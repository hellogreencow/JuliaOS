import { ethers } from 'ethers';
import { PositionManager } from './position';
import { RiskManager } from './risk';
import { ExecutionManager } from './execution';
import { MonitoringManager } from './monitoring';
import { MarketDataService } from './market-data';
import { UniswapV3Service } from './uniswap';

export interface TradingSystemParams {
  // Risk parameters
  maxPositionSize: string;
  maxTotalExposure: string;
  maxDrawdown: number;
  maxDailyLoss: string;
  maxOpenPositions: number;
  minLiquidity: string;
  slippageTolerance: number;

  // Execution parameters
  gasLimit: number;
  maxSlippage: number;
  minConfirmations: number;
  priorityFee: string;
  maxFeePerGas: string;

  // Monitoring parameters
  updateInterval: number;
  metricsRetention: number;
  alertThresholds: {
    drawdown: number;
    slippage: number;
    executionTime: number;
    errorRate: number;
  };
}

export class TradingSystem {
  private positionManager: PositionManager;
  private riskManager: RiskManager;
  private executionManager: ExecutionManager;
  private monitoringManager: MonitoringManager;
  private marketData: MarketDataService;
  private uniswap: UniswapV3Service;
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private isRunning: boolean;

  constructor(
    params: TradingSystemParams,
    marketData: MarketDataService,
    uniswap: UniswapV3Service,
    provider: ethers.Provider,
    signer: ethers.Signer
  ) {
    this.marketData = marketData;
    this.uniswap = uniswap;
    this.provider = provider;
    this.signer = signer;
    this.isRunning = false;

    // Initialize components
    this.positionManager = new PositionManager(
      provider,
      marketData,
      uniswap
    );
    this.riskManager = new RiskManager(
      {
        maxPositionSize: params.maxPositionSize,
        maxTotalExposure: params.maxTotalExposure,
        maxDrawdown: params.maxDrawdown,
        maxDailyLoss: params.maxDailyLoss,
        maxOpenPositions: params.maxOpenPositions,
        minLiquidity: params.minLiquidity,
        slippageTolerance: params.slippageTolerance,
      },
      this.positionManager,
      this.marketData
    );

    this.executionManager = new ExecutionManager(
      {
        gasLimit: params.gasLimit,
        maxSlippage: params.maxSlippage,
        minConfirmations: params.minConfirmations,
        priorityFee: params.priorityFee,
        maxFeePerGas: params.maxFeePerGas,
      },
      this.uniswap,
      this.marketData,
      this.riskManager,
      this.positionManager,
      this.provider,
      this.signer
    );

    this.monitoringManager = new MonitoringManager(
      {
        updateInterval: params.updateInterval,
        metricsRetention: params.metricsRetention,
        alertThresholds: params.alertThresholds,
      },
      this.positionManager,
      this.riskManager,
      this.executionManager,
      this.marketData
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Trading system is already running');
    }

    try {
      // Start monitoring
      await this.monitoringManager.startMonitoring();
      
      // Start position updates
      this.startPositionUpdates();
      
      this.isRunning = true;
      console.log('Trading system started successfully');
    } catch (error) {
      console.error('Failed to start trading system:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Trading system is not running');
    }

    try {
      // Close all positions
      await this.closeAllPositions();
      
      this.isRunning = false;
      console.log('Trading system stopped successfully');
    } catch (error) {
      console.error('Failed to stop trading system:', error);
      throw error;
    }
  }

  private startPositionUpdates(): void {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const positions = this.positionManager.getOpenPositions();
        for (const position of positions) {
          await this.updatePosition(position.id);
        }
      } catch (error) {
        console.error('Failed to update positions:', error);
      }
    }, 60000); // Update every minute
  }

  private async updatePosition(positionId: string): Promise<void> {
    const position = this.positionManager.getPosition(positionId);
    if (!position) return;

    try {
      // Check stop loss
      if (position.stopLoss) {
        const currentPrice = await this.marketData.getPrice(position.token.address);
        if (parseFloat(currentPrice) <= parseFloat(position.stopLoss)) {
          await this.executionManager.closePosition(positionId);
        }
      }

      // Check take profit
      if (position.takeProfit) {
        const currentPrice = await this.marketData.getPrice(position.token.address);
        if (parseFloat(currentPrice) >= parseFloat(position.takeProfit)) {
          await this.executionManager.closePosition(positionId);
        }
      }
    } catch (error) {
      console.error(`Failed to update position ${positionId}:`, error);
    }
  }

  private async closeAllPositions(): Promise<void> {
    const positions = this.positionManager.getOpenPositions();
    for (const position of positions) {
      try {
        await this.executionManager.closePosition(position.id);
      } catch (error) {
        console.error(`Failed to close position ${position.id}:`, error);
      }
    }
  }

  async executeTrade(params: {
    token: string;
    size: string;
    leverage: number;
    stopLoss?: string;
    takeProfit?: string;
  }): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.isRunning) {
      return { success: false, error: 'Trading system is not running' };
    }

    return this.executionManager.executeOrder(params);
  }

  getSystemStatus(): {
    isRunning: boolean;
    openPositions: number;
    totalPnL: string;
    alerts: string[];
  } {
    return {
      isRunning: this.isRunning,
      openPositions: this.positionManager.getOpenPositions().length,
      totalPnL: this.positionManager.getTotalPnL(),
      alerts: this.monitoringManager.getAlerts(),
    };
  }

  getPerformanceReport(): {
    totalPnL: string;
    winRate: number;
    averageTradeSize: string;
    totalTrades: number;
    averageExecutionTime: number;
    averageSlippage: number;
  } {
    return this.monitoringManager.getPerformanceReport();
  }

  getRiskReport(): {
    maxDrawdown: number;
    sharpeRatio: number;
    sortinoRatio: number;
    var95: string;
    cvar95: string;
  } {
    return this.monitoringManager.getRiskReport();
  }
} 