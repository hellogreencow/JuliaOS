import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { JuliaBridge } from '@j3os/julia-bridge';
import {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentManagerEvent,
  CreateAgentRequest,
  CreateAgentResponse,
  UpdateAgentRequest,
  UpdateAgentResponse,
  GetAgentStateRequest,
  GetAgentStateResponse,
  RegisterSkillRequest,
  RegisterSkillResponse,
  SwarmConfig,
  SwarmState,
  SwarmStatus,
  CreateSwarmRequest,
  CreateSwarmResponse,
  UpdateSwarmRequest,
  UpdateSwarmResponse,
  GetSwarmStateRequest,
  GetSwarmStateResponse,
  BroadcastMessageRequest,
  BroadcastMessageResponse,
  ErrorResponse,
  AgentSkill
} from './types';

/**
 * AgentManager class for managing agents and swarms
 */
export class AgentManager extends EventEmitter {
  private juliaBridge: JuliaBridge;
  private agents: Record<string, AgentState> = {};
  private swarms: Record<string, SwarmState> = {};
  private initialized: boolean = false;

  /**
   * Constructor
   * @param juliaBridge The JuliaBridge instance
   */
  constructor(juliaBridge: JuliaBridge) {
    super();
    this.juliaBridge = juliaBridge;
  }

  /**
   * Initialize the agent manager
   */
  public async initialize(): Promise<boolean> {
    try {
      // Initialize JuliaBridge if not already initialized
      await this.juliaBridge.initialize();

      // Register event handlers
      this.juliaBridge.on('error', (error) => {
        this.emit(AgentManagerEvent.AGENT_ERROR, error);
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize AgentManager:', error);
      return false;
    }
  }

  /**
   * Create a new agent
   * @param request The create agent request
   * @returns The create agent response
   */
  public async createAgent(request: CreateAgentRequest): Promise<CreateAgentResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      // Generate a unique ID for the agent
      const id = uuidv4();
      const version = '1.0.0';

      // Create default capabilities if not provided
      const capabilities = request.capabilities || this.getDefaultCapabilities(request.agentType);

      // Create agent config
      const config: AgentConfig = {
        id,
        name: request.name,
        version,
        agentType: request.agentType,
        capabilities,
        maxMemory: 1024,
        maxSkills: 10,
        updateInterval: 60000,
        networkConfigs: request.networkConfigs || {},
        llmConfig: request.llmConfig
      };

      // Create agent in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('create_agent', {
        config: this.convertToJuliaAgentConfig(config)
      });

      if (result.success) {
        // Create agent state
        const agentState: AgentState = {
          config,
          memory: {},
          skills: {},
          connections: {},
          lastUpdate: new Date(),
          status: AgentStatus.INITIALIZING,
          errorCount: 0,
          recoveryAttempts: 0
        };

        // Store agent
        this.agents[id] = agentState;

        // Update agent status
        this.updateAgentStatus(id, AgentStatus.ACTIVE);

        // Emit event
        this.emit(AgentManagerEvent.AGENT_CREATED, {
          id,
          name: request.name,
          status: AgentStatus.ACTIVE
        });

        return {
          id,
          name: request.name,
          status: AgentStatus.ACTIVE
        };
      } else {
        return {
          error: result.error || 'Failed to create agent',
          code: 'CREATION_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error creating agent:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Update an existing agent
   * @param request The update agent request
   * @returns The update agent response
   */
  public async updateAgent(request: UpdateAgentRequest): Promise<UpdateAgentResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { id } = request;
      
      // Check if agent exists
      if (!this.agents[id]) {
        return {
          error: `Agent with id ${id} not found`,
          code: 'AGENT_NOT_FOUND'
        };
      }

      const agent = this.agents[id];
      const updates: Partial<AgentConfig> = {};

      // Update name if provided
      if (request.name) {
        updates.name = request.name;
      }

      // Update capabilities if provided
      if (request.capabilities) {
        updates.capabilities = request.capabilities;
      }

      // Update network configs if provided
      if (request.networkConfigs) {
        updates.networkConfigs = request.networkConfigs;
      }

      // Update LLM config if provided
      if (request.llmConfig) {
        updates.llmConfig = request.llmConfig;
      }

      // Update agent config
      const updatedConfig = {
        ...agent.config,
        ...updates
      };

      // Update agent in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('update_agent', {
        id,
        updates: this.convertToJuliaAgentUpdates(updates)
      });

