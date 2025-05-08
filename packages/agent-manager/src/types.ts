import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { VectorStore } from '@langchain/core/vectorstores';

/**
 * Agent configuration interface
 */
export interface AgentConfig {
  id: string;
  name: string;
  version: string;
  agentType: string;
  capabilities: string[];
  maxMemory: number;
  maxSkills: number;
  updateInterval: number;
  networkConfigs: Record<string, NetworkConfig>;
  llmConfig?: LLMConfig;
}

/**
 * Agent state interface
 */
export interface AgentState {
  config: AgentConfig;
  memory: Record<string, any>;
  skills: Record<string, AgentSkill>;
  connections: Record<string, any>;
  lastUpdate: Date;
  status: AgentStatus;
  errorCount: number;
  recoveryAttempts: number;
}

/**
 * Network configuration interface
 */
export interface NetworkConfig {
  type: 'blockchain' | 'dex' | 'api';
  chainId?: string;
  rpcUrl?: string;
  wsUrl?: string;
  nativeCurrency?: string;
  blockTime?: number;
  confirmationsRequired?: number;
  maxGasPrice?: string;
  maxPriorityFee?: string;
  
  // DEX specific fields
  name?: string;
  version?: string;
  routerAddress?: string;
  factoryAddress?: string;
  wethAddress?: string;
  routerAbi?: string;
  factoryAbi?: string;
  pairAbi?: string;
  tokenAbi?: string;
  gasLimit?: string;
  gasPrice?: string;
  slippageTolerance?: number;
  
  // API specific fields
  apiKey?: string;
  apiUrl?: string;
  apiVersion?: string;
  timeoutMs?: number;
  rateLimitPerSecond?: number;
}

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'aws' | 'huggingface' | 'openrouter';
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  contextWindow?: number;
}

/**
 * Agent skill interface
 */
export interface AgentSkill {
  name: string;
  description: string;
  requiredCapabilities: string[];
  parameters: SkillParameter[];
  handler: (agent: AgentState, input: any) => Promise<any>;
  validator: (input: any) => boolean;
  errorHandler: (agent: AgentState, error: Error) => void;
}

/**
 * Skill parameter interface
 */
export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  defaultValue?: any;
}

/**
 * Agent message interface
 */
export interface AgentMessage {
  id: string;
  senderId: string;
  receiverId: string;
  messageType: string;
  content: Record<string, any>;
  timestamp: Date;
  priority: number;
  requiresResponse: boolean;
}

/**
 * Swarm configuration interface
 */
export interface SwarmConfig {
  id: string;
  name: string;
  version: string;
  agentConfigs: AgentConfig[];
  coordinationProtocol: string;
  decisionThreshold: number;
  maxAgents: number;
  updateInterval: number;
}

/**
 * Swarm state interface
 */
export interface SwarmState {
  config: SwarmConfig;
  agents: Record<string, AgentState>;
  messages: AgentMessage[];
  decisions: Record<string, any>;
  lastUpdate: Date;
  status: SwarmStatus;
}

/**
 * Agent memory interface
 */
export interface AgentMemory {
  shortTerm: VectorStore;
  longTerm: VectorStore;
  episodic: VectorStore;
}

/**
 * Agent profile interface
 */
export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  skills: AgentSkill[];
  model: BaseLanguageModel;
  memory: AgentMemory;
}

/**
 * Agent metrics interface
 */
export interface AgentMetrics {
  successRate: number;
  averageResponseTime: number;
  taskCompletion: number;
  learningProgress: number;
  collaborationScore: number;
}

/**
 * Agent status enum
 */
export enum AgentStatus {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
  SHUTDOWN = 'shutdown',
  RECOVERING = 'recovering'
}

/**
 * Swarm status enum
 */
export enum SwarmStatus {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
  SHUTDOWN = 'shutdown',
  SCALING = 'scaling'
}

/**
 * Agent manager events
 */
export enum AgentManagerEvent {
  AGENT_CREATED = 'agent-created',
  AGENT_UPDATED = 'agent-updated',
  AGENT_DELETED = 'agent-deleted',
  AGENT_STATUS_CHANGED = 'agent-status-changed',
  AGENT_ERROR = 'agent-error',
  AGENT_MESSAGE = 'agent-message',
  SWARM_CREATED = 'swarm-created',
  SWARM_UPDATED = 'swarm-updated',
  SWARM_DELETED = 'swarm-deleted',
  SWARM_STATUS_CHANGED = 'swarm-status-changed',
  SWARM_ERROR = 'swarm-error',
  SWARM_MESSAGE = 'swarm-message'
}

/**
 * Create agent request
 */
export interface CreateAgentRequest {
  name: string;
  agentType: string;
  capabilities?: string[];
  networkConfigs?: Record<string, NetworkConfig>;
  llmConfig?: LLMConfig;
}

/**
 * Create agent response
 */
export interface CreateAgentResponse {
  id: string;
  name: string;
  status: AgentStatus;
}

/**
 * Update agent request
 */
export interface UpdateAgentRequest {
  id: string;
  name?: string;
  capabilities?: string[];
  networkConfigs?: Record<string, NetworkConfig>;
  llmConfig?: LLMConfig;
}

/**
 * Update agent response
 */
export interface UpdateAgentResponse {
  id: string;
  name: string;
  status: AgentStatus;
}

/**
 * Register skill request
 */
export interface RegisterSkillRequest {
  agentId: string;
  skill: AgentSkill;
}

/**
 * Register skill response
 */
export interface RegisterSkillResponse {
  agentId: string;
  skillName: string;
  success: boolean;
}

/**
 * Get agent state request
 */
export interface GetAgentStateRequest {
  agentId: string;
}

/**
 * Get agent state response
 */
export interface GetAgentStateResponse {
  id: string;
  state: AgentState;
}

/**
 * Create swarm request
 */
export interface CreateSwarmRequest {
  name: string;
  agentConfigs: AgentConfig[];
  coordinationProtocol?: string;
  decisionThreshold?: number;
}

/**
 * Create swarm response
 */
export interface CreateSwarmResponse {
  id: string;
  name: string;
  status: SwarmStatus;
}

/**
 * Update swarm request
 */
export interface UpdateSwarmRequest {
  id: string;
  name?: string;
  agentConfigs?: AgentConfig[];
  coordinationProtocol?: string;
  decisionThreshold?: number;
}

/**
 * Update swarm response
 */
export interface UpdateSwarmResponse {
  id: string;
  name: string;
  status: SwarmStatus;
}

/**
 * Get swarm state request
 */
export interface GetSwarmStateRequest {
  swarmId: string;
}

/**
 * Get swarm state response
 */
export interface GetSwarmStateResponse {
  id: string;
  state: SwarmState;
}

/**
 * Broadcast message request
 */
export interface BroadcastMessageRequest {
  swarmId: string;
  message: Omit<AgentMessage, 'id' | 'timestamp'>;
}

/**
 * Broadcast message response
 */
export interface BroadcastMessageResponse {
  swarmId: string;
  messageId: string;
  deliveredTo: string[];
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
} 