/**
 * JuliaBridge - Typescript interface to Julia language
 */

import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
// import fetch from 'node-fetch';
import { commands } from './cross-chain-commands';

export interface JuliaBridgeConfig {
  juliaPath?: string;
  projectPath?: string;
  serverScript?: string;
  serverPort?: number;
  debug?: boolean;
  useWebSocket?: boolean;
  wsUrl?: string;
  useExistingServer?: boolean;
  apiUrl?: string;
  healthUrl?: string;
}

export interface JuliaCommandResponse {
  id: string;
  result?: any;
  error?: string;
}

export class JuliaBridge extends EventEmitter {
  private config: Required<JuliaBridgeConfig>;
  private juliaProcess: child_process.ChildProcess | null = null;
  private initialized = false;
  private serverRunning = false;
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private pendingCommands: Map<string, { resolve: (value: any) => void; reject: (reason: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private commandTimeout = 30000; // 30 seconds default timeout

  constructor(config: JuliaBridgeConfig = {}) {
    super();

    this.config = {
      juliaPath: config.juliaPath || this.findJuliaExecutable(),
      projectPath: config.projectPath || path.resolve(process.cwd(), 'julia'),
      serverScript: config.serverScript || 'start_server.jl',
      serverPort: config.serverPort || 8052,
      debug: config.debug || false,
      apiUrl: config.apiUrl || `http://localhost:8052/api/command`,
      healthUrl: config.healthUrl || `http://localhost:8052/health`,
      useWebSocket: config.useWebSocket !== undefined ? config.useWebSocket : true,
      wsUrl: config.wsUrl || `ws://localhost:${config.serverPort || 8052}`,
      useExistingServer: config.useExistingServer || false
    };
  }

  /**
   * Initialize the Julia bridge
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.log('Initializing JuliaBridge...');

      if (this.config.useExistingServer) {
        // Assume server is already running and connect directly via HTTP
        this.log('Using existing Julia server...');
        this.serverRunning = true;
        this.initialized = true;
        this.emit('initialized');
        this.log('JuliaBridge initialized successfully (using existing server)');
        return;
      } else if (this.config.useWebSocket) {
        // Connect to existing Julia server via WebSocket
        await this.connectWebSocket();
      } else {
        // Start a new Julia server
        // Check if Julia executable exists
        if (!this.checkJuliaExecutable()) {
          throw new Error('Julia executable not found');
        }

        // Check if project path exists
        if (!fs.existsSync(this.config.projectPath)) {
          throw new Error(`Julia project path not found: ${this.config.projectPath}`);
        }

        // Check if server script exists
        const serverScriptPath = path.join(this.config.projectPath, this.config.serverScript);
        if (!fs.existsSync(serverScriptPath)) {
          throw new Error(`Julia server script not found: ${serverScriptPath}`);
        }

        // Start the Julia server
        await this.startJuliaServer();
      }

      this.initialized = true;
      this.emit('initialized');
      this.log('JuliaBridge initialized successfully');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Connect to Julia server via WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.log(`Connecting to Julia server at ${this.config.wsUrl}...`);

        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.on('open', () => {
          this.wsConnected = true;
          this.emit('ws-connected');
          this.log('WebSocket connection established');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleWebSocketMessage(data);
        });

        this.ws.on('error', (error) => {
          this.log(`WebSocket error: ${error.message}`, true);
          this.wsConnected = false;
          reject(error);
        });

        this.ws.on('close', () => {
          this.log('WebSocket connection closed');
          this.wsConnected = false;
          this.emit('ws-closed');
        });

        // Set a timeout in case the connection doesn't establish
        setTimeout(() => {
          if (!this.wsConnected) {
            if (this.ws) {
              this.ws.terminate();
              this.ws = null;
            }
            reject(new Error('Timeout waiting for WebSocket connection'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as {
        id?: string;
        service?: string;
        command?: string;
        params?: any;
        error?: string;
        result?: any;
      };
      this.log(`Received WebSocket message: ${JSON.stringify(message)}`);

      // Handle command requests from Julia
      if (message.service && message.command) {
        this.handleCommandRequest({
          id: message.id,
          service: message.service,
          command: message.command,
          params: message.params
        })
          .catch((error: Error) => {
            this.log(`Error handling command request: ${error.message}`, true);

            // Send error response
            if (message.id && this.ws) {
              const errorResponse = {
                id: message.id,
                success: false,
                error: error.message
              };
              this.ws.send(JSON.stringify(errorResponse));
            }
          });
        return;
      }

      // Handle command responses
      if (message.id) {
        const pendingCommand = this.pendingCommands.get(message.id);

        if (pendingCommand) {
          // Clear the timeout
          clearTimeout(pendingCommand.timeout);

          // Remove from pending commands
          this.pendingCommands.delete(message.id);

          // Resolve or reject the promise
          if (message.error) {
            pendingCommand.reject(new Error(message.error));
          } else {
            pendingCommand.resolve(message.result);
          }
        } else {
          this.log(`Received response for unknown command ID: ${message.id}`, true);
        }
      }
    } catch (error: any) {
      this.log(`Error parsing WebSocket message: ${error.message}`, true);
    }
  }

  /**
   * Handle command requests from Julia
   */
  private async handleCommandRequest(message: {
    id?: string;
    service: string;
    command: string;
    params?: any;
  }): Promise<void> {
    const { id, service, command, params } = message;

    // Check if we have this command handler
    if (!commands[service as keyof typeof commands] ||
        !commands[service as keyof typeof commands][command as keyof typeof commands[keyof typeof commands]]) {
      throw new Error(`Command not found: ${service}.${command}`);
    }

    // Execute the command
    const commandHandler = commands[service as keyof typeof commands][
      command as keyof typeof commands[keyof typeof commands]
    ] as (params: any) => Promise<any>;

    const result = await commandHandler(params || {});

    // Send response
    if (this.ws && id) {
      this.ws.send(JSON.stringify({
        id,
        ...result
      }));
    }
  }

  /**
   * Start the Julia server
   */
  private async startJuliaServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const serverScriptPath = path.join(this.config.projectPath, this.config.serverScript);

        this.log(`Starting Julia server from ${serverScriptPath}`);

        this.juliaProcess = child_process.spawn(
          this.config.juliaPath,
          [serverScriptPath],
          {
            cwd: this.config.projectPath,
            env: process.env
          }
        );

        // Handle process events
        this.juliaProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          this.log(`Julia server output: ${output}`);

          // Check if server is running
          if (output.includes('Server is running') || output.includes('Server started')) {
            this.serverRunning = true;
            this.emit('server-started');

            // Connect to the server via WebSocket
            this.connectWebSocket()
              .then(() => resolve())
              .catch(reject);
          }
        });

