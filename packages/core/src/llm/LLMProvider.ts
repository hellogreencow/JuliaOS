import { EventEmitter } from 'events';
import axios from 'axios';

export interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  usageTracking?: boolean;
}

export interface LLMResponse {
  text: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  finishReason: string;
  metadata?: Record<string, any>;
}

export interface LLMUsage {
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
  date: Date;
  model: string;
  provider: string;
}

export abstract class LLMProvider extends EventEmitter {
  protected config!: LLMConfig;
  protected initialized: boolean = false;
  protected usageHistory: LLMUsage[] = [];

  constructor() {
    super();
  }

  abstract initialize(config: LLMConfig): Promise<void>;
  abstract generate(prompt: string, options?: Partial<LLMConfig>): Promise<LLMResponse>;
  abstract embed(text: string): Promise<number[]>;
  abstract validateConfig(config: LLMConfig): boolean;
  
  /**
   * Track token usage and cost
   */
  protected trackUsage(usage: {
    tokens: {
      prompt: number;
      completion: number;
      total: number;
    };
    model: string;
    provider: string;
  }): void {
    // Skip if usage tracking is disabled
    if (!this.config.usageTracking) {
      return;
    }
    
    // Calculate cost based on provider and model
    const cost = this.calculateCost(usage);
    
    // Add to usage history
    const usageRecord: LLMUsage = {
      tokens: usage.tokens,
      cost,
      date: new Date(),
      model: usage.model,
      provider: usage.provider
    };
    
    this.usageHistory.push(usageRecord);
    this.emit('usage', usageRecord);
  }
  
  /**
   * Calculate cost based on tokens, model, and provider
   */
  protected calculateCost(usage: {
    tokens: {
      prompt: number;
      completion: number;
      total: number;
    };
    model: string;
    provider: string;
  }): number {
    // Simplified cost calculation - in a real system, this would be more detailed
    const pricing: Record<string, { prompt: number; completion: number }> = {
      // OpenAI pricing (per 1K tokens)
      'gpt-4o': { prompt: 0.01, completion: 0.03 },
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      
      // Anthropic pricing (per 1K tokens)
      'claude-3-opus-20240229': { prompt: 0.015, completion: 0.075 },
      'claude-3-sonnet-20240229': { prompt: 0.003, completion: 0.015 },
      'claude-3-haiku-20240307': { prompt: 0.00025, completion: 0.00125 },
      
      // Default fallback pricing
      'default': { prompt: 0.01, completion: 0.03 }
    };
    
    const modelPricing = pricing[usage.model] || pricing['default'];
    
    const promptCost = (usage.tokens.prompt / 1000) * modelPricing.prompt;
    const completionCost = (usage.tokens.completion / 1000) * modelPricing.completion;
    
    return promptCost + completionCost;
  }
  
  /**
   * Get usage history
   */
  getUsageHistory(): LLMUsage[] {
    return [...this.usageHistory];
  }
  
  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.usageHistory.reduce((total, usage) => total + usage.cost, 0);
  }
}

export class OpenAIProvider extends LLMProvider {
  async initialize(config: LLMConfig): Promise<void> {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid OpenAI configuration');
    }
    this.config = config;
    this.initialized = true;
    
    // Test the API key with a simple request
    try {
      await axios.get('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });
    } catch (error) {
      this.initialized = false;
      throw new Error('Failed to initialize OpenAI API: Invalid API key');
    }
  }

  async generate(prompt: string, options?: Partial<LLMConfig>): Promise<LLMResponse> {
    if (!this.initialized) {
      throw new Error('OpenAI provider not initialized');
    }

    const mergedConfig = { ...this.config, ...options };
    
    try {
      const response = await axios.post(
        `${mergedConfig.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
        {
          model: mergedConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: mergedConfig.temperature,
          max_tokens: mergedConfig.maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mergedConfig.apiKey}`
          },
          timeout: mergedConfig.timeout || 30000
        }
      );
      
      const data = response.data;
      const text = data.choices[0]?.message?.content || '';
      const finishReason = data.choices[0]?.finish_reason || 'unknown';
      
      // Extract usage information
      const tokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0
      };
      
      // Track usage
      this.trackUsage({
        tokens,
        model: mergedConfig.model,
        provider: 'openai'
      });
      
      return {
        text,
        tokens,
        finishReason,
        metadata: {
          id: data.id,
          model: data.model,
          created: data.created
        }
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('OpenAI provider not initialized');
    }

    try {
      const response = await axios.post(
        `${this.config.baseUrl || 'https://api.openai.com/v1'}/embeddings`,
        {
          model: 'text-embedding-3-small',
          input: text
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          timeout: this.config.timeout || 30000
        }
      );
      
      const data = response.data;
      const embedding = data.data[0]?.embedding || [];
      
      // Track usage
      const tokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: 0,
        total: data.usage?.total_tokens || 0
      };
      
      this.trackUsage({
        tokens,
        model: 'text-embedding-3-small',
        provider: 'openai'
      });
      
      return embedding;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return (
      typeof config.provider === 'string' &&
      typeof config.model === 'string' &&
      typeof config.temperature === 'number' &&
      typeof config.maxTokens === 'number' &&
      config.temperature >= 0 &&
      config.temperature <= 1 &&
      config.maxTokens > 0 &&
      (config.apiKey !== undefined && typeof config.apiKey === 'string')
    );
  }
}

