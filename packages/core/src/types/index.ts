import { BigNumber } from 'ethers';

// For conversion methods
import * as ethers from 'ethers';

/**
 * Supported blockchain network IDs
 */
export enum ChainId {
  ETHEREUM = 1,
  POLYGON = 137,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  BASE = 8453,
  BSC = 56,
  AVALANCHE = 43114,
  SOLANA = -1, // Special case for Solana
}

/**
 * Transaction status states
 */
export enum TransactionStatus {
  PENDING = 'pending',
  MINED = 'mined',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

/**
 * Transaction types
 */
export enum TransactionType {
  TRANSFER = 'transfer',
  SWAP = 'swap',
  APPROVAL = 'approval',
  CONTRACT_INTERACTION = 'contract_interaction',
  CONTRACT_DEPLOYMENT = 'contract_deployment',
  CROSS_CHAIN = 'cross_chain',
}

/**
 * Provider interface for blockchain interactions
 */
export interface Provider {
  getBlockNumber(): Promise<number>;
  getTransactionReceipt(hash: string): Promise<any>;
  getTransaction(hash: string): Promise<any>;
  estimateGas(tx: any): Promise<any>;
  getGasPrice(): Promise<any>;
  call(tx: any): Promise<any>;
  sendTransaction(tx: any): Promise<any>;
}

/**
 * Explorer interface for blockchain explorers
 */
export interface Explorer {
  getTransactionUrl(hash: string): string;
  getAddressUrl(address: string): string;
  getTokenUrl(address: string): string;
  getBlockUrl(blockNumber: number | string): string;
}

/**
 * Account interface
 */
export interface Account {
  address: string;
  chainId: ChainId;
  balance?: string;
  nonce?: number;
}

export class TokenAmount {
  private value: BigNumber;

  private constructor(value: BigNumber) {
    this.value = value;
  }

  public static fromRaw(amount: string | number | BigNumber, decimals: number): TokenAmount {
    const bn = BigNumber.from(amount);
    return new TokenAmount(bn.mul(BigNumber.from(10).pow(decimals)));
  }

  public static zero(): TokenAmount {
    return new TokenAmount(BigNumber.from(0));
  }

  public add(other: TokenAmount | number): TokenAmount {
    if (typeof other === 'number') {
      return new TokenAmount(this.value.add(BigNumber.from(other)));
    }
    return new TokenAmount(this.value.add(other.value));
  }

  public sub(other: TokenAmount | number): TokenAmount {
    if (typeof other === 'number') {
      return new TokenAmount(this.value.sub(BigNumber.from(other)));
    }
    return new TokenAmount(this.value.sub(other.value));
  }

  public mul(other: TokenAmount | number): TokenAmount {
    if (typeof other === 'number') {
      return new TokenAmount(this.value.mul(BigNumber.from(other)));
    }
    return new TokenAmount(this.value.mul(other.value));
  }

  public div(other: TokenAmount | number): TokenAmount {
    if (typeof other === 'number') {
      return new TokenAmount(this.value.div(BigNumber.from(other)));
    }
    return new TokenAmount(this.value.div(other.value));
  }

  public gt(other: TokenAmount): boolean {
    return this.value.gt(other.value);
  }

  public lt(other: TokenAmount): boolean {
    return this.value.lt(other.value);
  }

  public eq(other: TokenAmount): boolean {
    return this.value.eq(other.value);
  }

  public toString(): string {
    return this.value.toString();
  }

  public toNumber(): number {
    return this.value.toNumber();
  }

  public valueOf(): number {
    return this.toNumber();
  }

  /**
   * Convert to BigNumberish for ethers compatibility
   */
  public toBigNumberish(): ethers.BigNumberish {
    return this.value;
  }

  /**
   * Convert to BigNumber for ethers compatibility
   */
  public toBigNumber(): ethers.BigNumber {
    return this.value;
  }
} 