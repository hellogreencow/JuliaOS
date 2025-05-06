import { JuliaBridge } from 'julia-bridge';
import { AgentManager, AgentManagerEvent, CreateAgentRequest, CreateSwarmRequest, GetAgentStateResponse } from '../index';
import path from 'path';

async function main() {
  try {
    console.log('Starting agent manager example...');
    
    // Create JuliaBridge
    const bridge = new JuliaBridge({
      debug: true,
      projectPath: path.resolve(process.cwd(), '../../../julia'),
      useWebSocket: true,
      wsUrl: 'ws://localhost:8052'
    });
    
    // Create AgentManager
    const agentManager = new AgentManager(bridge);
    
    // Register event handlers
    agentManager.on(AgentManagerEvent.AGENT_CREATED, (event) => {
      console.log('Agent created:', event);
    });
    
    agentManager.on(AgentManagerEvent.AGENT_STATUS_CHANGED, (event) => {
      console.log('Agent status changed:', event);
    });
    
    agentManager.on(AgentManagerEvent.SWARM_CREATED, (event) => {
      console.log('Swarm created:', event);
    });
    
    agentManager.on(AgentManagerEvent.SWARM_STATUS_CHANGED, (event) => {
      console.log('Swarm status changed:', event);
    });
    
    // Initialize agent manager
    console.log('Initializing agent manager...');
    await agentManager.initialize();
    
    // Create a trading agent
    console.log('Creating trading agent...');
    const tradingAgentRequest: CreateAgentRequest = {
      name: 'Trading Agent',
      agentType: 'Trading',
      capabilities: ['dex', 'price-oracle', 'trade-execution', 'market-analysis'],
      networkConfigs: {
        ethereum: {
          type: 'blockchain',
          chainId: '0x1',
          rpcUrl: 'https://mainnet.infura.io/v3/your-infura-key',
          wsUrl: 'wss://mainnet.infura.io/ws/v3/your-infura-key',
          nativeCurrency: 'ETH',
          blockTime: 12000,
          confirmationsRequired: 2,
          maxGasPrice: '100000000000',
          maxPriorityFee: '1500000000'
        }
      },
      llmConfig: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.2,
        maxTokens: 1000
      }
    };
    
    const tradingAgentResponse = await agentManager.createAgent(tradingAgentRequest);
    
    if ('error' in tradingAgentResponse) {
      console.error('Failed to create trading agent:', tradingAgentResponse.error);
      return;
    }
    
    console.log('Trading agent created:', tradingAgentResponse);
    const tradingAgentId = tradingAgentResponse.id;
    
    // Create an analysis agent
    console.log('Creating analysis agent...');
    const analysisAgentRequest: CreateAgentRequest = {
      name: 'Analysis Agent',
      agentType: 'Analysis',
      capabilities: ['data-processing', 'technical-analysis', 'sentiment-analysis'],
      llmConfig: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.1,
        maxTokens: 2000
      }
    };
    
    const analysisAgentResponse = await agentManager.createAgent(analysisAgentRequest);
    
    if ('error' in analysisAgentResponse) {
      console.error('Failed to create analysis agent:', analysisAgentResponse.error);
      return;
    }
    
    console.log('Analysis agent created:', analysisAgentResponse);
    const analysisAgentId = analysisAgentResponse.id;
    
    // Get the state of the trading agent
    console.log('Getting trading agent state...');
    const tradingAgentState = await agentManager.getAgentState({ agentId: tradingAgentId });
    
    if ('error' in tradingAgentState) {
      console.error('Failed to get trading agent state:', tradingAgentState.error);
      return;
    }
    
    console.log('Trading agent state:', tradingAgentState);
    
    // Get the state of the analysis agent
    console.log('Getting analysis agent state...');
    const analysisAgentState = await agentManager.getAgentState({ agentId: analysisAgentId });
    
    if ('error' in analysisAgentState) {
      console.error('Failed to get analysis agent state:', analysisAgentState.error);
      return;
    }
    
    console.log('Analysis agent state:', analysisAgentState);
    
    // Create a swarm with both agents
    console.log('Creating trading swarm...');
    const createSwarmRequest: CreateSwarmRequest = {
      name: 'Trading Swarm',
      agentConfigs: [
        tradingAgentState.state.config,
        analysisAgentState.state.config
      ],
      coordinationProtocol: 'consensus',
      decisionThreshold: 0.7
    };
    
    const swarmResponse = await agentManager.createSwarm(createSwarmRequest);
    
    if ('error' in swarmResponse) {
      console.error('Failed to create swarm:', swarmResponse.error);
      return;
    }
    
    console.log('Swarm created:', swarmResponse);
    const swarmId = swarmResponse.id;
    
    // Get the state of the swarm
    console.log('Getting swarm state...');
    const swarmState = await agentManager.getSwarmState({ swarmId });
    
    if ('error' in swarmState) {
      console.error('Failed to get swarm state:', swarmState.error);
    } else {
      console.log('Swarm state:', swarmState);
    }
    
    // Broadcast a message to the swarm
    console.log('Broadcasting message to swarm...');
    const broadcastResponse = await agentManager.broadcastSwarmMessage({
      swarmId,
      message: {
        senderId: 'system',
        receiverId: 'all',
        messageType: 'task',
        content: {
          task: 'analyze-market',
          parameters: {
            market: 'ETH/USDT',
            timeframe: '1h',
            indicators: ['RSI', 'MACD', 'BB']
          }
        },
        priority: 1,
        requiresResponse: true
      }
    });
    
    if ('error' in broadcastResponse) {
      console.error('Failed to broadcast message:', broadcastResponse.error);
    } else {
      console.log('Message broadcast:', broadcastResponse);
    }
    
    console.log('Example complete!');
  } catch (error) {
    console.error('Error in example:', error);
  }
}

main(); 