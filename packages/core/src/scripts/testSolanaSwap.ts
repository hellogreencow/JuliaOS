import { Connection, PublicKey, Transaction } from '@solana/web3.js';
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
    // Initialize Solana connection
    const connection = new Connection(CHAIN_CONFIG.RPC_URLS[ChainId.SOLANA], 'confirmed');
    
    // Initialize wallet (you'll need to provide your private key)
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Private key not found in environment variables');
    }

    const walletManager = WalletManager.getInstance();
    await walletManager.initializeWallet(ChainId.SOLANA, privateKey, connection);

    // Initialize DEX router (Jupiter for best routing)
    const dexManager = DexManager.getInstance();
    await dexManager.initializeRouter(
      ChainId.SOLANA,
      CHAIN_CONFIG.DEX_ROUTERS[ChainId.SOLANA].JUPITER,
      connection
    );

    // Set up risk management
    const riskManager = RiskManager.getInstance();
    riskManager.setConfig(ChainId.SOLANA, {
      maxTransactionValue: TokenAmount.fromRaw('0.1', 9), // 0.1 SOL max
      maxDailyVolume: TokenAmount.fromRaw('1', 9), // 1 SOL daily max
      maxSlippage: 1, // 1% max slippage
      minLiquidity: TokenAmount.fromRaw('1000', 9), // 1000 SOL min liquidity
      maxGasPrice: TokenAmount.fromRaw('100', 9), // 100 lamports max
      circuitBreakerThreshold: 0.5 // 50% price movement threshold
    });

    // Get wallet address and balance
    const address = walletManager.getAddress(ChainId.SOLANA);
    const balance = await walletManager.getBalance(ChainId.SOLANA);
    logger.info(`Wallet address: ${address}`);
    
    // Use our TokenAmount methods for conversion
    const balanceValue = balance.toNumber();
    logger.info(`Balance: ${balanceValue / 1e9} SOL`);

    // Test swap: 0.01 SOL to USDC
    const amountIn = TokenAmount.fromRaw('0.01', 9);
    const inputMint = new PublicKey(CHAIN_CONFIG.COMMON_TOKENS[ChainId.SOLANA].SOL);
    const outputMint = new PublicKey(CHAIN_CONFIG.COMMON_TOKENS[ChainId.SOLANA].USDC);

    // Get expected output
    const amountOut = await dexManager.getAmountOut(ChainId.SOLANA, amountIn, [inputMint, outputMint]);
    
    // Use our TokenAmount methods for calculations
    // Fixed issue - amountOut.mul(95).div(100) now properly works with our TokenAmount class
    const amountOutMin = TokenAmount.fromRaw(amountOut.toNumber() * 0.95, 6); // 5% slippage tolerance

    // Convert to number for display using our methods
    const amountOutValue = amountOut.toNumber();
    const amountOutMinValue = amountOutMin.toNumber();
    logger.info(`Expected USDC output: ${amountOutValue / 1e6} USDC`);
    logger.info(`Minimum USDC output: ${amountOutMinValue / 1e6} USDC`);

    // Execute swap
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const receipt = await dexManager.swapExactTokensForTokens(
      ChainId.SOLANA,
      amountIn,
      amountOutMin,
      [inputMint, outputMint],
      deadline
    );

    // Monitor transaction
    const monitor = TransactionMonitor.getInstance();
    const status = await monitor.waitForConfirmation(ChainId.SOLANA, receipt.signature);

    if (status.status === 'confirmed') {
      logger.info('Swap successful!');
      logger.info(`Transaction signature: ${status.signature}`);
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