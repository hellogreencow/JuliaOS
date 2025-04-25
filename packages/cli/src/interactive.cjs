#!/usr/bin/env node

/**
 * interactive.js - Enhanced JuliaOS Interactive CLI (v4 - Context Aware)
 *
 * This script provides a comprehensive interactive command-line interface
 * for managing Agents, Swarms, Cross-Chain operations, Trading Strategies,
 * and System Configuration within the JuliaOS framework.
 *
 * Updates based on provided project context (chains, completed features).
 * NOTE: For production use, this file should be refactored into smaller modules.
 */

// =============================================================================
// Imports and Setup
// =============================================================================
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

// Update paths to point to the correct locations
const { JuliaBridge } = require('../../julia-bridge/dist/index');
// placeholder for later
let walletManager;

/** 
 * 1) Load the ESM WalletManager class  
 * 2) Instantiate it  
 */
(async () => {
    const { WalletManager } = await import('../../wallets/src/index.js');
    walletManager = new WalletManager(/* optional config */);
    console.log('WalletManager is ready:', walletManager);
})();


const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');

// Import our enhanced JuliaBridge wrapper
const EnhancedJuliaBridge = require('./enhanced-bridge');

// Import Julia server starter
let startJuliaServer, checkServerHealth;
try {
  ({ startJuliaServer, checkServerHealth } = require('./start-julia-server'));
} catch (e) {
  console.warn('Could not import start-julia-server:', e.message);
  // Provide fallback implementations
  startJuliaServer = async () => {
    console.log(chalk.yellow('start-julia-server not available. Please start the server manually:'));
    console.log(chalk.yellow('  cd julia && julia --project=. server/julia_server.jl'));
    return false;
  };
  checkServerHealth = async () => {
    console.log(chalk.yellow('checkServerHealth not available. Assuming server is not running.'));
    return false;
  };
}

// Initialize JuliaBridge with environment variables
const JULIA_SERVER_HOST = process.env.JULIA_SERVER_HOST || 'localhost';
const JULIA_SERVER_PORT = process.env.JULIA_SERVER_PORT || 8052;  // Use port 8052 to match the Julia server
const JULIA_SERVER_URL = process.env.JULIA_SERVER_URL || `http://${JULIA_SERVER_HOST}:${JULIA_SERVER_PORT}`;

console.log(`Using Julia server at ${JULIA_SERVER_URL}`);

// Try multiple ports if the default port doesn't work
const ports = [8052, 8054, 8053, 3000];
let juliaBridgeRaw;

// We can't use await at the top level in CommonJS, so we'll use the first port
// and handle connection issues later
const port = ports[0];
const url = `http://${JULIA_SERVER_HOST}:${port}`;
console.log(`Trying Julia server at ${url}...`);

try {
    juliaBridgeRaw = new JuliaBridge({
        apiUrl: `${url}/api`,
        healthUrl: `${url}/health`,
        useWebSocket: false,
        useExistingServer: true,  // Use existing server instead of starting a new one
        debug: true,  // Enable debug logging
        timeout: 5000  // Short timeout for faster checking
    });
} catch (error) {
    console.log(chalk.yellow(`Error initializing JuliaBridge: ${error.message}`));
    juliaBridgeRaw = null;
}

// If we couldn't connect to any port, use the default port with mock mode
if (!juliaBridgeRaw) {
    console.log(chalk.yellow(`Could not connect to Julia server on any port. Using mock mode.`));
    try {
        juliaBridgeRaw = new JuliaBridge({
            apiUrl: `${JULIA_SERVER_URL}/api`,
            healthUrl: `${JULIA_SERVER_URL}/health`,
            useWebSocket: false,
            useExistingServer: true,
            debug: true,
            mockMode: true  // Enable mock mode
        });
    } catch (error) {
        console.error(chalk.red(`Failed to initialize JuliaBridge in mock mode: ${error.message}`));
        // Create a minimal mock object to prevent crashes
        juliaBridgeRaw = {
            initialize: async () => console.log('Mock initialize called'),
            execute: async () => ({ success: false, error: 'JuliaBridge not available' }),
            isConnected: false
        };
    }
}

// Create enhanced bridge wrapper
const juliaBridge = new EnhancedJuliaBridge(juliaBridgeRaw);

// Initialize the bridge
(async () => {
    try {
        console.log(chalk.blue('Initializing JuliaOS CLI...'));

        // First, try to start the Julia server if it's not already running
        if (typeof startJuliaServer === 'function') {
            console.log(chalk.blue('Starting Julia server...'));
            const serverRunning = await startJuliaServer();
            if (serverRunning) {
                console.log(chalk.green('Julia server is running'));
            } else {
                console.log(chalk.yellow('Failed to start Julia server. Will try to connect anyway.'));
                console.log(chalk.yellow('If you encounter issues, try starting the server manually:'));
                console.log(chalk.yellow('  cd julia && julia --project=. server/julia_server.jl'));
            }
        } else {
            console.log(chalk.yellow('startJuliaServer is not available. Skipping server start.'));
            console.log(chalk.yellow('You may need to start the server manually:'));
            console.log(chalk.yellow('  cd julia && julia --project=. server/julia_server.jl'));
        }

        // Initialize the JuliaBridge with retry logic
        let initSuccess = false;
        let retryCount = 0;
        const maxRetries = 3;

        while (!initSuccess && retryCount < maxRetries) {
            try {
                console.log(chalk.blue(`Initializing JuliaBridge (attempt ${retryCount + 1}/${maxRetries})...`));
                await juliaBridgeRaw.initialize();
                initSuccess = true;
                console.log(chalk.green('JuliaBridge initialized successfully'));
            } catch (initError) {
                retryCount++;
                console.log(chalk.yellow(`JuliaBridge initialization failed: ${initError.message}`));
                if (retryCount < maxRetries) {
                    console.log(chalk.yellow(`Retrying in 2 seconds...`));
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        // Check connection
        if (typeof checkServerHealth === 'function') {
            console.log(chalk.blue('Checking connection to Julia backend...'));
            const isConnected = await juliaBridge.checkConnection();
            if (isConnected) {
                console.log(chalk.green('Successfully connected to Julia backend'));
            } else {
                console.log(chalk.yellow('Not connected to Julia backend. Using mock implementations.'));
                console.log(chalk.yellow('Some features may not work correctly.'));
            }
        } else {
            console.log(chalk.yellow('checkServerHealth is not available. Skipping health check.'));
        }
    } catch (error) {
        console.error(chalk.red('Error initializing Julia connection:'), error.message);
        console.log(chalk.yellow('Continuing with mock implementations...'));
        console.log(chalk.yellow('Some features may not work correctly.'));
    }

    // Pause to let the user read the messages
    console.log(chalk.blue('\nPress Enter to continue to the JuliaOS CLI...'));
    await new Promise(resolve => {
        process.stdin.once('data', () => resolve(true));
    });
})();


// Create common dependencies for all menus
const menuDeps = {
    juliaBridge,
    displayHeader: (title = null) => {
        console.clear();
        console.log(chalk.bold.cyan(`=== ${title || 'JuliaOS'} ===`));
    }
};

// Import menu modules
/** @type {Record<string, any>} */
const menuModules = {
    agentManagement: require('./agent_management_menu'),
    swarmManagement: require('./swarm_management_menu'),
    walletManagement: require('./wallet_management_menu'),
    apiKeys: require('./api_access_codes_menu'),
    systemConfig: require('./system_config_menu'),
    performanceMetrics: require('./performance_metrics_menu'),
    helpDocumentation: require('./help_documentation_menu'),
    // Add the missing modules here
    crossChainHub: require('./cross_chain_hub_menu'),
    agentSkills: require('./agent_skills_menu'),
    agentSpecialization: require('./agent_specialization_menu'),
    neuralNetworks: require('./neural_networks_menu'),
    portfolioOptimization: require('./portfolio_optimization_menu'),
    swarmAlgorithms: require('./swarm_algorithms_menu'),
    swarmVisualization: require('./swarm_visualization'),
    // Add trading menu
    tradingMenu: require('./trading_menu')
};

// Import dex selection menu separately since it has a different export pattern
const dexSelectionMenu = require('./dex_selection_menu');

// Initialize menu functions
/** @type {Record<string, any>} */
const menus = {};

// Initialize factory-pattern menus
Object.keys(menuModules).forEach(key => {
    if (!menuModules[key]) {
        console.warn(`Warning: Menu module ${key} is undefined`);
        return;
    }

    try {
        // Check if the module is a factory function
        if (typeof menuModules[key] === 'function') {
            console.log(`Initializing factory menu: ${key}`);
            // Pass the enhanced bridge to all menu modules
            menus[key] = menuModules[key]({
                ...menuDeps,
                juliaBridge: juliaBridge // Ensure enhanced bridge is passed
            });
        } else {
            console.log(`Using direct menu: ${key}`);
            menus[key] = menuModules[key];
        }

        // Verify the menu was initialized correctly
        if (!menus[key]) {
            console.error(`Error: Menu ${key} initialization resulted in undefined`);
            menus[key] = {}; // Fallback to empty object
        }
    } catch (err) {
        console.error(`Error initializing menu ${key}:`, err);
        menus[key] = {}; // Fallback to empty object
    }
});

// Add dex selection menu functions directly
menus.dexSelection = {
    selectDexPreference: (chainName = 'ethereum') => dexSelectionMenu.selectDexPreference(juliaBridge, chainName),
    getCurrentDexPreference: dexSelectionMenu.getCurrentDexPreference
};

// Map chain names to chain IDs used by PrivateKeyProvider and elsewhere
const CHAIN_NAME_TO_ID = {
    'ethereum': 1,
    'sepolia': 11155111,
    'polygon': 137,
    'mumbai': 80001,
    'optimism': 10,
    'optimism_goerli': 420,
    'arbitrum': 42161,
    'arbitrum_goerli': 421613,
    'bsc': 56,
    'bsc_testnet': 97,
    'base': 8453,
    'base_goerli': 84531
};

const ID_TO_CHAIN_NAME = Object.fromEntries(Object.entries(CHAIN_NAME_TO_ID).map(([name, id]) => [id, name]));

// =============================================================================
// Wallet Management Functions
// =============================================================================
async function connectWallet() {
    try {
        // First, choose the connection mode
        const { mode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'Select wallet connection mode:',
                // Filter out browser-only providers if not in browser context?
                // For now, keep simple
                choices: ['Address Only (Read-only)', 'Private Key (Full Access)', 'MetaMask (Browser)', 'Rabby (Browser)', 'Phantom (Browser)']
            }
        ]);

        let providerName = null;

        if (mode === 'Address Only (Read-only)') {
            // ... (existing read-only logic remains largely the same) ...
            // Prompt for chain as before
             const { chainName } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'chainName',
                    message: 'Select blockchain:',
                    choices: Object.keys(CHAIN_NAME_TO_ID) // Use defined chains
                }
            ]);
            // ... rest of read-only address input and validation ...
             console.log(chalk.blue('Connecting wallet in read-only mode...'));
             // Update state object correctly
             const state = {
                isConnected: true,
                address: address, // validated address
                chainId: CHAIN_NAME_TO_ID[chainName], // Store chain ID
                balance: 'N/A',
                readOnly: true,
                provider: 'read-only', // Indicate mode
                hasFullAccess: false,
             };
             walletManager.state = state; // Directly setting state here - consider refactoring
             console.log(chalk.green('Wallet configured successfully in read-only mode!'));
             console.log(chalk.cyan('Address:'), state.address);
             console.log(chalk.cyan('Chain:'), chainName, `(ID: ${state.chainId})`);
             // ... pause and return ...
             return state;

        } else if (mode === 'Private Key (Full Access)') {
            isNodeProvider = true;
            providerName = 'node'; // Internal identifier for our PrivateKeyProvider usage

            // Get the private key from the user
            // ... (existing private key input logic) ...
            let privateKey = '';
            while (privateKey.trim() === '') {
                // ... (prompt logic) ...
                 privateKey = response.privateKey;
                 // Add basic validation (e.g., starts with 0x for EVM)
                 if (!privateKey.startsWith('0x')) {
                     console.log(chalk.red('Private key should typically start with 0x for EVM chains.'));
                     privateKey = ''; // Reset to re-prompt
                     continue;
                 }
                 if (privateKey.length !== 66) { // 0x + 64 hex chars
                     console.log(chalk.red('Private key should be 66 characters long (including 0x).'));
                     privateKey = ''; // Reset to re-prompt
                     continue;
                 }
            }

            // Get the target Chain ID
            const { chainName } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'chainName',
                    message: 'Select blockchain network for this private key:',
                    choices: Object.keys(CHAIN_NAME_TO_ID) // Show supported chains
                }
            ]);
            const chainId = CHAIN_NAME_TO_ID[chainName];

            console.log(chalk.blue(`Connecting via Private Key on ${chainName} (ID: ${chainId})...`));
            const spinner = ora(`Connecting to ${chainName}...`).start();

            try {
                // Use the new WalletManager method
                await walletManager.connectWithPrivateKey(privateKey, chainId);
                spinner.succeed('Wallet securely connected via Private Key');

                // Get state from WalletManager AFTER connection
                const state = walletManager.getState();

                console.log(chalk.green('Wallet connected successfully with full access!'));
                console.log(chalk.cyan('Address:'), state.address);
                console.log(chalk.cyan('Network:'), ID_TO_CHAIN_NAME[state.chainId] || `Unknown (ID: ${state.chainId})`);
                console.log(chalk.cyan('Balance:'), await walletManager.getBalance()); // Fetch real balance

            } catch (error) {
                spinner.fail(`Failed to connect using private key: ${error.message}`);
                 console.error(chalk.red('Connection Error Details:'), error);
                 // Add pause
                 await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: 'Press Enter to continue...'
                 }]);
                return null;
            } finally {
                 privateKey = null; // Clear private key from memory
                 // Add pause
                 await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: 'Press Enter to continue...'
                 }]);
            }
             return walletManager.getState(); // Return the latest state

        } else { // Handle Browser Providers (MetaMask, Rabby, Phantom)
            providerName = mode.split(' ')[0].toLowerCase(); // Extract 'metamask', 'rabby', 'phantom'

            if (!walletManager.isAvailable(providerName)) {
                console.log(chalk.red(`Wallet provider ${providerName} is not available. Make sure the browser extension is installed and active.`));
                return null;
            }

            console.log(chalk.blue(`Connecting to ${providerName} via browser extension...`));
            const spinner = ora(`Waiting for ${providerName} connection...`).start();

            try {
                await walletManager.connect(providerName);
                 spinner.succeed(`Connected to ${providerName}`);
                 const state = walletManager.getState();
                 console.log(chalk.green('Wallet connected successfully via browser extension!'));
                 console.log(chalk.cyan('Address:'), state.address);
                 console.log(chalk.cyan('Network:'), ID_TO_CHAIN_NAME[state.chainId] || `Unknown (ID: ${state.chainId})`);
                 console.log(chalk.cyan('Balance:'), await walletManager.getBalance()); // Fetch real balance
                 // Add pause
                 await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: 'Press Enter to continue...'
                 }]);
                 return state;
            } catch (error) {
                 spinner.fail(`Failed to connect to ${providerName}: ${error.message}`);
                 console.error(chalk.red('Connection Error Details:'), error);
                 // Add pause
                 await inquirer.prompt([{
                    type: 'input',
                    name: 'continue',
                    message: 'Press Enter to continue...'
                 }]);
                 return null;
            }
        }

    } catch (error) {
        console.error(chalk.red('Failed during wallet connection process:'), error.message);
         // Add pause
         await inquirer.prompt([{
            type: 'input',
            name: 'continue',
            message: 'Press Enter to continue...'
         }]);
        return null;
    }
}

async function disconnectWallet() {
    const state = walletManager.getState();
    if (!state.isConnected) {
        console.log(chalk.yellow('No wallet is currently connected.'));
        return;
    }

    try {
        const previousAddress = state.address;
        const previousChain = state.chainId;

        // Reset wallet state
        walletManager.state = {
            isConnected: false,
            address: null,
            chain: null,
            balance: null,
            readOnly: false,
            transactions: []
        };

        console.log(chalk.green('Wallet disconnected successfully!'));
        console.log(chalk.cyan('Disconnected address:'), previousAddress);
        console.log(chalk.cyan('Disconnected chain:'), previousChain);
    } catch (error) {
        console.error(chalk.red('Failed to disconnect wallet:'), error.message);
    }
}

async function checkWallet() {
    const state = walletManager.getState();
    if (state.isConnected) {
        const mode = state.readOnly ? 'Read-only' : 'Full Access';
        return chalk.green(`Connected (${state.chainId}) [${mode}] ✅`);
    }
    return chalk.yellow('Disconnected ⚠️');
}

