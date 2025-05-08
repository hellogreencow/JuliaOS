import { ethers } from 'ethers';
import { ChainId, TokenAmount } from '../types';
import { CHAIN_CONFIG } from '../config/chains';
import { WalletManager } from '../security/WalletManager';
import { DexManager } from '../dex/DexManager';
import { RiskManager } from '../security/RiskManager';
import { TransactionMonitor } from '../monitoring/TransactionMonitor';
import { logger } from '../utils/logger';
import { ConnectionAdapter } from '../utils/ConnectionAdapter';

async function main() {
  try {
    // Initialize providers using dynamic approach for ethers compatibility
    let provider;
    try {
      // Check if ethers has JsonRpcProvider as a direct property (v6) or under providers (v5)
      const Provider = (ethers as any).JsonRpcProvider || ethers.providers.JsonRpcProvider;
      provider = new Provider(CHAIN_CONFIG.RPC_URLS[ChainId.ETHEREUM]);
    } catch (error) {
      logger.error('Error creating JsonRpcProvider:', error);
      throw new Error('Failed to initialize ethers provider');
    }
    
    // Create connection adapter
    const connectionAdapter = new ConnectionAdapter(provider);
    
    // Initialize wallet (you'll need to provide your private key)
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key not found in environment variables');
    }

    const walletManager = WalletManager.getInstance();
    await walletManager.initializeWallet(ChainId.ETHEREUM, privateKey, provider);

    // Initialize DEX router using the connection adapter
    const dexManager = DexManager.getInstance();
    await dexManager.initializeRouter(
      ChainId.ETHEREUM,
      CHAIN_CONFIG.DEX_ROUTERS[ChainId.ETHEREUM]?.JUPITER || '',
      provider
    );

    // Set up risk management
    const riskManager = RiskManager.getInstance();
    riskManager.setConfig(ChainId.ETHEREUM, {
      maxTransactionValue: TokenAmount.fromRaw('0.1', 18), // 0.1 ETH max
      maxDailyVolume: TokenAmount.fromRaw('1', 18), // 1 ETH daily max
      maxSlippage: 1, // 1% max slippage
      minLiquidity: TokenAmount.fromRaw('1000', 18), // 1000 ETH min liquidity
      maxGasPrice: TokenAmount.fromRaw('100', 9), // 100 Gwei max
      circuitBreakerThreshold: 0.5 // 50% price movement threshold
    });

    // Get wallet address and balance
    const address = walletManager.getAddress(ChainId.ETHEREUM);
    const balance = await walletManager.getBalance(ChainId.ETHEREUM);
    logger.info(`Wallet address: ${address}`);
    
    // Use our TokenAmount methods
    const balanceValue = balance.toNumber();
    logger.info(`Balance: ${ethers.utils.formatEther(balance.toString())} ETH`);

    // Test swap: 0.01 ETH to USDC
    const amountIn = TokenAmount.fromRaw('0.01', 18);
    const path = [
      CHAIN_CONFIG.COMMON_TOKENS[ChainId.ETHEREUM].USDC,
      CHAIN_CONFIG.COMMON_TOKENS[ChainId.ETHEREUM].USDT
    ];

    // Get expected output
    const amountOut = await dexManager.getAmountOut(ChainId.ETHEREUM, amountIn, path);
    
    // Use proper TokenAmount methods
    const amountOutMin = TokenAmount.fromRaw(amountOut.toNumber() * 0.95, 6); // 5% slippage tolerance

    logger.info(`Expected USDC output: ${ethers.utils.formatUnits(amountOut.toString(), 6)} USDC`);
    logger.info(`Minimum USDC output: ${ethers.utils.formatUnits(amountOutMin.toString(), 6)} USDC`);

    // Execute swap
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const receipt = await dexManager.swapExactTokensForTokens(
      ChainId.ETHEREUM,
      amountIn,
      amountOutMin,
      path,
      deadline
    );

    // Monitor transaction
    const monitor = TransactionMonitor.getInstance();
    const status = await monitor.waitForConfirmation(ChainId.ETHEREUM, receipt.hash);

    if (status.status === 'confirmed') {
      logger.info('Swap successful!');
      logger.info(`Transaction hash: ${status.hash}`);
    } else {
      logger.error('Swap failed!');
      logger.error(`Error: ${status.error}`);
    }

  } catch (error) {
    logger.error('Error executing test swap:', error);
  }
}

// Run the script
main().catch(console.error); 