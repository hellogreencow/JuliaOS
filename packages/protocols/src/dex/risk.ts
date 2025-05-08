import { ethers } from 'ethers';
import { Position, PositionManager } from './position';
import { MarketDataService } from './market-data';

export interface RiskParams {
  maxPositionSize: string; // In USD
  maxTotalExposure: string; // In USD
  maxDrawdown: number; // Percentage
  maxDailyLoss: string; // In USD
  maxOpenPositions: number;
  minLiquidity: string; // In USD
  slippageTolerance: number; // Percentage
}

export class RiskManager {
  private params: RiskParams;
  private positionManager: PositionManager;
  private marketData: MarketDataService;
  private dailyPnL: string;
  private lastReset: number;

  constructor(
    params: RiskParams,
    positionManager: PositionManager,
    marketData: MarketDataService
  ) {
    this.params = params;
    this.positionManager = positionManager;
    this.marketData = marketData;
    this.dailyPnL = '0';
    this.lastReset = Date.now();
  }

  async canOpenPosition(
    token: string,
    size: string,
    leverage: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check if we've hit the daily loss limit
    if (this.hasHitDailyLossLimit()) {
      return { allowed: false, reason: 'Daily loss limit reached' };
    }

    // Check position size limit
    const positionSize = ethers.parseUnits(size, 6); // Assuming USD has 6 decimals
    if (positionSize > ethers.parseUnits(this.params.maxPositionSize, 6)) {
      return { allowed: false, reason: 'Position size exceeds maximum allowed' };
    }

    // Check total exposure
    const totalExposure = await this.calculateTotalExposure();
    const newExposure = totalExposure + positionSize;
    if (newExposure > ethers.parseUnits(this.params.maxTotalExposure, 6)) {
      return { allowed: false, reason: 'Total exposure would exceed maximum allowed' };
    }

    // Check number of open positions
    const openPositions = this.positionManager.getOpenPositions();
    if (openPositions.length >= this.params.maxOpenPositions) {
      return { allowed: false, reason: 'Maximum number of open positions reached' };
    }

    // Check liquidity
    const marketData = await this.marketData.getMarketData(token);
    if (!marketData || BigInt(marketData.liquidity) < ethers.parseUnits(this.params.minLiquidity, 6)) {
      return { allowed: false, reason: 'Insufficient liquidity' };
    }

    // Check drawdown
    const drawdown = await this.calculateDrawdown();
    if (drawdown >= this.params.maxDrawdown) {
      return { allowed: false, reason: 'Maximum drawdown reached' };
    }

    return { allowed: true };
  }

  async calculateTotalExposure(): Promise<bigint> {
    const openPositions = this.positionManager.getOpenPositions();
    return openPositions.reduce((total, position) => {
      const positionSize = ethers.parseUnits(position.size, position.token.decimals);
      return total + positionSize;
    }, 0n);
  }

  async calculateDrawdown(): Promise<number> {
    const totalPnL = this.positionManager.getTotalPnL();
    const totalExposure = await this.calculateTotalExposure();
    
    if (totalExposure === 0n) return 0;
    
    const pnlInUSD = ethers.parseUnits(totalPnL, 6);
    return (Number(pnlInUSD) / Number(totalExposure)) * 100;
  }

  hasHitDailyLossLimit(): boolean {
    // Reset daily PnL if it's a new day
    const now = Date.now();
    if (now - this.lastReset > 24 * 60 * 60 * 1000) {
      this.dailyPnL = '0';
      this.lastReset = now;
      return false;
    }

    return BigInt(this.dailyPnL) <= -ethers.parseUnits(this.params.maxDailyLoss, 6);
  }

  updateDailyPnL(pnl: string): void {
    this.dailyPnL = (BigInt(this.dailyPnL) + BigInt(pnl)).toString();
  }

  async getRiskMetrics(): Promise<{
    totalExposure: string;
    dailyPnL: string;
    drawdown: number;
    openPositions: number;
  }> {
    const totalExposure = await this.calculateTotalExposure();
    const drawdown = await this.calculateDrawdown();
    
    return {
      totalExposure: totalExposure.toString(),
      dailyPnL: this.dailyPnL,
      drawdown: drawdown,
      openPositions: this.positionManager.getOpenPositions().length
    };
  }
} 