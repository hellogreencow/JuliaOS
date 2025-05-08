/**
 * Swarm Module
 * 
 * This module provides classes and interfaces for managing swarms of agents.
 * A swarm is a collection of agents that work together to achieve a common goal.
 * 
 * Key Features:
 * - Task distribution among agents
 * - Multiple coordination strategies
 * - Metrics tracking and analysis
 * - Resource management and scaling
 * - LLM-powered consensus decision making
 */

import { Swarm } from './Swarm';
import { SwarmRouter } from './SwarmRouter';
import { StandardSwarm } from './StandardSwarm';

// Export classes directly
export { Swarm };
export { SwarmRouter };
export { StandardSwarm };

// Export types with 'export type' syntax
export type { SwarmConfig, SwarmMetrics, Task, SwarmResult } from './Swarm';
export type { RouterConfig, RouterMetrics } from './SwarmRouter';
export type { StandardSwarmConfig } from './StandardSwarm';

// Export default instance for easy access
export default StandardSwarm; 