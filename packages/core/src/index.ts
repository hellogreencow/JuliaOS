/**
 * JuliaOS Core Package
 * 
 * This package provides the core functionalities for building Web3 Cross-Chain AI Agent systems.
 */

// Base components
export { BaseAgent } from './agent/BaseAgent';
export { SwarmAgent, type SwarmAgentConfig } from './agents/SwarmAgent';
export { Skill } from './skills/Skill';

// Skills
export { 
  DeFiTradingSkill,
  type DeFiTradingConfig
} from './skills/DeFiTradingSkill';

// Platform
export {
  Platform,
  type PlatformConfig,
  type MessageData
} from './platform/Platform';

// Bridge
export { 
  JuliaBridge,
  type JuliaBridgeConfig,
  type JuliaBridgeOptions
} from './bridge/JuliaBridge';

export {
  CrossChainJuliaBridge,
  type CrossChainConfig
} from './bridge/CrossChainJuliaBridge';

export { MLBridge } from './bridge/MLBridge';

// Types
export * from './types/JuliaTypes';
export * from './types/MLTypes';

// Config
export { ConfigManager } from './config/ConfigManager';

// Version information
export const VERSION = '0.1.0'; 