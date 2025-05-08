import { EventEmitter } from 'events';
import { Platform } from '../platform/Platform';
import { Skill } from '../skills/Skill';
import { LLMProvider, LLMConfig, LLMResponse, OpenAIProvider } from '../llm/LLMProvider';

export interface AgentConfig {
  name: string;
  type: string;
  platforms?: Platform[];
  skills?: Skill[];
  parameters?: Record<string, any>;
  llmConfig?: LLMConfig;
  memoryConfig?: {
    maxSize: number;
    cleanupInterval: number;
    retentionPolicy: 'lru' | 'fifo';
  };
  errorConfig?: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential';
    errorHandlers: Record<string, (error: Error) => Promise<void>>;
  };
}

export abstract class BaseAgent extends EventEmitter {
  protected name: string;
  protected type: string;
  protected platforms: Platform[];
  protected skills: Skill[];
  protected parameters: Record<string, any>;
  protected isRunning: boolean;
  protected llmProvider: LLMProvider | null = null;
  protected memory: Map<string, any>;
  protected memoryConfig: Required<NonNullable<AgentConfig['memoryConfig']>>;
  protected errorConfig: Required<NonNullable<AgentConfig['errorConfig']>>;
  protected retryCount: Map<string, number>;

  constructor(config: AgentConfig) {
    super();
    this.name = config.name;
    this.type = config.type;
    this.platforms = config.platforms || [];
    this.skills = config.skills || [];
    this.parameters = config.parameters || {};
    this.isRunning = false;
    this.memory = new Map();
    this.retryCount = new Map();
    
    // Initialize memory configuration
    this.memoryConfig = {
      maxSize: config.memoryConfig?.maxSize ?? 1000,
      cleanupInterval: config.memoryConfig?.cleanupInterval ?? 3600000, // 1 hour
      retentionPolicy: config.memoryConfig?.retentionPolicy ?? 'lru'
    };

    // Initialize error configuration
    this.errorConfig = {
      maxRetries: config.errorConfig?.maxRetries ?? 3,
      backoffStrategy: config.errorConfig?.backoffStrategy ?? 'exponential',
      errorHandlers: config.errorConfig?.errorHandlers ?? {}
    };

    // Set up memory cleanup interval
    setInterval(() => this.cleanupMemory(), this.memoryConfig.cleanupInterval);

    // Initialize LLM if config is provided
    if (config.llmConfig) {
      this.initializeLLM(config.llmConfig).catch(error => {
        this.emit('error', error);
      });
    }
  }

  abstract initialize(): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  /**
   * Execute a task with this agent
   * @param taskData The data for the task to execute
   * @returns The result of the task execution
   */
  async executeTask(taskData: Record<string, any>): Promise<any> {
    if (!this.isRunning) {
      throw new Error(`Agent ${this.name} is not running. Start the agent before executing tasks.`);
    }
    
    try {
      // Default implementation uses LLM if available
      if (this.llmProvider) {
        // Convert task data to a prompt
        const prompt = this.generateTaskPrompt(taskData);
        
        // Process with LLM
        const response = await this.processWithLLM(prompt);
        
        return response;
      } else {
        throw new Error(`Agent ${this.name} cannot execute the task. No execution strategy available.`);
      }
    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }
  
  /**
   * Generate a prompt for a task
   * @param taskData The data for the task
   * @returns A formatted prompt string
   */
  protected generateTaskPrompt(taskData: Record<string, any>): string {
    // Simple default implementation
    return `Execute the following task:
${JSON.stringify(taskData, null, 2)}

Respond with the result in a structured format.`;
  }

  protected async initializeLLM(config: LLMConfig): Promise<void> {
    try {
      // Use factory method to create the appropriate provider
      const provider = config.provider?.toLowerCase() === 'openai' 
        ? new OpenAIProvider()
        : new OpenAIProvider(); // Default to OpenAI for now

      await provider.initialize(config);
      this.llmProvider = provider;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  protected async processWithLLM(prompt: string, options?: Partial<LLMConfig>): Promise<LLMResponse> {
    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }

    try {
      return await this.llmProvider.generate(prompt, options);
    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  protected async cleanupMemory(): Promise<void> {
    if (this.memory.size <= this.memoryConfig.maxSize) {
      return;
    }

    if (this.memoryConfig.retentionPolicy === 'lru') {
      // Remove least recently used items
      const entries = Array.from(this.memory.entries());
      entries.sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0));
      const itemsToRemove = entries.slice(0, this.memory.size - this.memoryConfig.maxSize);
      itemsToRemove.forEach(([key]) => this.memory.delete(key));
    } else {
      // Remove first in first out
      const entries = Array.from(this.memory.entries());
      const itemsToRemove = entries.slice(0, this.memory.size - this.memoryConfig.maxSize);
      itemsToRemove.forEach(([key]) => this.memory.delete(key));
    }
  }

  protected async handleError(error: Error): Promise<void> {
    const errorType = error.constructor.name;
    const currentRetries = this.retryCount.get(errorType) || 0;

    if (currentRetries >= this.errorConfig.maxRetries) {
      this.emit('error', error);
      return;
    }

    const handler = this.errorConfig.errorHandlers[errorType];
    if (handler) {
      await handler(error);
    }

    // Update retry count with backoff
    const backoffTime = this.calculateBackoff(currentRetries);
    this.retryCount.set(errorType, currentRetries + 1);
    await new Promise(resolve => setTimeout(resolve, backoffTime));
  }

  private calculateBackoff(retryCount: number): number {
    if (this.errorConfig.backoffStrategy === 'linear') {
      return retryCount * 1000; // Linear backoff: 1s, 2s, 3s, etc.
    } else {
      return Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    }
  }

  protected setMemory(key: string, value: any): void {
    this.memory.set(key, {
      value,
      lastAccessed: Date.now()
    });
    this.cleanupMemory();
  }

  protected getMemory(key: string): any {
    const entry = this.memory.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.value;
    }
    return undefined;
  }

  getName(): string {
    return this.name;
  }

  getType(): string {
    return this.type;
  }

  isActive(): boolean {
    return this.isRunning;
  }
} 