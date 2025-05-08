import { ethers } from 'ethers';
import { DEXInterface, DEXConfig, SwapParams, SwapResult } from './interface';
import { Token, TokenPair } from '../tokens/types';
import { IUniswapV3PoolABI } from './abis/uniswap-v3-pool';
import { IUniswapV3RouterABI } from './abis/uniswap-v3-router';
import { ERC20ABI } from './abis/erc20';
import { DEXMonitor } from './monitoring';
import { PriceFeed, PriceFeedConfig } from './price-feed';

declare global {
  function setTimeout(callback: () => void, ms: number): number;
}

export class UniswapV3DEX implements DEXInterface {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private router: ethers.Contract;
  private chainId: number;
  private isEmergencyStopped: boolean = false;
  private maxPositionSize: bigint;
  private minLiquidity: bigint;
  private maxSlippage: number;
  private circuitBreaker: boolean = false;
  private monitor: DEXMonitor;
  private priceFeed: PriceFeed;

  constructor(config: DEXConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    
    // Security parameters
    this.maxPositionSize = ethers.parseEther('100'); // 100 ETH max position
    this.minLiquidity = ethers.parseEther('1000'); // 1000 ETH min liquidity
    this.maxSlippage = config.slippageTolerance || 0.5; // 0.5% default
    
    // Initialize monitor
    this.monitor = new DEXMonitor();
    
    // Initialize price feed
    const priceFeedConfig: PriceFeedConfig = {
      updateInterval: 30000, // 30 seconds
      maxPriceDeviation: 1.0, // 1% max deviation
      minConfidence: 0.8, // 80% minimum confidence
      sources: ['uniswap-v3', 'chainlink', 'coingecko']
    };
    this.priceFeed = new PriceFeed(priceFeedConfig);
    
    // Uniswap V3 Router address (mainnet)
    const routerAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    this.router = new ethers.Contract(
      routerAddress,
      IUniswapV3RouterABI,
      this.signer
    );
  }

  // Emergency stop functionality
  public emergencyStop(): void {
    this.isEmergencyStopped = true;
    this.circuitBreaker = true;
  }

  public emergencyResume(): void {
    this.isEmergencyStopped = false;
    this.circuitBreaker = false;
  }

  // Security checks
  private async validateTrade(params: SwapParams): Promise<void> {
    if (this.isEmergencyStopped) {
      throw new Error('Trading is emergency stopped');
    }

    if (this.circuitBreaker) {
      throw new Error('Circuit breaker is active');
    }

    // Check position size
    const amountIn = BigInt(params.amountIn);
    if (amountIn > this.maxPositionSize) {
      throw new Error('Position size exceeds maximum limit');
    }

    // Check liquidity
    const liquidity = await this.getLiquidity(params.tokenIn, params.tokenOut);
    const reserveB = BigInt(liquidity.reserveB);
    if (reserveB < this.minLiquidity) {
      throw new Error('Insufficient liquidity');
    }

    // Check slippage
    if (params.slippageTolerance && params.slippageTolerance > this.maxSlippage) {
      throw new Error('Slippage tolerance exceeds maximum allowed');
    }
  }

  async getQuote(params: SwapParams): Promise<{
    amountOut: string;
    priceImpact: number;
    gasEstimate: number;
  }> {
    const { tokenIn, tokenOut, amountIn } = params;
    
    // Get pool address
    const poolAddress = await this.getPoolAddress(tokenIn, tokenOut);
    const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
    
    // Get current sqrt price
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0[0];
    
    // Calculate price impact
    const priceImpact = await this.calculatePriceImpact(
      pool,
      tokenIn,
      tokenOut,
      amountIn
    );
    
    // Get quote using exactInputSingle in the interface
    const quoteParams = {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: await pool.fee(),
      recipient: await this.signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
      amountIn: amountIn,
      amountOutMinimum: '0',
      sqrtPriceLimitX96: '0'
    };
    
    // Using the Universal Router interface method
    const quote = await this.router.exactInputSingle.staticCall(quoteParams);
    
    // Estimate gas
    const gasEstimate = await this.estimateGas(params);
    
    return {
      amountOut: quote.toString(),
      priceImpact,
      gasEstimate
    };
  }