      if (result.success) {
        // Update agent config
        agent.config = updatedConfig;
        agent.lastUpdate = new Date();

        // Emit event
        this.emit(AgentManagerEvent.AGENT_UPDATED, {
          id,
          name: agent.config.name,
          status: agent.status
        });

        return {
          id,
          name: agent.config.name,
          status: agent.status
        };
      } else {
        return {
          error: result.error || 'Failed to update agent',
          code: 'UPDATE_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error updating agent:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Get the state of an agent
   * @param request The get agent state request
   * @returns The get agent state response
   */
  public async getAgentState(request: GetAgentStateRequest): Promise<GetAgentStateResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { agentId } = request;
      
      // Check if agent exists
      if (!this.agents[agentId]) {
        return {
          error: `Agent with id ${agentId} not found`,
          code: 'AGENT_NOT_FOUND'
        };
      }

      // Get agent state from Julia backend
      const result = await this.juliaBridge.runJuliaCommand('get_agent_state', {
        agent_id: agentId
      });

      if (result.success) {
        // Update local agent state with the latest from Julia
        this.updateAgentStateFromJulia(agentId, result.data.state);

        return {
          id: agentId,
          state: this.agents[agentId]
        };
      } else {
        return {
          error: result.error || 'Failed to get agent state',
          code: 'GET_STATE_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error getting agent state:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Register a skill for an agent
   * @param request The register skill request
   * @returns The register skill response
   */
  public async registerAgentSkill(request: RegisterSkillRequest): Promise<RegisterSkillResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { agentId, skill } = request;
      
      // Check if agent exists
      if (!this.agents[agentId]) {
        return {
          error: `Agent with id ${agentId} not found`,
          code: 'AGENT_NOT_FOUND'
        };
      }

      // Check if agent has the required capabilities
      const agent = this.agents[agentId];
      const missingCapabilities = skill.requiredCapabilities.filter(
        cap => !agent.config.capabilities.includes(cap)
      );

      if (missingCapabilities.length > 0) {
        return {
          error: `Agent is missing required capabilities: ${missingCapabilities.join(', ')}`,
          code: 'MISSING_CAPABILITIES'
        };
      }

      // Register skill in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('register_skill', {
        agent_id: agentId,
        skill: this.convertToJuliaSkill(skill)
      });

      if (result.success) {
        // Add skill to agent
        agent.skills[skill.name] = skill;
        agent.lastUpdate = new Date();

        return {
          agentId,
          skillName: skill.name,
          success: true
        };
      } else {
        return {
          error: result.error || 'Failed to register skill',
          code: 'REGISTRATION_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error registering skill:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Create a new swarm
   * @param request The create swarm request
   * @returns The create swarm response
   */
  public async createSwarm(request: CreateSwarmRequest): Promise<CreateSwarmResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      // Generate a unique ID for the swarm
      const id = uuidv4();
      const version = '1.0.0';

      // Create swarm config
      const config: SwarmConfig = {
        id,
        name: request.name,
        version,
        agentConfigs: request.agentConfigs,
        coordinationProtocol: request.coordinationProtocol || 'consensus',
        decisionThreshold: request.decisionThreshold || 0.7,
        maxAgents: request.agentConfigs.length * 2,
        updateInterval: 60000
      };

      // Create swarm in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('create_swarm', {
        config: this.convertToJuliaSwarmConfig(config)
      });

      if (result.success) {
        // Create swarm state
        const swarmState: SwarmState = {
          config,
          agents: {},
          messages: [],
          decisions: {},
          lastUpdate: new Date(),
          status: SwarmStatus.INITIALIZING
        };

        // Store swarm
        this.swarms[id] = swarmState;

        // Update swarm status
        this.updateSwarmStatus(id, SwarmStatus.ACTIVE);

        // Emit event
        this.emit(AgentManagerEvent.SWARM_CREATED, {
          id,
          name: request.name,
          status: SwarmStatus.ACTIVE
        });

        return {
          id,
          name: request.name,
          status: SwarmStatus.ACTIVE
        };
      } else {
        return {
          error: result.error || 'Failed to create swarm',
          code: 'CREATION_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error creating swarm:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Update an existing swarm
   * @param request The update swarm request
   * @returns The update swarm response
   */
  public async updateSwarm(request: UpdateSwarmRequest): Promise<UpdateSwarmResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { id } = request;
      
      // Check if swarm exists
      if (!this.swarms[id]) {
        return {
          error: `Swarm with id ${id} not found`,
          code: 'SWARM_NOT_FOUND'
        };
      }

      const swarm = this.swarms[id];
      const updates: Partial<SwarmConfig> = {};

      // Update name if provided
      if (request.name) {
        updates.name = request.name;
      }

      // Update agent configs if provided
      if (request.agentConfigs) {
        updates.agentConfigs = request.agentConfigs;
      }

      // Update coordination protocol if provided
      if (request.coordinationProtocol) {
        updates.coordinationProtocol = request.coordinationProtocol;
      }

      // Update decision threshold if provided
      if (request.decisionThreshold) {
        updates.decisionThreshold = request.decisionThreshold;
      }

      // Update swarm config
      const updatedConfig = {
        ...swarm.config,
        ...updates
      };

      // Update swarm in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('update_swarm', {
        id,
        updates: this.convertToJuliaSwarmUpdates(updates)
      });

      if (result.success) {
        // Update swarm config
        swarm.config = updatedConfig;
        swarm.lastUpdate = new Date();

        // Emit event
        this.emit(AgentManagerEvent.SWARM_UPDATED, {
          id,
          name: swarm.config.name,
          status: swarm.status
        });

        return {
          id,
          name: swarm.config.name,
          status: swarm.status
        };
      } else {
        return {
          error: result.error || 'Failed to update swarm',
          code: 'UPDATE_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error updating swarm:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Get the state of a swarm
   * @param request The get swarm state request
   * @returns The get swarm state response
   */
  public async getSwarmState(request: GetSwarmStateRequest): Promise<GetSwarmStateResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { swarmId } = request;
      
      // Check if swarm exists
      if (!this.swarms[swarmId]) {
        return {
          error: `Swarm with id ${swarmId} not found`,
          code: 'SWARM_NOT_FOUND'
        };
      }

      // Get swarm state from Julia backend
      const result = await this.juliaBridge.runJuliaCommand('get_swarm_state', {
        swarm_id: swarmId
      });

      if (result.success) {
        // Update local swarm state with the latest from Julia
        this.updateSwarmStateFromJulia(swarmId, result.data.state);

        return {
          id: swarmId,
          state: this.swarms[swarmId]
        };
      } else {
        return {
          error: result.error || 'Failed to get swarm state',
          code: 'GET_STATE_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error getting swarm state:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Broadcast a message to all agents in a swarm
   * @param request The broadcast message request
   * @returns The broadcast message response
   */
  public async broadcastSwarmMessage(request: BroadcastMessageRequest): Promise<BroadcastMessageResponse | ErrorResponse> {
    if (!this.initialized) {
      return { error: 'AgentManager not initialized', code: 'NOT_INITIALIZED' };
    }

    try {
      const { swarmId, message } = request;
      
      // Check if swarm exists
      if (!this.swarms[swarmId]) {
        return {
          error: `Swarm with id ${swarmId} not found`,
          code: 'SWARM_NOT_FOUND'
        };
      }

      // Generate message ID
      const messageId = uuidv4();
      
      // Add message ID and timestamp
      const fullMessage = {
        ...message,
        id: messageId,
        timestamp: new Date()
      };

      // Broadcast message in Julia backend
      const result = await this.juliaBridge.runJuliaCommand('broadcast_message', {
        swarm_id: swarmId,
        message: this.convertToJuliaMessage(fullMessage)
      });

      if (result.success) {
        // Add message to swarm
        this.swarms[swarmId].messages.push(fullMessage);
        this.swarms[swarmId].lastUpdate = new Date();

        // Emit event
        this.emit(AgentManagerEvent.SWARM_MESSAGE, {
          swarmId,
          messageId,
          message: fullMessage
        });

        return {
          swarmId,
          messageId,
          deliveredTo: result.data.delivered_to || []
        };
      } else {
        return {
          error: result.error || 'Failed to broadcast message',
          code: 'BROADCAST_FAILED'
        };
      }
    } catch (error: any) {
      console.error('Error broadcasting message:', error);
      return {
        error: error.message || 'Unknown error',
        code: 'INTERNAL_ERROR',
        details: error
      };
    }
  }

  /**
   * Get the default capabilities for an agent type
   * @param agentType The agent type
   * @returns The default capabilities
   */
  private getDefaultCapabilities(agentType: string): string[] {
    switch (agentType.toLowerCase()) {
      case 'trading':
        return ['dex', 'price-oracle', 'trade-execution', 'market-analysis'];
      case 'analysis':
        return ['data-processing', 'technical-analysis', 'sentiment-analysis'];
      case 'execution':
        return ['transaction-monitoring', 'gas-optimization', 'blockchain-interaction'];
      case 'monitoring':
        return ['alerts', 'metrics', 'health-checks', 'logging'];
      default:
        return ['basic'];
    }
  }

  /**
   * Update the status of an agent
   * @param agentId The agent ID
   * @param status The new status
   */
  private updateAgentStatus(agentId: string, status: AgentStatus): void {
    if (this.agents[agentId]) {
      const prevStatus = this.agents[agentId].status;
      this.agents[agentId].status = status;
      this.agents[agentId].lastUpdate = new Date();
      
      if (prevStatus !== status) {
        this.emit(AgentManagerEvent.AGENT_STATUS_CHANGED, {
          id: agentId,
          prevStatus,
          newStatus: status
        });
      }
    }
  }

  /**
   * Update the status of a swarm
   * @param swarmId The swarm ID
   * @param status The new status
   */
  private updateSwarmStatus(swarmId: string, status: SwarmStatus): void {
    if (this.swarms[swarmId]) {
      const prevStatus = this.swarms[swarmId].status;
      this.swarms[swarmId].status = status;
      this.swarms[swarmId].lastUpdate = new Date();
      
      if (prevStatus !== status) {
        this.emit(AgentManagerEvent.SWARM_STATUS_CHANGED, {
          id: swarmId,
          prevStatus,
          newStatus: status
        });
      }
    }
  }

  /**
   * Update agent state from Julia backend
   * @param agentId The agent ID
   * @param juliaState The agent state from Julia
   */
  private updateAgentStateFromJulia(agentId: string, juliaState: any): void {
    if (this.agents[agentId]) {
      // Update status
      this.updateAgentStatus(agentId, this.convertFromJuliaStatus(juliaState.status));
      
      // Update memory
      this.agents[agentId].memory = juliaState.memory || {};
      
      // Update error count and recovery attempts
      this.agents[agentId].errorCount = juliaState.error_count || 0;
      this.agents[agentId].recoveryAttempts = juliaState.recovery_attempts || 0;
      
      // Update last update time
      this.agents[agentId].lastUpdate = new Date();
    }
  }

  /**
   * Update swarm state from Julia backend
   * @param swarmId The swarm ID
   * @param juliaState The swarm state from Julia
   */
  private updateSwarmStateFromJulia(swarmId: string, juliaState: any): void {
    if (this.swarms[swarmId]) {
      // Update status
      this.updateSwarmStatus(swarmId, this.convertFromJuliaSwarmStatus(juliaState.status));
      
      // Update decisions
      this.swarms[swarmId].decisions = juliaState.decisions || {};
      
      // Update last update time
      this.swarms[swarmId].lastUpdate = new Date();
    }
  }

  /**
   * Convert agent status from Julia format
   * @param status The Julia status
   * @returns The TypeScript status
   */
  private convertFromJuliaStatus(status: string): AgentStatus {
    switch (status) {
      case 'initializing':
        return AgentStatus.INITIALIZING;
      case 'active':
        return AgentStatus.ACTIVE;
      case 'paused':
        return AgentStatus.PAUSED;
      case 'error':
        return AgentStatus.ERROR;
      case 'shutdown':
        return AgentStatus.SHUTDOWN;
      case 'recovering':
        return AgentStatus.RECOVERING;
      default:
        return AgentStatus.ERROR;
    }
  }

  /**
   * Convert swarm status from Julia format
   * @param status The Julia status
   * @returns The TypeScript status
   */
  private convertFromJuliaSwarmStatus(status: string): SwarmStatus {
    switch (status) {
      case 'initializing':
        return SwarmStatus.INITIALIZING;
      case 'active':
        return SwarmStatus.ACTIVE;
      case 'paused':
        return SwarmStatus.PAUSED;
      case 'error':
        return SwarmStatus.ERROR;
      case 'shutdown':
        return SwarmStatus.SHUTDOWN;
      case 'scaling':
        return SwarmStatus.SCALING;
      default:
        return SwarmStatus.ERROR;
    }
  }

  /**
   * Convert agent config to Julia format
   * @param config The agent config
   * @returns The Julia agent config
   */
  private convertToJuliaAgentConfig(config: AgentConfig): any {
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      agent_type: config.agentType,
      capabilities: config.capabilities,
      max_memory: config.maxMemory,
      max_skills: config.maxSkills,
      update_interval: config.updateInterval,
      network_configs: this.convertToJuliaNetworkConfigs(config.networkConfigs)
    };
  }

  /**
   * Convert network configs to Julia format
   * @param networkConfigs The network configs
   * @returns The Julia network configs
   */
  private convertToJuliaNetworkConfigs(networkConfigs: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, config] of Object.entries(networkConfigs)) {
      result[key] = {
        type: config.type,
        chain_id: config.chainId,
        rpc_url: config.rpcUrl,
        ws_url: config.wsUrl,
        native_currency: config.nativeCurrency,
        block_time: config.blockTime,
        confirmations_required: config.confirmationsRequired,
        max_gas_price: config.maxGasPrice,
        max_priority_fee: config.maxPriorityFee,
        
        // DEX specific fields
        name: config.name,
        version: config.version,
        router_address: config.routerAddress,
        factory_address: config.factoryAddress,
        weth_address: config.wethAddress,
        router_abi: config.routerAbi,
        factory_abi: config.factoryAbi,
        pair_abi: config.pairAbi,
        token_abi: config.tokenAbi,
        gas_limit: config.gasLimit,
        gas_price: config.gasPrice,
        slippage_tolerance: config.slippageTolerance,
        
        // API specific fields
        api_key: config.apiKey,
        api_url: config.apiUrl,
        api_version: config.apiVersion,
        timeout_ms: config.timeoutMs,
        rate_limit_per_second: config.rateLimitPerSecond
      };
    }
    
    return result;
  }

  /**
   * Convert agent updates to Julia format
   * @param updates The agent updates
   * @returns The Julia agent updates
   */
  private convertToJuliaAgentUpdates(updates: Partial<AgentConfig>): any {
    const result: any = {};
    
    if (updates.name) {
      result.name = updates.name;
    }
    
    if (updates.capabilities) {
      result.capabilities = updates.capabilities;
    }
    
    if (updates.networkConfigs) {
      result.network_configs = this.convertToJuliaNetworkConfigs(updates.networkConfigs);
    }
    
    return result;
  }

  /**
   * Convert skill to Julia format
   * @param skill The agent skill
   * @returns The Julia agent skill
   */
  private convertToJuliaSkill(skill: AgentSkill): any {
    return {
      name: skill.name,
      description: skill.description,
      required_capabilities: skill.requiredCapabilities,
      parameters: skill.parameters.map(param => ({
        name: param.name,
        type: param.type,
        description: param.description,
        required: param.required,
        default_value: param.defaultValue
      }))
    };
  }

  /**
   * Convert swarm config to Julia format
   * @param config The swarm config
   * @returns The Julia swarm config
   */
  private convertToJuliaSwarmConfig(config: SwarmConfig): any {
    return {
      id: config.id,
      name: config.name,
      version: config.version,
      agent_configs: config.agentConfigs.map(agentConfig => this.convertToJuliaAgentConfig(agentConfig)),
      coordination_protocol: config.coordinationProtocol,
      decision_threshold: config.decisionThreshold,
      max_agents: config.maxAgents,
      update_interval: config.updateInterval
    };
  }

  /**
   * Convert swarm updates to Julia format
   * @param updates The swarm updates
   * @returns The Julia swarm updates
   */
  private convertToJuliaSwarmUpdates(updates: Partial<SwarmConfig>): any {
    const result: any = {};
    
    if (updates.name) {
      result.name = updates.name;
    }
    
    if (updates.agentConfigs) {
      result.agent_configs = updates.agentConfigs.map(agentConfig => 
        this.convertToJuliaAgentConfig(agentConfig)
      );
    }
    
    if (updates.coordinationProtocol) {
      result.coordination_protocol = updates.coordinationProtocol;
    }
    
    if (updates.decisionThreshold) {
      result.decision_threshold = updates.decisionThreshold;
    }
    
    return result;
  }

  /**
   * Convert message to Julia format
   * @param message The agent message
   * @returns The Julia agent message
   */
  private convertToJuliaMessage(message: any): any {
    return {
      id: message.id,
      sender_id: message.senderId,
      receiver_id: message.receiverId,
      message_type: message.messageType,
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      priority: message.priority,
      requires_response: message.requiresResponse
    };
  }
}