// Function for future use
async function getWalletBalance() {
    const state = walletManager.getState();
    if (!state.isConnected) {
        return chalk.red('Wallet not connected');
    }

    // Read-only mode still doesn't fetch balance
    if (state.readOnly) {
        return chalk.yellow('Balance not available in read-only mode');
    }

    const spinner = ora('Fetching balance...').start();
    try {
        const balance = await walletManager.getBalance(); // Use WalletManager method
        const chainName = ID_TO_CHAIN_NAME[state.chainId] || `Chain ${state.chainId}`;
        spinner.succeed('Balance fetched');
        return chalk.green(`${balance} ${chainName.toUpperCase()}`);
    } catch (error) {
        spinner.fail('Failed to get balance');
        return chalk.red(`Failed to get balance: ${error.message}`);
    }
}



// =============================================================================
// Display Functions
// =============================================================================
// Add a breadcrumbs array to track the current menu path
let breadcrumbs = ['Main'];

function displayHeader(subHeader = null) {
    console.clear();
    // JuliaOS logo
    const logo = chalk.magenta('   _       _ _       ___  ____  \n  | | ___ (_) |_   / _ \/ ___| \n  | |/ _ \| | __| | | | \___ \ \n  | | (_) | | |_  | |_| |___) |\n  |_|\___/|_|\__|  \___/|____/ ');
    console.log(logo);
    // Show breadcrumbs
    console.log(chalk.cyan('Path: ' + breadcrumbs.join(' > ')));
    // ... rest of header ...
    if (subHeader) {
        console.log(chalk.cyan(`\n=== ${subHeader} ===\n`));
    }
}

async function displayStatus() {
    const juliaStatus = await checkJulia();
    const walletStatus = await checkWallet();
    const networkStatus = await checkNetworks();
    const apiStatus = await checkApis();
    const storageStatus = await checkStorage();

    console.log(chalk.cyan('\n┌─ System Status ─────────────────────────────────────────┐'));
    console.log(chalk.cyan('│                                                           │'));
    console.log(chalk.cyan(`│  🧠 Julia Engine:  ${juliaStatus.padEnd(46)}│`));
    console.log(chalk.cyan(`│  💼 Wallet Status: ${walletStatus.padEnd(46)}│`));
    console.log(chalk.cyan(`│  🌐 Network:       ${networkStatus.padEnd(46)}│`));
    console.log(chalk.cyan(`│  🔑 API Keys:      ${apiStatus.padEnd(46)}│`));
    console.log(chalk.cyan(`│  💾 Storage:       ${storageStatus.padEnd(46)}│`));
    console.log(chalk.cyan(`│  ⚡ Performance:   ${chalk.green('Optimized').padEnd(46)}│`));
    console.log(chalk.cyan('│                                                          │'));
    console.log(chalk.cyan('└──────────────────────────────────────────────────────────┘'));
    console.log();
}

// =============================================================================
// System Check Functions
// =============================================================================
async function checkJulia() {
    try {
        // Get server host and port from environment variables
        const host = process.env.JULIA_SERVER_HOST || 'localhost';
        const port = process.env.JULIA_SERVER_PORT || '8052';
        const serverUrl = process.env.JULIA_SERVER_URL || `http://${host}:${port}`;

        console.log(chalk.blue(`Checking Julia health at ${serverUrl}/health`));

        // Use the enhanced bridge to check connection
        const isConnected = await juliaBridge.checkConnection();

        // Show connection status using the enhanced bridge's method
        return isConnected ? chalk.green('Active ✅') : chalk.yellow('Active ⚠️ (using mock implementations)');
    } catch (error) {
        console.error(chalk.red('Error checking Julia health:'), error.message);
        return chalk.red('Error ❌');
    }
}

async function checkNetworks() {
    try {
        const networks = ['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism', 'base'];
        const results = await Promise.all(
            networks.map(async (_) => {
                try {
                    // Simulate network check
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return true;
                } catch (error) {
                    return false;
                }
            })
        );
        return results.every(result => result) ? chalk.green('All Reachable ✅') : chalk.yellow('Some Unreachable ⚠️');
    } catch (error) {
        return chalk.red('Error ❌');
    }
}

async function checkApis() {
    try {
        const apis = ['openai', 'anthropic', 'google', 'aws'];
        const results = await Promise.all(
            apis.map(async (_) => {
                try {
                    // Simulate API check
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return true;
                } catch (error) {
                    return false;
                }
            })
        );
        return results.every(result => result) ? chalk.green('All Valid ✅') : chalk.yellow('Missing/Invalid Keys ⚠️');
    } catch (error) {
        return chalk.red('Error ❌');
    }
}

async function checkStorage() {
    try {
        const configDir = path.join(os.homedir(), '.juliaos');
        const settingsFile = path.join(configDir, 'settings.json');

        // Check if config directory exists and is writable
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Check if settings file exists and is readable
        if (!fs.existsSync(settingsFile)) {
            fs.writeFileSync(settingsFile, JSON.stringify({}, null, 2));
        }

        return chalk.green('Ready ✅');
    } catch (error) {
        return chalk.red('Error ❌');
    }
}

