import { EventEmitter } from 'events';
import WebSocket from 'ws';
import * as path from 'path';
import { z } from 'zod';
import { ConfigManager } from '../config/ConfigManager';
import * as JuliaTypes from '../types/JuliaTypes';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

// Enhanced type definitions
export interface JuliaBridgeConfig {
  juliaPath: string;
  scriptPath: string;
  port: number;
  options?: JuliaBridgeOptions;
}

export interface JuliaBridgeOptions {
  debug?: boolean;
  timeout?: number;
  maxRetries?: number;
  reconnectInterval?: number;
  artificialDelay?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  maxQueueSize?: number;
  backoffMultiplier?: number;
  env?: Record<string, string>;
  projectPath?: string;
  depotPath?: string;
}

export interface SwarmOptimizationParams {
  algorithm: 'pso' | 'aco' | 'abc' | 'firefly';
  dimensions: number;
  populationSize: number;
  iterations: number;
  bounds: {
    min: number[];
    max: number[];
  };
  objectiveFunction: string;
}

export interface JuliaResponse {
  id: string;
  type: string;
  data: any;
  error?: string;
  metadata?: {
    executionTime?: number;
    memoryUsage?: number;
    workerId?: number;
  };
}

// Enhanced validation schemas
const SwarmOptimizationParamsSchema = z.object({
  algorithm: z.enum(['pso', 'aco', 'abc', 'firefly']),
  dimensions: z.number().int().positive(),
  populationSize: z.number().int().positive(),
  iterations: z.number().int().positive(),
  bounds: z.object({
    min: z.array(z.number()),
    max: z.array(z.number())
  }),
  objectiveFunction: z.string()
});

const MessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.any(),
  error: z.string().optional(),
  metadata: z.object({
    executionTime: z.number().optional(),
    memoryUsage: z.number().optional(),
    workerId: z.number().optional()
  }).optional()
});

/**
 * Error class for Julia bridge errors
 */
export class JuliaBridgeError extends Error {
  code: string;

  constructor(message: string, code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'JuliaBridgeError';
    this.code = code;
  }
}

/**
 * Configuration for a swarm
 */
export interface SwarmConfig {
  id?: string;
  name?: string;
  size: number;
  algorithm: 'pso' | 'aco' | 'abc' | 'firefly';
  parameters: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
    maxDrawdown: number;
    inertia?: number;
    cognitiveWeight?: number;
    socialWeight?: number;
  };
}

/**
 * Market data point
 */
export interface MarketDataPoint {
  symbol: string;
  price: number;
  volume: number;
  timestamp: string | Date;
  indicators?: Record<string, number>;
}

/**
 * Input for swarm optimization
 */
export interface SwarmOptimizationInput {
  swarmId: string;
  marketData: MarketDataPoint[];
  tradingPairs: string[];
  riskParameters: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
    maxDrawdown: number;
  };
}

/**
 * Trading signal returned from swarm optimization
 */
export interface TradingSignal {
  action: 'buy' | 'sell' | 'hold';
  amount: number;
  confidence: number;
  timestamp: string | Date;
  indicators?: Record<string, number>;
  reasoning: string;
}

export class JuliaBridge extends EventEmitter {
  private config: JuliaBridgeConfig;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private retryCount: number = 0;
  private messageQueue: Array<{
    message: any;
    resolve: (value: JuliaTypes.JuliaResponse) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = 0;
  private isReconnecting: boolean = false;
  private juliaProcess: ChildProcess | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: JuliaTypes.JuliaResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout | null;
  }> = new Map();
  private isInitialized: boolean = false;
  private pendingCommands: Map<string, { 
    resolve: (value: any) => void, 
    reject: (reason: any) => void,
    timeout: NodeJS.Timeout
  }> = new Map();
  private activeSwarms: Map<string, SwarmConfig> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private autoReconnect: boolean;
  private timeout: number;

