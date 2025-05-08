import { ChainId } from '../types';
import { Explorer } from '../types/index';
import { logger } from '../utils/logger';

/**
 * Default explorer URLs by chain
 */
const DEFAULT_EXPLORERS: Record<ChainId, string> = {
  [ChainId.ETHEREUM]: 'https://etherscan.io',
  [ChainId.POLYGON]: 'https://polygonscan.com',
  [ChainId.ARBITRUM]: 'https://arbiscan.io',
  [ChainId.OPTIMISM]: 'https://optimistic.etherscan.io',
  [ChainId.BASE]: 'https://basescan.org',
  [ChainId.BSC]: 'https://bscscan.com',
  [ChainId.AVALANCHE]: 'https://snowtrace.io',
  [ChainId.SOLANA]: 'https://explorer.solana.com',
};

/**
 * Explorer implementation for EVM-compatible chains
 */
class EVMExplorer implements Explorer {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }
  
  getTransactionUrl(hash: string): string {
    return `${this.baseUrl}/tx/${hash}`;
  }
  
  getAddressUrl(address: string): string {
    return `${this.baseUrl}/address/${address}`;
  }
  
  getTokenUrl(address: string): string {
    return `${this.baseUrl}/token/${address}`;
  }
  
  getBlockUrl(blockNumber: number | string): string {
    return `${this.baseUrl}/block/${blockNumber}`;
  }
}

/**
 * Explorer implementation for Solana
 */
class SolanaExplorer implements Explorer {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }
  
  getTransactionUrl(hash: string): string {
    return `${this.baseUrl}/tx/${hash}`;
  }
  
  getAddressUrl(address: string): string {
    return `${this.baseUrl}/address/${address}`;
  }
  
  getTokenUrl(address: string): string {
    return `${this.baseUrl}/token/${address}`;
  }
  
  getBlockUrl(blockNumber: number | string): string {
    return `${this.baseUrl}/block/${blockNumber}`;
  }
}

/**
 * Map of explorers by chain ID
 */
const explorers: Map<ChainId, Explorer> = new Map();

/**
 * Initialize explorers with default URLs
 */
export const initializeDefaultExplorers = (): void => {
  for (const [chainId, baseUrl] of Object.entries(DEFAULT_EXPLORERS)) {
    const numericChainId = Number(chainId) as ChainId;
    
    if (numericChainId === ChainId.SOLANA) {
      registerExplorer(numericChainId, new SolanaExplorer(baseUrl));
    } else {
      registerExplorer(numericChainId, new EVMExplorer(baseUrl));
    }
  }
  
  logger.info(`Initialized ${explorers.size} default blockchain explorers`);
};

/**
 * Register an explorer for a specific chain
 * @param chainId Chain ID
 * @param explorer Explorer instance
 */
export const registerExplorer = (chainId: ChainId, explorer: Explorer): void => {
  explorers.set(chainId, explorer);
  logger.info(`Registered explorer for chain ID ${chainId}`);
};

/**
 * Get an explorer for a specific chain
 * @param chainId Chain ID
 * @returns Explorer for the specified chain, or undefined if not found
 */
export const getExplorer = (chainId: ChainId): Explorer | undefined => {
  return explorers.get(chainId);
};

/**
 * Remove an explorer for a specific chain
 * @param chainId Chain ID
 * @returns Whether the explorer was successfully removed
 */
export const removeExplorer = (chainId: ChainId): boolean => {
  const removed = explorers.delete(chainId);
  
  if (removed) {
    logger.info(`Removed explorer for chain ID ${chainId}`);
  }
  
  return removed;
};

/**
 * Check if an explorer is registered for a specific chain
 * @param chainId Chain ID
 * @returns Whether an explorer is registered for the specified chain
 */
export const hasExplorer = (chainId: ChainId): boolean => {
  return explorers.has(chainId);
};

/**
 * Get transaction URL for a specific chain
 * @param chainId Chain ID
 * @param hash Transaction hash
 * @returns Transaction URL, or null if no explorer is registered for the specified chain
 */
export const getTransactionUrl = (chainId: ChainId, hash: string): string | null => {
  const explorer = getExplorer(chainId);
  
  if (!explorer) {
    return null;
  }
  
  return explorer.getTransactionUrl(hash);
};

/**
 * Get address URL for a specific chain
 * @param chainId Chain ID
 * @param address Address
 * @returns Address URL, or null if no explorer is registered for the specified chain
 */
export const getAddressUrl = (chainId: ChainId, address: string): string | null => {
  const explorer = getExplorer(chainId);
  
  if (!explorer) {
    return null;
  }
  
  return explorer.getAddressUrl(address);
};

/**
 * Get token URL for a specific chain
 * @param chainId Chain ID
 * @param address Token address
 * @returns Token URL, or null if no explorer is registered for the specified chain
 */
export const getTokenUrl = (chainId: ChainId, address: string): string | null => {
  const explorer = getExplorer(chainId);
  
  if (!explorer) {
    return null;
  }
  
  return explorer.getTokenUrl(address);
};

/**
 * Get block URL for a specific chain
 * @param chainId Chain ID
 * @param blockNumber Block number
 * @returns Block URL, or null if no explorer is registered for the specified chain
 */
export const getBlockUrl = (chainId: ChainId, blockNumber: number | string): string | null => {
  const explorer = getExplorer(chainId);
  
  if (!explorer) {
    return null;
  }
  
  return explorer.getBlockUrl(blockNumber);
};

// Initialize default explorers
initializeDefaultExplorers(); 