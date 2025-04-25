"use strict";
/**
 * JuliaBridge - Typescript interface to Julia language
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JuliaBridge = void 0;
const child_process = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const node_fetch_1 = __importDefault(require("node-fetch"));
const cross_chain_commands_1 = require("./cross-chain-commands");
class JuliaBridge extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.juliaProcess = null;
        this.initialized = false;
        this.serverRunning = false;
        this.ws = null;
        this.wsConnected = false;
        this.pendingCommands = new Map();
        this.commandTimeout = 30000; // 30 seconds default timeout
        // Add agent-related methods to JuliaBridge class
        this.agents = {
            create_agent: async (config) => {
                return this.runJuliaCommand('agents.create_agent', config);
            },
            list_agents: async (params = {}) => {
                return this.runJuliaCommand('agents.list_agents', params);
            },
            get_agent: async (id) => {
                return this.runJuliaCommand('agents.get_agent', { id });
            },
            update_agent: async (id, updates) => {
                return this.runJuliaCommand('agents.update_agent', { id, ...updates });
            },
            delete_agent: async (id) => {
                return this.runJuliaCommand('agents.delete_agent', { id });
            },
            start_agent: async (id) => {
                return this.runJuliaCommand('agents.start_agent', { id });
            },
            stop_agent: async (id) => {
                return this.runJuliaCommand('agents.stop_agent', { id });
            },
            get_metrics: async (id) => {
                return this.runJuliaCommand('agents.get_metrics', { id });
            }
        };
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
    async initialize() {
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
            }
            else if (this.config.useWebSocket) {
                // Connect to existing Julia server via WebSocket
                await this.connectWebSocket();
            }
            else {
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
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * Connect to Julia server via WebSocket
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.log(`Connecting to Julia server at ${this.config.wsUrl}...`);
                this.ws = new ws_1.default(this.config.wsUrl);
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
            }
            catch (error) {
                reject(error);
            }
        });
    }
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            this.log(`Received WebSocket message: ${JSON.stringify(message)}`);
            // Handle command requests from Julia
            if (message.service && message.command) {
                this.handleCommandRequest({
                    id: message.id,
                    service: message.service,
                    command: message.command,
                    params: message.params
                })
                    .catch((error) => {
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
                    }
                    else {
                        pendingCommand.resolve(message.result);
                    }
                }
                else {
                    this.log(`Received response for unknown command ID: ${message.id}`, true);
                }
            }
        }
        catch (error) {
            this.log(`Error parsing WebSocket message: ${error.message}`, true);
        }
    }
    /**
     * Handle command requests from Julia
     */
    async handleCommandRequest(message) {
        const { id, service, command, params } = message;
        // Check if we have this command handler
        if (!cross_chain_commands_1.commands[service] ||
            !cross_chain_commands_1.commands[service][command]) {
            throw new Error(`Command not found: ${service}.${command}`);
        }
        // Execute the command
        const commandHandler = cross_chain_commands_1.commands[service][command];
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
    async startJuliaServer() {
        return new Promise((resolve, reject) => {
            try {
                const serverScriptPath = path.join(this.config.projectPath, this.config.serverScript);
                this.log(`Starting Julia server from ${serverScriptPath}`);
                this.juliaProcess = child_process.spawn(this.config.juliaPath, [serverScriptPath], {
                    cwd: this.config.projectPath,
                    env: process.env
                });
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
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Run a Julia command
     */
    async runJuliaCommand(command, params = {}) {
        this.checkInitialized();
        const commandId = (0, uuid_1.v4)();
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
                this.ws.send(JSON.stringify(commandData));
            });
        }
        else {
            // Fallback to HTTP if WebSocket is not available
            try {
                const response = await (0, node_fetch_1.default)(this.config.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(commandData)
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                if (result.error) {
                    throw new Error(result.error);
                }
                return result.data;
            }
            catch (error) {
                this.log(`Error executing command ${command}: ${error.message}`, true);
                throw error;
            }
        }
    }
    /**
     * Create a swarm
     */
    async createSwarm(params) {
        return this.runJuliaCommand('create_swarm', params);
    }
    /**
     * Optimize using a swarm
     */
    async optimizeSwarm(swarmId, data, options = {}) {
        return this.runJuliaCommand('optimize_swarm', { swarmId, data, options });
    }
    /**
     * Analyze a cross-chain route
     */
    async analyzeRoute(params) {
        return this.runJuliaCommand('analyze_route', params);
    }
    /**
     * Get health status of the Julia server
     */
    async getHealth() {
        if (this.config.useExistingServer) {
            try {
                const response = await (0, node_fetch_1.default)(this.config.healthUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return await response.json();
            }
            catch (error) {
                this.log(`Error getting health status: ${error.message}`, true);
                throw new Error(`Failed to get health status: ${error.message}`);
            }
        }
        else {
            return this.runJuliaCommand('check_system_health', {});
        }
    }
    /**
     * Shutdown the Julia bridge
     */
    async shutdown() {
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
    findJuliaExecutable() {
        // Check common paths based on OS
        const platform = os.platform();
        const possiblePaths = [];
        if (platform === 'win32') {
            possiblePaths.push('C:\\Program Files\\Julia\\bin\\julia.exe', 'C:\\Program Files (x86)\\Julia\\bin\\julia.exe', 'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Julia\\bin\\julia.exe');
        }
        else if (platform === 'darwin') {
            possiblePaths.push('/Applications/Julia-1.9.app/Contents/Resources/julia/bin/julia', '/usr/local/bin/julia', '/opt/homebrew/bin/julia');
        }
        else {
            // Linux and other Unix-like systems
            possiblePaths.push('/usr/bin/julia', '/usr/local/bin/julia');
        }
        // Check if Julia is in PATH
        try {
            const { stdout } = child_process.spawnSync('which', ['julia'], { encoding: 'utf8' });
            if (stdout.trim()) {
                return stdout.trim();
            }
        }
        catch (error) {
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
    checkJuliaExecutable() {
        try {
            const { status } = child_process.spawnSync(this.config.juliaPath, ['--version'], { stdio: 'ignore' });
            return status === 0;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Check if JuliaBridge is initialized
     */
    checkInitialized() {
        if (!this.initialized) {
            throw new Error('JuliaBridge not initialized. Call initialize() first.');
        }
    }
    /**
     * Log a message
     */
    log(message, isError = false) {
        if (this.config.debug || isError) {
            const prefix = isError ? 'ERROR' : 'INFO';
            console.log(`[JuliaBridge:${prefix}] ${message}`);
        }
    }
}
exports.JuliaBridge = JuliaBridge;
exports.default = JuliaBridge;
//# sourceMappingURL=index.js.map