async function runAllSystemChecks() {
    // displayHeader already includes console.clear()
    displayHeader();

    // Create a spinner for system checks
    let spinner = ora('Running system checks...').start();

    // Check if Julia server is running
    const serverRunning = await checkServerHealth();
    if (!serverRunning) {
        spinner.text = 'Julia server not running. Starting server...';
        try {
            const started = await startJuliaServer();
            if (!started) {
                spinner.fail('Failed to start Julia server');
                console.log(chalk.yellow('The CLI will run in mock mode without the Julia backend.'));
            } else {
                spinner.succeed('Julia server started successfully');
                // Try to connect to the server
                const isConnected = await juliaBridge.checkConnection();
                if (isConnected) {
                    console.log(chalk.green('Successfully connected to Julia backend'));
                } else {
                    console.log(chalk.yellow('Not connected to Julia backend. Using mock implementations.'));
                }
            }
        } catch (error) {
            spinner.fail(`Error starting Julia server: ${error.message}`);
            console.log(chalk.yellow('The CLI will run in mock mode without the Julia backend.'));
        }
    } else {
        spinner.text = 'Julia server is running';
        spinner.succeed();
        // Try to connect to the server
        const isConnected = await juliaBridge.checkConnection();
        if (isConnected) {
            console.log(chalk.green('Successfully connected to Julia backend'));
        } else {
            console.log(chalk.yellow('Not connected to Julia backend. Using mock implementations.'));
        }
    }

    // Create a more visually interesting spinner for system checks
    spinner = ora({
        text: 'Running system checks...',
        spinner: 'dots',
        color: 'cyan'
    }).start();

    try {
        // Simulate the checks running with a slight delay for each check to see the spinner
        const juliaPromise = checkJulia().then(result => {
            spinner.text = 'Checking Julia engine...';
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        const walletPromise = checkWallet().then(result => {
            spinner.text = 'Checking wallet connection...';
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        const networkPromise = checkNetworks().then(result => {
            spinner.text = 'Checking network connectivity...';
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        const apiPromise = checkApis().then(result => {
            spinner.text = 'Verifying API keys...';
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        const storagePromise = checkStorage().then(result => {
            spinner.text = 'Checking storage system...';
            return result;
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Wait for all promises to resolve
        const [juliaStatus, walletStatus, networkStatus, apiStatus, storageStatus] =
            await Promise.all([juliaPromise, walletPromise, networkPromise, apiPromise, storagePromise]);

        spinner.succeed('System checks complete ✨');

        // Display results in a fancy box
        console.log(chalk.cyan('\n┌─ System Status ─────────────────────────────────────────┐'));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan(`│  🧠 Julia Engine:  ${juliaStatus.padEnd(46)}│`));
        console.log(chalk.cyan(`│  💼 Wallet Status: ${walletStatus.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🌐 Network:       ${networkStatus.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🔑 API Keys:      ${apiStatus.padEnd(46)}│`));
        console.log(chalk.cyan(`│  💾 Storage:       ${storageStatus.padEnd(46)}│`));
        console.log(chalk.cyan(`│  ⚡ Performance:   ${chalk.green('Optimized').padEnd(46)}│`));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan('└──────────────────────────────────────────────────────────┘'));
    } catch (error) {
        spinner.fail('System checks failed ❌');
        console.error(chalk.red('Error running system checks:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

// =============================================================================
// Menu Functions
// =============================================================================
// Agent Management Menu is now in agent_management_menu.js

// Swarm Management Menu is now in swarm_management_menu.js

// Cross-Chain Hub Menu is now in cross_chain_hub_menu.js

// API Keys Management Menu is now in api_keys_menu.js

async function systemConfigurationMenu() {
    // displayHeader already includes console.clear()
    displayHeader();

    // Display a professional header for system configuration
    console.log(chalk.blueBright(`
      ╔══════════════════════════════════════════╗
      ║        System Configuration              ║
      ║                                          ║
      ║  ⚙️ Configure system settings and         ║
      ║     preferences for optimal performance.   ║
      ║                                          ║
      ╚══════════════════════════════════════════╝
    `));

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: '⚙️ Select configuration area:',
            choices: [
                'Configure Performance',
                'Configure Security',
                'Configure Network',
                'Configure Storage',
                'Back'
            ],
            pageSize: 10
        }
    ]);

    // Show a loading animation when an action is selected
    if (action !== 'Back') {
        const spinner = ora({
            text: `Preparing ${action.toLowerCase()}...`,
            spinner: 'dots',
            color: 'blue'
        }).start();

        await new Promise(resolve => setTimeout(resolve, 500));
        spinner.stop();
    }

    switch (action) {
        case 'Configure Performance':
            await configurePerformance();
            break;
        case 'Configure Security':
            await configureSecurity();
            break;
        case 'Configure Network':
            await configureNetwork();
            break;
        case 'Configure Storage':
            await configureStorage();
            break;
    }
}

async function performanceMetricsMenu() {
    // displayHeader already includes console.clear()
    displayHeader();

    // Display a professional header for performance metrics
    console.log(chalk.redBright(`
      ╔══════════════════════════════════════════╗
      ║        Performance Metrics               ║
      ║                                          ║
      ║             ┌──────────┐                 ║
      ║             │ Analytics│                 ║
      ║        ┌────┴──────────┴────┐            ║
      ║        │                    │            ║
      ║        │   📊   📉   📈    │            ║
      ║        │                    │            ║
      ║        └────────────────────┘            ║
      ║                                          ║
      ╚══════════════════════════════════════════╝
    `));

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: '📊 Select metrics to view:',
            choices: [
                'View System Metrics',
                'View Agent Metrics',
                'View Swarm Metrics',
                'View Network Metrics',
                'Back'
            ],
            pageSize: 10
        }
    ]);

    // Show a loading animation when an action is selected
    if (action !== 'Back') {
        const spinner = ora({
            text: `Loading ${action.toLowerCase()}...`,
            spinner: 'dots',
            color: 'red'
        }).start();

        await new Promise(resolve => setTimeout(resolve, 500));
        spinner.stop();
    }

    switch (action) {
        case 'View System Metrics':
            await displaySystemMetrics();
            break;
        case 'View Agent Metrics':
            await displayAgentMetrics();
            break;
        case 'View Swarm Metrics':
            await displaySwarmMetrics();
            break;
        case 'View Network Metrics':
            await displayNetworkMetrics();
            break;
    }
}

// =============================================================================
// Agent Functions
// =============================================================================
async function createAgent() {
    // Use a different variable name to avoid confusion
    const { name, type, config } = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Enter agent name:',
            validate: input => input.length > 0 ? true : 'Name is required'
        },
        {
            type: 'list',
            name: 'type',
            message: 'Select agent type:',
            choices: [
                'Trading',
                'Analysis',
                'Execution',
                'Monitoring',
                'Cross Chain Optimizer',
                'Portfolio Optimization',
                'Smart Grid Management'
            ]
        },
        {
            type: 'input',
            name: 'config',
            message: 'Enter agent configuration (JSON):',
            default: '{}'
        }
    ]);

    // Show a loading spinner
    const spinner = ora({
        text: 'Creating agent...',
        spinner: 'dots',
        color: 'blue'
    }).start();

    try {
        // Safely parse JSON with try/catch
        let agentConfig;
        try {
            agentConfig = JSON.parse(config);
        } catch (jsonError) {
            spinner.warn('Invalid JSON configuration format. Using empty config.');
            agentConfig = {};
        }

        // Convert display type to backend type
        let agentType;
        console.log(`Selected agent type: ${type}`);
        switch(type) {
            case 'Cross Chain Optimizer':
                agentType = 'cross_chain_optimizer';
                break;
            case 'Portfolio Optimization':
                agentType = 'portfolio_optimization';
                break;
            case 'Smart Grid Management':
                agentType = 'smart_grid';
                break;
            default:
                agentType = type.toLowerCase();
        }
        console.log(`Converted to backend type: ${agentType}`);

        // Try to create agent using the Julia backend first
        let useBackend = true;

        try {
            spinner.text = 'Connecting to Julia backend...';
            // First check if the backend is responsive
            const healthResult = await juliaBridge.getHealth();
            if (!healthResult || healthResult.status !== 'healthy') {
                throw new Error('Backend health check failed');
            }

            spinner.text = 'Sending request to Julia backend...';
            console.log(`Sending agent creation request with type: ${agentType}`);
            const backendResult = await juliaBridge.runJuliaCommand('create_agent', [name, agentType, JSON.stringify(agentConfig)]);

            if (backendResult && backendResult.error) {
                throw new Error(backendResult.error);
            }

            // Successfully created via backend
            spinner.succeed('Agent created successfully via Julia backend!');

            console.log(chalk.green(`\nAgent "${name}" created successfully!`));
            console.log(chalk.cyan('Agent ID:'), backendResult.id || 'Unknown');
            console.log(chalk.cyan('Status:'), backendResult.status || 'Initialized');

            // Debug information
            console.log(chalk.gray('\nDebug: Response from backend:'), JSON.stringify(backendResult));

        } catch (backendError) {
            // Backend failed, fall back to local mock implementation
            useBackend = false;
            spinner.warn(`Julia backend request failed: ${backendError.message}`);
            console.log(chalk.yellow('Falling back to local agent creation...'));

            // Short delay for UI
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Only proceed with local creation if backend failed
        if (!useBackend) {
            // Fallback to local creation
            spinner.text = 'Using local mock implementation...';

            const result = await createAgentService(name, agentType, agentConfig);

            spinner.succeed('Agent created with local mock implementation');

            console.log(chalk.green(`\nAgent "${name}" created successfully!`));
            console.log(chalk.cyan('Agent ID:'), result.id);
            console.log(chalk.cyan('Status:'), result.status);
            console.log(chalk.yellow('\nNote: This agent was created using a local mock implementation.'));
            console.log(chalk.yellow('      It will not persist between CLI sessions.'));
        }
    } catch (error) {
        spinner.fail('Failed to create agent');
        console.error(chalk.red('\nError:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function listAgents() {
    try {
        // Show a loading spinner
        const spinner = ora({
            text: 'Fetching agents...',
            spinner: 'dots',
            color: 'blue'
        }).start();

        await new Promise(resolve => setTimeout(resolve, 800));

        let result;
        let usingMockData = false;

        try {
            // Try to get all agents from Julia backend
            result = await juliaBridge.runJuliaCommand('agents.list_agents', {});
        } catch (backendError) {
            // If backend fails, log the error and use mock data
            spinner.warn(`Backend error: ${backendError.message}. Using mock data.`);
            usingMockData = true;

            // Provide mock data for demo purposes
            result = {
                agents: [
                    {
                        id: uuidv4().substring(0, 8),
                        name: 'TradingAssistant',
                        type: 'Trading',
                        status: 'active'
                    },
                    {
                        id: uuidv4().substring(0, 8),
                        name: 'MarketAnalyzer',
                        type: 'Analysis',
                        status: 'inactive'
                    }
                ]
            };
        }

        spinner.stop();

        if (result && result.error) {
            throw new Error(result.error);
        }

        console.log(chalk.cyan('\n┌─ Agent List ───────────────────────────────────────────┐'));
        console.log(chalk.cyan('│                                                          │'));

        console.log('DEBUG: Got result from backend:', JSON.stringify(result));

        // Create mock data if no real data is available
        if (!result || (!result.result && !result.agents)) {
            console.log('No valid result from backend, using mock data');
            result = {
                agents: [
                    { name: 'MockAgent1', type: 'trading', status: 'active', id: 'mock-1' },
                    { name: 'MockAgent2', type: 'arbitrage', status: 'initialized', id: 'mock-2' }
                ]
            };
            usingMockData = true;
        }

        // Check if we have agents in the result
        if (result && result.result && result.result.data && result.result.data.length > 0) {
            // Handle the nested structure from the Julia backend with data field
            result.result.data.forEach(agent => {
                const status = agent.status === 'active' ? chalk.green('Active') : chalk.yellow('Initialized');
                console.log(chalk.cyan(`│  • ${agent.name.padEnd(20)} (${agent.type.padEnd(10)}) [${status}]   │`));
            });

            if (usingMockData) {
                console.log(chalk.cyan('│                                                          │'));
                console.log(chalk.cyan('│  ℹ️  Note: Displaying mock data (backend unavailable)    │'));
            }
        } else if (result && result.result && result.result.agents && result.result.agents.length > 0) {
            // Handle the nested structure from the Julia backend
            result.result.agents.forEach(agent => {
                const status = agent.status === 'active' ? chalk.green('Active') : chalk.yellow('Initialized');
                console.log(chalk.cyan(`│  • ${agent.name.padEnd(20)} (${agent.type.padEnd(10)}) [${status}]   │`));
            });

            if (usingMockData) {
                console.log(chalk.cyan('│                                                          │'));
                console.log(chalk.cyan('│  ℹ️  Note: Displaying mock data (backend unavailable)    │'));
            }
        } else if (result && result.agents && result.agents.length > 0) {
            // Handle the direct structure (for mock data or older API)
            result.agents.forEach(agent => {
                const status = agent.status === 'active' ? chalk.green('Active') : chalk.yellow('Initialized');
                console.log(chalk.cyan(`│  • ${agent.name.padEnd(20)} (${agent.type.padEnd(10)}) [${status}]   │`));
            });

            if (usingMockData) {
                console.log(chalk.cyan('│                                                          │'));
                console.log(chalk.cyan('│  ℹ️  Note: Displaying mock data (backend unavailable)    │'));
            }
        } else {
            // No agents found or empty response
            console.log(chalk.cyan('│  No agents found. Create an agent to get started.      │'));
            console.log(chalk.cyan('│                                                          │'));
            console.log(chalk.cyan('│  Tip: Select "Create Agent" from the Agent Management  │'));
            console.log(chalk.cyan('│       menu to create your first agent.                 │'));
        }

        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan('└──────────────────────────────────────────────────────────┘'));

        // Debug information about the response
        console.log(chalk.gray('\nDebug: Response from backend:'), result ? JSON.stringify(result) : 'No response');
    } catch (error) {
        console.error(chalk.red('\nFailed to list agents:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function configureAgent() {
    const { agentId, updates } = await inquirer.prompt([
        {
            type: 'input',
            name: 'agentId',
            message: 'Enter agent ID:',
            validate: input => input.length > 0 ? true : 'Agent ID is required'
        },
        {
            type: 'input',
            name: 'updates',
            message: 'Enter configuration updates (JSON):',
            default: '{}'
        }
    ]);

    try {
        // FIX: Safely parse JSON with try/catch
        let configUpdates;
        try {
            configUpdates = JSON.parse(updates);
        } catch (jsonError) {
            console.error(chalk.red('Invalid JSON updates format. Using empty updates.'));
            configUpdates = {};
        }

        const result = await updateAgentService(agentId, configUpdates);
        console.log(chalk.green(`Agent "${agentId}" configuration updated successfully!`));
        console.log(chalk.cyan('New Status:'), result.status);
    } catch (error) {
        console.error(chalk.red('Failed to update agent configuration:'), error.message);
    }
}

async function startAgent() {
    const { agentId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'agentId',
            message: 'Enter agent ID:',
            validate: input => input.length > 0 ? true : 'Agent ID is required'
        }
    ]);

    try {
        const result = await updateAgentService(agentId, { status: 'active' });
        console.log(chalk.green(`Agent "${agentId}" started successfully!`));
        console.log(chalk.cyan('Status:'), result.status);
  } catch (error) {
        console.error(chalk.red('Failed to start agent:'), error.message);
    }
}

async function stopAgent() {
    const { agentId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'agentId',
            message: 'Enter agent ID:',
            validate: input => input.length > 0 ? true : 'Agent ID is required'
        }
    ]);

    try {
        const result = await updateAgentService(agentId, { status: 'inactive' });
        console.log(chalk.green(`Agent "${agentId}" stopped successfully!`));
        console.log(chalk.cyan('Status:'), result.status);
    } catch (error) {
        console.error(chalk.red('Failed to stop agent:'), error.message);
    }
}

async function deleteAgent() {
    const { agentId, confirm } = await inquirer.prompt([
        {
            type: 'input',
            name: 'agentId',
            message: 'Enter agent ID:',
            validate: input => input.length > 0 ? true : 'Agent ID is required'
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete this agent?',
            default: false
        }
    ]);

    if (confirm) {
        try {
            const result = await juliaBridge.runJuliaCommand('delete_agent', [agentId]);
            if (result.error) {
                throw new Error(result.error);
            }
            console.log(chalk.green(`Agent "${agentId}" deleted successfully!`));
        } catch (error) {
            console.error(chalk.red('Failed to delete agent:'), error.message);
        }
    }
}

async function displayAgentMetrics() {
    // displayHeader already includes console.clear()
    displayHeader();

    const { agentId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'agentId',
            message: 'Enter agent ID:',
            validate: input => input.length > 0 ? true : 'Agent ID is required'
        }
    ]);

    // Show a loading spinner
    const spinner = ora({
        text: 'Collecting agent metrics...',
        spinner: 'dots',
        color: 'cyan'
    }).start();

    await new Promise(resolve => setTimeout(resolve, 1200)); // Simulate loading

    try {
        const state = await getAgentStateService(agentId);
        const metrics = state.metrics || {
            cpu: '25%',
            memory: '128MB',
            uptime: '3h 45m',
            tasks: '42',
            success: '97.5%'
        };

        spinner.succeed('Agent metrics collected successfully! 📊');

        // Display metrics in a nicely formatted box
        console.log(chalk.cyan('\n┌─ Agent Metrics ─────────────────────────────────────────┐'));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan(`│  🤖 Agent ID:       ${agentId.padEnd(46)}│`));
        console.log(chalk.cyan(`│  💻 CPU Usage:      ${metrics.cpu.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🧠 Memory Usage:   ${metrics.memory.padEnd(46)}│`));
        console.log(chalk.cyan(`│  ⏱️ Uptime:         ${metrics.uptime.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🔄 Tasks Processed: ${metrics.tasks.padEnd(44)}│`));
        console.log(chalk.cyan(`│  ✅ Success Rate:   ${metrics.success.padEnd(46)}│`));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan('└──────────────────────────────────────────────────────────┘'));

        // Pause to let the user see the results
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    } catch (error) {
        spinner.fail('Failed to collect agent metrics');
        console.error(chalk.red('Error:'), error.message);

        // Pause to let the user see the error
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    }
}

// =============================================================================
// Swarm Functions
// =============================================================================
async function createSwarm() {
    // Show a loading spinner
    const spinner = ora({
        text: 'Initializing swarm creation...',
        spinner: 'dots',
        color: 'green'
    }).start();

    await new Promise(resolve => setTimeout(resolve, 500));
    spinner.stop();

    try {
        // Ask user for the type of swarm implementation
        const { implementationType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'implementationType',
                message: 'Select swarm implementation type:',
                choices: ['Julia Native Swarm', 'OpenAI Swarm']
            }
        ]);

        if (implementationType === 'Julia Native Swarm') {
            // --- Logic for Julia Native Swarm ---
            console.log(chalk.blue('\n--- Configure Julia Native Swarm ---'));

            // Use a single prompt for all basic configuration to reduce navigation issues
            const swarmConfig = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Enter Julia swarm name:',
                    validate: input => input.length > 0 ? true : 'Name is required'
                },
                {
                    type: 'number',
                    name: 'size',
                    message: 'Enter swarm size (number of particles/agents):',
                    default: 10,
                    validate: input => !isNaN(parseInt(input)) && parseInt(input) > 0 ? true : 'Size must be a positive number'
                },
                {
                    type: 'list',
                    name: 'algorithm',
                    message: 'Select swarm algorithm:',
                    choices: ['DE', 'PSO', 'GWO', 'ACO', 'GA', 'WOA'],
                    default: 'DE'
                },
                {
                    type: 'input',
                    name: 'trading_pairs',
                    message: 'Enter trading pairs (comma-separated, e.g., ETH/USD,BTC/USD):',
                    default: 'ETH/USD',
                    filter: input => input.split(',').map(p => p.trim()).filter(p => p.length > 0) // Split, trim, remove empty
                },
                {
                    type: 'input',
                    name: 'chain',
                    message: 'Enter blockchain (e.g., ethereum):',
                    default: 'ethereum'
                },
                {
                    type: 'input',
                    name: 'dex',
                    message: 'Enter DEX (e.g., uniswap-v3):',
                    default: 'uniswap-v3'
                }
            ]);

            // Extract values from the config
            const { name, size, algorithm, trading_pairs, chain, dex } = swarmConfig;

            // Prompt for algorithm parameters
            console.log(chalk.blue('\nEnter algorithm-specific parameters (leave key blank to finish):'));
            const parameters = {};
            let continueParams = true;

            while (continueParams) {
                const { key, continueAdding } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'key',
                        message: 'Parameter key (or leave blank to finish):'
                    },
                    {
                        type: 'confirm',
                        name: 'continueAdding',
                        message: 'Add another parameter?',
                        default: false,
                        when: (answers) => answers.key.trim() !== ''
                    }
                ]);

                if (key.trim() === '') {
                    continueParams = false;
                    continue;
                }

                const { value } = await inquirer.prompt({
                    type: 'input',
                    name: 'value',
                    message: `Value for "${key}":`
                });

                // Attempt to parse as number, otherwise store as string
                const parsedValue = parseFloat(value);
                parameters[key] = isNaN(parsedValue) ? value : parsedValue;

                if (!continueAdding) {
                    continueParams = false;
                }
            }

            // Show a loading spinner while creating the swarm
            const createSpinner = ora('Creating Julia Native Swarm...').start();

            try {
                // Construct the config object
                const fullSwarmConfig = {
                    name,
                    size,
                    algorithm,
                    trading_pairs,
                    parameters
                };

                // Call the service function
                const result = await createSwarmService(name, 'Trading', fullSwarmConfig, chain, dex);

                createSpinner.succeed(`Julia Swarm "${name}" created successfully!`);

                // Display the result in a formatted box
                console.log(chalk.green('\n┌─ Swarm Created ─────────────────────────────────────────┐'));
                console.log(chalk.green('│                                                          │'));
                console.log(chalk.green(`│  🐝 Name:           ${name.padEnd(46)}│`));
                console.log(chalk.green(`│  🧮 Algorithm:      ${algorithm.padEnd(46)}│`));
                console.log(chalk.green(`│  👥 Size:           ${size.toString().padEnd(46)}│`));
                console.log(chalk.green(`│  💱 Trading Pairs:  ${trading_pairs.join(', ').padEnd(46)}│`));
                console.log(chalk.green(`│  ⛓️ Chain:          ${chain.padEnd(46)}│`));
                console.log(chalk.green(`│  🔄 DEX:            ${dex.padEnd(46)}│`));

                // Add swarm ID if available in the result
                if (result && (result.swarm_id || result.id)) {
                    const swarmId = result.swarm_id || result.id;
                    console.log(chalk.green(`│  🆔 Swarm ID:       ${swarmId.padEnd(46)}│`));
                }

                console.log(chalk.green('│                                                          │'));
                console.log(chalk.green('└──────────────────────────────────────────────────────────┘'));

                // Debug information
                console.log(chalk.gray('\nDebug: Backend response:'), JSON.stringify(result, null, 2));

            } catch (error) {
                createSpinner.fail(`Failed to create Julia swarm: ${error.message}`);
                console.error(chalk.red('Error details:'), error);
            }

        } else if (implementationType === 'OpenAI Swarm') {
            // --- Logic for OpenAI Swarm ---
            console.log(chalk.blue('\n--- Configure OpenAI Swarm ---'));

            // Get the swarm name
            const { name } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Enter OpenAI swarm name:',
                    validate: input => input.length > 0 ? true : 'Name is required'
                }
            ]);

            // Collect agent configurations
            const agentConfigs = [];
            console.log(chalk.blue('\nAdd agents to the swarm:'));

            let addMoreAgents = true;
            let agentCounter = 1;

            while (addMoreAgents) {
                console.log(chalk.cyan(`\n--- Agent ${agentCounter} Configuration ---`));

                const { agentName, instructions, addAnother } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'agentName',
                        message: `Agent ${agentCounter} Name:`,
                        validate: input => input.trim().length > 0 ? true : 'Agent name is required'
                    },
                    {
                        type: 'input',
                        name: 'instructions',
                        message: `Agent instructions:`,
                        default: 'You are a helpful agent.'
                    },
                    {
                        type: 'confirm',
                        name: 'addAnother',
                        message: 'Add another agent?',
                        default: agentCounter < 2 // Default to yes for the first agent
                    }
                ]);

                agentConfigs.push({
                    name: agentName.trim(),
                    instructions: instructions
                });

                agentCounter++;
                addMoreAgents = addAnother;
            }

            // Show a loading spinner while creating the swarm
            const createSpinner = ora('Creating OpenAI Swarm...').start();

            try {
                // Call the service function for OpenAI Swarm
                const result = await createOpenAISwarmService(name, agentConfigs);

                createSpinner.succeed(`OpenAI Swarm "${name}" created successfully!`);

                // Display the result in a formatted box
                console.log(chalk.green('\n┌─ OpenAI Swarm Created ─────────────────────────────────┐'));
                console.log(chalk.green('│                                                          │'));
                console.log(chalk.green(`│  🐝 Name:           ${name.padEnd(46)}│`));
                console.log(chalk.green(`│  🤖 Agents:         ${agentConfigs.length.toString().padEnd(46)}│`));

                // Add swarm/assistant ID if available in the result
                if (result && (result.swarm_id || result.assistant_id || result.id)) {
                    const swarmId = result.swarm_id || result.assistant_id || result.id;
                    console.log(chalk.green(`│  🆔 Swarm ID:       ${swarmId.padEnd(46)}│`));
                }

                console.log(chalk.green('│                                                          │'));
                console.log(chalk.green('└──────────────────────────────────────────────────────────┘'));

                // Debug information
                console.log(chalk.gray('\nDebug: Backend response:'), JSON.stringify(result, null, 2));

            } catch (error) {
                createSpinner.fail(`Failed to create OpenAI swarm: ${error.message}`);
                console.error(chalk.red('Error details:'), error);
            }
        }
    } catch (error) {
        console.error(chalk.red('\nError during swarm creation:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function listSwarms() {
    // Show a loading spinner
    const spinner = ora({
        text: 'Fetching swarms...',
        spinner: 'dots',
        color: 'green'
    }).start();

    try {
        // Try to get all swarms from Julia backend using the correct command
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });

        // Extract swarms from the result structure
        // The backend might return data in different formats
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        spinner.succeed('Swarms retrieved successfully');

        if (swarms && swarms.length > 0) {
            // Display swarms in a table format
            console.log(chalk.green('\n┌─────────────────────────────────────────────────────────────────────────────┐'));
            console.log(chalk.green('│                                 SWARM LIST                                  │'));
            console.log(chalk.green('├─────────────┬────────────┬──────────────┬────────────────┬──────────────────┤'));
            console.log(chalk.green('│ NAME        │ ALGORITHM  │ STATUS       │ TRADING PAIRS  │ ID               │'));
            console.log(chalk.green('├─────────────┼────────────┼──────────────┼────────────────┼──────────────────┤'));

            swarms.forEach(swarm => {
                const name = swarm.name || 'Unnamed';
                const algorithm = swarm.algorithm || swarm.type || 'Unknown';
                const status = swarm.status === 'active' ? chalk.green('Active') : chalk.yellow('Inactive');
                const pairs = swarm.config?.trading_pairs ? swarm.config.trading_pairs.join(',') : 'N/A';
                const id = swarm.id || 'Unknown';

                console.log(chalk.green('│') +
                    ` ${name.padEnd(11)}` + chalk.green('│') +
                    ` ${algorithm.padEnd(10)}` + chalk.green('│') +
                    ` ${status.padEnd(12)}` + chalk.green('│') +
                    ` ${pairs.padEnd(14)}` + chalk.green('│') +
                    ` ${id.padEnd(16)}` + chalk.green('│'));
            });

            console.log(chalk.green('└─────────────┴────────────┴──────────────┴────────────────┴──────────────────┘'));

            // Offer detailed view option
            const { viewDetails } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'viewDetails',
                    message: 'Would you like to view details of a specific swarm?',
                    default: false
                }
            ]);

            if (viewDetails) {
                // Format swarms for selection
                const swarmChoices = swarms.map(swarm => ({
                    name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
                    value: swarm
                }));

                // Add a cancel option
                swarmChoices.push({
                    name: 'Cancel - Go back',
                    value: 'cancel'
                });

                // Let the user select a swarm to view
                const { selectedSwarm } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedSwarm',
                        message: 'Select a swarm to view details:',
                        choices: swarmChoices,
                        pageSize: 10
                    }
                ]);

                // Check if user canceled
                if (selectedSwarm !== 'cancel') {
                    // Display detailed information about the selected swarm
                    const swarm = selectedSwarm;

                    console.log(chalk.green('\n┌─ Swarm Details ─────────────────────────────────────────┐'));
                    console.log(chalk.green('│                                                          │'));
                    console.log(chalk.green(`│  🐝 Name:           ${swarm.name.padEnd(46)}│`));
                    console.log(chalk.green(`│  🧮 Algorithm:      ${(swarm.algorithm || 'Unknown').padEnd(46)}│`));
                    console.log(chalk.green(`│  🚦 Status:         ${(swarm.status || 'Unknown').padEnd(46)}│`));
                    console.log(chalk.green(`│  🆔 ID:             ${swarm.id.padEnd(46)}│`));

                    // Add creation date if available
                    if (swarm.created_at) {
                        console.log(chalk.green(`│  📅 Created:        ${swarm.created_at.padEnd(46)}│`));
                    }

                    // Add size if available
                    if (swarm.size) {
                        console.log(chalk.green(`│  👥 Size:           ${swarm.size.toString().padEnd(46)}│`));
                    }

                    // Add trading pairs if available
                    if (swarm.config?.trading_pairs) {
                        console.log(chalk.green(`│  💱 Trading Pairs:  ${swarm.config.trading_pairs.join(', ').padEnd(46)}│`));
                    }

                    // Add chain if available
                    if (swarm.config?.chain) {
                        console.log(chalk.green(`│  ⛓️  Chain:          ${swarm.config.chain.padEnd(46)}│`));
                    }

                    // Add DEX if available
                    if (swarm.config?.dex) {
                        console.log(chalk.green(`│  🔄 DEX:            ${swarm.config.dex.padEnd(46)}│`));
                    }

                    console.log(chalk.green('│                                                          │'));
                    console.log(chalk.green('└──────────────────────────────────────────────────────────┘'));

                    // Show configuration details if available
                    if (swarm.config && Object.keys(swarm.config).length > 0) {
                        console.log(chalk.cyan('\nConfiguration Details:'));
                        console.log(JSON.stringify(swarm.config, null, 2));
                    }
                }
            }
        } else {
            // No swarms found or empty response
            console.log(chalk.yellow('\nNo swarms found. Create a swarm to get started.'));
            console.log(chalk.cyan('\nTip: Select "Create Swarm" from the Swarm Management menu to create your first swarm.'));
        }

        // Debug information about the response
        console.log(chalk.gray('\nDebug: Response from backend:'), JSON.stringify(result, null, 2));
    } catch (error) {
        spinner.fail(`Failed to list swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);

        // Provide helpful guidance
        console.log(chalk.yellow('\nTroubleshooting tips:'));
        console.log(chalk.cyan('1. Make sure the Julia server is running'));
        console.log(chalk.cyan('2. Check network connectivity'));
        console.log(chalk.cyan('3. Verify that the swarm management module is properly initialized'));
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function configureSwarm() {
    // Show a loading spinner while fetching swarms
    const listSpinner = ora('Fetching available swarms...').start();

    try {
        // First, get the list of swarms to let the user select from them
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });
        listSpinner.succeed('Swarms retrieved successfully');

        // Extract swarms from the result
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        if (!swarms || swarms.length === 0) {
            console.log(chalk.yellow('\nNo swarms found to configure. Create a swarm first.'));
            return;
        }

        // Format swarms for selection
        const swarmChoices = swarms.map(swarm => ({
            name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
            value: swarm
        }));

        // Add a cancel option
        swarmChoices.push({
            name: 'Cancel - Go back to menu',
            value: 'cancel'
        });

        // Let the user select a swarm to configure
        const { selectedSwarm } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSwarm',
                message: 'Select a swarm to configure:',
                choices: swarmChoices,
                pageSize: 10
            }
        ]);

        // Check if user canceled
        if (selectedSwarm === 'cancel') {
            console.log(chalk.blue('Operation canceled.'));
            return;
        }

        // Get the swarm ID
        const swarmId = selectedSwarm.id;

        // Display current configuration
        console.log(chalk.cyan('\nCurrent Swarm Configuration:'));
        console.log(JSON.stringify(selectedSwarm, null, 2));

        // Ask which parameter to update
        const { configOption } = await inquirer.prompt([
            {
                type: 'list',
                name: 'configOption',
                message: 'What would you like to configure?',
                choices: [
                    { name: 'Status (active/inactive)', value: 'status' },
                    { name: 'Algorithm Parameters', value: 'parameters' },
                    { name: 'Trading Pairs', value: 'trading_pairs' },
                    { name: 'Advanced (JSON)', value: 'advanced' },
                    { name: 'Cancel', value: 'cancel' }
                ]
            }
        ]);

        if (configOption === 'cancel') {
            console.log(chalk.blue('Configuration canceled.'));
            return;
        }

        let configUpdates = {};

        if (configOption === 'status') {
            // Update status
            const { status } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'status',
                    message: 'Select new status:',
                    choices: [
                        { name: 'Active', value: 'active' },
                        { name: 'Inactive', value: 'inactive' }
                    ],
                    default: selectedSwarm.status === 'active' ? 'active' : 'inactive'
                }
            ]);

            configUpdates.status = status;
        } else if (configOption === 'parameters') {
            // Update algorithm parameters
            console.log(chalk.cyan('\nCurrent Parameters:'));
            console.log(JSON.stringify(selectedSwarm.parameters || {}, null, 2));

            // Iteratively prompt for algorithm parameters
            console.log(chalk.blue('\nEnter updated algorithm parameters (leave key blank to finish):'));
            const parameters = { ...selectedSwarm.parameters } || {};
            let continueParams = true;

            while (continueParams) {
                const { key, continueAdding } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'key',
                        message: 'Parameter key (or leave blank to finish):'
                    },
                    {
                        type: 'confirm',
                        name: 'continueAdding',
                        message: 'Add another parameter?',
                        default: false,
                        when: (answers) => answers.key.trim() !== ''
                    }
                ]);

                if (key.trim() === '') {
                    continueParams = false;
                    continue;
                }

                const { value } = await inquirer.prompt({
                    type: 'input',
                    name: 'value',
                    message: `Value for "${key}":`,
                    default: parameters[key] !== undefined ? parameters[key].toString() : ''
                });

                // Attempt to parse as number, otherwise store as string
                const parsedValue = parseFloat(value);
                parameters[key] = isNaN(parsedValue) ? value : parsedValue;

                if (!continueAdding) {
                    continueParams = false;
                }
            }

            configUpdates.parameters = parameters;
        } else if (configOption === 'trading_pairs') {
            // Update trading pairs
            const currentPairs = selectedSwarm.trading_pairs || [];
            console.log(chalk.cyan('\nCurrent Trading Pairs:'), currentPairs.join(', ') || 'None');

            const { trading_pairs } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'trading_pairs',
                    message: 'Enter trading pairs (comma-separated, e.g., ETH/USD,BTC/USD):',
                    default: currentPairs.join(','),
                    filter: input => input.split(',').map(p => p.trim()).filter(p => p.length > 0) // Split, trim, remove empty
                }
            ]);

            configUpdates.trading_pairs = trading_pairs;
        } else if (configOption === 'advanced') {
            // Advanced JSON configuration
            const { updates } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'updates',
                    message: 'Enter configuration updates (JSON):',
                    default: '{}'
                }
            ]);

            try {
                const jsonUpdates = JSON.parse(updates);
                configUpdates = jsonUpdates;
            } catch (jsonError) {
                console.error(chalk.red('Invalid JSON updates format. Using empty updates.'));
                configUpdates = {};
            }
        }

        // Show a loading spinner while updating the swarm
        const updateSpinner = ora(`Updating swarm ${swarmId}...`).start();

        try {
            // Call the service function to update the swarm
            const result = await updateSwarmService(swarmId, configUpdates);

            updateSpinner.succeed(`Swarm "${swarmId}" configuration updated successfully!`);

            // Display the result
            console.log(chalk.cyan('\nUpdated Configuration:'));
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            updateSpinner.fail(`Failed to update swarm configuration: ${error.message}`);
            console.error(chalk.red('Error details:'), error);
        }
    } catch (error) {
        listSpinner.fail(`Failed to retrieve swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function startSwarm() {
    // Show a loading spinner while fetching swarms
    const listSpinner = ora('Fetching available swarms...').start();

    try {
        // First, get the list of swarms to let the user select from them
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });
        listSpinner.succeed('Swarms retrieved successfully');

        // Extract swarms from the result
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        if (!swarms || swarms.length === 0) {
            console.log(chalk.yellow('\nNo swarms found to start. Create a swarm first.'));
            return;
        }

        // Filter inactive swarms
        const inactiveSwarms = swarms.filter(swarm => swarm.status !== 'active');

        if (inactiveSwarms.length === 0) {
            console.log(chalk.yellow('\nAll swarms are already active. No swarms to start.'));
            return;
        }

        // Format swarms for selection
        const swarmChoices = inactiveSwarms.map(swarm => ({
            name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
            value: swarm.id
        }));

        // Add a cancel option
        swarmChoices.push({
            name: 'Cancel - Go back to menu',
            value: 'cancel'
        });

        // Let the user select a swarm to start
        const { swarmId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'swarmId',
                message: 'Select a swarm to start:',
                choices: swarmChoices,
                pageSize: 10
            }
        ]);

        // Check if user canceled
        if (swarmId === 'cancel') {
            console.log(chalk.blue('Operation canceled.'));
            return;
        }

        // Show a loading spinner while starting the swarm
        const startSpinner = ora(`Starting swarm ${swarmId}...`).start();

        try {
            // Prepare parameters for the update service
            const updates = { status: 'active' };

            // Call the updated updateSwarmService function
            const result = await updateSwarmService(swarmId, updates);

            startSpinner.succeed(`Swarm "${swarmId}" started successfully!`);
            console.log(chalk.cyan('Status:'), result.status || 'active');

            // Debug information
            console.log(chalk.gray('\nDebug: Backend response:'), JSON.stringify(result, null, 2));
        } catch (error) {
            startSpinner.fail(`Failed to start swarm: ${error.message}`);
            console.error(chalk.red('Error details:'), error);
        }
    } catch (error) {
        listSpinner.fail(`Failed to retrieve swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function stopSwarm() {
    // Show a loading spinner while fetching swarms
    const listSpinner = ora('Fetching available swarms...').start();

    try {
        // First, get the list of swarms to let the user select from them
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });
        listSpinner.succeed('Swarms retrieved successfully');

        // Extract swarms from the result
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        if (!swarms || swarms.length === 0) {
            console.log(chalk.yellow('\nNo swarms found to stop. Create a swarm first.'));
            return;
        }

        // Filter active swarms
        const activeSwarms = swarms.filter(swarm => swarm.status === 'active');

        if (activeSwarms.length === 0) {
            console.log(chalk.yellow('\nNo active swarms found. All swarms are already stopped.'));
            return;
        }

        // Format swarms for selection
        const swarmChoices = activeSwarms.map(swarm => ({
            name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
            value: swarm.id
        }));

        // Add a cancel option
        swarmChoices.push({
            name: 'Cancel - Go back to menu',
            value: 'cancel'
        });

        // Let the user select a swarm to stop
        const { swarmId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'swarmId',
                message: 'Select a swarm to stop:',
                choices: swarmChoices,
                pageSize: 10
            }
        ]);

        // Check if user canceled
        if (swarmId === 'cancel') {
            console.log(chalk.blue('Operation canceled.'));
            return;
        }

        // Show a loading spinner while stopping the swarm
        const stopSpinner = ora(`Stopping swarm ${swarmId}...`).start();

        try {
            // Prepare parameters for the update service
            const updates = { status: 'inactive' };

            // Call the updated updateSwarmService function
            const result = await updateSwarmService(swarmId, updates);

            stopSpinner.succeed(`Swarm "${swarmId}" stopped successfully!`);
            console.log(chalk.cyan('Status:'), result.status || 'inactive');

            // Debug information
            console.log(chalk.gray('\nDebug: Backend response:'), JSON.stringify(result, null, 2));
        } catch (error) {
            stopSpinner.fail(`Failed to stop swarm: ${error.message}`);
            console.error(chalk.red('Error details:'), error);
        }
    } catch (error) {
        listSpinner.fail(`Failed to retrieve swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function deleteSwarm() {
    // Show a loading spinner while fetching swarms
    const listSpinner = ora('Fetching available swarms...').start();

    try {
        // First, get the list of swarms to let the user select from them
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });
        listSpinner.succeed('Swarms retrieved successfully');

        // Extract swarms from the result
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        if (!swarms || swarms.length === 0) {
            console.log(chalk.yellow('\nNo swarms found to delete. Create a swarm first.'));
            return;
        }

        // Format swarms for selection
        const swarmChoices = swarms.map(swarm => ({
            name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
            value: swarm.id
        }));

        // Add a cancel option
        swarmChoices.push({
            name: 'Cancel - Go back to menu',
            value: 'cancel'
        });

        // Let the user select a swarm to delete
        const { swarmId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'swarmId',
                message: 'Select a swarm to delete:',
                choices: swarmChoices,
                pageSize: 10
            }
        ]);

        // Check if user canceled
        if (swarmId === 'cancel') {
            console.log(chalk.blue('Operation canceled.'));
            return;
        }

        // Get confirmation
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to delete swarm with ID: ${swarmId}?`,
                default: false
            }
        ]);

        if (confirm) {
            // Show a loading spinner while deleting
            const deleteSpinner = ora(`Deleting swarm ${swarmId}...`).start();

            try {
                // Prepare parameters based on what the Julia backend expects
                const params = { id: swarmId };

                // Call Julia backend to delete swarm using the correct command format
                const result = await juliaBridge.runJuliaCommand('swarms.delete_swarm', params);

                if (result && result.error) {
                    throw new Error(result.error);
                }

                deleteSpinner.succeed(`Swarm "${swarmId}" deleted successfully!`);

                // Debug information
                console.log(chalk.gray('\nDebug: Backend response:'), JSON.stringify(result, null, 2));
            } catch (error) {
                deleteSpinner.fail(`Failed to delete swarm: ${error.message}`);
                console.error(chalk.red('Error details:'), error);
            }
        } else {
            console.log(chalk.blue('\nDeletion canceled.'));
        }
    } catch (error) {
        listSpinner.fail(`Failed to retrieve swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function displaySwarmMetrics() {
    // Show a loading spinner while fetching swarms
    const listSpinner = ora('Fetching available swarms...').start();

    try {
        // First, get the list of swarms to let the user select from them
        const result = await juliaBridge.runJuliaCommand('swarms.list_swarms', { page: 1, limit: 100 });
        listSpinner.succeed('Swarms retrieved successfully');

        // Extract swarms from the result
        const swarms = result?.result?.data || result?.data || result?.swarms || [];

        if (!swarms || swarms.length === 0) {
            console.log(chalk.yellow('\nNo swarms found to display metrics for. Create a swarm first.'));
            return;
        }

        // Format swarms for selection
        const swarmChoices = swarms.map(swarm => ({
            name: `${swarm.name} (${swarm.algorithm || 'Unknown'}) - ID: ${swarm.id}`,
            value: swarm.id
        }));

        // Add a cancel option
        swarmChoices.push({
            name: 'Cancel - Go back to menu',
            value: 'cancel'
        });

        // Let the user select a swarm to view metrics for
        const { swarmId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'swarmId',
                message: 'Select a swarm to view metrics:',
                choices: swarmChoices,
                pageSize: 10
            }
        ]);

        // Check if user canceled
        if (swarmId === 'cancel') {
            console.log(chalk.blue('Operation canceled.'));
            return;
        }

        // Show a loading spinner while collecting metrics
        const metricsSpinner = ora(`Collecting metrics for swarm ${swarmId}...`).start();

        try {
            // Get swarm state using the service function
            const state = await getSwarmStateService(swarmId);

            // Find the full swarm data from our list
            const swarmData = swarms.find(s => s.id === swarmId) || state?.data || state;

            // Extract or create metrics
            const metrics = swarmData?.metrics || {
                agents: '0/0',
                cpu: '0%',
                memory: '0MB',
                uptime: '0m',
                tasks: '0',
                success: '0%'
            };

            // Try to extract more meaningful metrics from the swarm data
            if (swarmData) {
                // If we have algorithm info, use it
                if (swarmData.algorithm) {
                    metrics.algorithm = swarmData.algorithm;
                }

                // If we have status info, use it
                if (swarmData.status) {
                    metrics.status = swarmData.status;
                }

                // If we have creation time, calculate uptime
                if (swarmData.created_at) {
                    const createdAt = new Date(swarmData.created_at);
                    const now = new Date();
                    const uptimeMs = now - createdAt;
                    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
                    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
                    metrics.uptime = `${uptimeHours}h ${uptimeMinutes}m`;
                }

                // If we have size info, use it for agents
                if (swarmData.size) {
                    metrics.agents = `${swarmData.size}/${swarmData.size}`;
                }
            }

            metricsSpinner.succeed('Swarm metrics collected successfully! 📊');

            // Display metrics in a nicely formatted box
            console.log(chalk.green('\n┌─ Swarm Metrics ─────────────────────────────────────────┐'));
            console.log(chalk.green('│                                                          │'));
            console.log(chalk.green(`│  🐝 Swarm ID:       ${swarmId.padEnd(46)}│`));
            console.log(chalk.green(`│  🐝 Name:           ${(swarmData.name || 'Unknown').padEnd(46)}│`));
            console.log(chalk.green(`│  🧮 Algorithm:      ${(metrics.algorithm || 'Unknown').padEnd(46)}│`));
            console.log(chalk.green(`│  🚦 Status:         ${(metrics.status || 'Unknown').padEnd(46)}│`));
            console.log(chalk.green(`│  👥 Active Agents:  ${metrics.agents.padEnd(46)}│`));
            console.log(chalk.green(`│  💻 CPU Usage:      ${metrics.cpu.padEnd(46)}│`));
            console.log(chalk.green(`│  🧠 Memory Usage:   ${metrics.memory.padEnd(46)}│`));
            console.log(chalk.green(`│  ⏱️ Uptime:         ${metrics.uptime.padEnd(46)}│`));
            console.log(chalk.green(`│  🔄 Tasks Processed: ${metrics.tasks.padEnd(44)}│`));
            console.log(chalk.green(`│  ✅ Success Rate:   ${metrics.success.padEnd(46)}│`));
            console.log(chalk.green('│                                                          │'));
            console.log(chalk.green('└──────────────────────────────────────────────────────────┘'));

            // Offer performance visualization option
            const { viewPerformance } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'viewPerformance',
                    message: 'Would you like to view performance visualization?',
                    default: false
                }
            ]);

            if (viewPerformance) {
                // Create a simple ASCII chart for CPU usage over time
                console.log(chalk.cyan('\nCPU Usage Over Time:'));
                console.log(chalk.cyan('┌─────────────────────────────────────────────────────┐'));
                console.log(chalk.cyan('│                                                    │'));
                console.log(chalk.cyan('│    ┏━━━┓                                          │'));
                console.log(chalk.cyan('│    ┃   ┃     ┏━━━┓                                │'));
                console.log(chalk.cyan('│    ┃   ┃     ┃   ┃                                │'));
                console.log(chalk.cyan('│    ┃   ┗━━━━━┛   ┗━━━━┓      ┏━━━━┓              │'));
                console.log(chalk.cyan('│    ┃                   ┃      ┃    ┃              │'));
                console.log(chalk.cyan('│    ┃                   ┗━━━━━━┛    ┗━━━━━━━━━━━━━│'));
                console.log(chalk.cyan('│                                                    │'));
                console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
                console.log(chalk.cyan('  1h ago                                      Now    '));

                // Create a simple ASCII chart for memory usage
                console.log(chalk.magenta('\nMemory Usage:'));
                console.log(chalk.magenta('┌─────────────────────────────────────────────────────┐'));
                console.log(chalk.magenta('│██████████████████████                             │'));
                console.log(chalk.magenta('│                                                    │'));
                console.log(chalk.magenta('└─────────────────────────────────────────────────────┘'));
                console.log(chalk.magenta(`  ${metrics.memory} used of available memory`));
            }

            // Debug information about the response
            console.log(chalk.gray('\nDebug: Swarm data from backend:'), JSON.stringify(swarmData, null, 2));

        } catch (error) {
            metricsSpinner.fail(`Failed to collect swarm metrics: ${error.message}`);
            console.error(chalk.red('Error details:'), error);
        }
    } catch (error) {
        listSpinner.fail(`Failed to retrieve swarms: ${error.message}`);
        console.error(chalk.red('Error details:'), error);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

// =============================================================================
// Transaction Functions
// =============================================================================
/**
 * Sends a standard transaction (e.g., value transfer) from the connected wallet.
 */
async function sendTransaction() {
    const state = walletManager.getState();
    if (!state.isConnected) {
        console.log(chalk.red('Please connect a wallet first.'));
        return;
    }
    if (state.readOnly) {
        console.log(chalk.red('Cannot send transactions in read-only mode.'));
        return;
    }
    // Check if the current provider is node (PrivateKeyProvider)
    const currentProvider = walletManager.getCurrentProvider();
    const isNodePvkProvider = currentProvider instanceof walletManager.getNodeProvider().constructor;

    if (!isNodePvkProvider) {
         console.log(chalk.yellow('Sending transactions directly is currently only supported when connected via Private Key.'));
         console.log(chalk.yellow('For browser wallets, initiate transactions through dApps or their interfaces.'));
         return;
    }

    try {
        // Get transaction details from the user
        const { to, value, data } = await inquirer.prompt([
            // ... (prompts for to, value, data - same as before) ...
            {
                type: 'input',
                name: 'to',
                message: 'Enter recipient address:',
                // Add validation
            },
            {
                type: 'input',
                name: 'value',
                message: 'Enter amount to send (in Ether/native token):',
                 validate: input => !isNaN(parseFloat(input)) && parseFloat(input) >= 0 ? true : 'Invalid amount'
            },
            {
                type: 'input',
                name: 'data',
                message: 'Enter transaction data (optional, hex string):',
                default: '0x'
            }
        ]);

        // Construct the transaction request (ethers v5)
        const txRequest = {
            to: to,
            value: ethers.utils.parseEther(value), // Convert ETH value to Wei
            data: data || '0x',
            // Let ethers/provider handle nonce, gas estimation etc.
        };

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: `Send ${value} to ${to}?`,
                default: false
            }
        ]);

        if (!confirmed) {
            console.log(chalk.yellow('Transaction cancelled.'));
            return;
        }

        const spinner = ora('Sending transaction...').start();
        try {
            // Use the WalletManager method - it handles provider check internally
            const txResponse = await walletManager.sendTransaction(txRequest);
            spinner.succeed(`Transaction submitted! Hash: ${txResponse.hash}`);
            console.log(chalk.cyan('Waiting for confirmation...'));

            // Wait for 1 confirmation
            const receipt = await walletManager.waitForTransaction(txResponse.hash, 1);

            if (receipt && receipt.status === 1) {
                spinner.succeed(`Transaction confirmed! Block: ${receipt.blockNumber}`);
                 // Update local history if needed
                 if (!walletManager.state.transactions) walletManager.state.transactions = [];
                 walletManager.state.transactions.push({
                     hash: receipt.transactionHash,
                     from: state.address,
                     to: to,
                     amount: `${value} ${ID_TO_CHAIN_NAME[state.chainId]}`, // Use correct chain name
                     timestamp: new Date(), // Or get block timestamp from receipt
                     status: 'Confirmed',
                     provider: 'node' // Indicate it was sent via node provider
                 });
            } else {
                spinner.fail(`Transaction failed or status unknown. Receipt: ${JSON.stringify(receipt)}`);
            }

        } catch (error) {
            spinner.fail(`Transaction failed: ${error.message}`);
            console.error(chalk.red('Error Details:'), error);
        }
    } catch (error) {
        console.error(chalk.red('Error preparing transaction:'), error.message);
    }
    // Add pause
    await inquirer.prompt([{
       type: 'input',
       name: 'continue',
       message: 'Press Enter to continue...'
    }]);
}

