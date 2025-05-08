import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';
import { ChainId, TokenAmount } from '../types';
import { logger } from '../utils/logger';
import { JupiterDex } from './jupiter';
import { ChainlinkPriceFeed } from './chainlink';
import { ConnectionAdapter } from '../utils/ConnectionAdapter';

export interface SwapReceipt {
  signature: string;
  status: 'pending' | 'confirmed' | 'failed';
  hash: string;
}

export class DexManager {
  private static instance: DexManager;
  private connection: ConnectionAdapter | null = null;
  private jupiter: JupiterDex | null = null;
  private chainlink: ChainlinkPriceFeed | null = null;

  private constructor() {}

  static getInstance(): DexManager {
    if (!DexManager.instance) {
      DexManager.instance = new DexManager();
    }
    return DexManager.instance;
  }

  async initializeRouter(
    chainId: ChainId, 
    routerAddress: string, 
    connection: Connection | ethers.providers.Provider
  ): Promise<void> {
    // Create adapter for the connection
    this.connection = new ConnectionAdapter(connection);
    
    // Initialize Jupiter DEX for Solana
    if (chainId === ChainId.SOLANA) {
      const solanaConnection = this.connection.toSolanaConnection() || 
                               this.connection.toMockSolanaConnection();
      this.jupiter = JupiterDex.getInstance(solanaConnection, routerAddress);
      
      // Initialize Chainlink price feeds
      this.chainlink = ChainlinkPriceFeed.getInstance(solanaConnection);
    }
    
    logger.info(`Initialized DEX router for chain ${chainId}`);
  }

  async getAmountOut(
    chainId: ChainId,
    amountIn: TokenAmount,
    tokens: any[]
  ): Promise<TokenAmount> {
    if (!this.jupiter) {
      throw new Error('DEX router not initialized');
    }

    try {
      // Convert PublicKey to string if needed
      const inputToken = tokens[0].toString ? tokens[0].toString() : tokens[0];
      const outputToken = tokens[1].toString ? tokens[1].toString() : tokens[1];
      
      const quote = await this.jupiter.getQuote(
        inputToken,
        outputToken,
        amountIn
      );

      return TokenAmount.fromRaw(quote.amount, 6); // USDC has 6 decimals
    } catch (error) {
      logger.error(`Error getting amount out: ${error}`);
      throw error;
    }
  }

  async swapExactTokensForTokens(
    chainId: ChainId,
    amountIn: TokenAmount,
    amountOutMin: TokenAmount,
    tokens: any[],
    deadline: number
  ): Promise<SwapReceipt> {
    if (!this.jupiter || !this.connection) {
      throw new Error('DEX router not initialized');
    }

    try {
      // Convert PublicKey to string if needed
      const inputToken = tokens[0].toString ? tokens[0].toString() : tokens[0];
      const outputToken = tokens[1].toString ? tokens[1].toString() : tokens[1];
      
      if (chainId === ChainId.SOLANA) {
        // Solana/Jupiter implementation
        // Get quote from Jupiter
        const quote = await this.jupiter.getQuote(
          inputToken,
          outputToken,
          amountIn
        );

        // Get the Solana Connection from the adapter
        const solanaConnection = this.connection.toSolanaConnection() || 
                                this.connection.toMockSolanaConnection();
        
        // Get swap transaction
        const swapResponse = await this.jupiter.getSwapTransaction(
          quote,
          solanaConnection.rpcEndpoint
        );

        // Execute swap
        const signature = await this.jupiter.executeSwap(
          swapResponse,
          solanaConnection
        );

        return {
          signature,
          status: 'pending',
          hash: signature
        };
      } else {
        // EVM implementation (placeholder)
        logger.info(`Swapping ${amountIn.toString()} of ${inputToken} for ${outputToken}`);
        
        // This is a placeholder for EVM swaps
        const mockSignature = `mock-tx-${Date.now()}`;
        
        return {
          signature: mockSignature,
          status: 'pending',
          hash: mockSignature
        };
      }
    } catch (error) {
      logger.error(`Error executing swap: ${error}`);
      throw error;
    }
  }

  async getPrice(tokenIn: string, tokenOut: string): Promise<number> {
    if (!this.chainlink) {
      throw new Error('Price feeds not initialized');
    }

    try {
      return await this.chainlink.getPriceBetweenTokens(
        { address: tokenIn, decimals: 9, symbol: 'SOL' },
        { address: tokenOut, decimals: 6, symbol: 'USDC' }
      );
    } catch (error) {
      logger.error(`Error getting price: ${error}`);
      throw error;
    }
  }
} 