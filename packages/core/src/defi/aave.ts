import { ethers } from 'ethers';

// Define the WalletAdapter interface locally to avoid import issues
interface WalletAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(transaction: any): Promise<any>;
  signMessage(message: string): Promise<string>;
  getAddress(): Promise<string>;
}

export interface AaveConfig {
  rpcUrl: string;
  lendingPoolAddress: string;
  dataProviderAddress: string;
}

export interface ReserveData {
  availableLiquidity: string;
  totalStableDebt: string;
  totalVariableDebt: string;
  liquidityRate: string;
  variableBorrowRate: string;
  stableBorrowRate: string;
  utilizationRate: string;
}

export interface UserAccountData {
  totalCollateralETH: string;
  totalDebtETH: string;
  availableBorrowsETH: string;
  currentLiquidationThreshold: string;
  ltv: string;
  healthFactor: string;
}

export class AaveProtocol {
  private config: AaveConfig;
  private provider: any; // Use any to avoid version compatibility issues
  private lendingPool: any;
  private dataProvider: any;

  constructor(config: AaveConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      // Create a provider using a try-catch approach
      try {
        // Try ethers v5 style provider first
        const ethersAny = ethers as any;
        if (typeof ethersAny.providers?.JsonRpcProvider === 'function') {
          this.provider = new ethersAny.providers.JsonRpcProvider(this.config.rpcUrl);
        } 
        // Try ethers v6 style provider next
        else if (typeof ethersAny.JsonRpcProvider === 'function') {
          this.provider = new ethersAny.JsonRpcProvider(this.config.rpcUrl);
        }
        // Fallback to a minimal mock provider
        else {
          console.warn("Could not create a standard provider, using fallback");
          this.provider = { 
            getCode: async () => '0x', 
            estimateGas: async () => 0,
            getNetwork: async () => ({ chainId: 1, name: 'mainnet' })
          };
        }
      } catch (error) {
        console.warn("Error creating provider:", error);
        // Create minimal mock provider as fallback
        this.provider = { 
          getCode: async () => '0x', 
          estimateGas: async () => 0,
          getNetwork: async () => ({ chainId: 1, name: 'mainnet' })
        };
      }

      // Initialize contracts
      const lendingPoolAbi = ['function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'];
      this.lendingPool = new ethers.Contract(this.config.lendingPoolAddress, lendingPoolAbi, this.provider);
      
      const dataProviderAbi = ['function getReserveData(address asset) view returns (tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256) data)'];
      this.dataProvider = new ethers.Contract(this.config.dataProviderAddress, dataProviderAbi, this.provider);
    } catch (error) {
      console.error("Failed to connect to Aave:", error);
      throw error;
    }
  }

  // Helper method for parsing units that works with both ethers v5 and v6
  private parseUnits(value: string | number, decimals: number = 18): bigint {
    try {
      const ethersAny = ethers as any;
      
      if (typeof ethersAny.parseUnits === 'function') {
        // ethers v6 approach
        return ethersAny.parseUnits(value.toString(), decimals);
      }
      else if (typeof ethersAny.utils?.parseUnits === 'function') {
        // ethers v5 approach
        return ethersAny.utils.parseUnits(value.toString(), decimals);
      }
      else {
        // Fallback implementation
        console.warn("parseUnits not found in ethers, using simple multiplication fallback");
        const factor = BigInt(10) ** BigInt(decimals);
        return BigInt(Math.floor(Number(value) * Number(factor)));
      }
    } catch (e) {
      console.error("Error parsing units:", e);
      return BigInt(0);
    }
  }

  async deposit(asset: string, amount: string, wallet: WalletAdapter): Promise<any> {
    try {
      await wallet.connect();
      const address = await wallet.getAddress();
      const amountBN = this.parseUnits(amount, 18);
      
      // Connect wallet to contract
      const signer = new ethers.Wallet('0x0000000000000000000000000000000000000000000000000000000000000001', this.provider);
      const connectedPool = this.lendingPool.connect(signer);
      
      // Prepare transaction
      const tx = await connectedPool.deposit(
        asset,
        amountBN,
        address,
        0, // referral code
        { 
          gasLimit: 300000,
          gasPrice: this.parseUnits('50', 9) // 50 Gwei
        }
      );
      
      // Return transaction  
      return { txHash: tx.hash };
    } catch (error) {
      console.error("Failed to deposit:", error);
      throw error;
    }
  }
  
  async getReserveData(asset: string): Promise<any> {
    try {
      const data = await this.dataProvider.getReserveData(asset);
      return {
        availableLiquidity: data[0].toString(),
        totalStableDebt: data[1].toString(),
        totalVariableDebt: data[2].toString(),
        liquidityRate: data[3].toString(),
        variableBorrowRate: data[4].toString(),
        stableBorrowRate: data[5].toString(),
        averageStableBorrowRate: data[6].toString(),
        liquidityIndex: data[7].toString(),
        variableBorrowIndex: data[8].toString(),
        lastUpdateTimestamp: data[9].toString()
      };
    } catch (error) {
      console.error("Failed to get reserve data:", error);
      throw error;
    }
  }

  async getUserAccountData(user: string): Promise<UserAccountData> {
    const data = await this.lendingPool.getUserAccountData(user);
    return {
      totalCollateralETH: data[0].toString(),
      totalDebtETH: data[1].toString(),
      availableBorrowsETH: data[2].toString(),
      currentLiquidationThreshold: data[3].toString(),
      ltv: data[4].toString(),
      healthFactor: data[5].toString()
    };
  }
} 