import { ethers } from 'ethers';
import { Token } from '../tokens/types';
import { MarketDataService } from './market-data';
import { UniswapV3Service } from './uniswap';

export interface Position {
  id: string;
  token: Token;
  entryPrice: string;
  currentPrice: string;
  size: string;
  leverage: number;
  side: 'long' | 'short';
  timestamp: number;
  stopLoss?: string;
  takeProfit?: string;
  pnl: string;
  status: 'open' | 'closed' | 'liquidated';
}

export interface PositionParams {
  token: Token;
  size: string;
  leverage: number;
  side: 'long' | 'short';
  stopLoss?: string;
  takeProfit?: string;
}

export class PositionManager {
  private positions: Map<string, Position>;
  private marketData: MarketDataService;
  private uniswap: UniswapV3Service;
  private provider: ethers.Provider;

  constructor(
    provider: ethers.Provider,
    marketData: MarketDataService,
    uniswap: UniswapV3Service
  ) {
    this.positions = new Map();
    this.marketData = marketData;
    this.uniswap = uniswap;
    this.provider = provider;
  }

  async openPosition(params: PositionParams): Promise<Position> {
    // Get current market price
    const marketData = await this.marketData.getMarketData(params.token.symbol);
    if (!marketData) {
      throw new Error(`Failed to get market data for ${params.token.symbol}`);
    }

    // Calculate position size in USD
    const positionSize = ethers.parseUnits(params.size, params.token.decimals);
    const entryPrice = marketData.price;

    // Create position
    const position: Position = {
      id: ethers.id(`${Date.now()}-${params.token.symbol}`),
      token: params.token,
      entryPrice,
      currentPrice: entryPrice,
      size: positionSize.toString(),
      leverage: params.leverage,
      side: params.side,
      timestamp: Date.now(),
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      pnl: '0',
      status: 'open'
    };

    // Store position
    this.positions.set(position.id, position);

    return position;
  }

  async closePosition(positionId: string): Promise<Position> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    if (position.status !== 'open') {
      throw new Error(`Position ${positionId} is not open`);
    }

    // Get current market price
    const marketData = await this.marketData.getMarketData(position.token.symbol);
    if (!marketData) {
      throw new Error(`Failed to get market data for ${position.token.symbol}`);
    }

    // Calculate PnL
    const entryPrice = ethers.parseUnits(position.entryPrice, 6);
    const exitPrice = ethers.parseUnits(marketData.price, 6);
    const size = ethers.parseUnits(position.size, position.token.decimals);
    
    let pnl: bigint;
    if (position.side === 'long') {
      pnl = (size * (exitPrice - entryPrice)) / entryPrice;
    } else {
      pnl = (size * (entryPrice - exitPrice)) / entryPrice;
    }

    // Update position
    position.currentPrice = marketData.price;
    position.pnl = pnl.toString();
    position.status = 'closed';

    return position;
  }

  async updatePositions(): Promise<void> {
    for (const [id, position] of this.positions.entries()) {
      if (position.status !== 'open') continue;

      // Get current market price
      const marketData = await this.marketData.getMarketData(position.token.symbol);
      if (!marketData) continue;

      // Update current price and PnL
      const entryPrice = ethers.parseUnits(position.entryPrice, 6);
      const currentPrice = ethers.parseUnits(marketData.price, 6);
      const size = ethers.parseUnits(position.size, position.token.decimals);
      
      let pnl: bigint;
      if (position.side === 'long') {
        pnl = (size * (currentPrice - entryPrice)) / entryPrice;
      } else {
        pnl = (size * (entryPrice - currentPrice)) / entryPrice;
      }

      position.currentPrice = marketData.price;
      position.pnl = pnl.toString();

      // Check stop loss
      if (position.stopLoss) {
        const stopLoss = ethers.parseUnits(position.stopLoss, 6);
        if ((position.side === 'long' && currentPrice <= stopLoss) ||
            (position.side === 'short' && currentPrice >= stopLoss)) {
          await this.closePosition(id);
        }
      }

      // Check take profit
      if (position.takeProfit) {
        const takeProfit = ethers.parseUnits(position.takeProfit, 6);
        if ((position.side === 'long' && currentPrice >= takeProfit) ||
            (position.side === 'short' && currentPrice <= takeProfit)) {
          await this.closePosition(id);
        }
      }
    }
  }

  getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getOpenPositions(): Position[] {
    return this.getAllPositions().filter(p => p.status === 'open');
  }

  getClosedPositions(): Position[] {
    return this.getAllPositions().filter(p => p.status === 'closed');
  }

  getTotalPnL(): string {
    return this.getAllPositions()
      .reduce((total, position) => {
        return (BigInt(total) + BigInt(position.pnl)).toString();
      }, '0');
  }
} 