import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ChainId, TokenAmount } from '../types';
import { logger } from '../utils/logger';
import { RiskManager } from './RiskManager';

export class WalletManager {
  private static instance: WalletManager;
  private wallets: Map<ChainId, Keypair>;
  private connections: Map<ChainId, Connection>;
  private riskManager: RiskManager;

  private constructor() {
    this.wallets = new Map();
    this.connections = new Map();
    this.riskManager = RiskManager.getInstance();
  }

  public static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  public async initializeWallet(
    chainId: ChainId,
    privateKey: string,
    connection: Connection
  ): Promise<void> {
    try {
      // Convert private key to Uint8Array
      const secretKey = Buffer.from(privateKey, 'base64');
      const keypair = Keypair.fromSecretKey(secretKey);
      
      this.wallets.set(chainId, keypair);
      this.connections.set(chainId, connection);
      
      logger.info(`Initialized wallet for chain ${chainId}`);
    } catch (error) {
      logger.error(`Failed to initialize wallet: ${error}`);
      throw error;
    }
  }

  public getAddress(chainId: ChainId): string {
    const wallet = this.wallets.get(chainId);
    if (!wallet) {
      throw new Error(`No wallet initialized for chain ${chainId}`);
    }
    return wallet.publicKey.toString();
  }

  public async getBalance(chainId: ChainId): Promise<TokenAmount> {
    const connection = this.connections.get(chainId);
    const wallet = this.wallets.get(chainId);
    
    if (!connection || !wallet) {
      throw new Error(`No wallet or connection initialized for chain ${chainId}`);
    }

    try {
      const balance = await connection.getBalance(wallet.publicKey);
      return TokenAmount.fromRaw(balance.toString(), 9); // SOL has 9 decimals
    } catch (error) {
      logger.error(`Failed to get balance: ${error}`);
      throw error;
    }
  }

  public async signTransaction(
    chainId: ChainId,
    transaction: any
  ): Promise<any> {
    const wallet = this.wallets.get(chainId);
    if (!wallet) {
      throw new Error(`No wallet initialized for chain ${chainId}`);
    }

    try {
      transaction.partialSign(wallet);
      return transaction;
    } catch (error) {
      logger.error(`Failed to sign transaction: ${error}`);
      throw error;
    }
  }

  public async sendTransaction(
    chainId: ChainId,
    transaction: any
  ): Promise<string> {
    const connection = this.connections.get(chainId);
    if (!connection) {
      throw new Error(`No connection initialized for chain ${chainId}`);
    }

    try {
      const signature = await connection.sendRawTransaction(transaction.serialize());
      logger.info(`Transaction sent: ${signature}`);
      return signature;
    } catch (error) {
      logger.error(`Failed to send transaction: ${error}`);
      throw error;
    }
  }

  public async getNonce(chainId: ChainId): Promise<number> {
    const wallet = this.wallets.get(chainId);
    const connection = this.connections.get(chainId);
    
    if (!wallet) {
      throw new Error(`No wallet initialized for chain ${chainId}`);
    }
    
    if (!connection) {
      throw new Error(`No connection initialized for chain ${chainId}`);
    }

    try {
      // Different implementation based on chain
      if (chainId === ChainId.SOLANA) {
        // For Solana
        const accountInfo = await connection.getAccountInfo(wallet.publicKey);
        return accountInfo?.lamports || 0; // Use lamports as a placeholder for nonce
      } else {
        // For EVM chains
        return 0; // Mock implementation, should be replaced with actual EVM method
      }
    } catch (error) {
      logger.error(`Failed to get nonce: ${error}`);
      throw error;
    }
  }

  public removeWallet(chainId: ChainId): void {
    this.wallets.delete(chainId);
    this.connections.delete(chainId);
    logger.info(`Removed wallet for chain ${chainId}`);
  }
} 