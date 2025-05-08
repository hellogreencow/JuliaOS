import { ethers } from 'ethers';
import { MarketDataService, MarketDataConfig } from './market-data';
import { TradingService } from './trading';
import { Agent, AgentConfig } from './agent';
import { Swarm } from './swarm';
import { Token } from '../tokens/types';
import { USDC, WETH } from '../tokens';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Define test tokens
const TOP_TOKENS: Token[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
    chainId: 1
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    decimals: 8,
    chainId: 1
  }
];

const USDC: Token = {
  symbol: 'USDC',
  name: 'USD Coin',
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
  chainId: 1
};

// Define market data config
const marketDataConfig = {
  chainlinkFeeds: {
    [TOP_TOKENS[0].address]: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD
    [TOP_TOKENS[1].address]: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'  // BTC/USD
  },
  updateInterval: 60000, // 1 minute
  minConfidence: 0.8
};

// Define risk parameters
const riskParams = {
  maxPositionSize: '1000',
  maxDrawdown: 10,
  maxDailyLoss: 5,
  maxOpenPositions: 5
};

// Mock UniswapV3Service
class MockUniswapV3Service {
  async calculatePriceImpact(token: Token, amount: string): Promise<number> {
    return 0.1; // Mock 0.1% price impact
  }

  async swapExactTokensForTokens(token: Token, amount: string): Promise<any> {
    return {
      wait: async () => {}
    };
  }
}

async function testCLI() {
  console.log('\nTesting CLI Interface...');

  try {
    // Test agent creation
    console.log('\nTesting agent creation via CLI...');
    await execAsync('juliaos agent create test-agent --type trading --strategy momentum');
    console.log('✅ Agent creation successful');

    // Test swarm creation
    console.log('\nTesting swarm creation via CLI...');
    await execAsync('juliaos swarm create test-swarm --type trading --agents 3');
    console.log('✅ Swarm creation successful');

    // Test agent management
    console.log('\nTesting agent management via CLI...');
    await execAsync('juliaos agent start test-agent');
    await execAsync('juliaos agent list');
    await execAsync('juliaos agent stop test-agent');
    console.log('✅ Agent management successful');

    // Test swarm management
    console.log('\nTesting swarm management via CLI...');
    await execAsync('juliaos swarm start test-swarm');
    await execAsync('juliaos swarm list');
    await execAsync('juliaos swarm stop test-swarm');
    console.log('✅ Swarm management successful');

  } catch (error) {
    console.error('❌ CLI test failed:', error);
    throw error;
  }
}

async function testFramework() {
  console.log('\nTesting Framework Interface...');

  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC_URL);

    // Initialize services
    const marketData = new MarketDataService(provider, marketDataConfig);
    const uniswap = new MockUniswapV3Service();
    const trading = new TradingService(provider, marketData, uniswap, riskParams);

    // Create agent configurations
    const agentConfigs: AgentConfig[] = [
      {
        id: 'momentum-agent',
        riskParams: {
          maxPositionSize: '1000',
          maxDailyLoss: 5,
          maxDrawdown: 10,
          maxOpenPositions: 5
        },
        tradingParams: {
          minConfidence: 0.8,
          maxSlippage: 0.5,
          stopLossPercentage: 2,
          takeProfitPercentage: 4
        },
        strategy: {
          type: 'momentum',
          parameters: {
            momentumThreshold: 2,
            volumeThreshold: 1.5
          }
        }
      },
      {
        id: 'mean-reversion-agent',
        riskParams: {
          maxPositionSize: '1000',
          maxDailyLoss: 5,
          maxDrawdown: 10,
          maxOpenPositions: 5
        },
        tradingParams: {
          minConfidence: 0.8,
          maxSlippage: 0.5,
          stopLossPercentage: 2,
          takeProfitPercentage: 4
        },
        strategy: {
          type: 'mean-reversion',
          parameters: {
            deviationThreshold: 3
          }
        }
      }
    ];

    // Test individual agents
    console.log('\nTesting individual agents...');
    for (const agentConfig of agentConfigs) {
      const agent = new Agent(provider, marketData, trading, agentConfig);
      await testAgent(agent);
    }

    // Create and test swarm
    console.log('\nTesting swarm...');
    const swarmConfig = {
      id: 'test-swarm',
      agents: agentConfigs,
      riskParams: {
        maxTotalExposure: '5000',
        maxDrawdown: 15,
        maxDailyLoss: 10
      },
      coordination: {
        strategy: 'hierarchical',
        parameters: {
          decayFactor: 0.5
        }
      }
    };

    const swarm = new Swarm(provider, marketData, trading, swarmConfig);
    await testSwarm(swarm);

    console.log('✅ Framework tests completed successfully');

  } catch (error) {
    console.error('❌ Framework test failed:', error);
    throw error;
  }
}

async function testAgent(agent: Agent): Promise<void> {
  console.log(`\nTesting agent: ${agent.getConfig().id}`);
  
  try {
    // Test agent initialization
    console.log('Testing agent initialization...');
    expect(agent).toBeDefined();
    expect(agent.getConfig().id).toBeDefined();

    // Test agent update
    console.log('Testing agent update...');
    await agent.update();
    
    // Test agent metrics
    console.log('Testing agent metrics...');
    const metrics = agent.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalTrades).toBeGreaterThanOrEqual(0);
    
    // Test agent state persistence
    console.log('Testing agent state persistence...');
    await agent.saveState();
    const loadedState = await agent.loadState();
    expect(loadedState).toBeDefined();

    console.log('✅ Agent tests passed');

  } catch (error) {
    console.error(`❌ Agent test failed for ${agent.getConfig().id}:`, error);
    throw error;
  }
}

async function testSwarm(swarm: Swarm): Promise<void> {
  console.log(`\nTesting swarm: ${swarm.getConfig().id}`);
  
  try {
    // Test swarm initialization
    console.log('Testing swarm initialization...');
    expect(swarm).toBeDefined();
    expect(swarm.getConfig().id).toBeDefined();

    // Test swarm update
    console.log('Testing swarm update...');
    await swarm.update();
    
    // Test swarm metrics
    console.log('Testing swarm metrics...');
    const metrics = swarm.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalAgents).toBeGreaterThan(0);
    
    // Test swarm coordination
    console.log('Testing swarm coordination...');
    await swarm.coordinate();
    
    // Test swarm state persistence
    console.log('Testing swarm state persistence...');
    await swarm.saveState();
    const loadedState = await swarm.loadState();
    expect(loadedState).toBeDefined();

    console.log('✅ Swarm tests passed');

  } catch (error) {
    console.error(`❌ Swarm test failed for ${swarm.getConfig().id}:`, error);
    throw error;
  }
}

async function main() {
  console.log('Starting comprehensive test suite...\n');

  try {
    // Test CLI Interface
    await testCLI();

    // Test Framework Interface
    await testFramework();

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    }
  };
} 