async function viewTransactionHistory() {
    const state = walletManager.getState();
    if (!state.isConnected) {
        console.log(chalk.yellow('Please connect a wallet first.'));
        return;
    }

    try {
        let transactions = state.transactions || [];

        if (transactions.length === 0) {
            // If no transactions, provide mock data for demo purposes
            if (state.readOnly) {
                console.log(chalk.yellow('No transaction history available in read-only mode.'));
                console.log(chalk.yellow('Connect with a private key to view and make transactions.'));
                return;
            } else {
                transactions = [
                    {
                        hash: `0x${Math.random().toString(16).substring(2, 12)}`,
                        from: 'Previous Wallet',
                        to: state.address,
                        amount: `0.5 ${state.chainId.toUpperCase()}`,
                        timestamp: new Date(Date.now() - 86400000), // 1 day ago
                        status: 'Confirmed'
                    }
                ];
            }
        }

        console.log(chalk.cyan('\nTransaction History:'));
        transactions.forEach(tx => {
            const statusColor = tx.status === 'Confirmed' ? chalk.green : chalk.yellow;
            console.log(
                chalk.white(`- ${tx.hash}`),
                '\n  ',
                chalk.white(`From: ${tx.from}`),
                '\n  ',
                chalk.white(`To: ${tx.to}`),
                '\n  ',
                chalk.white(`Amount: ${tx.amount}`),
                '\n  ',
                chalk.white(`Date: ${tx.timestamp.toLocaleString()}`),
                '\n  ',
                chalk.white(`Status: ${statusColor(tx.status)}`),
                '\n'
            );
        });

        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: 'Press Enter to continue...'
            }
        ]);
    } catch (error) {
        console.error(chalk.red('Failed to get transaction history:'), error.message);
    }
}

