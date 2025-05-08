import { ethers } from 'ethers';
import { UniswapV3Service } from './uniswap';
import { MarketDataService } from './market-data';
import { RiskManager } from './risk';
import { PositionManager, PositionParams } from './position';
import { Token } from '../tokens/types';

// Helper function to create or get Token objects
function getToken(tokenInput: string | Token): Token {
  if (typeof tokenInput === 'string') {
    return {
      symbol: tokenInput,
      name: tokenInput,
      address: tokenInput, // Assuming tokenInput could be an address
      decimals: 18, // Default
      chainId: 1    // Default to Ethereum mainnet
    };
  }
  return tokenInput;
}

export interface ExecutionParams {
  gasLimit: number;
  maxSlippage: number; // Percentage
  minConfirmations: number;
  priorityFee: string; // In Gwei
  maxFeePerGas: string; // In Gwei
}

export interface OrderParams {
  token: string | Token;
  size: string;
  leverage: number;
  stopLoss?: string;
  takeProfit?: string;
}

export class ExecutionManager {
  private params: ExecutionParams;
  private uniswap: UniswapV3Service;
  private marketData: MarketDataService;
  private riskManager: RiskManager;
  private positionManager: PositionManager;
  private provider: ethers.Provider;
  private signer: ethers.Signer;

  constructor(
    params: ExecutionParams,
    uniswap: UniswapV3Service,
    marketData: MarketDataService,
    riskManager: RiskManager,
    positionManager: PositionManager,
    provider: ethers.Provider,
    signer: ethers.Signer
  ) {
    this.params = params;
    this.uniswap = uniswap;
    this.marketData = marketData;
    this.riskManager = riskManager;
    this.positionManager = positionManager;
    this.provider = provider;
    this.signer = signer;
  }

  async executeOrder(params: OrderParams): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Convert to Token object if needed
      const token = getToken(params.token);

      // Check risk parameters - pass token.symbol to match risk manager's signature
      const riskCheck = await this.riskManager.canOpenPosition(
        token.symbol,
        params.size,
        params.leverage
      );

      if (!riskCheck.allowed) {
        return { success: false, error: riskCheck.reason };
      }

      // Get current market data
      const marketData = await this.marketData.getMarketData(token);
      if (!marketData) {
        return { success: false, error: 'Failed to get market data' };
      }

      // Calculate execution price with slippage
      const executionPrice = this.calculateExecutionPrice(parseFloat(marketData.price), params.size);
      const minPrice = executionPrice * (1 - this.params.maxSlippage / 100);
      const maxPrice = executionPrice * (1 + this.params.maxSlippage / 100);

      // Prepare transaction parameters
      const txParams = {
        gasLimit: this.params.gasLimit,
        maxFeePerGas: ethers.parseUnits(this.params.maxFeePerGas, 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(this.params.priorityFee, 'gwei'),
      };

      // Execute the trade
      const swapResult = await this.uniswap.swapExactTokensForTokens(
        token,
        getToken(ethers.ZeroAddress), // Placeholder - replace with actual token to swap to
        params.size,
        minPrice.toString(),
        this.params.maxSlippage
      );

      // Transaction is already confirmed, so no need to wait
      if (!swapResult.transactionHash) {
        return { success: false, error: 'Transaction failed' };
      }

      // Update position - create a proper PositionParams object
      const positionParams: PositionParams = {
        token: token,
        size: params.size,
        leverage: params.leverage,
        side: 'long', // Default to long - could be parameterized in OrderParams
        stopLoss: params.stopLoss,
        takeProfit: params.takeProfit
      };
      
      const position = await this.positionManager.openPosition(positionParams);

      return { success: true, txHash: swapResult.transactionHash };
    } catch (error) {
      console.error('Order execution failed:', error);
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown execution error' };
    }
  }

  async closePosition(positionId: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const position = this.positionManager.getPosition(positionId);
      if (!position) {
        return { success: false, error: 'Position not found' };
      }

      // Get current market data
      const marketData = await this.marketData.getMarketData(position.token);
      if (!marketData) {
        return { success: false, error: 'Failed to get market data' };
      }

      // Calculate execution price with slippage
      const executionPrice = this.calculateExecutionPrice(parseFloat(marketData.price), position.size);
      const minPrice = executionPrice * (1 - this.params.maxSlippage / 100);
      const maxPrice = executionPrice * (1 + this.params.maxSlippage / 100);

      // Prepare transaction parameters
      const txParams = {
        gasLimit: this.params.gasLimit,
        maxFeePerGas: ethers.parseUnits(this.params.maxFeePerGas, 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits(this.params.priorityFee, 'gwei'),
      };

      // Execute the trade (swap back to paired token)
      const swapResult = await this.uniswap.swapExactTokensForTokens(
        position.token,
        getToken(ethers.ZeroAddress), // Placeholder - replace with actual token to swap to
        position.size,
        minPrice.toString(),
        this.params.maxSlippage
      );

      // Transaction is already confirmed, no need to wait
      if (!swapResult.transactionHash) {
        return { success: false, error: 'Transaction failed' };
      }

      // Update position - only pass positionId as required
      await this.positionManager.closePosition(positionId);

      return { success: true, txHash: swapResult.transactionHash };
    } catch (error) {
      console.error('Position close failed:', error);
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown execution error' };
    }
  }

  private calculateExecutionPrice(basePrice: number, size: string): number {
    // Implement price impact calculation based on size and liquidity
    // This is a simplified version - in production, you'd want to use more sophisticated models
    const sizeInUSD = parseFloat(size);
    const priceImpact = sizeInUSD / 1000000; // Assuming 1M USD liquidity
    return basePrice * (1 + priceImpact);
  }

  async getExecutionMetrics(): Promise<{
    averageExecutionTime: number;
    successRate: number;
    averageSlippage: number;
    totalTrades: number;
  }> {
    // Implement execution metrics calculation
    return {
      averageExecutionTime: 0,
      successRate: 0,
      averageSlippage: 0,
      totalTrades: 0,
    };
  }
} 