import { ethers } from 'ethers';
import { MarketDataService } from './market-data';
import { Token } from '../tokens/types';
import { UniswapV3Service } from './uniswap';

export interface Position {
  id: string;
  token: Token;
  amount: string;
  entryPrice: string;
  currentPrice: string;
  stopLoss?: string;
  takeProfit?: string;
  txHash?: string;
  timestamp: number;
  pnl?: string;
  pnlPercent?: string;
}

export interface TradeParams {
  token: Token;
  amount: string;
  slippageTolerance: number;
  stopLoss?: string;
  takeProfit?: string;
}

export interface RiskParams {
  maxPositionSize: string;
  maxTotalExposure: string;
  maxDrawdown: number;
  maxDailyLoss: string;
  maxOpenPositions: number;
}

export class TradingService {
  private provider: ethers.Provider;
  private marketData: MarketDataService;
  private uniswapService: any; // This would be properly typed in a real implementation
  private positions: Map<string, Position> = new Map();
  private transactions: any[] = [];
  private config: {
    slippageTolerance: number;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
  private riskParams: RiskParams;
  
  constructor(
    provider: ethers.Provider, 
    marketData: MarketDataService, 
    uniswapService: any,
    config: {
      slippageTolerance: number;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    }
  ) {
    this.provider = provider;
    this.marketData = marketData;
    this.uniswapService = uniswapService;
    this.config = config;
    
    // Default risk parameters
    this.riskParams = {
      maxPositionSize: '1.0',
      maxTotalExposure: '10.0',
      maxDrawdown: 0.1,
      maxDailyLoss: '1.0',
      maxOpenPositions: 10
    };
  }
  
  async openPosition(params: TradeParams): Promise<Position> {
    const { token, amount, slippageTolerance, stopLoss, takeProfit } = params;
    
    console.log(`Opening position: ${amount} of ${token.symbol}`);
    
    // Check risk limits
    if (this.positions.size >= this.riskParams.maxOpenPositions) {
      throw new Error('Maximum number of open positions reached');
    }
    
    const amountValue = parseFloat(amount);
    const maxSizeValue = parseFloat(this.riskParams.maxPositionSize);
    if (amountValue > maxSizeValue) {
      throw new Error(`Position size exceeds maximum allowed (${this.riskParams.maxPositionSize})`);
    }
    
    // Get market data for token
    const marketData = await this.marketData.getMarketData(token);
    if (!marketData) {
      throw new Error(`Failed to get market data for ${token.symbol}`);
    }
    
    // Create position
    const position: Position = {
      id: `pos_${Math.random().toString(36).substring(2, 10)}`,
      token,
      amount,
      entryPrice: marketData.price,
      currentPrice: marketData.price,
      stopLoss,
      takeProfit,
      timestamp: Date.now(),
    };
    
    // Save position
    this.positions.set(token.address, position);
    
    // Record transaction
    const txHash = `tx_${Math.random().toString(36).substring(2, 15)}`;
    position.txHash = txHash;
    
    this.transactions.push({
      txHash,
      type: 'open',
      token: token.symbol,
      amount,
      price: marketData.price,
      timestamp: Date.now(),
      status: 'completed',
    });
    
    return position;
  }
  
  async closePosition(tokenAddress: string): Promise<void> {
    // Check if position exists
    const position = this.positions.get(tokenAddress);
    if (!position) {
      throw new Error(`No open position found for token ${tokenAddress}`);
    }
    
    // Get current market data
    const marketData = await this.marketData.getMarketData(position.token);
    if (!marketData) {
      throw new Error(`Failed to get market data for ${position.token.symbol}`);
    }
    
    // Update position with current price
    position.currentPrice = marketData.price;
    
    // Calculate PnL
    const entryValue = parseFloat(position.amount) * parseFloat(position.entryPrice);
    const exitValue = parseFloat(position.amount) * parseFloat(position.currentPrice);
    const pnl = exitValue - entryValue;
    const pnlStr = pnl.toFixed(2);
    
    // Remove position
    this.positions.delete(tokenAddress);
    
    // Record transaction
    const txHash = `tx_${Math.random().toString(36).substring(2, 15)}`;
    this.transactions.push({
      txHash,
      type: 'close',
      token: position.token.symbol,
      amount: position.amount,
      price: position.currentPrice,
      pnl: pnlStr,
      timestamp: Date.now(),
      status: 'completed',
    });
  }
  
  async updatePositions(): Promise<void> {
    // Update current prices for all positions
    for (const [tokenAddress, position] of this.positions.entries()) {
      const marketData = await this.marketData.getMarketData(position.token);
      if (marketData) {
        position.currentPrice = marketData.price;
        
        // Calculate PnL
        const entryPrice = parseFloat(position.entryPrice);
        const currentPrice = parseFloat(position.currentPrice);
        const priceDiffPercent = (currentPrice - entryPrice) / entryPrice * 100;
        
        position.pnl = (parseFloat(position.amount) * (currentPrice - entryPrice)).toFixed(2);
        position.pnlPercent = priceDiffPercent.toFixed(2) + '%';
        
        // Check stop loss and take profit
        if (position.stopLoss && currentPrice <= parseFloat(position.stopLoss)) {
          console.log(`Stop loss triggered for ${position.token.symbol} at ${currentPrice}`);
          await this.closePosition(tokenAddress);
        } else if (position.takeProfit && currentPrice >= parseFloat(position.takeProfit)) {
          console.log(`Take profit triggered for ${position.token.symbol} at ${currentPrice}`);
          await this.closePosition(tokenAddress);
        }
      }
    }
  }
  
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }
  
  getPosition(tokenAddress: string): Position | undefined {
    return this.positions.get(tokenAddress);
  }
  
  getTransactions(): any[] {
    return [...this.transactions];
  }
  
  async swapExactTokensForTokens(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    minAmountOut: string,
    maxAmountOut: string,
    options: any = {}
  ): Promise<string> {
    // In a real implementation, this would call the DEX to execute the swap
    // For now, we'll just simulate a successful swap
    const txHash = `tx_${Math.random().toString(36).substring(2, 15)}`;
    
    // Record transaction
    this.transactions.push({
      txHash,
      type: 'swap',
      tokenIn,
      tokenOut,
      amountIn,
      timestamp: Date.now(),
      status: 'completed',
    });
    
    return txHash;
  }
  
  async getTradeHistory(token?: Token): Promise<any[]> {
    if (token) {
      return this.transactions.filter(tx => 
        tx.token === token.symbol || tx.tokenIn === token.symbol || tx.tokenOut === token.symbol
      );
    }
    return this.transactions;
  }
  
  async calculatePnL(token?: Token): Promise<string> {
    let totalPnL = 0;
    
    // Filter transactions based on token if provided
    const txs = token 
      ? this.transactions.filter(tx => tx.token === token.symbol)
      : this.transactions;
    
    // Calculate PnL from closed positions
    for (const tx of txs) {
      if (tx.type === 'close' && tx.pnl) {
        totalPnL += parseFloat(tx.pnl);
      }
    }
    
    // Add PnL from open positions
    const positionsList = this.getPositions();
    const positions = token
      ? positionsList.filter(pos => pos.token.symbol === token.symbol)
      : positionsList;
    
    for (const position of positions) {
      if (position.pnl) {
        totalPnL += parseFloat(position.pnl);
      }
    }
    
    return totalPnL.toFixed(2);
  }
} 