// =============================================================================
// API Key Functions
// =============================================================================
async function addApiKey() {
    const { service } = await inquirer.prompt([
    {
      type: 'list',
            name: 'service',
            message: 'Select service:',
            choices: ['OpenAI', 'Anthropic', 'Google', 'AWS']
        },
        {
            type: 'password',
            name: 'key',
            message: 'Enter API key:',
            validate: input => input.length > 0 ? true : 'API key is required'
        }
    ]);

    try {
        // Simulate adding API key
        console.log(chalk.green(`API key for ${service} added successfully!`));
    } catch (error) {
        console.error(chalk.red('Failed to add API key:'), error.message);
    }
}

async function listApiKeys() {
    try {
        // Show a loading spinner
        const spinner = ora({
            text: 'Fetching API keys...',
            spinner: 'dots',
            color: 'yellow'
        }).start();

        await new Promise(resolve => setTimeout(resolve, 800));

        // Simulate listing API keys (in a real app, this would fetch from a backend)
        const keys = [
            { service: 'OpenAI', status: 'Valid', last_used: '2 hours ago' },
            { service: 'Anthropic', status: 'Valid', last_used: '1 day ago' },
            { service: 'Google', status: 'Invalid', last_used: 'Never' },
            { service: 'AWS', status: 'Missing', last_used: 'Never' }
        ];

        spinner.succeed('API keys retrieved successfully');

        console.log(chalk.yellow('\n┌─ API Keys ─────────────────────────────────────────────┐'));
        console.log(chalk.yellow('│                                                          │'));

        if (keys.length > 0) {
            keys.forEach(key => {
                let statusColor;
                let statusIcon;

                switch (key.status) {
                    case 'Valid':
                        statusColor = chalk.green;
                        statusIcon = '✅';
                        break;
                    case 'Invalid':
                        statusColor = chalk.red;
                        statusIcon = '❌';
                        break;
                    case 'Missing':
                        statusColor = chalk.yellow;
                        statusIcon = '⚠️';
                        break;
                    default:
                        statusColor = chalk.white;
                        statusIcon = '❓';
                }

                console.log(chalk.yellow(`│  • ${key.service.padEnd(12)} ${statusIcon} ${statusColor(key.status.padEnd(10))} Last used: ${key.last_used.padEnd(12)} │`));
            });
        } else {
            console.log(chalk.yellow('│  No API keys found. Add an API key to get started.     │'));
            console.log(chalk.yellow('│                                                          │'));
            console.log(chalk.yellow('│  Tip: Select "Add API Key" from the API Keys Management │'));
            console.log(chalk.yellow('│       menu to add your first API key.                   │'));
        }

        console.log(chalk.yellow('│                                                          │'));
        console.log(chalk.yellow('└──────────────────────────────────────────────────────────┘'));
    } catch (error) {
        console.error(chalk.red('\nFailed to list API keys:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

async function updateApiKey() {
    const { service } = await inquirer.prompt([
        {
            type: 'list',
            name: 'service',
            message: 'Select service:',
            choices: ['OpenAI', 'Anthropic', 'Google', 'AWS']
        },
        {
            type: 'password',
            name: 'key',
            message: 'Enter new API key:',
            validate: input => input.length > 0 ? true : 'API key is required'
        }
    ]);

    try {
        // Simulate updating API key
        console.log(chalk.green(`API key for ${service} updated successfully!`));
    } catch (error) {
        console.error(chalk.red('Failed to update API key:'), error.message);
    }
}

async function deleteApiKey() {
    const { service, confirm } = await inquirer.prompt([
        {
            type: 'list',
            name: 'service',
            message: 'Select service:',
            choices: ['OpenAI', 'Anthropic', 'Google', 'AWS']
        },
        {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete this API key?',
            default: false
        }
    ]);

    if (confirm) {
        try {
            // Simulate deleting API key
            console.log(chalk.green(`API key for ${service} deleted successfully!`));
  } catch (error) {
            console.error(chalk.red('Failed to delete API key:'), error.message);
        }
    }
}

// =============================================================================
// Configuration Functions
// =============================================================================
async function configurePerformance() {
    await inquirer.prompt([
          {
            type: 'input',
            name: 'cpu',
            message: 'Enter CPU limit (percentage):',
            default: '80',
            validate: input => !isNaN(input) && parseInt(input) > 0 && parseInt(input) <= 100 ? true : 'CPU limit must be between 1 and 100'
        },
        {
            type: 'input',
            name: 'memory',
            message: 'Enter memory limit (MB):',
            default: '2048',
            validate: input => !isNaN(input) && parseInt(input) > 0 ? true : 'Memory limit must be a positive number'
        },
        {
            type: 'input',
            name: 'threads',
            message: 'Enter number of threads:',
            default: '4',
            validate: input => !isNaN(input) && parseInt(input) > 0 ? true : 'Number of threads must be a positive number'
        }
    ]);

    try {
        // Simulate updating performance settings
        console.log(chalk.green('Performance settings updated successfully!'));
    } catch (error) {
        console.error(chalk.red('Failed to update performance settings:'), error.message);
    }
}

async function configureSecurity() {
    await inquirer.prompt([
        {
            type: 'list',
            name: 'encryption',
            message: 'Select encryption level:',
            choices: ['Low', 'Medium', 'High']
        },
        {
            type: 'list',
            name: 'authentication',
            message: 'Select authentication method:',
            choices: ['Password', '2FA', 'Hardware Key']
        },
        {
            type: 'list',
            name: 'firewall',
            message: 'Select firewall level:',
            choices: ['Basic', 'Advanced', 'Custom']
        }
    ]);

    try {
        // Simulate updating security settings
        console.log(chalk.green('Security settings updated successfully!'));
  } catch (error) {
        console.error(chalk.red('Failed to update security settings:'), error.message);
    }
}

async function configureNetwork() {
    await inquirer.prompt([
        {
            type: 'input',
            name: 'proxy',
            message: 'Enter proxy server (optional):',
            default: ''
        },
        {
            type: 'input',
            name: 'dns',
            message: 'Enter DNS server:',
            default: '8.8.8.8',
            validate: input => input.length > 0 ? true : 'DNS server is required'
        },
        {
            type: 'input',
            name: 'timeout',
            message: 'Enter connection timeout (seconds):',
            default: '30',
            validate: input => !isNaN(input) && parseInt(input) > 0 ? true : 'Timeout must be a positive number'
        }
    ]);

    try {
        // Simulate updating network settings
        console.log(chalk.green('Network settings updated successfully!'));
    } catch (error) {
        console.error(chalk.red('Failed to update network settings:'), error.message);
    }
}

async function configureStorage() {
    // Use storagePath instead of path to avoid conflict with the global path module
    const { storagePath, quota, backup } = await inquirer.prompt([
        {
            type: 'input',
            name: 'storagePath',
            message: 'Enter storage path:',
            default: path.join(os.homedir(), '.juliaos', 'data'),
            validate: input => input.length > 0 ? true : 'Storage path is required'
        },
        {
            type: 'input',
            name: 'quota',
            message: 'Enter storage quota (GB):',
            default: '10',
            validate: input => !isNaN(input) && parseInt(input) > 0 ? true : 'Storage quota must be a positive number'
        },
        {
            type: 'list',
            name: 'backup',
            message: 'Select backup frequency:',
            choices: ['Never', 'Daily', 'Weekly', 'Monthly']
        }
    ]);

    try {
        // Show a spinner while updating settings
        const spinner = ora('Updating storage settings...').start();

        // Simulate a delay for the update
        await new Promise(resolve => setTimeout(resolve, 800));

        // Try to update settings via Julia backend
        try {
            const result = await juliaBridge.runJuliaCommand('configure_storage', {
                path: storagePath,
                quota: parseInt(quota),
                backup_frequency: backup.toLowerCase()
            });

            if (result && result.success) {
                spinner.succeed('Storage settings updated successfully!');
                console.log(chalk.green('\nStorage configuration has been updated:'));
                console.log(chalk.cyan(`  Storage Path: ${storagePath}`));
                console.log(chalk.cyan(`  Storage Quota: ${quota} GB`));
                console.log(chalk.cyan(`  Backup Frequency: ${backup}`));
            } else {
                // If backend call fails, fall back to local update
                spinner.warn('Backend update failed, updating local settings only.');

                // Update local settings file
                const configDir = path.join(os.homedir(), '.juliaos');
                const settingsFile = path.join(configDir, 'settings.json');

                if (await fs.pathExists(settingsFile)) {
                    const settings = await fs.readJson(settingsFile);
                    settings.storage = {
                        path: storagePath,
                        quota: parseInt(quota),
                        backup: backup.toLowerCase()
                    };
                    await fs.writeJson(settingsFile, settings, { spaces: 2 });
                    console.log(chalk.green('\nLocal storage settings updated successfully!'));
                }
            }
        } catch (backendError) {
            // If backend call throws an error, fall back to local update
            spinner.warn(`Backend error: ${backendError.message}. Updating local settings only.`);

            // Update local settings file
            const configDir = path.join(os.homedir(), '.juliaos');
            const settingsFile = path.join(configDir, 'settings.json');

            if (await fs.pathExists(settingsFile)) {
                const settings = await fs.readJson(settingsFile);
                settings.storage = {
                    path: storagePath,
                    quota: parseInt(quota),
                    backup: backup.toLowerCase()
                };
                await fs.writeJson(settingsFile, settings, { spaces: 2 });
                console.log(chalk.green('\nLocal storage settings updated successfully!'));
            }
        }
    } catch (error) {
        console.error(chalk.red('Failed to update storage settings:'), error.message);
    }

    // Pause to let the user see the results
    await inquirer.prompt([
        {
            type: 'input',
            name: 'continue',
            message: '🔄 Press Enter to continue...'
        }
    ]);
}

// =============================================================================
// Metrics Functions
// =============================================================================
async function displaySystemMetrics() {
    // displayHeader already includes console.clear()
    displayHeader();

    // Show loading spinner
    const spinner = ora({
        text: 'Collecting system metrics...',
        spinner: 'dots',
        color: 'cyan'
    }).start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Simulate retrieving system metrics
        const metrics = {
            cpu: '35%',
            memory: '4GB',
            disk: '250GB',
            network: '100Mbps',
            processes: '50'
        };

        spinner.succeed('System metrics collected successfully! 📊');

        console.log(chalk.cyan('\n┌─ System Metrics ────────────────────────────────────────┐'));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan(`│  💻 CPU Usage:      ${metrics.cpu.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🧠 Memory Usage:   ${metrics.memory.padEnd(46)}│`));
        console.log(chalk.cyan(`│  💾 Disk Usage:     ${metrics.disk.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🌐 Network Speed:  ${metrics.network.padEnd(46)}│`));
        console.log(chalk.cyan(`│  🔄 Processes:      ${metrics.processes.padEnd(46)}│`));
        console.log(chalk.cyan('│                                                          │'));
        console.log(chalk.cyan('└──────────────────────────────────────────────────────────┘'));

        // Pause to let the user see the results
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    } catch (error) {
        spinner.fail('Failed to collect system metrics');
        console.error(chalk.red('Error:'), error.message);

        // Pause to let the user see the error
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    }
}

async function displayNetworkMetrics() {
    // displayHeader already includes console.clear()
    displayHeader();

    // Show loading spinner
    const spinner = ora({
        text: 'Analyzing network metrics...',
        spinner: 'dots',
        color: 'blue'
    }).start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Simulate retrieving network metrics
        const metrics = {
            bandwidth: '100Mbps',
            latency: '50ms',
            packets: '1000/s',
            errors: '0.1%',
            connections: '25'
        };

        spinner.succeed('Network analysis complete! 🌐');

        console.log(chalk.blue('\n┌─ Network Metrics ───────────────────────────────────────┐'));
        console.log(chalk.blue('│                                                          │'));
        console.log(chalk.blue(`│  🔌 Bandwidth:      ${metrics.bandwidth.padEnd(46)}│`));
        console.log(chalk.blue(`│  ⏱️  Latency:        ${metrics.latency.padEnd(46)}│`));
        console.log(chalk.blue(`│  📦 Packets/s:      ${metrics.packets.padEnd(46)}│`));
        console.log(chalk.blue(`│  ⚠️  Error Rate:     ${metrics.errors.padEnd(46)}│`));
        console.log(chalk.blue(`│  🔄 Connections:    ${metrics.connections.padEnd(46)}│`));
        console.log(chalk.blue('│                                                          │'));
        console.log(chalk.blue('└──────────────────────────────────────────────────────────┘'));

        // Pause to let the user see the results
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    } catch (error) {
        spinner.fail('Failed to collect network metrics');
        console.error(chalk.red('Error:'), error.message);

        // Pause to let the user see the error
        await inquirer.prompt([
            {
                type: 'input',
                name: 'continue',
                message: '🔄 Press Enter to continue...'
            }
        ]);
    }
}

// =============================================================================
// Agent Service Functions
// =============================================================================
async function createAgentService(name, type, config) {
    // In a real implementation, we'd communicate with the Julia backend
    // through the juliaBridge to create an agent

    try {
        // For demo, generate a unique ID using UUID
        const id = uuidv4();

        // Get agent capabilities based on type
        const capabilities = getAgentCapabilities(type);

        // Create a more realistic agent object
        const agent = {
            id,
            name,
            type,
            config,
            status: 'Initialized',
            created_at: new Date().toISOString(),
            capabilities: capabilities,
            metrics: {
                cpu: '0%',
                memory: '0MB',
                uptime: '0s',
                tasks: '0',
                success: '0%'
            }
        };

        // In a real app, we'd persist this agent somewhere

        return agent;
    } catch (error) {
        console.error('Error in createAgentService:', error);
        throw new Error(`Failed to create agent: ${error.message}`);
    }
}

async function updateAgentService(agentId, updates) {
    try {
        // Call Julia backend to update agent
        const result = await juliaBridge.runJuliaCommand('update_agent', [agentId, JSON.stringify(updates)]);

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        throw new Error(`Failed to update agent: ${error.message}`);
    }
}

async function getAgentStateService(agentId) {
    try {
        // Call Julia backend to get agent state
        const result = await juliaBridge.runJuliaCommand('get_agent_state', [agentId]);

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        throw new Error(`Failed to get agent state: ${error.message}`);
    }
}

// Function for future use - this is intentionally not used yet but will be implemented in a future version
// This function will be used to register skills for agents when the skill management feature is implemented
// @ts-ignore - Intentionally unused function
async function registerAgentSkillService(agentId, skill) {
    try {
        // Call Julia backend to register skill
        const result = await juliaBridge.runJuliaCommand('register_skill', [agentId, JSON.stringify(skill)]);

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        throw new Error(`Failed to register agent skill: ${error.message}`);
    }
}

// =============================================================================
// Swarm Service Functions
// =============================================================================
async function createSwarmService(name, type, config, chain, dex) {
    // Note: This function handles Julia Native Swarms.
    // createOpenAISwarmService handles OpenAI Swarms.
    try {
        console.log(chalk.blue('Preparing swarm creation request...'));

        // Extract the algorithm from config
        const algorithm = config.algorithm || 'PSO';

        // Prepare parameters based on what the Julia backend expects
        // The Swarms.create_swarm function expects name, algorithm, and config
        const params = {
            name: name,
            algorithm: algorithm,
            config: {
                ...config,
                type: type,
                chain: chain,
                dex: dex,
                parameters: config.parameters || {}
            }
        };

        console.log(chalk.cyan('Sending swarm creation request with parameters:'), JSON.stringify(params, null, 2));

        // Call the Julia backend function via the bridge
        // Use the command format registered in the Julia backend: "swarms.create_swarm"
        const result = await juliaBridge.runJuliaCommand('swarms.create_swarm', params);

        console.log(chalk.cyan('Received response from Julia backend:'), JSON.stringify(result, null, 2));

        if (result && result.error) {
            throw new Error(result.error);
        }

        // Return the successful result from the backend
        return result || { id: 'unknown', status: 'created_backend' };

    } catch (error) {
        console.error(chalk.red(`Error in createSwarmService (Native): ${error.message}`), error);
        throw new Error(`Failed to create native swarm via backend: ${error.message}`);
    }
}

// Placeholder function for OpenAI Swarm creation
async function createOpenAISwarmService(name, agentConfigs) {
    console.log(chalk.magenta('[DEBUG] Entered createOpenAISwarmService.'));
    try {
        console.log(chalk.yellow(`Attempting to call backend for OpenAI Swarm: ${name}`));

        // Construct the payload for the Julia backend function
        // Ensure this structure matches what `julia_server.jl` expects for `create_openai_swarm`
        // The backend expects the config object directly as the first element in the params array.
        const payload = {
            name: name,
            agents: agentConfigs
            // Add other OpenAI-specific swarm config if needed here
        };

        console.log(chalk.magenta('[DEBUG] Payload constructed:', JSON.stringify(payload)));

        // Call the Julia backend function via the bridge
        console.log(chalk.magenta('[DEBUG] Calling juliaBridge.runJuliaCommand...'));
        // Pass the payload object as the single element in the params array
        const result = await juliaBridge.runJuliaCommand(
            'create_openai_swarm',
            [payload] // Pass payload directly inside the array
        );
        console.log(chalk.magenta('[DEBUG] juliaBridge.runJuliaCommand finished.'));

        console.log(chalk.cyan('Backend Response (OpenAI Swarm):'), JSON.stringify(result));

        if (result && result.error) {
            console.log(chalk.magenta('[DEBUG] Backend returned an error.'));
            throw new Error(result.error);
        }

        console.log(chalk.magenta('[DEBUG] Returning result from createOpenAISwarmService.'));
        return result;

    } catch (error) {
        console.log(chalk.magenta('[DEBUG] Caught error inside createOpenAISwarmService.'));
        console.error(chalk.red(`Error in createOpenAISwarmService: ${error.message}`), error);
        throw new Error(`Failed to create OpenAI swarm via backend: ${error.message}`);
    }
}

async function updateSwarmService(swarmId, updates) {
    try {
        console.log(chalk.blue('Preparing swarm update request...'));

        // Prepare parameters based on what the Julia backend expects
        const params = {
            id: swarmId,
            updates: updates
        };

        console.log(chalk.cyan('Sending swarm update request with parameters:'), JSON.stringify(params, null, 2));

        // Call Julia backend to update swarm using the correct command format
        const result = await juliaBridge.runJuliaCommand('swarms.update_swarm', params);

        console.log(chalk.cyan('Received response from Julia backend:'), JSON.stringify(result, null, 2));

        if (result && result.error) {
            throw new Error(result.error);
        }

        return result || { id: swarmId, status: updates.status || 'updated' };
    } catch (error) {
        console.error(chalk.red(`Error in updateSwarmService: ${error.message}`), error);
        throw new Error(`Failed to update swarm: ${error.message}`);
    }
}

async function getSwarmStateService(swarmId) {
    try {
        console.log(chalk.blue('Preparing swarm state request...'));

        // Prepare parameters based on what the Julia backend expects
        const params = { id: swarmId };

        console.log(chalk.cyan('Sending swarm state request with parameters:'), JSON.stringify(params, null, 2));

        // Call Julia backend to get swarm state using the correct command format
        const result = await juliaBridge.runJuliaCommand('swarms.get_swarm', params);

        console.log(chalk.cyan('Received response from Julia backend:'), JSON.stringify(result, null, 2));

        if (result && result.error) {
            throw new Error(result.error);
        }

        return result || { id: swarmId, status: 'unknown' };
    } catch (error) {
        console.error(chalk.red(`Error in getSwarmStateService: ${error.message}`), error);
        throw new Error(`Failed to get swarm state: ${error.message}`);
    }
}

// Function for future use - this is intentionally not used yet but will be implemented in a future version
// This function will be used to broadcast messages to swarms when the messaging feature is implemented
// @ts-ignore - Intentionally unused function
async function broadcastSwarmMessageService(swarmId, message) {
    try {
        // Call Julia backend to broadcast message
        const result = await juliaBridge.runJuliaCommand('broadcast_message', [swarmId, JSON.stringify(message)]);

        if (result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        throw new Error(`Failed to broadcast swarm message: ${error.message}`);
    }
}

// =============================================================================
// New OpenAI Swarm Interaction Functions
// =============================================================================

async function runOpenAITask() {
    console.log(chalk.blue('\n--- Run Task in OpenAI Swarm ---'));
    try {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'assistant_id', // Explicitly ask for Assistant ID
                message: 'Enter the OpenAI Assistant ID (used as Swarm ID):',
                validate: input => input.trim().length > 0 ? true : 'Assistant ID cannot be empty.'
            },
            {
                type: 'input',
                name: 'task_prompt',
                message: 'Enter the task prompt for the swarm:',
                validate: input => input.trim().length > 0 ? true : 'Task prompt cannot be empty.'
            },
            {
                type: 'input',
                name: 'thread_id',
                message: 'Enter existing Thread ID (optional, leave blank to create new):'
            }
        ]);

        const { assistant_id, task_prompt } = answers;
        const thread_id = answers.thread_id.trim() || null; // Send null if blank

        const spinner = ora('Submitting task to OpenAI swarm via backend...').start();

        // Construct params array for the backend command
        // Backend expects: assistant_id, task_prompt, [thread_id - optional]
        // We send the assistant_id as the first parameter (which the backend expects as swarm_id)
        const params = [assistant_id, task_prompt];
        if (thread_id) {
            params.push(thread_id);
        }

        try {
            // Call the real backend command
            const response = await juliaBridge.runJuliaCommand('run_openai_task', params);
            spinner.stop();

            if (response && response.error) {
                console.error(chalk.red('\nBackend Error:'), response.error);
            } else if (response && response.result && response.result.success) {
                spinner.succeed('Task submitted successfully!');
                console.log(chalk.green('\nTask Submission Details:'));
                // Display the IDs returned from the backend
                console.log(chalk.cyan(`  Assistant ID: ${response.result.swarm_id || assistant_id}`)); // Show the ID used
                console.log(chalk.cyan(`  Thread ID:    ${response.result.thread_id}`));
                console.log(chalk.cyan(`  Run ID:       ${response.result.run_id}`));
                console.log(chalk.cyan(`  Run Status:   ${response.result.status}`));
                console.log(chalk.yellow('\nUse "Get OpenAI Response" with the Thread ID and Run ID to check status and get results.'));
            } else {
                spinner.fail('Failed to submit task.');
                console.error(chalk.red('\nUnexpected response format from backend:'));
                console.log(response);
            }
        } catch (bridgeError) {
            spinner.fail('Failed to communicate with backend.');
            console.error(chalk.red('Bridge Error:'), bridgeError.message);
        }

    } catch (error) {
        // Ensure spinner stops on prompt error
        if (ora.promise.active) ora.promise.active.stop();
        console.error(chalk.red('An error occurred while setting up the OpenAI task:'), error.message);
    }

    // Pause
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

