import { Swarm, SwarmConfig, Task, SwarmResult } from './Swarm';
import { SwarmRouter, RouterConfig } from './SwarmRouter';
import { BaseAgent } from '../agent/BaseAgent';
import { LLMConfig, LLMProvider, OpenAIProvider } from '../llm/LLMProvider';

export interface StandardSwarmConfig extends SwarmConfig {
  routerConfig: RouterConfig;
}

/**
 * StandardSwarm is a concrete implementation of Swarm that uses a SwarmRouter
 * for task routing and provides default implementations for all coordination strategies.
 */
export class StandardSwarm extends Swarm {
  private router: SwarmRouter;
  private updateInterval?: NodeJS.Timeout;
  private llmProvider: LLMProvider | null = null;
  
  /**
   * Create a new StandardSwarm
   * @param config Configuration options for the swarm
   */
  constructor(config: StandardSwarmConfig) {
    super(config);
    this.router = new SwarmRouter(config.routerConfig);
    
    // Listen for router events
    this.router.on('routingError', (data) => {
      this.emit('routingError', data);
    });
  }
  
  /**
   * Initialize the swarm and its components
   */
  async initialize(): Promise<void> {
    // Initialize the router
    await this.router.initialize(this.llmConfig);
    
    // Initialize any LLM if configured
    if (this.llmConfig) {
      await this.initializeLLM();
    }
    
    this.emit('initialized');
  }
  
