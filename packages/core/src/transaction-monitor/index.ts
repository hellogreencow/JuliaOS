import { EventEmitter } from 'events';
import { ChainId } from '../types';
import { TransactionStatus, TransactionType } from '../types/index';
import { getProvider } from '../providers';
import { getExplorer } from '../explorers';
import { logger } from '../utils/logger';
import { sleep } from '../utils/time';

/**
 * Transaction representation with status information
 */
export interface Transaction {
  id: string;
  hash: string;
  chainId: ChainId;
  type: TransactionType;
  status: TransactionStatus;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string;
  data?: string;
  nonce?: number;
  blockNumber?: number;
  blockHash?: string;
  confirmations: number;
  metadata?: Record<string, any>;
  lastChecked?: number;
  error?: string;
}

/**
 * Interface for transaction monitor configuration
 */
export interface TransactionMonitorConfig {
  pollingInterval?: number;
  confirmationsRequired?: number | Record<ChainId, number>;
  maxRetries?: number;
  retryDelay?: number;
  autoStart?: boolean;
  debug?: boolean;
}

/**
 * Default configuration for the transaction monitor
 */
const DEFAULT_CONFIG: TransactionMonitorConfig = {
  pollingInterval: 15000, // 15 seconds
  confirmationsRequired: {
    [ChainId.ETHEREUM]: 12,
    [ChainId.POLYGON]: 20,
    [ChainId.ARBITRUM]: 5,
    [ChainId.OPTIMISM]: 5,
    [ChainId.BASE]: 5,
    [ChainId.BSC]: 15,
    [ChainId.AVALANCHE]: 12,
    [ChainId.SOLANA]: 32,
  },
  maxRetries: 3,
  retryDelay: 1000,
  autoStart: true,
  debug: false,
};

/**
 * Service responsible for monitoring transaction status across multiple chains
 */
export class TransactionMonitor extends EventEmitter {
  private transactions: Map<string, Transaction> = new Map();
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private config: Required<TransactionMonitorConfig>;
  
  constructor(config: TransactionMonitorConfig = {}) {
    super();
    
    // Merge with default config
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<TransactionMonitorConfig>;
    
    if (this.config.autoStart) {
      this.start();
    }
  }
  
  /**
   * Start the transaction monitor
   */
  public start(): void {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Set up polling interval
    this.pollingInterval = setInterval(() => {
      this.checkTransactions();
    }, this.config.pollingInterval);
    
    logger.info('Transaction monitor started');
    this.emit('started');
  }
  
  /**
   * Stop the transaction monitor
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    // Clear polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    logger.info('Transaction monitor stopped');
    this.emit('stopped');
  }
  
  /**
   * Add a transaction to monitor
   */
  public addTransaction(transaction: Omit<Transaction, 'status' | 'confirmations' | 'timestamp'>): Transaction {
    // Create new transaction object with defaults
    const newTx: Transaction = {
      ...transaction,
      status: TransactionStatus.PENDING,
      confirmations: 0,
      timestamp: Date.now(),
    };
    
    // Add to monitoring map
    this.transactions.set(newTx.id, newTx);
    
    if (this.config.debug) {
      logger.debug(`Added transaction to monitor: ${newTx.id} (${newTx.hash})`);
    }
    
    this.emit('transaction:added', newTx);
    
    // Immediately check transaction status
    this.checkTransaction(newTx.id).catch(error => {
      logger.error(`Error checking transaction ${newTx.id}:`, error);
    });
    
    return newTx;
  }
  
  /**
   * Remove a transaction from monitoring
   */
  public removeTransaction(id: string): boolean {
    const exists = this.transactions.has(id);
    
    if (exists) {
      const tx = this.transactions.get(id)!;
      this.transactions.delete(id);
      
      if (this.config.debug) {
        logger.debug(`Removed transaction from monitor: ${id}`);
      }
      
      this.emit('transaction:removed', tx);
    }
    
    return exists;
  }
  
