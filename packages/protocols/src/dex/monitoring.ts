import { ethers } from 'ethers';
import { PositionManager } from './position';
import { RiskManager } from './risk';
import { ExecutionManager } from './execution';
import { MarketDataService } from './market-data';
import { SwapResult } from './interface';

declare global {
  function setInterval(callback: () => void, ms: number): number;
  // Define console types directly on the global scope or within NodeJS namespace if applicable
  // Assuming a general environment where console is globally available
  interface Console {
    error(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
  }
  var console: Console;
}

export interface MonitoringParams {
  updateInterval: number; // In milliseconds
  metricsRetention: number; // In days
  alertThresholds: {
    drawdown: number; // Percentage
    slippage: number; // Percentage
    executionTime: number; // In milliseconds
    errorRate: number; // Percentage
  };
}

export interface SystemMetrics {
  timestamp: number;
  totalPnL: string;
  totalExposure: string;
  drawdown: number;
  openPositions: number;
  averageExecutionTime: number;
  successRate: number;
  averageSlippage: number;
  errorRate: number;
  gasUsed: string;
  gasPrice: string;
}

export class MonitoringManager {
  private params: MonitoringParams;
  private positionManager: PositionManager;
  private riskManager: RiskManager;
  private executionManager: ExecutionManager;
  private marketData: MarketDataService;
  private metrics: SystemMetrics[];
  private alerts: string[];
  private lastUpdate: number;

  constructor(
    params: MonitoringParams,
    positionManager: PositionManager,
    riskManager: RiskManager,
    executionManager: ExecutionManager,
    marketData: MarketDataService
  ) {
    this.params = params;
    this.positionManager = positionManager;
    this.riskManager = riskManager;
    this.executionManager = executionManager;
    this.marketData = marketData;
    this.metrics = [];
    this.alerts = [];
    this.lastUpdate = Date.now();
  }

  async startMonitoring(): Promise<void> {
    setInterval(async () => {
      await this.updateMetrics();
    }, this.params.updateInterval);
  }

  private async updateMetrics(): Promise<void> {
    try {
      const riskMetrics = await this.riskManager.getRiskMetrics();
      const executionMetrics = await this.executionManager.getExecutionMetrics();
      const totalPnL = this.positionManager.getTotalPnL();

      const metrics: SystemMetrics = {
        timestamp: Date.now(),
        totalPnL,
        totalExposure: riskMetrics.totalExposure,
        drawdown: riskMetrics.drawdown,
        openPositions: riskMetrics.openPositions,
        averageExecutionTime: executionMetrics.averageExecutionTime,
        successRate: executionMetrics.successRate,
        averageSlippage: executionMetrics.averageSlippage,
        errorRate: 0, // Implement error rate calculation
        gasUsed: '0', // Implement gas usage tracking
        gasPrice: '0', // Implement gas price tracking
      };

      this.metrics.push(metrics);
      this.cleanupOldMetrics();
      await this.checkAlerts(metrics);
    } catch (error) {
      // Type check the caught error before accessing properties
      if (error instanceof Error) {
        // Explicitly cast error to Error type after check
        const typedError = error as Error;
        console.error('Failed to update metrics:', typedError.message);
        this.alerts.push(`Failed to update metrics: ${typedError.message}`);
      } else {
        console.error('Failed to update metrics with unknown error type:', error);
        this.alerts.push(`Failed to update metrics: An unknown error occurred.`);
      }
    }
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - (this.params.metricsRetention * 24 * 60 * 60 * 1000);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  private async checkAlerts(metrics: SystemMetrics): Promise<void> {
    // Check drawdown
    if (metrics.drawdown >= this.params.alertThresholds.drawdown) {
      this.alerts.push(`High drawdown alert: ${metrics.drawdown}%`);
    }

    // Check slippage
    if (metrics.averageSlippage >= this.params.alertThresholds.slippage) {
      this.alerts.push(`High slippage alert: ${metrics.averageSlippage}%`);
    }

    // Check execution time
    if (metrics.averageExecutionTime >= this.params.alertThresholds.executionTime) {
      this.alerts.push(`Slow execution alert: ${metrics.averageExecutionTime}ms`);
    }

    // Check error rate
    if (metrics.errorRate >= this.params.alertThresholds.errorRate) {
      this.alerts.push(`High error rate alert: ${metrics.errorRate}%`);
    }
  }

  getMetrics(): SystemMetrics[] {
    return this.metrics;
  }

  getAlerts(): string[] {
    return this.alerts;
  }

  getPerformanceReport(): {
    totalPnL: string;
    winRate: number;
    averageTradeSize: string;
    totalTrades: number;
    averageExecutionTime: number;
    averageSlippage: number;
  } {
    // Implement performance report calculation
    return {
      totalPnL: '0',
      winRate: 0,
      averageTradeSize: '0',
      totalTrades: 0,
      averageExecutionTime: 0,
      averageSlippage: 0,
    };
  }

  getRiskReport(): {
    maxDrawdown: number;
    sharpeRatio: number;
    sortinoRatio: number;
    var95: string;
    cvar95: string;
  } {
    // Implement risk report calculation
    return {
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      var95: '0',
      cvar95: '0',
    };
  }
}

export class DEXMonitor {
  private trades: SwapResult[];
  private metrics: {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalVolume: string;
    averageExecutionTime: number;
    averageSlippage: number;
  };

  constructor() {
    this.trades = [];
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: '0',
      averageExecutionTime: 0,
      averageSlippage: 0
    };
  }

  recordTrade(trade: SwapResult): void {
    this.trades.push(trade);
    this.updateMetrics();
  }

  private updateMetrics(): void {
    const successfulTrades = this.trades.filter(t => t.transactionHash !== '');
    const failedTrades = this.trades.filter(t => t.transactionHash === '');
    
    const totalVolume = this.trades.reduce((acc, t) => {
      return acc + BigInt(t.amountOut);
    }, BigInt(0));

    const avgExecutionTime = this.trades.reduce((acc, t) => acc + t.executionTime, 0) / this.trades.length;
    const avgSlippage = this.trades.reduce((acc, t) => acc + t.priceImpact, 0) / this.trades.length;

    this.metrics = {
      totalTrades: this.trades.length,
      successfulTrades: successfulTrades.length,
      failedTrades: failedTrades.length,
      totalVolume: totalVolume.toString(),
      averageExecutionTime: avgExecutionTime,
      averageSlippage: avgSlippage
    };
  }

  getMetrics() {
    return this.metrics;
  }

  getTrades() {
    return this.trades;
  }
} 