/**
 * Skills Module
 * 
 * This module provides a system for pluggable capabilities that agents can use.
 * Skills are self-contained units of functionality that can be attached to agents
 * to extend their capabilities without modifying the agent core.
 * 
 * @module skills
 */

// Import and export skills
import { Skill } from './Skill';
export { Skill };
export type { SkillConfig } from './Skill';

import { EchoSkill } from './EchoSkill';
export { EchoSkill };
export type { EchoSkillConfig } from './EchoSkill';

import { DeFiTradingSkill } from './DeFiTradingSkill';
export { DeFiTradingSkill };
export type { DeFiTradingConfig, MarketData } from './DeFiTradingSkill';

import { WebSearchSkill } from './WebSearchSkill';
export { WebSearchSkill };
export type { WebSearchSkillConfig, SearchResult } from './WebSearchSkill';

/**
 * Example usage:
 * 
 * ```typescript
 * import { EchoSkill, WebSearchSkill } from '@juliaos/core/skills';
 * 
 * // Create an echo skill
 * const echoSkill = new EchoSkill({
 *   name: 'my-echo-skill',
 *   type: 'utility',
 *   prefix: 'Bot says: ',
 *   parameters: {
 *     maxLength: 100
 *   }
 * });
 * 
 * // Initialize the skill
 * await echoSkill.initialize();
 * 
 * // Use the skill
 * echoSkill.setInput('Hello, world!');
 * await echoSkill.execute();
 * 
 * // Listen for events
 * echoSkill.on('executionComplete', (data) => {
 *   console.log(`Execution completed: ${data.result}`);
 * });
 * 
 * // Stop the skill when done
 * await echoSkill.stop();
 * 
 * // Create a web search skill
 * const searchSkill = new WebSearchSkill({
 *   name: 'web-search',
 *   type: 'search',
 *   apiKey: 'your-api-key',
 *   maxResults: 5
 * });
 * 
 * // Initialize the skill
 * await searchSkill.initialize();
 * 
 * // Use the skill
 * searchSkill.setQuery('JuliaOS framework');
 * await searchSkill.execute();
 * 
 * // Get results
 * const results = searchSkill.getResults();
 * console.log(`Found ${results.length} results`);
 * 
 * // Or listen for events
 * searchSkill.on('searchComplete', (data) => {
 *   console.log(`Search for "${data.query}" returned ${data.results.length} results`);
 * });
 * ```
 * 
 * Creating a custom skill:
 * 
 * ```typescript
 * import { Skill, SkillConfig } from '@juliaos/core/skills';
 * 
 * // Define your skill configuration
 * export interface MyCustomSkillConfig extends SkillConfig {
 *   customOption?: string;
 * }
 * 
 * // Implement your skill
 * export class MyCustomSkill extends Skill {
 *   private customOption: string;
 * 
 *   constructor(config: MyCustomSkillConfig) {
 *     super(config.parameters || {}, config.name, config.type);
 *     this.customOption = config.customOption || 'default';
 *   }
 * 
 *   async initialize(): Promise<void> {
 *     // Initialize your skill
 *     this.setInitialized(true);
 *   }
 * 
 *   async execute(): Promise<void> {
 *     // Perform the skill's functionality
 *     this.setRunning(true);
 *     
 *     // Your implementation goes here
 *     const result = await someOperation();
 *     
 *     // Emit event with results
 *     this.emit('customEvent', { result });
 *     
 *     this.setRunning(false);
 *   }
 * 
 *   async stop(): Promise<void> {
 *     // Clean up resources
 *     this.setRunning(false);
 *   }
 * }
 * ```
 */ 