export class AnthropicProvider extends LLMProvider {
  async initialize(config: LLMConfig): Promise<void> {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid Anthropic configuration');
    }
    this.config = config;
    this.initialized = true;
    
    // Test the API key with a simple request
    try {
      await axios.get('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
    } catch (error) {
      this.initialized = false;
      throw new Error('Failed to initialize Anthropic API: Invalid API key');
    }
  }

  async generate(prompt: string, options?: Partial<LLMConfig>): Promise<LLMResponse> {
    if (!this.initialized) {
      throw new Error('Anthropic provider not initialized');
    }

    const mergedConfig = { ...this.config, ...options };
    
    try {
      const response = await axios.post(
        `${mergedConfig.baseUrl || 'https://api.anthropic.com/v1'}/messages`,
        {
          model: mergedConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: mergedConfig.temperature,
          max_tokens: mergedConfig.maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': mergedConfig.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: mergedConfig.timeout || 30000
        }
      );
      
      const data = response.data;
      const text = data.content[0]?.text || '';
      const finishReason = data.stop_reason || 'unknown';
      
      // Extract usage information
      const tokens = {
        prompt: data.usage?.input_tokens || 0,
        completion: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      };
      
      // Track usage
      this.trackUsage({
        tokens,
        model: mergedConfig.model,
        provider: 'anthropic'
      });
      
      return {
        text,
        tokens,
        finishReason,
        metadata: {
          id: data.id,
          model: data.model,
          type: data.type
        }
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('Anthropic provider not initialized');
    }

    // Anthropic doesn't have a dedicated embeddings API
    // For now, we'll throw an error
    throw new Error('Embedding functionality not available for Anthropic provider');
  }

  validateConfig(config: LLMConfig): boolean {
    return (
      typeof config.provider === 'string' &&
      typeof config.model === 'string' &&
      typeof config.temperature === 'number' &&
      typeof config.maxTokens === 'number' &&
      config.temperature >= 0 &&
      config.temperature <= 1 &&
      config.maxTokens > 0 &&
      (config.apiKey !== undefined && typeof config.apiKey === 'string')
    );
  }
}

export class OpenRouterProvider extends LLMProvider {
  async initialize(config: LLMConfig): Promise<void> {
    if (!this.validateConfig(config)) {
      throw new Error('Invalid OpenRouter configuration');
    }
    this.config = config;
    this.initialized = true;
    
    // Test the API key with a simple request
    try {
      await axios.get('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://juliaos.ai',  // Your site URL
          'X-Title': 'JuliaOS'                   // Your app name
        }
      });
    } catch (error) {
      this.initialized = false;
      throw new Error('Failed to initialize OpenRouter API: Invalid API key');
    }
  }

  async generate(prompt: string, options?: Partial<LLMConfig>): Promise<LLMResponse> {
    if (!this.initialized) {
      throw new Error('OpenRouter provider not initialized');
    }

    const mergedConfig = { ...this.config, ...options };
    
    try {
      const response = await axios.post(
        `${mergedConfig.baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`,
        {
          model: mergedConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: mergedConfig.temperature,
          max_tokens: mergedConfig.maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mergedConfig.apiKey}`,
            'HTTP-Referer': 'https://juliaos.ai',  // Your site URL
            'X-Title': 'JuliaOS'                   // Your app name
          },
          timeout: mergedConfig.timeout || 30000
        }
      );
      
      const data = response.data;
      const text = data.choices[0]?.message?.content || '';
      const finishReason = data.choices[0]?.finish_reason || 'unknown';
      
      // Extract usage information
      const tokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0
      };
      
      // Track usage
      this.trackUsage({
        tokens,
        model: mergedConfig.model,
        provider: 'openrouter'
      });
      
      return {
        text,
        tokens,
        finishReason,
        metadata: {
          id: data.id,
          model: data.model,
          created: data.created
        }
      };
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('OpenRouter provider not initialized');
    }

    try {
      const response = await axios.post(
        `${this.config.baseUrl || 'https://openrouter.ai/api/v1'}/embeddings`,
        {
          model: 'openai/text-embedding-ada-002', // Default embedding model
          input: text
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'HTTP-Referer': 'https://juliaos.ai',  // Your site URL
            'X-Title': 'JuliaOS'                   // Your app name
          },
          timeout: this.config.timeout || 30000
        }
      );
      
      const data = response.data;
      const embedding = data.data[0]?.embedding || [];
      
      // Track usage
      const tokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: 0,
        total: data.usage?.total_tokens || 0
      };
      
      this.trackUsage({
        tokens,
        model: 'openai/text-embedding-ada-002',
        provider: 'openrouter'
      });
      
      return embedding;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return (
      typeof config.provider === 'string' &&
      typeof config.model === 'string' &&
      typeof config.temperature === 'number' &&
      typeof config.maxTokens === 'number' &&
      config.temperature >= 0 &&
      config.temperature <= 1 &&
      config.maxTokens > 0 &&
      (config.apiKey !== undefined && typeof config.apiKey === 'string')
    );
  }
}

// Factory to create LLM providers
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider.toLowerCase()) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
} 