  /**
   * Get a transaction by ID
   */
  public getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }
  
  /**
   * Get all transactions
   */
  public getAllTransactions(): Transaction[] {
    return Array.from(this.transactions.values());
  }
  
  /**
   * Get transactions by status
   */
  public getTransactionsByStatus(status: TransactionStatus): Transaction[] {
    return this.getAllTransactions().filter(tx => tx.status === status);
  }
  
  /**
   * Get transactions by chain ID
   */
  public getTransactionsByChain(chainId: ChainId): Transaction[] {
    return this.getAllTransactions().filter(tx => tx.chainId === chainId);
  }
  
  /**
   * Check all transactions
   */
  private async checkTransactions(): Promise<void> {
    const txIds = Array.from(this.transactions.keys());
    
    // Skip if no transactions to check
    if (txIds.length === 0) {
      return;
    }
    
    if (this.config.debug) {
      logger.debug(`Checking ${txIds.length} transactions`);
    }
    
    // Check each transaction
    const checkPromises = txIds.map(id => this.checkTransaction(id).catch(error => {
      logger.error(`Error checking transaction ${id}:`, error);
    }));
    
    await Promise.all(checkPromises);
  }
  
  /**
   * Check a specific transaction
   */
  private async checkTransaction(id: string): Promise<void> {
    const tx = this.transactions.get(id);
    
    if (!tx) {
      return;
    }
    
    // Update last checked timestamp
    tx.lastChecked = Date.now();
    
    try {
      // Get provider for the chain
      const provider = getProvider(tx.chainId);
      
      if (!provider) {
        throw new Error(`No provider available for chain ${tx.chainId}`);
      }
      
      // Get transaction receipt
      const receipt = await this.getTransactionReceipt(tx.hash, tx.chainId);
      
      if (!receipt) {
        // Transaction is still pending
        if (tx.status !== TransactionStatus.PENDING) {
          // Update status if changed
          tx.status = TransactionStatus.PENDING;
          this.emit('transaction:updated', tx);
          this.emit('transaction:status:changed', tx, TransactionStatus.PENDING);
        }
        return;
      }
      
      // Get current block number for confirmations
      const currentBlock = await provider.getBlockNumber();
      
      // Transaction is mined
      if (receipt.blockNumber) {
        tx.blockNumber = receipt.blockNumber;
        tx.blockHash = receipt.blockHash;
        tx.gasUsed = receipt.gasUsed.toString();
        
        // Calculate confirmations
        tx.confirmations = currentBlock - receipt.blockNumber;
        
        // Determine status based on receipt and confirmations
        const requiredConfirmations = this.getRequiredConfirmations(tx.chainId);
        
        if (receipt.status === 0) {
          // Transaction failed
          tx.status = TransactionStatus.FAILED;
          tx.error = 'Transaction execution failed';
        } else if (tx.confirmations >= requiredConfirmations) {
          // Transaction confirmed
          tx.status = TransactionStatus.CONFIRMED;
        } else {
          // Transaction is mined but not confirmed yet
          tx.status = TransactionStatus.MINED;
        }
        
        // Emit events
        this.emit('transaction:updated', tx);
        this.emit('transaction:status:changed', tx, tx.status);
        
        // Remove confirmed or failed transactions from monitoring
        if (tx.status === TransactionStatus.CONFIRMED || tx.status === TransactionStatus.FAILED) {
          this.removeTransaction(tx.id);
        }
      }
    } catch (error: any) {
      logger.error(`Error checking transaction ${id}:`, error);
      
      // Increment retry count in metadata
      if (!tx.metadata) {
        tx.metadata = {};
      }
      
      tx.metadata.retryCount = (tx.metadata.retryCount || 0) + 1;
      
      // Mark as failed if max retries reached
      if (tx.metadata.retryCount >= this.config.maxRetries) {
        tx.status = TransactionStatus.FAILED;
        tx.error = `Failed to check transaction status: ${error.message}`;
        
        this.emit('transaction:updated', tx);
        this.emit('transaction:status:changed', tx, TransactionStatus.FAILED);
        this.emit('transaction:error', tx, error);
        
        // Remove failed transaction from monitoring
        this.removeTransaction(tx.id);
      }
    }
  }
  
  /**
   * Get transaction receipt with retries
   */
  private async getTransactionReceipt(hash: string, chainId: ChainId): Promise<any> {
    const provider = getProvider(chainId);
    
    if (!provider) {
      throw new Error(`No provider available for chain ${chainId}`);
    }
    
    let retryCount = 0;
    
    while (retryCount < this.config.maxRetries) {
      try {
        const receipt = await provider.getTransactionReceipt(hash);
        return receipt;
      } catch (error) {
        retryCount++;
        
        if (retryCount >= this.config.maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, retryCount - 1);
        await sleep(delay);
      }
    }
    
    return null;
  }
  
  /**
   * Get required confirmations for a chain
   */
  private getRequiredConfirmations(chainId: ChainId): number {
    if (typeof this.config.confirmationsRequired === 'number') {
      return this.config.confirmationsRequired;
    }
    
    return (
      this.config.confirmationsRequired[chainId] ||
      this.config.confirmationsRequired[ChainId.ETHEREUM] ||
      12
    );
  }
  
  /**
   * Get transaction explorer URL
   */
  public getTransactionExplorerUrl(id: string): string | null {
    const tx = this.transactions.get(id);
    
    if (!tx) {
      return null;
    }
    
    const explorer = getExplorer(tx.chainId);
    
    if (!explorer) {
      return null;
    }
    
    return explorer.getTransactionUrl(tx.hash);
  }
}

// Singleton instance for global use
export const transactionMonitor = new TransactionMonitor();

// Default export for flexibility
export default transactionMonitor; 