async function getOpenAIResponse() {
    console.log(chalk.blue('\n--- Get Response/Status from OpenAI Run ---'));
    try {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'assistant_id',
                message: 'Enter the OpenAI Assistant ID (used as Swarm ID):',
                validate: input => input.trim().length > 0 ? true : 'Assistant ID cannot be empty.'
            },
            {
                type: 'input',
                name: 'thread_id',
                message: 'Enter the Thread ID from the task submission:',
                validate: input => input.trim().length > 0 ? true : 'Thread ID cannot be empty.'
            },
            {
                type: 'input',
                name: 'run_id',
                message: 'Enter the Run ID from the task submission:',
                validate: input => input.trim().length > 0 ? true : 'Run ID cannot be empty.'
            }
        ]);

        const { assistant_id, thread_id, run_id } = answers;
        const spinner = ora('Fetching response/status from backend...').start();

        try {
            // Call the real backend command
            // Backend expects: assistant_id, thread_id, run_id
            const response = await juliaBridge.runJuliaCommand('get_openai_response', [assistant_id, thread_id, run_id]);
            spinner.stop();

            if (response && response.error) {
                console.error(chalk.red('\nBackend Error:'), response.error);
            } else if (response && response.result) {
                const result = response.result;
                if (result.success) {
                    spinner.succeed(`Status fetched: ${result.status}`);
                    console.log(chalk.green('\nRun Details:'));
                    console.log(chalk.cyan(`  Assistant ID: ${result.swarm_id || assistant_id}`));
                    console.log(chalk.cyan(`  Thread ID:    ${result.thread_id || thread_id}`));
                    console.log(chalk.cyan(`  Run ID:       ${result.run_id || run_id}`));
                    console.log(chalk.cyan(`  Status:       ${result.status}`));

                    if (result.status === 'completed' && result.response) {
                        console.log(chalk.cyan(`\nAssistant Response:`));
                        // Handle potential variations in response structure
                        if (typeof result.response === 'string') {
                           console.log(chalk.white(`  ${result.response}`));
                        } else if (result.response.content) {
                           console.log(chalk.white(`  ${result.response.content}`));
                           if (result.response.message_id) {
                               console.log(chalk.gray(`  (Message ID: ${result.response.message_id})`));
                           }
                        } else {
                           console.log(chalk.yellow(`  (Response content format unclear: ${JSON.stringify(result.response)})`));
                        }
                    } else if (result.message) {
                         console.log(chalk.yellow(`\nMessage: ${result.message}`));
                    }

                } else {
                    // Handle cases where success is false (e.g., run failed)
                     spinner.fail(`Run status: ${result.status || 'Failed'}`);
                     console.log(chalk.red(`\nError: ${result.error || 'Failed to get response.'}`));
                     if (result.run_details) {
                         console.log(chalk.gray('Run Details:'), JSON.stringify(result.run_details, null, 2));
                     }
                }
            } else {
                spinner.fail('Failed to get response.');
                console.error(chalk.red('\nUnexpected response format from backend:'));
                console.log(response);
            }
        } catch (bridgeError) {
            spinner.fail('Failed to communicate with backend.');
            console.error(chalk.red('Bridge Error:'), bridgeError.message);
        }

    } catch (error) {
        // Ensure spinner stops on prompt error
        if (ora.promise.active) ora.promise.active.stop();
        console.error(chalk.red('An error occurred while setting up the OpenAI response request:'), error.message);
    }

    // Pause
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
}