  constructor(options: { 
    juliaPath?: string, 
    autoReconnect?: boolean,
    timeout?: number 
  } = {}) {
    super();
      this.config = {
      juliaPath: options.juliaPath || 'julia',
      scriptPath: '',
      port: 0,
        options: {
        debug: false,
        timeout: options.timeout || 30000,
        maxRetries: 3,
        reconnectInterval: 5000,
        artificialDelay: 0,
        heartbeatInterval: 30000,
        heartbeatTimeout: 10000,
        maxQueueSize: 1000,
        backoffMultiplier: 1.5,
        env: {},
        projectPath: '',
        depotPath: ''
      }
    };
    this.autoReconnect = options.autoReconnect !== false;
    this.timeout = options.timeout || 30000; // 30 second default timeout
  }

  /**
   * Initialize the Julia bridge
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set up Julia environment variables
      if (this.config.options?.projectPath) {
        process.env.JULIA_PROJECT = this.config.options.projectPath;
      }
      if (this.config.options?.depotPath) {
        process.env.JULIA_DEPOT_PATH = this.config.options.depotPath;
      }

      // Start Julia process with environment variables
      const { spawn } = require('child_process');
      const juliaArgs = [
        path.join(this.config.scriptPath, 'server.jl'),
        '--port',
        this.config.port.toString()
      ];

      if (this.config.options?.debug) {
        juliaArgs.push('--debug');
      }

      this.juliaProcess = spawn(this.config.juliaPath, juliaArgs, {
        env: {
          ...process.env,
          ...this.config.options?.env
        }
      });

      // Set up process event handlers
      this.juliaProcess?.stdout?.on('data', (data: Buffer) => {
        const message = data.toString().trim();
        if (message.includes('Server started')) {
          this.connectWebSocket();
        }
        if (this.config.options?.debug) {
          console.log('Julia output:', message);
        }
      });

      this.juliaProcess?.stderr?.on('data', (data: Buffer) => {
        console.error('Julia error:', data.toString());
      });

      this.juliaProcess?.on('error', (error: Error) => {
        console.error('Failed to start Julia process:', error);
        this.handleError(error);
      });

      this.juliaProcess?.on('exit', (code: number) => {
        console.log(`Julia process exited with code ${code}`);
        this.handleDisconnect();
      });

      // Wait for connection
      await this.waitForConnection();

      this.isInitialized = true;
      this.reconnectAttempts = 0;
      
      this.emit('initialized');
      console.log('Julia bridge initialized successfully');
    } catch (error: any) {
      console.error('Failed to initialize Julia bridge:', error);
      
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
        
        setTimeout(() => {
          this.initialize().catch(e => {
            this.emit('error', new JuliaBridgeError(`Reconnect failed: ${e.message}`, 'RECONNECT_FAILED'));
          });
        }, delay);
      } else {
        throw new JuliaBridgeError(
          `Failed to initialize Julia bridge after ${this.reconnectAttempts} attempts: ${error.message}`,
          'INITIALIZATION_FAILED'
        );
      }
    }
  }

  /**
   * Shutdown the Julia bridge
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Cancel all pending commands
      for (const { reject, timeout } of this.pendingCommands.values()) {
        clearTimeout(timeout);
        reject(new JuliaBridgeError('Bridge shutdown', 'BRIDGE_SHUTDOWN'));
      }
      this.pendingCommands.clear();

      // Stop all active swarms
      for (const swarmId of this.activeSwarms.keys()) {
        try {
          await this.stopSwarm(swarmId);
    } catch (error) {
          console.error(`Failed to stop swarm ${swarmId} during shutdown:`, error);
        }
      }
      this.activeSwarms.clear();

      // Send exit command to Julia process
      if (this.juliaProcess && this.juliaProcess.stdin) {
        this.juliaProcess.stdin.write('exit()\n');
      }

      // Kill the process if it doesn't exit normally
      setTimeout(() => {
        if (this.juliaProcess) {
          this.juliaProcess.kill();
        }
      }, 1000);

      this.isInitialized = false;
      this.emit('shutdown');
      console.log('Julia bridge shut down successfully');
    } catch (error: any) {
      throw new JuliaBridgeError(`Shutdown error: ${error.message}`, 'SHUTDOWN_ERROR');
    }
  }

  /**
   * Start a new swarm for optimization
   */
  async createSwarm(config: SwarmConfig): Promise<string> {
    if (!this.isInitialized) {
      throw new JuliaBridgeError('Julia bridge is not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Generate swarm ID if not provided
      const swarmId = config.id || uuidv4();
      const swarmConfig = { ...config, id: swarmId };
      
      // Send swarm configuration to Julia
      await this.sendCommand('start_swarm', swarmConfig);
      
      // Register swarm locally
      this.activeSwarms.set(swarmId, swarmConfig);
      
      this.emit('swarmCreated', { swarmId, config: swarmConfig });
      return swarmId;
    } catch (error: any) {
      throw new JuliaBridgeError(`Failed to create swarm: ${error.message}`, 'SWARM_CREATION_ERROR');
    }
  }

  /**
   * Stop a running swarm
   */
  async stopSwarm(swarmId?: string): Promise<void> {
    if (!this.isInitialized) {
      throw new JuliaBridgeError('Julia bridge is not initialized', 'NOT_INITIALIZED');
    }

    try {
      if (swarmId) {
        // Stop a specific swarm
        if (!this.activeSwarms.has(swarmId)) {
          throw new JuliaBridgeError(`Swarm not found: ${swarmId}`, 'SWARM_NOT_FOUND');
        }
        
        await this.sendCommand('stop_swarm', { swarmId });
        this.activeSwarms.delete(swarmId);
        this.emit('swarmStopped', { swarmId });
      } else {
        // Stop all swarms
        const swarmIds = Array.from(this.activeSwarms.keys());
        
        for (const id of swarmIds) {
          await this.sendCommand('stop_swarm', { swarmId: id });
          this.activeSwarms.delete(id);
          this.emit('swarmStopped', { swarmId: id });
        }
      }
    } catch (error: any) {
      throw new JuliaBridgeError(`Failed to stop swarm: ${error.message}`, 'SWARM_STOP_ERROR');
    }
  }

  /**
   * Run optimization on a swarm
   */
  async optimizeSwarm(input: SwarmOptimizationInput): Promise<Record<string, TradingSignal>> {
    if (!this.isInitialized) {
      throw new JuliaBridgeError('Julia bridge is not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Validate swarm ID
      if (!this.activeSwarms.has(input.swarmId)) {
        throw new JuliaBridgeError(`Swarm not found: ${input.swarmId}`, 'SWARM_NOT_FOUND');
      }
      
      // Prepare market data for optimization
      const marketData = input.marketData.map(point => ({
        ...point,
        timestamp: point.timestamp instanceof Date ? point.timestamp.toISOString() : point.timestamp
      }));
      
      // Send optimization command to Julia
      const result = await this.sendCommand('optimize_swarm', {
        swarmId: input.swarmId,
        marketData,
        tradingPairs: input.tradingPairs,
        riskParameters: input.riskParameters
      });
      
      this.emit('swarmOptimized', { 
        swarmId: input.swarmId, 
        tradingSignals: result 
      });
      
      return result;
    } catch (error: any) {
      throw new JuliaBridgeError(`Optimization error: ${error.message}`, 'OPTIMIZATION_ERROR');
    }
  }

  /**
   * Get status of a swarm
   */
  async getSwarmStatus(swarmId: string): Promise<any> {
    if (!this.isInitialized) {
      throw new JuliaBridgeError('Julia bridge is not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Validate swarm ID
      if (!this.activeSwarms.has(swarmId)) {
        throw new JuliaBridgeError(`Swarm not found: ${swarmId}`, 'SWARM_NOT_FOUND');
      }
      
      // Get swarm status from Julia
      return await this.sendCommand('get_swarm_status', { swarmId });
    } catch (error: any) {
      throw new JuliaBridgeError(`Failed to get swarm status: ${error.message}`, 'STATUS_ERROR');
    }
  }

  /**
   * Get all active swarm IDs
   */
  getActiveSwarms(): string[] {
    return Array.from(this.activeSwarms.keys());
  }

  /**
   * Execute arbitrary Julia code
   */
  async executeCode(code: string): Promise<any> {
    if (!this.isInitialized) {
      throw new JuliaBridgeError('Julia bridge is not initialized', 'NOT_INITIALIZED');
    }

    try {
      return await this.sendCommand('execute_code', { code });
    } catch (error: any) {
      throw new JuliaBridgeError(`Code execution error: ${error.message}`, 'CODE_EXECUTION_ERROR');
    }
  }

  /**
   * Connect to WebSocket
   */
  private connectWebSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(`ws://localhost:${this.config.port}`);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.retryCount = 0;
        this.emit('connected');
        
        // Process any queued messages
        this.processQueuedMessages();
        
        // Start heartbeat
        this.startHeartbeat();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'heartbeat') {
            this.handleHeartbeat(message);
            return;
          }
          
          // Handle response
          const requestId = message.id;
          const pendingRequest = this.pendingRequests.get(requestId);
          
          if (pendingRequest) {
            // Clear timeout
            if (pendingRequest.timeout) {
              clearTimeout(pendingRequest.timeout);
            }
            
            // Remove from pending requests
            this.pendingRequests.delete(requestId);
            
            // Resolve the promise
            if (message.error) {
              pendingRequest.reject(new Error(message.error));
            } else {
              pendingRequest.resolve(message);
            }
          }
          
          this.emit('message', message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.handleError(error);
      });

      this.ws.on('close', () => {
        this.handleDisconnect();
      });
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.handleError(error);
    }
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(): void {
    if (!this.isConnected) {
      return;
    }

    this.isConnected = false;
    this.emit('disconnected');

    // Schedule reconnect
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting || this.reconnectTimer) {
      return;
    }