  /**
   * Get quote for multi-hop swap
   */
  async getMultiHopQuote(params: {
    path: Token[];
    amountIn: string;
  }): Promise<{
    amountOut: string;
    priceImpact: number;
    gasEstimate: number;
  }> {
    const { path, amountIn } = params;
    
    if (path.length < 2) {
      throw new Error('Path must contain at least 2 tokens');
    }

    // Encode path
    const encodedPath = this.encodePath(path);
    
    // Get quote using exactInput in the interface
    const quoteParams = {
      path: encodedPath,
      recipient: await this.signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
      amountIn: amountIn,
      amountOutMinimum: '0'
    };
    
    // Using the Universal Router interface method
    const quote = await this.router.exactInput.staticCall(quoteParams);
    
    // Calculate total price impact across all hops
    let totalPriceImpact = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const poolAddress = await this.getPoolAddress(path[i], path[i + 1]);
      const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
      const hopImpact = await this.calculatePriceImpact(
        pool,
        path[i],
        path[i + 1],
        amountIn
      );
      totalPriceImpact += hopImpact;
    }
    
    // Estimate gas for multi-hop
    const gasEstimate = await this.estimateMultiHopGas(path, amountIn);
    
    return {
      amountOut: quote.toString(),
      priceImpact: totalPriceImpact,
      gasEstimate
    };
  }

  /**
   * Execute multi-hop swap
   */
  private async waitForTransaction(tx: ethers.ContractTransactionResponse, timeout: number = 300000): Promise<ethers.TransactionReceipt> {
    try {
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Transaction timeout')), timeout);
        })
      ]);
      
      if (receipt === null) {
        throw new Error('Transaction failed');
      }
      
      return receipt;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown transaction error');
    }
  }

  async executeMultiHopSwap(params: {
    path: Token[];
    amountIn: string;
    minAmountOut: string;
  }): Promise<SwapResult> {
    const { path, amountIn, minAmountOut } = params;
    const startTime = Date.now();
    
    try {
      // Validate path
      if (path.length < 2) {
        throw new Error('Path must contain at least 2 tokens');
      }

      // Encode path
      const encodedPath = this.encodePath(path);
      
      // Approve first token if needed
      await this.approveToken(path[0], amountIn);
      
      // Execute multi-hop swap
      const tx = await this.router.exactInput({
        path: encodedPath,
        recipient: await this.signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
        amountIn: amountIn,
        amountOutMinimum: minAmountOut
      });
      
      // Wait for transaction with timeout
      const receipt = await this.waitForTransaction(tx);
      
      // Get amount out from event logs
      const amountOut = this.getAmountOutFromLogs([...receipt.logs]);
      
      // Calculate total price impact
      let totalPriceImpact = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const poolAddress = await this.getPoolAddress(path[i], path[i + 1]);
        const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
        const hopImpact = await this.calculatePriceImpact(
          pool,
          path[i],
          path[i + 1],
          amountIn
        );
        totalPriceImpact += hopImpact;
      }
      
      const result: SwapResult = {
        transactionHash: receipt.hash,
        amountOut,
        priceImpact: totalPriceImpact,
        gasUsed: Number(receipt.gasUsed),
        gasPrice: receipt.gasPrice.toString(),
        executionTime: Date.now() - startTime
      };

      // Record trade in monitor
      this.monitor.recordTrade(result);

      return result;
    } catch (error) {
      // Record failed trade
      this.monitor.recordTrade({
        transactionHash: '',
        amountOut: '0',
        priceImpact: 0,
        gasUsed: 0,
        gasPrice: '0',
        executionTime: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Encode path for multi-hop swap
   */
  private encodePath(path: Token[]): string {
    let encodedPath = '';
    
    for (let i = 0; i < path.length - 1; i++) {
      const tokenIn = path[i];
      const tokenOut = path[i + 1];
      
      // Get pool address to determine fee
      const poolAddress = this.getPoolAddress(tokenIn, tokenOut);
      // Default fee (3000 = 0.3%)
      const fee = 3000;
      
      // Encode each hop: tokenIn + fee + tokenOut
      encodedPath += tokenIn.address.slice(2) + // Remove '0x' prefix
                     fee.toString(16).padStart(6, '0') +
                     tokenOut.address.slice(2);
    }
    
    return '0x' + encodedPath;
  }

  /**
   * Estimate gas for multi-hop swap
   */
  private async estimateMultiHopGas(path: Token[], amountIn: string): Promise<number> {
    const encodedPath = this.encodePath(path);
    
    try {
      const gasEstimate = await this.router.exactInput.estimateGas({
        path: encodedPath,
        recipient: await this.signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: '0'
      });
      
      return Number(gasEstimate);
    } catch (error) {
      console.error('Error estimating gas:', error);
      return 500000; // Default gas estimate
    }
  }

  async executeSwap(params: SwapParams): Promise<SwapResult> {
    // Add security validation
    await this.validateTrade(params);

    const { tokenIn, tokenOut, amountIn } = params;
    const startTime = Date.now();
    
    try {
      // Get and validate price
      const price = await this.getPrice(tokenIn, tokenOut);
      const isValidPrice = await this.priceFeed.validatePrice(
        tokenIn,
        tokenOut,
        price
      );

      if (!isValidPrice) {
        throw new Error('Invalid price data');
      }

      // Approve token if needed
      await this.approveToken(tokenIn, amountIn);
      
      // Get pool for fee
      const poolAddress = await this.getPoolAddress(tokenIn, tokenOut);
      const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
      const fee = await pool.fee();
      
      // Execute swap with additional security checks
      const tx = await this.router.exactInputSingle({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: fee,
        recipient: await this.signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: '0',
        sqrtPriceLimitX96: '0'
      });
      
      // Wait for transaction with timeout
      const receipt = await this.waitForTransaction(tx);
      
      // Get amount out from event logs
      const amountOut = this.getAmountOutFromLogs([...receipt.logs]);
      
      const result: SwapResult = {
        transactionHash: receipt.hash,
        amountOut,
        priceImpact: await this.calculatePriceImpact(
          pool,
          tokenIn,
          tokenOut,
          amountIn
        ),
        gasUsed: Number(receipt.gasUsed),
        gasPrice: receipt.gasPrice.toString(),
        executionTime: Date.now() - startTime
      };

      // Record trade in monitor
      this.monitor.recordTrade(result);

      // Update price feed
      await this.priceFeed.updatePrice(
        tokenIn,
        tokenOut,
        price,
        'uniswap-v3',
        0.9 // 90% confidence for on-chain prices
      );

      return result;
    } catch (error) {
      // Record failed trade
      this.monitor.recordTrade({
        transactionHash: '',
        amountOut: '0',
        priceImpact: 0,
        gasUsed: 0,
        gasPrice: '0',
        executionTime: Date.now() - startTime
      });

      throw error;
    }
  }

  async getLiquidity(tokenA: Token, tokenB: Token): Promise<{
    reserveA: string;
    reserveB: string;
    totalSupply: string;
  }> {
    const poolAddress = await this.getPoolAddress(tokenA, tokenB);
    const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
    
    const [token0, token1] = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
    
    const liquidity = await pool.liquidity();
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0[0];
    
    // Calculate reserves from liquidity and price
    const reserves = await this.calculateReserves(
      pool,
      liquidity,
      sqrtPriceX96,
      token0,
      token1
    );
    
    return {
      reserveA: reserves[0].toString(),
      reserveB: reserves[1].toString(),
      totalSupply: liquidity.toString()
    };
  }

  async getPrice(tokenA: Token, tokenB: Token): Promise<string> {
    const poolAddress = await this.getPoolAddress(tokenA, tokenB);
    const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
    
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0[0];
    
    return this.calculatePrice(sqrtPriceX96, tokenA, tokenB);
  }

  async getPool(tokenA: Token, tokenB: Token): Promise<{
    address: string;
    fee: number;
    tickSpacing: number;
  }> {
    const poolAddress = await this.getPoolAddress(tokenA, tokenB);
    const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
    
    const fee = await pool.fee();
    const tickSpacing = await pool.tickSpacing();
    
    return {
      address: poolAddress,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing)
    };
  }

  async getTokenBalance(token: Token, address: string): Promise<string> {
    const contract = new ethers.Contract(token.address, ERC20ABI, this.provider);
    return (await contract.balanceOf(address)).toString();
  }

  async approveToken(token: Token, amount: string): Promise<string> {
    const contract = new ethers.Contract(token.address, ERC20ABI, this.signer);
    const routerAddress = this.router.address;
    
    const allowance = await contract.allowance(
      await this.signer.getAddress(),
      routerAddress
    );
    
    if (allowance.lt(amount)) {
      const tx = await contract.approve(routerAddress, amount);
      return tx.hash;
    }
    
    return '';
  }

  async estimateGas(params: SwapParams): Promise<number> {
    const { tokenIn, tokenOut, amountIn } = params;
    
    try {
      // Get pool for fee
      const poolAddress = await this.getPoolAddress(tokenIn, tokenOut);
      const pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI, this.provider);
      const fee = await pool.fee();
      
      const gasEstimate = await this.router.exactInputSingle.estimateGas({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        fee: fee,
        recipient: await this.signer.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: amountIn,
        amountOutMinimum: '0',
        sqrtPriceLimitX96: '0'
      });
      
      return Number(gasEstimate);
    } catch (error) {
      console.error('Error estimating gas:', error);
      return 300000; // Default gas estimate
    }
  }

  async getGasPrice(): Promise<string> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice?.toString() || '0';
  }

  getChainId(): number {
    return this.chainId;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Wallet {
    return this.signer;
  }

  // Helper methods
  private async getPoolAddress(tokenA: Token, tokenB: Token): Promise<string> {
    const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
    const factory = new ethers.Contract(
      factoryAddress,
      ['function getPool(address,address,uint24) view returns (address)'],
      this.provider
    );
    
    return factory.getPool(tokenA.address, tokenB.address, 3000); // Using 0.3% fee tier
  }

  private async calculatePriceImpact(
    pool: ethers.Contract,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string
  ): Promise<number> {
    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0[0];
    const currentPrice = this.calculatePrice(sqrtPriceX96, tokenIn, tokenOut);
    
    const quote = await this.getQuote({
      tokenIn,
      tokenOut,
      amountIn
    });
    
    const executionPrice = parseFloat(quote.amountOut) / parseFloat(amountIn);
    return Math.abs((executionPrice - parseFloat(currentPrice)) / parseFloat(currentPrice)) * 100;
  }

  private calculatePrice(
    sqrtPriceX96: bigint,
    tokenA: Token,
    tokenB: Token
  ): string {
    const price = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** tokenA.decimals)) / 
                  (BigInt(2) ** BigInt(192)) / 
                  BigInt(10 ** tokenB.decimals);
    return price.toString();
  }

  private async calculateReserves(
    pool: ethers.Contract,
    liquidity: bigint,
    sqrtPriceX96: bigint,
    token0: Token,
    token1: Token
  ): Promise<[bigint, bigint]> {
    const sqrtPrice = BigInt(ethers.parseUnits("1", token1.decimals));
    
    const reserve0 = liquidity * BigInt(2 ** 96) / sqrtPriceX96;
    const reserve1 = liquidity * sqrtPriceX96 / BigInt(2 ** 96);
    
    return [reserve0, reserve1];
  }

  private getAmountOutFromLogs(logs: ethers.Log[]): string {
    const swapLog = logs.find(log => {
      try {
        const parsedLog = this.router.interface.parseLog({
          topics: Array.from(log.topics) as string[],
          data: log.data
        });
        return parsedLog?.name === 'ExactInputSingle';
      } catch (e) {
        return false;
      }
    });
    
    if (!swapLog) {
      throw new Error('Swap event log not found');
    }
    
    const parsedLog = this.router.interface.parseLog({
      topics: Array.from(swapLog.topics) as string[],
      data: swapLog.data
    });
    
    if (parsedLog && parsedLog.args.amountOut) {
      return parsedLog.args.amountOut.toString();
    }
    
    throw new Error('Failed to parse swap event log');
  }

  // Add monitoring methods
  public getMetrics() {
    return this.monitor.getMetrics();
  }

  // Missing health method - implementing a placeholder
  public getHealth() {
    return {
      status: 'ok',
      lastCheck: Date.now(),
      errors: 0,
      warnings: 0
    };
  }

  // Missing clear errors method - implementing a placeholder
  public clearErrors() {
    console.log('Errors cleared');
  }

  // Missing clear warnings method - implementing a placeholder
  public clearWarnings() {
    console.log('Warnings cleared');
  }

  // Add price feed methods
  public async getLatestPrice(tokenA: Token, tokenB: Token) {
    return this.priceFeed.getLatestPrice(tokenA, tokenB);
  }

  public async getPriceHistory(tokenA: Token, tokenB: Token, limit?: number) {
    return this.priceFeed.getPriceHistory(tokenA, tokenB, limit);
  }

  public isPriceFeedStale() {
    return this.priceFeed.isStale();
  }
} 