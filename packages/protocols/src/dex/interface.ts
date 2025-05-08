import { ethers } from 'ethers';
import { Token } from '../tokens/types';

export interface DEXConfig {
  chainId: number;
  rpcUrl: string;
  privateKey: string;
  gasLimit?: number;
  slippageTolerance?: number;
}

export interface SwapParams {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  slippageTolerance?: number;
  deadline?: number;
}

export interface SwapResult {
  transactionHash: string;
  amountOut: string;
  priceImpact: number;
  gasUsed: number;
  gasPrice: string;
  executionTime: number;
}

export interface DEXInterface {
  // Core DEX functions
  getQuote(params: SwapParams): Promise<{
    amountOut: string;
    priceImpact: number;
    gasEstimate: number;
  }>;
  
  executeSwap(params: SwapParams): Promise<SwapResult>;
  
  // Liquidity functions
  getLiquidity(tokenA: Token, tokenB: Token): Promise<{
    reserveA: string;
    reserveB: string;
    totalSupply: string;
  }>;
  
  // Price functions
  getPrice(tokenA: Token, tokenB: Token): Promise<string>;
  
  // Pool functions
  getPool(tokenA: Token, tokenB: Token): Promise<{
    address: string;
    fee: number;
    tickSpacing: number;
  }>;
  
  // Token functions
  getTokenBalance(token: Token, address: string): Promise<string>;
  approveToken(token: Token, amount: string): Promise<string>;
  
  // Gas functions
  estimateGas(params: SwapParams): Promise<number>;
  getGasPrice(): Promise<string>;
  
  // Chain specific
  getChainId(): number;
  getProvider(): ethers.Provider;
  getSigner(): ethers.Signer;
} 