  /**
   * Initialize the LLM provider
   */
  private async initializeLLM(): Promise<void> {
    try {
      // Create LLM provider based on config
      const provider = new OpenAIProvider();
      await provider.initialize(this.llmConfig!);
      
      // Store for later use
      this.llmProvider = provider;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Start the swarm's operations
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Swarm ${this.name} is already running.`);
    }
    
    // Start the swarm
    this.isRunning = true;
    
    // Start all agents
    for (const agent of this.agents.values()) {
      if (!agent.isActive()) {
        await agent.start();
      }
    }
    
    // Set up periodic tasks
    this.updateInterval = setInterval(() => {
      this.processTaskQueue();
    }, 1000);
    
    this.emit('started');
  }
  
  /**
   * Stop the swarm's operations
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      throw new Error(`Swarm ${this.name} is not running.`);
    }
    
    // Stop periodic tasks
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    // Stop all agents
    for (const agent of this.agents.values()) {
      if (agent.isActive()) {
        await agent.stop();
      }
    }
    
    // Clean up resources
    this.taskQueue = [];
    this.isRunning = false;
    
    this.emit('stopped');
  }
  
  /**
   * Route a task for coordinated execution (agents share information)
   * @param task The task to route
   */
  protected async routeTaskCoordinated(task: Task): Promise<SwarmResult> {
    // Coordinated execution: First analyze with all agents, then execute with the best
    const agents = Array.from(this.agents.values());
    
    // Each agent analyzes the task
    const analysisResults: Record<string, any> = {};
    for (const agent of agents) {
      if (agent.isActive()) {
        try {
          // Ask each agent to analyze but not execute
          const analysis = await agent.executeTask({
            ...task.data,
            action: 'analyze'
          });
          
          analysisResults[agent.getName()] = analysis;
        } catch (error) {
          // If an agent fails to analyze, continue with others
          console.error(`Agent ${agent.getName()} failed to analyze task:`, error);
        }
      }
    }
    
    // Choose the best agent based on analysis
    const selectedAgent = await this.router.routeTask(task, agents);
    if (!selectedAgent) {
      throw new Error(`No suitable agent found for task ${task.id}.`);
    }
    
    // Execute with the selected agent
    return this.executeTaskWithAgent(
      {
        ...task,
        data: {
          ...task.data,
          action: 'execute',
          analysisResults
        }
      }, 
      selectedAgent
    );
  }
  
  /**
   * Route a task for hierarchical execution (leader assigns to followers)
   * @param task The task to route
   */
  protected async routeTaskHierarchical(task: Task): Promise<SwarmResult> {
    const agents = Array.from(this.agents.values());
    
    // Find the leader agent (first in the list for simplicity)
    const leaderAgent = agents[0];
    if (!leaderAgent || !leaderAgent.isActive()) {
      throw new Error(`Leader agent not available for task ${task.id}.`);
    }
    
    // Leader determines the best agent to handle the task
    const leaderAnalysis = await leaderAgent.executeTask({
      ...task.data,
      action: 'delegate',
      availableAgents: agents.map(a => ({
        name: a.getName(),
        type: a.getType(),
        isActive: a.isActive()
      }))
    });
    
    // Get the agent selected by the leader
    const selectedAgentName = leaderAnalysis.selectedAgent;
    const selectedAgent = this.agents.get(selectedAgentName);
    
    if (!selectedAgent || !selectedAgent.isActive()) {
      // If selected agent is not available, fall back to the leader
      return this.executeTaskWithAgent(task, leaderAgent);
    }
    
    // Execute with the selected agent
    return this.executeTaskWithAgent(task, selectedAgent);
  }
  
  /**
   * Route a task for consensus execution (agents vote on approach)
   * @param task The task to route
   */
  protected async routeTaskConsensus(task: Task): Promise<SwarmResult> {
    const agents = Array.from(this.agents.values()).filter(a => a.isActive());
    
    if (agents.length === 0) {
      throw new Error(`No active agents available for consensus on task ${task.id}.`);
    }
    
    // Each agent proposes an approach
    const proposals: Record<string, any> = {};
    for (const agent of agents) {
      try {
        const proposal = await agent.executeTask({
          ...task.data,
          action: 'propose'
        });
        
        proposals[agent.getName()] = proposal;
      } catch (error) {
        // If an agent fails to propose, continue with others
        console.error(`Agent ${agent.getName()} failed to propose for task:`, error);
      }
    }
    
    // If no proposals were made, throw an error
    if (Object.keys(proposals).length === 0) {
      throw new Error(`No proposals received for task ${task.id}.`);
    }
    
    // Reach consensus (using LLM if available)
    let consensusResult: any;
    
    if (this.llmProvider) {
      // Use LLM to analyze proposals and reach consensus
      try {
        const prompt = `
          Task: ${JSON.stringify(task.data, null, 2)}
          
          Agents have proposed the following approaches:
          ${Object.entries(proposals).map(([agent, proposal]) => 
            `${agent}: ${JSON.stringify(proposal, null, 2)}`
          ).join('\n\n')}
          
          Based on these proposals, determine the best approach. Consider:
          1. Which approach is most likely to succeed?
          2. Is there a way to combine the best elements of multiple approaches?
          3. Which agent should execute the task?
          
          Respond with:
          {
            "selectedApproach": "description of the selected or combined approach",
            "selectedAgent": "name of the agent that should execute",
            "rationale": "explanation of why this is the best approach"
          }
        `;
        
        const response = await this.llmProvider.generate(prompt);
        consensusResult = JSON.parse(response.text);
        
        // Update metrics
        this.metrics.consensusEvents++;
        this.metrics.lastUpdated = Date.now();
      } catch (error) {
        // Fall back to simple majority if LLM fails
        console.error('Failed to reach consensus with LLM:', error);
        consensusResult = this.simpleConsensus(proposals);
      }
    } else {
      // Use simple majority if no LLM is available
      consensusResult = this.simpleConsensus(proposals);
    }
    
    // Execute with the selected agent
    const selectedAgent = this.agents.get(consensusResult.selectedAgent);
    if (!selectedAgent || !selectedAgent.isActive()) {
      // If selected agent is not available, choose another active agent
      return this.executeTaskWithAgent(
        {
          ...task,
          data: {
            ...task.data,
            approach: consensusResult.selectedApproach,
            rationale: consensusResult.rationale
          }
        }, 
        agents[0]
      );
    }
    
    // Execute with the selected agent
    return this.executeTaskWithAgent(
      {
        ...task,
        data: {
          ...task.data,
          approach: consensusResult.selectedApproach,
          rationale: consensusResult.rationale
        }
      }, 
      selectedAgent
    );
  }
  
  /**
   * Reach consensus using a simple majority
   * @param proposals The proposals from each agent
   */
  private simpleConsensus(proposals: Record<string, any>): any {
    // This is a very simplified consensus mechanism
    // In a real implementation, you would analyze the proposals
    // to find similarities and determine the best approach
    
    // For now, just pick the first proposal
    const selectedAgent = Object.keys(proposals)[0];
    
    return {
      selectedApproach: proposals[selectedAgent].approach || 'Default approach',
      selectedAgent: selectedAgent,
      rationale: 'Selected based on availability'
    };
  }
} 