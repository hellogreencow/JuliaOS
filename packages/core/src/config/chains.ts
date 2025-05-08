import { ChainId } from '../types';

export interface ChainConfig {
  RPC_URLS: Record<ChainId, string>;
  DEX_ROUTERS: Record<ChainId, {
    JUPITER: string;
  }>;
  COMMON_TOKENS: Record<ChainId, {
    SOL: string;
    USDC: string;
    USDT: string;
    BONK: string;
  }>;
  EXPLORER_URLS: Record<ChainId, string>;
}

export const CHAIN_CONFIG: ChainConfig = {
  RPC_URLS: {
    [ChainId.ETHEREUM]: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-api-key',
    [ChainId.POLYGON]: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    [ChainId.ARBITRUM]: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    [ChainId.OPTIMISM]: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    [ChainId.BASE]: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    [ChainId.BSC]: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    [ChainId.AVALANCHE]: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    [ChainId.SOLANA]: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  },
  DEX_ROUTERS: {
    [ChainId.ETHEREUM]: {
      JUPITER: '', // Not applicable for Ethereum
    },
    [ChainId.POLYGON]: {
      JUPITER: '', // Not applicable for Polygon
    },
    [ChainId.ARBITRUM]: {
      JUPITER: '', // Not applicable for Arbitrum
    },
    [ChainId.OPTIMISM]: {
      JUPITER: '', // Not applicable for Optimism
    },
    [ChainId.BASE]: {
      JUPITER: '', // Not applicable for Base
    },
    [ChainId.BSC]: {
      JUPITER: '', // Not applicable for BSC
    },
    [ChainId.AVALANCHE]: {
      JUPITER: '', // Not applicable for Avalanche
    },
    [ChainId.SOLANA]: {
      JUPITER: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter v6 Program ID
    },
  },
  COMMON_TOKENS: {
    [ChainId.ETHEREUM]: {
      SOL: '', // Not applicable for Ethereum
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
      BONK: '', // Not applicable for Ethereum
    },
    [ChainId.POLYGON]: {
      SOL: '', // Not applicable for Polygon
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT on Polygon
      BONK: '', // Not applicable for Polygon
    },
    [ChainId.ARBITRUM]: {
      SOL: '', // Not applicable for Arbitrum
      USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC on Arbitrum
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum
      BONK: '', // Not applicable for Arbitrum
    },
    [ChainId.OPTIMISM]: {
      SOL: '', // Not applicable for Optimism
      USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC on Optimism
      USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT on Optimism
      BONK: '', // Not applicable for Optimism
    },
    [ChainId.BASE]: {
      SOL: '', // Not applicable for Base
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      USDT: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // USDT on Base
      BONK: '', // Not applicable for Base
    },
    [ChainId.BSC]: {
      SOL: '', // Not applicable for BSC
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
      USDT: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
      BONK: '', // Not applicable for BSC
    },
    [ChainId.AVALANCHE]: {
      SOL: '', // Not applicable for Avalanche
      USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
      USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT on Avalanche
      BONK: '', // Not applicable for Avalanche
    },
    [ChainId.SOLANA]: {
      SOL: 'So11111111111111111111111111111111111111112', // Native SOL
      USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
    },
  },
  EXPLORER_URLS: {
    [ChainId.ETHEREUM]: 'https://etherscan.io',
    [ChainId.POLYGON]: 'https://polygonscan.com',
    [ChainId.ARBITRUM]: 'https://arbiscan.io',
    [ChainId.OPTIMISM]: 'https://optimistic.etherscan.io',
    [ChainId.BASE]: 'https://basescan.org',
    [ChainId.BSC]: 'https://bscscan.com',
    [ChainId.AVALANCHE]: 'https://snowtrace.io',
    [ChainId.SOLANA]: 'https://solscan.io',
  },
}; 