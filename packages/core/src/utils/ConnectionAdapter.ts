import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import { logger } from './logger';

/**
 * ConnectionAdapter class to adapt various provider types to a unified interface
 * This allows us to use either Solana's Connection or ethers.js provider with the same interface
 */
export class ConnectionAdapter {
  private provider: any;
  private type: 'solana' | 'evm';

  /**
   * Create a new ConnectionAdapter
   * @param provider Provider to adapt (Connection or JsonRpcProvider)
   */
  constructor(provider: any) {
    this.provider = provider;
    
    // Detect provider type
    if (provider instanceof Connection) {
      this.type = 'solana';
    } else if (provider instanceof ethers.providers.JsonRpcProvider || 
               provider instanceof ethers.providers.Provider) {
      this.type = 'evm';
    } else {
      logger.warn('Unknown provider type, defaulting to EVM');
      this.type = 'evm';
    }
  }

  /**
   * Get the underlying provider
   * @returns Original provider
   */
  getProvider(): any {
    return this.provider;
  }

  /**
   * Convert to Solana Connection if possible
   * @returns Connection object or null
   */
  toSolanaConnection(): Connection | null {
    if (this.type === 'solana') {
      return this.provider as Connection;
    }
    
    logger.warn('Cannot convert EVM provider to Solana Connection');
    return null;
  }
  
  /**
   * Create a mock Solana Connection from EVM provider
   * This is a workaround for type compatibility issues
   * @returns A minimal mock Connection
   */
  toMockSolanaConnection(): Connection {
    // Create a minimal mock with required properties
    return {
      commitment: 'confirmed',
      rpcEndpoint: this.provider.connection?.url || 'mock-url',
      
      // Add required methods
      getBalanceAndContext: () => Promise.resolve({ value: 0, context: { slot: 0 } }),
      getBlockTime: () => Promise.resolve(Math.floor(Date.now() / 1000)),
      
      // Add other required properties to satisfy the type
      // This is just a minimal implementation for compilation
      ...Object.fromEntries(
        Object.getOwnPropertyNames(Connection.prototype)
          .filter(prop => typeof Connection.prototype[prop] === 'function')
          .map(method => [method, () => Promise.resolve(null)])
      )
    } as unknown as Connection;
  }
  
  /**
   * Convert to ethers JsonRpcProvider if possible
   * @returns JsonRpcProvider object or null
   */
  toEthersProvider(): ethers.providers.Provider | null {
    if (this.type === 'evm') {
      return this.provider as ethers.providers.Provider;
    }
    
    logger.warn('Cannot convert Solana Connection to ethers Provider');
    return null;
  }
  
  /**
   * Get provider type
   * @returns Provider type (solana or evm)
   */
  getType(): 'solana' | 'evm' {
    return this.type;
  }
  
  /**
   * Get network ID for current provider
   * @returns Promise resolving to network ID
   */
  async getNetworkId(): Promise<number> {
    if (this.type === 'evm') {
      const network = await (this.provider as ethers.providers.Provider).getNetwork();
      return network.chainId;
    } else {
      // For Solana, we don't have a direct way to get the chainId
      // We could potentially use the cluster/endpoint to determine this
      return -1; // ChainId.SOLANA
    }
  }
} 