import { ethers } from 'ethers';
import { MarketDataService, MarketDataConfig } from '../market-data';
import { TradingService } from '../trading';
import { Agent } from '../agent';
import { Swarm } from '../swarm';
import { Token } from '../../tokens/types';
import { UniswapV3Service } from '../uniswap';

// Mock services
jest.mock('../market-data');
jest.mock('../trading');
jest.mock('../uniswap');

describe('Agent and Swarm Integration Tests', () => {
  let provider: ethers.Provider;
  let marketData: MarketDataService;
  let trading: TradingService;
  let uniswap: UniswapV3Service;

  beforeEach(() => {
    provider = new ethers.JsonRpcProvider('http://localhost:8545');
    
    const marketDataConfig: MarketDataConfig = {
      chainlinkFeeds: {},
      updateInterval: 5000,
      minConfidence: 0.95,
      maxStaleTime: 3600
    };
    
    marketData = new MarketDataService(provider, marketDataConfig);
    uniswap = new UniswapV3Service(provider);
    trading = new TradingService(provider, marketData, uniswap, {
      slippageTolerance: 0.005,
      maxFeePerGas: ethers.parseUnits('50', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
    });
  });

  describe('Agent Tests', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent({
        id: 'test-agent-1',
        tradingService: trading,
        marketDataService: marketData,
        riskParameters: {
          maxPositionSize: ethers.parseEther('1').toString(),
          stopLossPercentage: 0.05,
          takeProfitPercentage: 0.1
        },
        tradingParameters: {
          entryThreshold: 0.02,
          exitThreshold: 0.01,
          stopLossPercentage: 0.05,
          takeProfitPercentage: 0.1
        },
        strategy: {
          type: 'momentum',
          parameters: {
            momentumThreshold: 0.03,
            volumeThreshold: 0.05
          }
        }
      });
    });

    test('should initialize agent with correct configuration', () => {
      expect(agent.id).toBe('test-agent-1');
      expect(agent.getState()).toBeDefined();
    });

    test('should update state correctly', async () => {
      const mockState = {
        currentPosition: ethers.parseEther('0.5'),
        entryPrice: ethers.parseEther('2000'),
        lastUpdate: Date.now()
      };

      await agent.saveState(mockState);
      const loadedState = await agent.loadState();
      expect(loadedState).toEqual(mockState);
    });
  });

  describe('Swarm Tests', () => {
    let swarm: Swarm;
    let agents: Agent[];

    beforeEach(() => {
      agents = [
        new Agent({
          id: 'test-agent-1',
          tradingService: trading,
          marketDataService: marketData,
          riskParameters: {
            maxPositionSize: ethers.parseEther('1').toString(),
            stopLossPercentage: 0.05,
            takeProfitPercentage: 0.1
          },
          tradingParameters: {
            entryThreshold: 0.02,
            exitThreshold: 0.01,
            stopLossPercentage: 0.05,
            takeProfitPercentage: 0.1
          },
          strategy: {
            type: 'momentum',
            parameters: {
              momentumThreshold: 0.03,
              volumeThreshold: 0.05
            }
          }
        }),
        new Agent({
          id: 'test-agent-2',
          tradingService: trading,
          marketDataService: marketData,
          riskParameters: {
            maxPositionSize: ethers.parseEther('2').toString(),
            stopLossPercentage: 0.07,
            takeProfitPercentage: 0.15
          },
          tradingParameters: {
            entryThreshold: 0.03,
            exitThreshold: 0.015,
            stopLossPercentage: 0.07,
            takeProfitPercentage: 0.15
          },
          strategy: {
            type: 'trend-following',
            parameters: {
              shortPeriod: 20,
              longPeriod: 50
            }
          }
        })
      ];

      swarm = new Swarm({
        agents,
        coordinationStrategy: 'hierarchical',
        coordinationParameters: {
          leaderWeight: 0.6,
          followerWeight: 0.4
        }
      });
    });

    test('should initialize swarm with correct configuration', () => {
      expect(swarm.getAgents().length).toBe(2);
      expect(swarm.getMetrics()).toBeDefined();
    });

    test('should coordinate agents correctly', async () => {
      const initialMetrics = swarm.getMetrics();
      await swarm.coordinate();
      const updatedMetrics = swarm.getMetrics();
      expect(updatedMetrics.lastCoordination).toBeGreaterThan(initialMetrics.lastCoordination);
    });

    test('should persist swarm state', async () => {
      const mockState = {
        metrics: {
          totalPnL: ethers.parseEther('1000'),
          successRate: 0.75,
          lastCoordination: Date.now()
        },
        agentStates: {}
      };

      await swarm.saveState(mockState);
      const loadedState = await swarm.loadState();
      expect(loadedState).toEqual(mockState);
    });
  });
}); 