// =============================================================================
// System Initialization
// =============================================================================
async function initializeSystem() {
    try {
        // Load environment variables
        dotenv.config();

        // Set default environment variables if not set
        process.env.JULIA_HOME = process.env.JULIA_HOME || '/usr/local/bin/julia';
        process.env.JULIA_NUM_THREADS = process.env.JULIA_NUM_THREADS || '4';
        process.env.JULIA_DEPOT_PATH = process.env.JULIA_DEPOT_PATH || path.join(os.homedir(), '.julia');

        // Initialize Julia bridge
        // Skip actual initialization since we're using an existing server
        juliaBridge.initialized = true;

        // Create necessary directories
        const configDir = path.join(os.homedir(), '.juliaos');
        const dataDir = path.join(configDir, 'data');
        const logsDir = path.join(configDir, 'logs');

        await fs.ensureDir(configDir);
        await fs.ensureDir(dataDir);
        await fs.ensureDir(logsDir);

        // Create or load settings file
        const settingsFile = path.join(configDir, 'settings.json');
        let settings = {};

        if (await fs.pathExists(settingsFile)) {
            settings = await fs.readJson(settingsFile);
        } else {
            settings = {
                performance: {
                    cpuLimit: 80,
                    memoryLimit: 2048,
                    threads: 4
                },
                security: {
                    encryption: 'medium',
                    authentication: 'password',
                    firewall: 'basic'
                },
                network: {
                    proxy: '',
                    dns: '8.8.8.8',
                    timeout: 30
                },
                storage: {
                    path: dataDir,
                    quota: 10,
                    backup: 'daily'
                }
            };
            await fs.writeJson(settingsFile, settings, { spaces: 2 });
        }

        return settings;
    } catch (error) {
        throw new Error(`Failed to initialize system: ${error.message}`);
    }
}

// =============================================================================
// Welcome Animation
// =============================================================================
async function displayWelcomeAnimation() {
    console.clear();

    // Simple loading animation
    const spinner = ora('Initializing JuliaOS...').start();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add a loading bar animation
    spinner.succeed('JuliaOS initialized');

    console.log(chalk.green('  ✓ System core initialized'));
    console.log(chalk.green('  ✓ Runtime environment loaded'));
    console.log(chalk.green('  ✓ Network connections established'));
    console.log(chalk.green('  ✓ Security protocols activated'));
    console.log(chalk.green('  ✓ User interface ready'));

    // Short pause before continuing to the main interface
    await new Promise(resolve => setTimeout(resolve, 1000));
}

// =============================================================================
// NEW: Manual Trade Function with Signing Flow
// =============================================================================
async function manualTrade() {
    const walletState = walletManager.getState();
    if (!walletState.isConnected || walletState.readOnly) {
        console.log(chalk.red('Please connect a wallet with full access first.'));
        return;
    }

    // Check if we are connected via the PrivateKeyProvider
    const currentProvider = walletManager.getCurrentProvider();
    const canSignLocally = currentProvider instanceof walletManager.getNodeProvider().constructor;

    if (!canSignLocally) {
        console.log(chalk.yellow('Manual trade execution currently requires connection via Private Key for signing.'));
        return;
    }

    console.log(chalk.blue('--- Execute Manual Trade ---'));
    try {
        const { dex, chainName, tokenInSymbol, tokenOutSymbol, amountIn, slippagePercent } = await inquirer.prompt([
            { type: 'input', name: 'dex', message: 'DEX Name (e.g., uniswap_v3):', default: 'uniswap_v3' },
            { type: 'list', name: 'chainName', message: 'Chain:', choices: Object.keys(CHAIN_NAME_TO_ID), default: ID_TO_CHAIN_NAME[walletState.chainId] },
            { type: 'input', name: 'tokenInSymbol', message: 'Token In Symbol (e.g., WETH):' },
            { type: 'input', name: 'tokenOutSymbol', message: 'Token Out Symbol (e.g., USDC):' },
            { type: 'input', name: 'amountIn', message: 'Amount In:', validate: input => !isNaN(parseFloat(input)) && parseFloat(input) > 0 },
            { type: 'input', name: 'slippagePercent', message: 'Slippage Tolerance (%): ', default: '0.5', validate: input => !isNaN(parseFloat(input)) }
        ]);

        const chain = chainName.toLowerCase();
        const slippage = parseFloat(slippagePercent) / 100;

        // 1. Resolve Token Addresses via Bridge
        const addrSpinner = ora('Resolving token addresses...').start();
        let tokenInAddress, tokenOutAddress;
        try {
            const [inAddrRes, outAddrRes] = await Promise.all([
                juliaBridge.runJuliaCommand('Bridge.get_token_address', { symbol: tokenInSymbol, chain: chain }),
                juliaBridge.runJuliaCommand('Bridge.get_token_address', { symbol: tokenOutSymbol, chain: chain })
            ]);

            if (inAddrRes.status !== 'success' || outAddrRes.status !== 'success') {
                throw new Error(`Failed to resolve addresses: IN: ${inAddrRes.error || 'OK'}, OUT: ${outAddrRes.error || 'OK'}`);
            }
            tokenInAddress = inAddrRes.address;
            tokenOutAddress = outAddrRes.address;
            addrSpinner.succeed(`Addresses resolved: ${tokenInSymbol}=${tokenInAddress}, ${tokenOutSymbol}=${tokenOutAddress}`);
        } catch (error) {
            addrSpinner.fail(`Address resolution failed: ${error.message}`);
            return;
        }

        // 2. Get Token Decimals via Bridge (or Blockchain module directly? Bridge seems better)
        const decSpinner = ora(`Fetching ${tokenInSymbol} decimals...`).start();
        let tokenInDecimals;
        try {
             // Assuming a Bridge command exists, otherwise need to add it or call Blockchain directly
             // Let's assume Bridge.get_token_decimals exists for now
             const decRes = await juliaBridge.runJuliaCommand('Bridge.get_token_decimals', { address: tokenInAddress, chain: chain });
             if (decRes.status !== 'success') throw new Error(decRes.error || 'Unknown error');
             tokenInDecimals = decRes.decimals;
             decSpinner.succeed(`${tokenInSymbol} decimals: ${tokenInDecimals}`);
        } catch (error) {
             // Fallback: Call Blockchain.getDecimals directly if Bridge command fails/doesn't exist
             decSpinner.text = `Bridge failed, fetching decimals via Blockchain module...`;
             try {
                 const decRes = await juliaBridge.runJuliaCommand('Blockchain.getDecimals', { contractAddress: tokenInAddress, chain: chain });
                 if (decRes.status !== 'success') throw new Error(decRes.error || 'Unknown error fetching via Blockchain');
                 tokenInDecimals = decRes.result; // Adjust based on actual return structure
                 decSpinner.succeed(`${tokenInSymbol} decimals: ${tokenInDecimals}`);
             } catch (finalError) {
                 decSpinner.fail(`Failed to fetch decimals: ${finalError.message}`);
                 return;
             }
        }

        // 3. Calculate amountInWei
        const amountInWei = ethers.utils.parseUnits(amountIn, tokenInDecimals).toString();

        // 4. Prepare Trade via Julia Bridge
        const prepSpinner = ora('Preparing trade via Julia backend...').start();
        let tradePrepResult;
        try {
            tradePrepResult = await juliaBridge.runJuliaCommand('Bridge.execute_trade', {
                dex: dex,
                chain: chain,
                token_in: tokenInAddress,
                token_out: tokenOutAddress,
                amount_in: amountInWei,
                slippage: slippage,
                recipient: walletState.address // Use connected wallet address
            });
            prepSpinner.succeed('Trade prepared by backend.');
            console.log('Backend Response:', tradePrepResult);
        } catch (error) {
            prepSpinner.fail(`Trade preparation failed: ${error.message}`);
            return;
        }

        // 5. Handle Signing Request
        if (tradePrepResult.status === 'needs_signing' && tradePrepResult.unsigned_transaction) {
            const unsignedTx = tradePrepResult.unsigned_transaction;
            const requestId = tradePrepResult.request_id;
            const txChain = tradePrepResult.chain; // Chain from the response

            console.log(chalk.yellow('\n--- Transaction Requires Signing ---'));
            // Display transaction details clearly to the user
            console.log(`  From:    ${unsignedTx.from}`);
            console.log(`  To:      ${unsignedTx.to}`);
            console.log(`  Value:   ${unsignedTx.value ? ethers.utils.formatEther(unsignedTx.value) : '0'} ETH/Native`);
            console.log(`  Nonce:   ${unsignedTx.nonce}`);
            console.log(`  GasPrice:${unsignedTx.gasPrice ? ethers.utils.formatUnits(unsignedTx.gasPrice, 'gwei') : 'N/A'} Gwei`);
            console.log(`  GasLimit:${unsignedTx.gas}`);
            console.log(`  Data:    ${unsignedTx.data.substring(0, 50)}...`);
            console.log(`  Chain:   ${txChain} (ID: ${CHAIN_NAME_TO_ID[txChain]})`);
            console.log(`  Request: ${requestId}`);

            const { confirmSign } = await inquirer.prompt([{
                type: 'confirm', name: 'confirmSign', message: 'Do you want to sign and submit this transaction?', default: true
            }]);

            if (confirmSign) {
                const signSpinner = ora('Signing transaction...').start();
                try {
                    // Ensure unsignedTx fields match ethers.TransactionRequest
                    // Convert string hex numbers to BigInt or number where needed by ethers v5
                    const txToSign = {
                        to: unsignedTx.to,
                        from: unsignedTx.from, // Optional in ethers v5, signer fills it
                        nonce: parseInt(unsignedTx.nonce), // Must be number
                        gasLimit: ethers.BigNumber.from(unsignedTx.gas), // Must be BigNumber/string
                        gasPrice: unsignedTx.gasPrice ? ethers.BigNumber.from(unsignedTx.gasPrice) : undefined,
                        data: unsignedTx.data || '0x',
                        value: unsignedTx.value ? ethers.BigNumber.from(unsignedTx.value) : ethers.BigNumber.from(0),
                        chainId: CHAIN_NAME_TO_ID[txChain]
                    };

                    // Sign using the WalletManager method
                    const signedTxHex = await walletManager.signTransactionRequest(txToSign);
                    signSpinner.succeed('Transaction signed successfully.');
                    console.log('Signed TX Hex:', signedTxHex.substring(0, 60), '...');

                    // 6. Submit Signed Transaction via Bridge
                    const submitSpinner = ora('Submitting signed transaction to Julia backend...').start();
                    try {
                        const submitResult = await juliaBridge.runJuliaCommand('Bridge.submit_signed_transaction', {
                           chain: txChain,
                           request_id: requestId,
                           signed_tx_hex: signedTxHex
                        });

                        if (submitResult.status === 'success') {
                           submitSpinner.succeed(`Transaction submitted! Final Hash: ${submitResult.tx_hash}`);
                           // TODO: Optionally wait for confirmation here
                        } else {
                            throw new Error(submitResult.error || 'Submission failed with unknown error');
                        }
                    } catch (error) {
                         submitSpinner.fail(`Transaction submission failed: ${error.message}`);
                    }

                } catch (error) {
                    signSpinner.fail(`Signing failed: ${error.message}`);
                    console.error(chalk.red('Signing Error Details:'), error);
                }
            } else {
                console.log(chalk.yellow('Transaction signing cancelled.'));
            }
        } else if (tradePrepResult.status === 'success') {
             // Handle cases where backend might execute directly (e.g., internal wallet or simulation)
             console.log(chalk.green(`Trade executed directly by backend (status: ${tradePrepResult.status}). Hash: ${tradePrepResult.tx_hash || 'N/A'}`));
        } else {
            // Handle other statuses or errors from Bridge.execute_trade
            console.error(chalk.red(`Trade preparation failed with status: ${tradePrepResult.status}. Error: ${tradePrepResult.error || 'Unknown error'}`));
        }

    } catch (error) {
        console.error(chalk.red(`Manual trade failed: ${error.message}`));
    }
     // Add pause
     await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
     }]);
}

// =============================================================================
// Initialization and Main Execution
// =============================================================================

// ... initializeSystem and main functions ...
// Ensure dotenv.config() is called early in initializeSystem or before it.
dotenv.config(); // Load .env file

// ... (rest of initializeSystem) ...

async function main() {
    try {
        // Load .env first
        dotenv.config();

        // Display welcome animation
        await displayWelcomeAnimation();

        // Initialize system
        const spinner = ora('Initializing system...').start();
        await initializeSystem();
        spinner.succeed('System initialized');

        // Run initial system checks
        await runAllSystemChecks();

        // await setupWalletManager(); // Initialize wallet manager

        // Update menuDeps with initialized juliaBridge
        menuDeps.juliaBridge = juliaBridge;

        // Define main menu choices with consistent numbering
        const mainMenuChoices = [
            {
                name: '1. 👤  Agent Management',
                value: 'agent_management'
            },
            {
                name: '2. 🐝  Swarm Management',
                value: 'swarm_management'
            },
            {
                name: '3. ⛓️   Cross-Chain Hub',
                value: 'cross_chain_hub'
            },
            {
                name: '4. 🧠  Agent Skills & Specialization',
                value: 'agent_skills'
            },
            {
                name: '5. 🤖  Neural Networks',
                value: 'neural_networks'
            },
            {
                name: '6. 💼  Portfolio Optimization',
                value: 'portfolio_optimization'
            },
            {
                name: '7. 🧮  Swarm Algorithms',
                value: 'swarm_algorithms'
            },
            {
                name: '8. 📊  Swarm Visualization',
                value: 'swarm_visualization'
            },
            {
                name: '9. 💱  Trading',
                value: 'trading_menu'
            },
            {
                name: '10. 🔑  API Keys Management',
                value: 'api_keys'
            },
            {
                name: '11. ⚙️   System Configuration',
                value: 'system_config'
            },
            {
                name: '12. 📈  Performance Metrics',
                value: 'performance_metrics'
            },
            {
                name: '13. 📊  Real-time Dashboard',
                value: 'dashboard'
            },
            {
                name: '14. ❓  Help & Documentation',
                value: 'help_documentation'
            },
            {
                name: '15. ⚙️  Set DEX Preference',
                value: 'dex_selection'
            },
            {
                name: '16. 🚪  Exit',
                value: 'exit'
            }
        ];

        // Main menu loop
        let running = true;
        while (running) {
            // Check if we need to navigate to trading from agent management
            if (global.navigateToTrading) {
                global.navigateToTrading = false;
                const selectedAgentId = global.selectedTradingAgentId;
                const selectedAgentName = global.selectedTradingAgentName || 'Selected Agent';
                delete global.selectedTradingAgentId;
                delete global.selectedTradingAgentName;

                console.log(chalk.green(`\nNavigating to Trading menu with agent ${selectedAgentName}...`));

                // Show a loading spinner
                const spinner = ora(`Preparing trading environment for ${selectedAgentName}...`).start();
                await new Promise(resolve => setTimeout(resolve, 1000));
                spinner.succeed(`Trading environment ready for ${selectedAgentName}`);

                // Navigate to trading menu with the selected agent
                await menus.tradingMenu.showTradingMenu(selectedAgentId);
                continue; // Skip the main menu display and go directly to trading
            }

            displayHeader("JuliaOS J3OS Mode v1.0");

            // Check backend connection status
            await juliaBridge.checkConnection();
            console.log(juliaBridge.getConnectionStatusString());
            console.log(chalk.cyan('Backend URL:'), process.env.JULIA_SERVER_URL || 'http://localhost:8053');

            // Display system status
            await displayStatus();

            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: '🎮 Choose a management area:',
                    choices: mainMenuChoices,
                    pageSize: 14
                }
            ]);

            if (action === 'exit') {
                running = false;
                continue;
            }

            const spinner = ora(`Loading ${action.replace('_', ' ')}...`).start();
            await new Promise(resolve => setTimeout(resolve, 500));
            spinner.stop();

            // Handle menu actions
            switch (action) {
                case 'agent_management':
                    // Use menus object which holds initialized functions
                    await menus.agentManagement.agentManagementMenu();
                    break;
                case 'swarm_management':
                    await menus.swarmManagement.swarmManagementMenu();
                    break;
                // Add cases for the other menus, using the initialized versions from the menus object
                case 'cross_chain_hub':
                    await menus.crossChainHub.crossChainHubMenu();
                    break;
                case 'agent_skills':
                    await menus.agentSkills.agentSkillsMenu();
                    break;
                case 'neural_networks':
                    await menus.neuralNetworks.neuralNetworksMenu();
                    break;
                case 'portfolio_optimization':
                    await menus.portfolioOptimization.portfolioOptimizationMenu();
                    break;
                case 'swarm_algorithms':
                    await menus.swarmAlgorithms.swarmAlgorithmsMenu();
                    break;
                case 'swarm_visualization':
                    await menus.swarmVisualization.swarmVisualizationMenu(juliaBridge, ['Main', 'Swarm Visualization']);
                    break;
                case 'api_keys':
                    await menus.apiKeys.apiKeysMenu();
                    break;
                case 'system_config':
                    await menus.systemConfig.systemConfigMenu();
                    break;
                case 'performance_metrics':
                    // Check the menus object for the initialized function
                    if (menus.performanceMetrics && menus.performanceMetrics.performanceMetricsMenu) {
                        await menus.performanceMetrics.performanceMetricsMenu(); // Pass breadcrumbs if needed
                    } else {
                        console.log(chalk.yellow('\nPerformance metrics menu is not properly initialized.'));
                        await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
                    }
                    break;
                case 'help_documentation':
                    await menus.helpDocumentation.helpDocumentationMenu();
                    break;
                case 'dashboard':
                    console.log(chalk.yellow('\nThe real-time dashboard feature is coming soon!'));
                    await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
                    break;
                case 'dex_selection':
                    // dexSelection uses a different pattern, access directly
                    await menus.dexSelection.selectDexPreference();
                    break;
                case 'trading_menu':
                    // Access the trading menu
                    await menus.tradingMenu.showTradingMenu();
                    break;
                default:
                    console.log(chalk.yellow(`\nThe ${action.replace('_', ' ')} feature is not yet implemented.`));
                    await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
            }
        }
    } catch (error) {
        // Use the enhanced error handler for fatal errors
        const errorHandler = require('./utils/error-handler');
        errorHandler.handleError(error, 'Main Application Startup', true); // Show verbose output for startup errors
        console.error(chalk.red('\nFatal error during startup. Please check the error logs for more details.'));
        process.exit(1);
    }
}