        this.juliaProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          this.log(`Julia server error: ${error}`, true);
        });

        this.juliaProcess.on('error', (error) => {
          this.log(`Julia process error: ${error.message}`, true);
          reject(error);
        });

        this.juliaProcess.on('close', (code) => {
          this.log(`Julia process closed with code ${code}`);
          this.serverRunning = false;
          this.juliaProcess = null;
        });

        // Set a timeout in case the server doesn't start
        setTimeout(() => {
          if (!this.serverRunning) {
            if (this.juliaProcess) {
              this.juliaProcess.kill();
              this.juliaProcess = null;
            }
            reject(new Error('Timeout waiting for Julia server to start'));
          }
        }, 300000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Run a Julia command
   */
  public async runJuliaCommand(command: string, params: any = {}): Promise<any> {
    this.checkInitialized();

    const commandId = uuidv4();
    const commandData = {
      id: commandId,
      command,
      params
    };

    if (this.config.useWebSocket && this.ws && this.wsConnected) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingCommands.delete(commandId);
          reject(new Error(`Command timed out: ${command}`));
        }, this.commandTimeout);

        this.pendingCommands.set(commandId, { resolve, reject, timeout });
        this.ws!.send(JSON.stringify(commandData));
      });
    } else {
      // Fallback to HTTP if WebSocket is not available
      try {
        const response = await fetch(this.config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(commandData)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json() as { error?: string; data?: any };
        if (result.error) {
          throw new Error(result.error);
        }

        return result.data;
      } catch (error: any) {
        this.log(`Error executing command ${command}: ${error.message}`, true);
        throw error;
      }
    }
  }

  /**
   * Create a swarm
   */
  public async createSwarm(params: any): Promise<string> {
    return this.runJuliaCommand('create_swarm', params);
  }

  /**
   * Optimize using a swarm
   */
  public async optimizeSwarm(swarmId: string, data: any, options: any = {}): Promise<any> {
    return this.runJuliaCommand('optimize_swarm', { swarmId, data, options });
  }

  /**
   * Analyze a cross-chain route
   */
  public async analyzeRoute(params: any): Promise<any> {
    return this.runJuliaCommand('analyze_route', params);
  }

  /**
   * Get health status of the Julia server
   */
  public async getHealth(): Promise<any> {
    if (this.config.useExistingServer) {
      try {
        const response = await fetch(this.config.healthUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error: any) {
        this.log(`Error getting health status: ${error.message}`, true);
        throw new Error(`Failed to get health status: ${error.message}`);
      }
    } else {
      return this.runJuliaCommand('check_system_health', {});
    }
  }

  /**
   * Shutdown the Julia bridge
   */
  public async shutdown(): Promise<void> {
    // Close WebSocket connection
    if (this.ws) {
      this.log('Closing WebSocket connection...');
      this.ws.close();
      this.ws = null;
    }

    // Kill Julia process
    if (this.juliaProcess) {
      this.log('Shutting down Julia server...');

      this.juliaProcess.kill();
      this.juliaProcess = null;
    }

    this.serverRunning = false;
    this.wsConnected = false;
    this.initialized = false;
    this.emit('shutdown');
    this.log('JuliaBridge shutdown complete');
  }

  /**
   * Find Julia executable on the system
   */
  private findJuliaExecutable(): string {
    // Check common paths based on OS
    const platform = os.platform();
    const possiblePaths = [];

    if (platform === 'win32') {
      possiblePaths.push(
        'C:\\Program Files\\Julia\\bin\\julia.exe',
        'C:\\Program Files (x86)\\Julia\\bin\\julia.exe',
        'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Julia\\bin\\julia.exe'
      );
    } else if (platform === 'darwin') {
      possiblePaths.push(
        '/Applications/Julia-1.9.app/Contents/Resources/julia/bin/julia',
        '/usr/local/bin/julia',
        '/opt/homebrew/bin/julia'
      );
    } else {
      // Linux and other Unix-like systems
      possiblePaths.push(
        '/usr/bin/julia',
        '/usr/local/bin/julia'
      );
    }

    // Check if Julia is in PATH
    try {
      const { stdout } = child_process.spawnSync('which', ['julia'], { encoding: 'utf8' });
      if (stdout.trim()) {
        return stdout.trim();
      }
    } catch (error) {
      // Ignore error
    }

    // Check possible paths
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }

    // Return default name (will be looked up in PATH)
    return 'julia';
  }

  /**
   * Check if Julia executable exists
   */
  private checkJuliaExecutable(): boolean {
    try {
      const { status } = child_process.spawnSync(this.config.juliaPath, ['--version'], { stdio: 'ignore' });
      return status === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if JuliaBridge is initialized
   */
  private checkInitialized(): void {
    if (!this.initialized) {
      throw new Error('JuliaBridge not initialized. Call initialize() first.');
    }
  }

  /**
   * Log a message
   */
  private log(message: string, isError = false): void {
    if (this.config.debug || isError) {
      const prefix = isError ? 'ERROR' : 'INFO';
      console.log(`[JuliaBridge:${prefix}] ${message}`);
    }
  }

  // Add agent-related methods to JuliaBridge class
  public agents = {
    create_agent: async (config: any) => {
      return this.runJuliaCommand('agents.create_agent', config);
    },
    list_agents: async (params: any = {}) => {
      return this.runJuliaCommand('agents.list_agents', params);
    },
    get_agent: async (id: string) => {
      return this.runJuliaCommand('agents.get_agent', { id });
    },
    update_agent: async (id: string, updates: any) => {
      return this.runJuliaCommand('agents.update_agent', { id, ...updates });
    },
    delete_agent: async (id: string) => {
      return this.runJuliaCommand('agents.delete_agent', { id });
    },
    start_agent: async (id: string) => {
      return this.runJuliaCommand('agents.start_agent', { id });
    },
    stop_agent: async (id: string) => {
      return this.runJuliaCommand('agents.stop_agent', { id });
    },
    get_metrics: async (id: string) => {
      return this.runJuliaCommand('agents.get_metrics', { id });
    }
  };
}

export default JuliaBridge;