    this.isReconnecting = true;
    const delay = this.calculateBackoffDelay();
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.retryCount + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isReconnecting = false;
      this.retryCount++;
      
      if (this.retryCount > (this.config.options?.maxRetries || 3)) {
        this.emit('error', new Error('Max reconnect attempts reached'));
        return;
      }
      
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoffDelay(): number {
    const baseDelay = this.config.options?.reconnectInterval || 5000;
    const multiplier = this.config.options?.backoffMultiplier || 1.5;
    return baseDelay * Math.pow(multiplier, this.retryCount);
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    const interval = this.config.options?.heartbeatInterval || 30000;
    
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, interval);
    
    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }
    
    try {
      const heartbeat: JuliaTypes.JuliaHeartbeatMessage = {
        type: 'heartbeat',
        timestamp: Date.now()
      };
      
      this.ws.send(JSON.stringify(heartbeat));
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(message: any): void {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Handle error
   */
  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorObject = new JuliaBridgeError(errorMessage, 'WEBSOCKET_ERROR');
    
    this.emit('error', errorObject);
    
    if (this.isConnected) {
      this.handleDisconnect();
    }
  }

  /**
   * Wait for connection
   */
  private async waitForConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        this.removeListener('connected', onConnected);
        this.removeListener('error', onError);
        reject(new Error('Connection timeout'));
      }, this.config.options?.timeout || 30000);
      
      const onConnected = () => {
        clearTimeout(timeout);
        this.removeListener('error', onError);
        resolve();
      };
      
      const onError = (error: Error) => {
        clearTimeout(timeout);
        this.removeListener('connected', onConnected);
        reject(error);
      };
      
      this.once('connected', onConnected);
      this.once('error', onError);
    });
  }

  /**
   * Process queued messages
   */
  private processQueuedMessages(): void {
    const now = Date.now();
    const maxQueueAge = this.config.options?.timeout || 30000;
    
    // Filter out expired messages
    this.messageQueue = this.messageQueue.filter(item => {
      if (now - item.timestamp > maxQueueAge) {
        item.reject(new Error('Message expired'));
        return false;
      }
      return true;
    });
    
    // Process remaining messages
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const item of queue) {
      this.sendMessage(item.message)
        .then(item.resolve)
        .catch(item.reject);
    }
  }

  /**
   * Send a message to Julia
   */
  private async sendMessage(message: any): Promise<JuliaTypes.JuliaResponse> {
    if (!this.isConnected) {
      return new Promise((resolve, reject) => {
        // If not connected, queue the message
        if (this.messageQueue.length >= (this.config.options?.maxQueueSize || 1000)) {
          reject(new Error('Message queue full'));
          return;
        }
        
        this.messageQueue.push({
          message,
          resolve,
          reject,
          timestamp: Date.now()
        });
      });
    }
    
    return new Promise<JuliaTypes.JuliaResponse>((resolve, reject) => {
      try {
        // Generate a unique ID for this request
        const requestId = uuidv4();
        const requestMessage = {
          id: requestId,
          ...message
        };
        
        // Set up timeout
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }, this.config.options?.timeout || 30000);
        
        // Store the promise callbacks
        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeout
        });
        
        // Add artificial delay if configured (for testing)
        if (this.config.options?.artificialDelay) {
          setTimeout(() => {
            if (this.ws) {
              this.ws.send(JSON.stringify(requestMessage));
            }
          }, this.config.options.artificialDelay);
        } else {
          if (this.ws) {
            this.ws.send(JSON.stringify(requestMessage));
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Wait for Julia initialization
   */
  private waitForInitialization(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new JuliaBridgeError('Julia initialization timeout', 'INITIALIZATION_TIMEOUT'));
      }, this.timeout);

      const handler = (data: Buffer) => {
        const message = data.toString().trim();
        if (message.includes('Julia initialized')) {
          clearTimeout(timeout);
          if (this.juliaProcess && this.juliaProcess.stdout) {
            this.juliaProcess.stdout.removeListener('data', handler);
          }
          resolve();
        }
      };

      if (this.juliaProcess && this.juliaProcess.stdout) {
        this.juliaProcess.stdout.on('data', handler);
      } else {
        reject(new JuliaBridgeError('Julia process not started', 'PROCESS_NOT_STARTED'));
      }
    });
  }

  /**
   * Send a command to Julia process
   */
  private async sendCommand(command: string, data: any = {}): Promise<any> {
    if (!this.isInitialized || !this.juliaProcess || !this.juliaProcess.stdin) {
      throw new JuliaBridgeError('Julia bridge is not initialized or process not running', 'NOT_INITIALIZED');
    }

    return new Promise((resolve, reject) => {
      const commandId = uuidv4();
      
      // Set timeout for command
      const commandTimeout = setTimeout(() => {
        if (this.pendingCommands.has(commandId)) {
          this.pendingCommands.delete(commandId);
          reject(new JuliaBridgeError(`Command timed out: ${command}`, 'COMMAND_TIMEOUT'));
        }
      }, this.timeout);
      
      // Store promise callbacks
      this.pendingCommands.set(commandId, { resolve, reject, timeout: commandTimeout });
      
      // Prepare command
      const commandObj = {
        id: commandId,
        command,
        data
      };
      
      // Add command tracking for debugging and metrics
      const startTime = Date.now();
      const trackCommand = () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Log command stats for performance monitoring
        if (this.config.options?.debug && duration > 1000) {
          console.warn(`Slow command execution: ${command} took ${duration}ms`);
        }
        
        // Could emit an event for metrics collection
        this.emit('commandExecuted', {
          command,
          duration,
          success: true
        });
      };
      
      // Add success/failure trackers
      const originalResolve = resolve;
      resolve = (value: any) => {
        trackCommand();
        originalResolve(value);
      };
      
      const originalReject = reject;
      reject = (reason: any) => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Log failure
        this.emit('commandExecuted', {
          command,
          duration,
          success: false,
          error: reason
        });
        
        originalReject(reason);
      };

      // Add safety check for data size
      const serializedData = JSON.stringify(commandObj);
      if (serializedData.length > 10 * 1024 * 1024) { // 10MB limit
        this.pendingCommands.delete(commandId);
        clearTimeout(commandTimeout);
        reject(new JuliaBridgeError(`Command data too large: ${(serializedData.length / (1024 * 1024)).toFixed(2)}MB`, 'DATA_TOO_LARGE'));
        return;
      }
      
      // Send command to Julia with better error handling
      try {
        if (!this.juliaProcess || !this.juliaProcess.stdin) {
          this.pendingCommands.delete(commandId);
          clearTimeout(commandTimeout);
          reject(new JuliaBridgeError('Julia process stdin not available', 'PROCESS_ERROR'));
          return;
        }

        // Check if stdin is writable
        if (!this.juliaProcess.stdin.writable) {
          this.pendingCommands.delete(commandId);
          clearTimeout(commandTimeout);
          reject(new JuliaBridgeError('Julia process stdin not writable', 'PROCESS_ERROR'));
          
          // Try to reconnect
          if (this.autoReconnect && !this.isReconnecting) {
            this.handleReconnect();
          }
          
          return;
        }
        
        // Write with error handling
        const writeSuccess = this.juliaProcess.stdin.write(serializedData + '\n', (error) => {
          if (error) {
            this.pendingCommands.delete(commandId);
            clearTimeout(commandTimeout);
            reject(new JuliaBridgeError(`Failed to send command: ${error.message}`, 'WRITE_ERROR'));
            
            // Try to reconnect on write error
            if (this.autoReconnect && !this.isReconnecting) {
              this.handleReconnect();
            }
          }
        });
        
        // Handle backpressure
        if (!writeSuccess) {
          // Command was queued due to backpressure
          console.warn('Write backpressure detected');
          
          // Set up drain handler
          this.juliaProcess.stdin.once('drain', () => {
            console.log('Write backpressure relieved');
          });
        }
      } catch (error: any) {
        this.pendingCommands.delete(commandId);
        clearTimeout(commandTimeout);
        reject(new JuliaBridgeError(`Failed to send command: ${error.message}`, 'COMMAND_SEND_ERROR'));
      }
    });
  }

  /**
   * Check the health of the Julia process and bridge
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    details: {
      processRunning: boolean;
      initialized: boolean;
      pendingCommands: number;
      activeSwarms: number;
      reconnectAttempts: number;
      lastHeartbeat?: number;
    }
  }> {
    const processRunning = this.juliaProcess !== null && 
      this.juliaProcess.exitCode === null && 
      !this.juliaProcess.killed;
    
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (!processRunning || !this.isInitialized) {
      status = 'unhealthy';
    } else if (this.reconnectAttempts > 0 || this.pendingCommands.size > 10) {
      status = 'degraded';
    }
    
    return {
      status,
      details: {
        processRunning,
        initialized: this.isInitialized,
        pendingCommands: this.pendingCommands.size,
        activeSwarms: this.activeSwarms.size,
        reconnectAttempts: this.reconnectAttempts,
        lastHeartbeat: this.lastHeartbeat > 0 ? this.lastHeartbeat : undefined
      }
    };
  }

  /**
   * Handle reconnection attempts
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
      this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
      
      setTimeout(() => {
        this.initialize().catch(e => {
          this.emit('error', new JuliaBridgeError(`Reconnect failed: ${e.message}`, 'RECONNECT_FAILED'));
        });
      }, delay);
    } else {
      console.error(`Failed to reconnect after ${this.reconnectAttempts} attempts`);
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
    }
  }
} 