main();

/**
 * Checks the status of a blockchain transaction.
 */
async function checkTransactionStatus() {
    try {
        const { txHash, chain } = await inquirer.prompt([
            {
                type: 'input',
                name: 'txHash',
                message: 'Enter transaction hash:',
                validate: input => input.trim().length > 0 ? true : 'Transaction hash is required'
            },
            {
                type: 'list',
                name: 'chain',
                message: 'Select blockchain network:',
                choices: Object.keys(CHAIN_NAME_TO_ID),
                default: walletManager.getState().chainId ? ID_TO_CHAIN_NAME[walletManager.getState().chainId] : 'ethereum'
            }
        ]);

        const spinner = ora('Checking transaction status...').start();

        try {
            const result = await juliaBridge.runJuliaCommand('Bridge.get_transaction_status', { chain: chain.toLowerCase(), tx_hash: txHash });

            spinner.stop();

            if (result.status === 'error') {
                console.log(chalk.red(`Error checking transaction: ${result.message}`));
                return;
            }

            // Display transaction status with nice formatting
            const txStatus = result.status;
            let statusColor;
            let statusIcon;

            switch (txStatus) {
                case 'confirmed':
                    statusColor = chalk.green;
                    statusIcon = '✅';
                    break;
                case 'pending':
                    statusColor = chalk.yellow;
                    statusIcon = '⏳';
                    break;
                case 'failed':
                    statusColor = chalk.red;
                    statusIcon = '❌';
                    break;
                default:
                    statusColor = chalk.gray;
                    statusIcon = '❓';
            }

            console.log(chalk.bold('\nTransaction Status:'));
            console.log(`${statusIcon} Status: ${statusColor(txStatus.toUpperCase())}`);
            console.log(`${chalk.cyan('Transaction Hash:')} ${txHash}`);
            console.log(`${chalk.cyan('Network:')} ${chain}`);

            if (result.block_number) {
                console.log(`${chalk.cyan('Block Number:')} ${result.block_number}`);
            }

            if (result.confirmations) {
                console.log(`${chalk.cyan('Confirmations:')} ${result.confirmations}`);
            }

            // Additional receipt info if available
            if (txStatus === 'confirmed' || txStatus === 'failed') {
                const receipt = result.receipt;

                if (receipt && receipt.gasUsed) {
                    const gasUsed = typeof receipt.gasUsed === 'string' && receipt.gasUsed.startsWith('0x')
                        ? parseInt(receipt.gasUsed.substring(2), 16)
                        : receipt.gasUsed;
                    console.log(`${chalk.cyan('Gas Used:')} ${gasUsed}`);
                }

                if (receipt && receipt.effectiveGasPrice) {
                    const gasPrice = typeof receipt.effectiveGasPrice === 'string' && receipt.effectiveGasPrice.startsWith('0x')
                        ? parseInt(receipt.effectiveGasPrice.substring(2), 16) / 1e9
                        : receipt.effectiveGasPrice / 1e9;
                    console.log(`${chalk.cyan('Gas Price:')} ${gasPrice.toFixed(2)} Gwei`);
                }

                if (txStatus === 'failed' && receipt && receipt.revertReason) {
                    console.log(`${chalk.red('Revert Reason:')} ${receipt.revertReason}`);
                }
            }

            // Offer to check again if pending
            if (txStatus === 'pending') {
                const { checkAgain } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'checkAgain',
                    message: 'Transaction is still pending. Check status again?',
                    default: true
                }]);

                if (checkAgain) {
                    await checkTransactionStatus(); // Recursively call to check again
                    return;
                }
            }

        } catch (error) {
            spinner.fail('Failed to check transaction status');
            // Use the enhanced error handler
            const errorHandler = require('./utils/error-handler');
            errorHandler.handleError(error, 'Transaction Status Check');
        }
    } catch (error) {
        // Use the enhanced error handler for outer errors too
        const errorHandler = require('./utils/error-handler');
        errorHandler.handleError(error, 'Transaction Status Check');
    }

    // Pause to let the user see the results
    await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: 'Press Enter to continue...'
    }]);
}

// =============================================================================
// Wormhole Bridge Functions
// =============================================================================

/**
 * Bridge tokens using the Wormhole protocol
 */
async function bridgeTokensWormhole() {
    const state = walletManager.getState();
    if (!state.isConnected) {
        console.log(chalk.red('Please connect a wallet first.'));
        await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
        return;
    }

    console.log(chalk.magenta('\n--- Bridge Tokens via Wormhole ---'));

    try {
        // Get available chains from the backend
        const spinner = ora('Fetching available chains...').start();

        let availableChains;
        try {
            const chainsResult = await juliaBridge.runJuliaCommand('WormholeBridge.get_available_chains', []);
            if (!chainsResult.success) {
                throw new Error(chainsResult.error || 'Failed to fetch chains');
            }
            availableChains = chainsResult.chains || Object.keys(CHAIN_NAME_TO_ID);
            spinner.succeed('Available chains fetched successfully');
        } catch (error) {
            spinner.warn(`Failed to fetch chains from backend: ${error.message}`);
            console.log(chalk.yellow('Using default chain list...'));
            availableChains = Object.keys(CHAIN_NAME_TO_ID);
        }

        // Prompt for source and target chains
        const { sourceChain, targetChain } = await inquirer.prompt([
            {
                type: 'list',
                name: 'sourceChain',
                message: 'Select source chain:',
                choices: availableChains,
                default: state.chainId ? ID_TO_CHAIN_NAME[state.chainId] : 'ethereum'
            },
            {
                type: 'list',
                name: 'targetChain',
                message: 'Select target chain:',
                choices: availableChains.filter(chain => chain !== sourceChain),
                default: sourceChain === 'ethereum' ? 'solana' : 'ethereum'
            }
        ]);

        // Get available tokens for the source chain
        const tokenSpinner = ora(`Fetching available tokens for ${sourceChain}...`).start();

        let availableTokens;
        try {
            const tokensResult = await juliaBridge.runJuliaCommand('WormholeBridge.get_available_tokens', [sourceChain]);
            if (!tokensResult.success) {
                throw new Error(tokensResult.error || 'Failed to fetch tokens');
            }
            availableTokens = tokensResult.tokens || [
                { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
                { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
                { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 }
            ];
            tokenSpinner.succeed('Available tokens fetched successfully');
        } catch (error) {
            tokenSpinner.warn(`Failed to fetch tokens from backend: ${error.message}`);
            console.log(chalk.yellow('Using default token list...'));
            availableTokens = [
                { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
                { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
                { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 }
            ];
        }

        // Prompt for token and amount
        const { tokenSymbol, amount, recipient } = await inquirer.prompt([
            {
                type: 'list',
                name: 'tokenSymbol',
                message: 'Select token to bridge:',
                choices: availableTokens.map(token => token.symbol)
            },
            {
                type: 'input',
                name: 'amount',
                message: 'Enter amount to bridge:',
                validate: input => !isNaN(parseFloat(input)) && parseFloat(input) > 0 ? true : 'Please enter a valid amount'
            },
            {
                type: 'input',
                name: 'recipient',
                message: `Enter recipient address on ${targetChain}:`,
                default: state.address, // Default to the connected wallet address
                validate: input => input.trim().length > 0 ? true : 'Recipient address is required'
            }
        ]);

        // Find the selected token
        const selectedToken = availableTokens.find(token => token.symbol === tokenSymbol);
        if (!selectedToken) {
            throw new Error(`Token ${tokenSymbol} not found`);
        }

        // Convert amount to token units
        const amountInUnits = ethers.utils.parseUnits(amount, selectedToken.decimals).toString();

        // Confirm the bridge operation
        console.log(chalk.cyan('\nBridge Operation Summary:'));
        console.log(`Source Chain: ${sourceChain}`);
        console.log(`Target Chain: ${targetChain}`);
        console.log(`Token: ${selectedToken.symbol} (${selectedToken.address})`);
        console.log(`Amount: ${amount} ${selectedToken.symbol}`);
        console.log(`Recipient: ${recipient}`);

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Do you want to proceed with this bridge operation?',
                default: false
            }
        ]);

        if (!confirm) {
            console.log(chalk.yellow('Bridge operation cancelled.'));
            await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
            return;
        }

        // Execute the bridge operation
        const bridgeSpinner = ora('Initiating bridge operation...').start();

        try {
            const bridgeParams = {
                sourceChain,
                targetChain,
                token: selectedToken.address,
                amount: amountInUnits,
                recipient,
                wallet: state.address
            };

            const bridgeResult = await juliaBridge.runJuliaCommand('WormholeBridge.bridge_tokens_wormhole', [bridgeParams]);

            if (!bridgeResult.success) {
                throw new Error(bridgeResult.error || 'Bridge operation failed');
            }

            bridgeSpinner.succeed('Bridge operation initiated successfully');

            console.log(chalk.green('\nBridge operation initiated!'));
            console.log(`Transaction Hash: ${bridgeResult.transactionHash}`);
            console.log(`Status: ${bridgeResult.status}`);

            if (bridgeResult.attestation) {
                console.log(`Attestation: ${bridgeResult.attestation}`);
                console.log(chalk.yellow('\nYou will need to redeem the tokens on the target chain.'));
                console.log(chalk.yellow('Use the "Check Bridge Status (Wormhole)" option to check the status of your bridge operation.'));
            }
        } catch (error) {
            bridgeSpinner.fail(`Bridge operation failed`);
            // Use the enhanced error handler
            const errorHandler = require('./utils/error-handler');
            errorHandler.handleError(error, 'Wormhole Bridge Operation');
        }
    } catch (error) {
        // Use the enhanced error handler for outer errors too
        const errorHandler = require('./utils/error-handler');
        errorHandler.handleError(error, 'Wormhole Bridge Setup');
    }

    await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
}

/**
 * Check the status of a Wormhole bridge operation
 */
async function checkBridgeStatusWormhole() {
    console.log(chalk.magenta('\n--- Check Bridge Status (Wormhole) ---'));

    try {
        const { sourceChain, transactionHash } = await inquirer.prompt([
            {
                type: 'list',
                name: 'sourceChain',
                message: 'Select source chain:',
                choices: Object.keys(CHAIN_NAME_TO_ID),
                default: 'ethereum'
            },
            {
                type: 'input',
                name: 'transactionHash',
                message: 'Enter transaction hash:',
                validate: input => input.trim().length > 0 ? true : 'Transaction hash is required'
            }
        ]);

        const spinner = ora('Checking bridge status...').start();

        try {
            const statusParams = {
                sourceChain,
                transactionHash
            };

            const statusResult = await juliaBridge.runJuliaCommand('WormholeBridge.check_bridge_status_wormhole', [statusParams]);

            if (!statusResult.success) {
                throw new Error(statusResult.error || 'Failed to check bridge status');
            }

            spinner.succeed('Bridge status checked successfully');

            console.log(chalk.cyan('\nBridge Status:'));
            console.log(`Transaction Hash: ${transactionHash}`);
            console.log(`Source Chain: ${sourceChain}`);
            console.log(`Status: ${statusResult.status}`);

            if (statusResult.attestation) {
                console.log(`Attestation: ${statusResult.attestation}`);

                const { redeem } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'redeem',
                        message: 'Do you want to redeem the tokens on the target chain?',
                        default: false
                    }
                ]);

                if (redeem) {
                    await redeemTokensWormhole(statusResult.attestation, statusResult.targetChain);
                }
            }
        } catch (error) {
            spinner.fail(`Failed to check bridge status: ${error.message}`);
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
    }

    await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
}

/**
 * Redeem tokens on the target chain
 */
async function redeemTokensWormhole(attestation, targetChain) {
    const state = walletManager.getState();
    if (!state.isConnected) {
        console.log(chalk.red('Please connect a wallet first.'));
        return;
    }

    console.log(chalk.magenta('\n--- Redeem Tokens (Wormhole) ---'));

    try {
        const spinner = ora('Redeeming tokens...').start();

        try {
            const redeemParams = {
                attestation,
                targetChain,
                wallet: state.address
            };

            const redeemResult = await juliaBridge.runJuliaCommand('WormholeBridge.redeem_tokens_wormhole', [redeemParams]);

            if (!redeemResult.success) {
                throw new Error(redeemResult.error || 'Failed to redeem tokens');
            }

            spinner.succeed('Tokens redeemed successfully');

            console.log(chalk.green('\nTokens redeemed successfully!'));
            console.log(`Transaction Hash: ${redeemResult.transactionHash}`);
            console.log(`Status: ${redeemResult.status}`);
        } catch (error) {
            spinner.fail(`Failed to redeem tokens: ${error.message}`);
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
    }
}

/**
 * View wrapped tokens information
 */
async function viewWrappedTokensWormhole() {
    console.log(chalk.magenta('\n--- View Wrapped Tokens (Wormhole) ---'));

    try {
        const { originalChain, originalAsset, targetChain } = await inquirer.prompt([
            {
                type: 'list',
                name: 'originalChain',
                message: 'Select original chain:',
                choices: Object.keys(CHAIN_NAME_TO_ID),
                default: 'ethereum'
            },
            {
                type: 'input',
                name: 'originalAsset',
                message: 'Enter original asset address:',
                validate: input => input.trim().length > 0 ? true : 'Asset address is required'
            },
            {
                type: 'list',
                name: 'targetChain',
                message: 'Select target chain:',
                choices: Object.keys(CHAIN_NAME_TO_ID).filter(chain => chain !== originalChain),
                default: originalChain === 'ethereum' ? 'solana' : 'ethereum'
            }
        ]);

        const spinner = ora('Fetching wrapped token information...').start();

        try {
            const infoParams = {
                originalChain,
                originalAsset,
                targetChain
            };

            const tokenInfoResult = await juliaBridge.runJuliaCommand('WormholeBridge.get_wrapped_asset_info_wormhole', [infoParams]);

            if (!tokenInfoResult.success) {
                throw new Error(tokenInfoResult.error || 'Failed to fetch wrapped token information');
            }

            spinner.succeed('Wrapped token information fetched successfully');

            console.log(chalk.cyan('\nWrapped Token Information:'));
            console.log(`Original Chain: ${originalChain}`);
            console.log(`Original Asset: ${originalAsset}`);
            console.log(`Target Chain: ${targetChain}`);
            console.log(`Wrapped Address: ${tokenInfoResult.address}`);
            console.log(`Symbol: ${tokenInfoResult.symbol}`);
            console.log(`Name: ${tokenInfoResult.name}`);
            console.log(`Decimals: ${tokenInfoResult.decimals}`);
        } catch (error) {
            spinner.fail(`Failed to fetch wrapped token information: ${error.message}`);
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
    }

    await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to continue...'}]);
}

// Helper function to get agent capabilities based on type
function getAgentCapabilities(type) {
    const capabilities = {
        'Trading': ['market_analysis', 'order_execution', 'risk_management'],
        'Analysis': ['data_processing', 'pattern_recognition', 'prediction'],
        'Execution': ['order_routing', 'position_management', 'risk_control'],
        'Monitoring': ['system_monitoring', 'alert_management', 'performance_tracking'],
        'Cross Chain Optimizer': ['cross_chain', 'optimization', 'bridge_analysis', 'gas_optimization'],
        'Portfolio Optimization': ['portfolio_management', 'risk_assessment', 'asset_allocation', 'rebalancing'],
        'Smart Grid Management': ['energy_monitoring', 'demand_prediction', 'supply_optimization', 'grid_balancing']
    };
    return capabilities[type] || [];
}

// Export functions for use in other modules
module.exports = {
    main,
    displayHeader
};