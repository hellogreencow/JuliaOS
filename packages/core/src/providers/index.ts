import { ChainId } from '../types';
import { Provider } from '../types/index';
import { logger } from '../utils/logger';

/**
 * Map of providers by chain ID
 */
const providers: Map<ChainId, Provider> = new Map();

/**
 * Register a provider for a specific chain
 * @param chainId Chain ID
 * @param provider Provider instance
 */
export const registerProvider = (chainId: ChainId, provider: Provider): void => {
  providers.set(chainId, provider);
  logger.info(`Registered provider for chain ID ${chainId}`);
};

/**
 * Get a provider for a specific chain
 * @param chainId Chain ID
 * @returns Provider for the specified chain, or undefined if not found
 */
export const getProvider = (chainId: ChainId): Provider | undefined => {
  return providers.get(chainId);
};

/**
 * Remove a provider for a specific chain
 * @param chainId Chain ID
 * @returns Whether the provider was successfully removed
 */
export const removeProvider = (chainId: ChainId): boolean => {
  const removed = providers.delete(chainId);
  
  if (removed) {
    logger.info(`Removed provider for chain ID ${chainId}`);
  }
  
  return removed;
};

/**
 * Check if a provider is registered for a specific chain
 * @param chainId Chain ID
 * @returns Whether a provider is registered for the specified chain
 */
export const hasProvider = (chainId: ChainId): boolean => {
  return providers.has(chainId);
};

/**
 * Get all registered chain IDs
 * @returns Array of registered chain IDs
 */
export const getRegisteredChains = (): ChainId[] => {
  return Array.from(providers.keys());
};

/**
 * Get the block number from a specific chain
 * @param chainId Chain ID
 * @returns Promise that resolves to the current block number
 * @throws Error if no provider is registered for the specified chain
 */
export const getBlockNumber = async (chainId: ChainId): Promise<number> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.getBlockNumber();
};

/**
 * Get transaction receipt from a specific chain
 * @param chainId Chain ID
 * @param txHash Transaction hash
 * @returns Promise that resolves to the transaction receipt
 * @throws Error if no provider is registered for the specified chain
 */
export const getTransactionReceipt = async (chainId: ChainId, txHash: string): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.getTransactionReceipt(txHash);
};

/**
 * Get transaction details from a specific chain
 * @param chainId Chain ID
 * @param txHash Transaction hash
 * @returns Promise that resolves to the transaction details
 * @throws Error if no provider is registered for the specified chain
 */
export const getTransaction = async (chainId: ChainId, txHash: string): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.getTransaction(txHash);
};

/**
 * Estimate gas for a transaction on a specific chain
 * @param chainId Chain ID
 * @param tx Transaction object
 * @returns Promise that resolves to the estimated gas
 * @throws Error if no provider is registered for the specified chain
 */
export const estimateGas = async (chainId: ChainId, tx: any): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.estimateGas(tx);
};

/**
 * Get gas price for a specific chain
 * @param chainId Chain ID
 * @returns Promise that resolves to the current gas price
 * @throws Error if no provider is registered for the specified chain
 */
export const getGasPrice = async (chainId: ChainId): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.getGasPrice();
};

/**
 * Call a contract method on a specific chain
 * @param chainId Chain ID
 * @param tx Transaction object
 * @returns Promise that resolves to the call result
 * @throws Error if no provider is registered for the specified chain
 */
export const call = async (chainId: ChainId, tx: any): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.call(tx);
};

/**
 * Send a transaction to a specific chain
 * @param chainId Chain ID
 * @param tx Transaction object
 * @returns Promise that resolves to the transaction response
 * @throws Error if no provider is registered for the specified chain
 */
export const sendTransaction = async (chainId: ChainId, tx: any): Promise<any> => {
  const provider = getProvider(chainId);
  
  if (!provider) {
    throw new Error(`No provider registered for chain ID ${chainId}`);
  }
  
  return provider.sendTransaction(tx);
}; 