import { ethers } from 'ethers';
import { Token } from '../tokens/types';
import { UniswapV3DEX } from './uniswap-v3';
import { MarketDataService } from './market-data';

/**
 * Wrapper service for UniswapV3DEX to maintain backward compatibility
 * during the ethers v6 migration
 */
export class UniswapV3Service {
  private dex: UniswapV3DEX;
  private provider: ethers.Provider;
  private marketData?: MarketDataService;

  constructor(provider: ethers.Provider, marketData?: MarketDataService) {
    this.provider = provider;
    this.marketData = marketData;
    
    // Initialize the underlying DEX
    // Use environment variables for private key or create a read-only instance
    const privateKey = process.env.WALLET_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001';
    
    // Default mainnet RPC URL
    const rpcUrl = 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';
    
    this.dex = new UniswapV3DEX({
      chainId: 1, // Default to Ethereum Mainnet
      rpcUrl: rpcUrl,
      privateKey: privateKey,
      slippageTolerance: 0.5
    });
  }

  /**
   * Get a price quote for a token swap
   */
  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: string) {
    return this.dex.getQuote({
      tokenIn,
      tokenOut,
      amountIn
    });
  }

  /**
   * Calculate price impact for a specific swap
   */
  async calculatePriceImpact(tokenIn: Token, tokenOut: Token, amountIn: string) {
    const quote = await this.dex.getQuote({
      tokenIn,
      tokenOut,
      amountIn
    });
    return quote.priceImpact;
  }

  /**
   * Execute a token swap
   */
  async swapExactTokensForTokens(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    minAmountOut: string = '0',
    slippageTolerance: number = 0.5
  ) {
    return this.dex.executeSwap({
      tokenIn,
      tokenOut,
      amountIn,
      slippageTolerance
    });
  }

  /**
   * Get liquidity for a token pair
   */
  async getLiquidity(tokenA: Token, tokenB: Token) {
    return this.dex.getLiquidity(tokenA, tokenB);
  }

  /**
   * Get current price for a token pair
   */
  async getPrice(tokenA: Token, tokenB: Token) {
    return this.dex.getPrice(tokenA, tokenB);
  }

  /**
   * Get pool information for a token pair
   */
  async getPool(tokenA: Token, tokenB: Token) {
    return this.dex.getPool(tokenA, tokenB);
  }

  /**
   * Get token balance for a specific address
   */
  async getTokenBalance(token: Token, address: string) {
    return this.dex.getTokenBalance(token, address);
  }

  /**
   * Approve token spending
   */
  async approveToken(token: Token, amount: string) {
    return this.dex.approveToken(token, amount);
  }

  /**
   * Get the provider instance
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get the DEX instance
   */
  getDEX() {
    return this.dex;
  }
} 