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
  protected llmProvider?: LLMProvider;
  protected memory: Map<string, any>;
  protected memoryConfig?: MemoryConfig;
  protected errorConfig?: ErrorConfig;
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
      maxSize: config.memoryConfig?.maxSize || 1000,
      cleanupInterval: config.memoryConfig?.cleanupInterval || 3600000, // 1 hour
      retentionPolicy: config.memoryConfig?.retentionPolicy || 'lru'
    };

    // Initialize error configuration
    this.errorConfig = {
      maxRetries: config.errorConfig?.maxRetries || 3,
      backoffStrategy: config.errorConfig?.backoffStrategy || 'exponential',
      errorHandlers: config.errorConfig?.errorHandlers || {}
    };

    // Set up memory cleanup interval
    setInterval(() => this.manageMemory(), this.memoryConfig.cleanupInterval);
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
      this.llmProvider = new OpenAIProvider();
      await this.llmProvider.initialize(config);
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

  private manageMemory(): void {
    if (!this.memoryConfig || this.memory.size <= this.memoryConfig.maxSize) {
      return;
    }

    const entries = Array.from(this.memory.entries());
    if (this.memoryConfig.retentionPolicy === 'lru') {
      // Remove oldest entries first
      const itemsToRemove = entries.slice(0, this.memory.size - this.memoryConfig.maxSize);
      for (const [key] of itemsToRemove) {
        this.memory.delete(key);
      }
    } else {
      // Remove newest entries first
      const itemsToRemove = entries.slice(0, this.memory.size - this.memoryConfig.maxSize);
      for (const [key] of itemsToRemove) {
        this.memory.delete(key);
      }
    }
  }

  private async handleError(error: Error): Promise<void> {
    const errorType = error.constructor.name;
    const currentRetries = this.retryCount.get(errorType) || 0;
    
    if (!this.errorConfig || currentRetries >= this.errorConfig.maxRetries) {
      throw error;
    }

    this.retryCount.set(errorType, currentRetries + 1);
    
    const handler = this.errorConfig.errorHandlers?.[errorType];
    if (handler) {
      try {
        await handler(error);
      } catch (handlerError) {
        this.logger.error(`Error handler failed: ${handlerError}`);
      }
    }

    // Implement backoff strategy
    if (this.errorConfig.backoffStrategy === 'linear') {
      await this.delay(1000 * currentRetries);
    } else {
      await this.delay(1000 * Math.pow(2, currentRetries));
    }
  }

  protected setMemory(key: string, value: any): void {
    this.memory.set(key, {
      value,
      lastAccessed: Date.now()
    });
    this.manageMemory();
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