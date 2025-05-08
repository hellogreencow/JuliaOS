# JuliaOS Open Source AI Agent & Swarm Framework


*joo-LEE-uh-oh-ESS* /ˈdʒuː.li.ə.oʊ.ɛs/

**Noun**
**A powerful multi-chain, community-driven framework for AI and Swarm technological innovation, powered by Julia.**

![JuliaOS Banner](./banner.png)

## Overview

JuliaOS is a comprehensive framework for building decentralized applications (DApps) with a focus on agent-based architectures, swarm intelligence, and cross-chain operations. It provides both a CLI interface for quick deployment and a framework API for custom implementations. By leveraging AI-powered agents and swarm optimization, JuliaOS enables sophisticated strategies across multiple blockchains.

## Documentation

- 📖 [Overview](https://juliaos.gitbook.io/juliaos-documentation-hub): Project overview and vision
- 🤝 [Partners](https://juliaos.gitbook.io/juliaos-documentation-hub/partners-and-ecosystems/partners): Partners & Ecosystems
  
### Technical

- 🚀 [Getting Started](https://juliaos.gitbook.io/juliaos-documentation-hub/technical/getting-started): Quick start guide
- 🏗️ [Architecture](https://juliaos.gitbook.io/juliaos-documentation-hub/technical/architecture): Architecture overview
- 🧑‍💻 [Developer Hub](https://juliaos.gitbook.io/juliaos-documentation-hub/developer-hub): For the developer
    
### Features

- 🌟 [Core Features & Concepts](https://juliaos.gitbook.io/juliaos-documentation-hub/features/core-features-and-concepts): Important features and fundamentals
- 🤖 [Agents](https://juliaos.gitbook.io/juliaos-documentation-hub/features/agents): Everything about Agents
- 🐝 [Swarms](https://juliaos.gitbook.io/juliaos-documentation-hub/features/swarms): Everything about Swarms
- 🧠 [Neural Networks](https://juliaos.gitbook.io/juliaos-documentation-hub/features/neural-networks): Everything about Neural Networks
- ⛓️ [Blockchains](https://juliaos.gitbook.io/juliaos-documentation-hub/features/blockchains-and-chains): All blockchains where you can find JuliaOS
- 🌉 [Bridges](https://juliaos.gitbook.io/juliaos-documentation-hub/features/bridges-cross-chain): Important bridge notes and information
- 🔌 [Integrations](https://juliaos.gitbook.io/juliaos-documentation-hub/features/integrations): All forms of integrations
- 💾 [Storage](https://juliaos.gitbook.io/juliaos-documentation-hub/features/storage): Different types of storage
- 👛 [Wallets](https://juliaos.gitbook.io/juliaos-documentation-hub/features/wallets): Supported wallets
- 🚩 [Use Cases](https://juliaos.gitbook.io/juliaos-documentation-hub/features/use-cases): All use cases and examples
- 🔵 [API](https://juliaos.gitbook.io/juliaos-documentation-hub/api-documentation/api-reference): Julia backend API reference



## Quick Start

### Prerequisites

#### Option 1: Using Docker (Recommended)

The easiest way to get started with JuliaOS is using Docker, which eliminates the need to install dependencies separately:

- [Docker](https://www.docker.com/products/docker-desktop/) (v20.10 or later recommended)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0 or later, included with Docker Desktop)

#### Option 2: Manual Installation

If you prefer to install dependencies manually:

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/) (v7 or later, comes with Node.js)
- [Julia](https://julialang.org/downloads/) (v1.10 or later recommended)
- [Python](https://www.python.org/downloads/) (v3.8 or later, optional for Python wrapper)

Make sure `node`, `julia`, and `python` commands are available in your system's PATH.

### Installation and Setup

#### Option 1: Quick Start with Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/Juliaoscode/JuliaOS.git
cd JuliaOS

# Run JuliaOS using the quick start script
chmod +x run-juliaos.sh
./run-juliaos.sh
```

That's it! This will build and start JuliaOS in Docker containers. The CLI will automatically connect to the Julia server.

#### Option 2: Manual Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Juliaoscode/JuliaOS.git
    cd JuliaOS
    ```

2.  **Install Node.js Dependencies:**
    This installs dependencies for the CLI, framework packages, bridge, etc.
    ```bash
    npm install
    ```
    *Troubleshooting: If you encounter errors, ensure you have Node.js v18+ and npm v7+. Deleting `node_modules` and `package-lock.json` before running `npm install` might help.*

3.  **Install Julia Dependencies:**
    This installs the necessary Julia packages for the backend server.
    ```bash
    # Navigate to the julia directory
    cd julia

    # Activate the Julia environment and install packages
    # This might take some time on the first run as it downloads and precompiles packages
    julia -e 'using Pkg; Pkg.activate("."); Pkg.update(); Pkg.instantiate()'

    # Navigate back to the root directory
    cd ..
    ```
    *Troubleshooting: Ensure Julia is installed and in your PATH. If `Pkg.instantiate()` fails, check your internet connection and Julia version compatibility (1.10+). Sometimes running `julia -e 'using Pkg; Pkg.update()'` inside the `julia` directory before `instantiate` can resolve issues.*

4.  **Install Python Dependencies (Optional):**
    If you want to use the Python wrapper, install the necessary Python packages.
    ```bash
    # Option 1: Install directly from GitHub (recommended)
    pip install git+https://github.com/Juliaoscode/JuliaOS.git#subdirectory=packages/python-wrapper

    # Option 2: Install with LLM support
    pip install "git+https://github.com/Juliaoscode/JuliaOS.git@23-04-max-fix#egg=juliaos[llm]&subdirectory=packages/python-wrapper"

    # Option 3: Install with Google ADK support
    pip install "git+https://github.com/Juliaoscode/JuliaOS.git@23-04-max-fix#egg=juliaos[adk]&subdirectory=packages/python-wrapper"

    # Option 4: For development (after cloning the repository)
    cd packages/python-wrapper
    pip install -e .
    cd ../..
    ```
    *Note: The `juliaos` package is NOT available on PyPI. You must install it using one of the methods above.*


    *Troubleshooting Direct GitHub Install (Options 1-3):*
    - Ensure Python 3.8+ and `pip` are installed and in your PATH.
    - Ensure `git` is installed and in your PATH.
    - **Verify the URL format is exactly as shown.** Do not use URLs containing `/tree/`.
    - Use quotes around the URL if your shell requires it (especially for URLs with `[...]` extras).
    - Check your network connection and ensure you can clone the GitHub repository manually.
    - If issues persist, use the **Development Install (Option 4)** below, which is generally more reliable.

    *Troubleshooting Development Install (Option 4):*
    - Ensure you have cloned the `JuliaOS` repository first.
    - Ensure you are running the `pip install -e .` command from within the `packages/python-wrapper` directory.
    - Using a Python virtual environment (`venv` or `conda`) is highly recommended.

5.  **Set Up Environment Variables:**
    Copy the example environment file and add your API keys/RPC URLs for full functionality.
    ```bash
    # Copy the root .env.example (contains keys for Julia backend, Python wrapper tests etc.)
    cp .env.example .env
    nano .env # Add your keys (OpenAI, RPC URLs etc.)

    # Alternatively, copy the example config file for Julia
    cp julia/config.example.toml julia/config.toml
    nano julia/config.toml # Edit with your configuration
    ```

    *Required keys for full functionality:*
    - `OPENAI_API_KEY`: For OpenAI integration
    - `ETHEREUM_RPC_URL`: For Ethereum blockchain interaction (get from [Infura](https://infura.io), [Alchemy](https://www.alchemy.com), or other providers)
    - `POLYGON_RPC_URL`: For Polygon blockchain interaction (get from [Infura](https://infura.io), [Alchemy](https://www.alchemy.com), or other providers)
    - `SOLANA_RPC_URL`: For Solana blockchain interaction (get from [QuickNode](https://www.quicknode.com), [Alchemy](https://www.alchemy.com), or use public endpoints with limitations)
    - `ARBITRUM_RPC_URL`: For Arbitrum blockchain interaction
    - `OPTIMISM_RPC_URL`: For Optimism blockchain interaction
    - `AVALANCHE_RPC_URL`: For Avalanche blockchain interaction
    - `BSC_RPC_URL`: For Binance Smart Chain interaction
    - `BASE_RPC_URL`: For Base blockchain interaction
    - `ARWEAVE_WALLET_FILE`: Path to your Arweave wallet file (for decentralized storage)
    - `ANTHROPIC_API_KEY`: For Claude integration
    - `COHERE_API_KEY`: For Cohere integration
    - `MISTRAL_API_KEY`: For Mistral integration
    - `GOOGLE_API_KEY`: For Gemini integration
    - `OPENROUTER_API_KEY`: For OpenRouter integration (access to multiple LLM providers through a unified API)

    Without these keys, certain functionalities will use mock implementations or have limited capabilities.

    **RPC URL Providers:**
    - **Ethereum/EVM Chains**: [Infura](https://infura.io), [Alchemy](https://www.alchemy.com), [QuickNode](https://www.quicknode.com), [Ankr](https://www.ankr.com)
    - **Solana**: [QuickNode](https://www.quicknode.com), [Alchemy](https://www.alchemy.com), [Helius](https://helius.xyz)

    Most providers offer free tiers that are sufficient for development and testing.

    6. (if not using Docker) Build the project. Run:
    ```bash
    npm run build
    ```

## Local machine deployment and running guide

** Use Git Bash or other Unix-like terminal for Windows users.**


**1. Clone the Repository:**

```bash
git clone --single-branch --branch 23-04-max-fix https://github.com/Juliaoscode/JuliaOS.git
cd JuliaOS
```

**2. Install Node.js Dependencies: This installs dependencies for the CLI, framework packages, bridge, etc.**

```bash
npm install --force
```

**3. Install Julia Dependencies: This installs the necessary Julia packages for the backend server.**

```bash
# Navigate to the julia directory
cd julia

# Activate the Julia environment and install packages
# This might take some time on the first run as it downloads and precompiles packages
julia -e 'using Pkg; Pkg.activate("."); Pkg.update(); Pkg.instantiate()'

# Navigate back to the root directory
cd ..
```

_Troubleshooting: Ensure Julia is installed and in your PATH. If Pkg.instantiate() fails, check your internet connection and Julia version compatibility (1.10+). Sometimes running julia -e 'using Pkg; Pkg.update()' inside the julia directory before instantiate can resolve issues._


**4. Install Python Dependencies (Optional): If you want to use the Python wrapper, install the necessary Python packages.**

```python
# Option 1: Install directly from GitHub (recommended)
pip install git+https://github.com/Juliaoscode/JuliaOS.git#subdirectory=packages/python-wrapper

# Option 2: Install with LLM support
pip install "git+https://github.com/Juliaoscode/JuliaOS.git@23-04-max-fix#egg=juliaos[llm]&subdirectory=packages/python-wrapper"

# Option 3: Install with Google ADK support
pip install "git+https://github.com/Juliaoscode/JuliaOS.git@23-04-max-fix#egg=juliaos[adk]&subdirectory=packages/python-wrapper"
```


#### Alternative: Start the Julia Server and Run the Interactive CLI in Two Separate Terminals:

** Run build command**
```bash
npm run build
```

**Terminal 1: Start the Julia Server**
```bash
# Navigate to the julia directory
cd julia/server

# Activate the Julia environment and install packages
# This might take some time on the first run as it downloads and precompiles packages
julia -e 'using Pkg; Pkg.activate("."); Pkg.instantiate()'

# Run the server script
julia --project=. julia_server.jl
```
*Wait until you see messages indicating the server has started (e.g., "Server started successfully on localhost:8052"). The server will initialize all modules and display their status.*

**Terminal 2: Run the Interactive CLI**
```bash
# Ensure you are in the project root directory (JuliaOS)
# If not, cd back to it

# Run the interactive CLI script
node scripts/interactive.cjs
```
*You should now see the JuliaOS CLI menu with options for Agent Management, Swarm Intelligence, Blockchain Operations, and more.*



## Architecture Overview

```mermaid
%%{init: {'theme': 'default'}}%%
%% Enhanced System Architecture Diagram with clearer definitions, grouping, and legend
flowchart TD
    %% User Interaction Layer
    subgraph "User Interaction"
        direction LR
        U1([End User via CLI])
        U2([Developer via SDK])
    end

    %% Client Layer - TypeScript/Node.js
    subgraph "Client Layer \n(TypeScript / Node.js)"
        direction TB
        CLI["Interactive CLI Script\n(scripts/interactive.cjs)\nuses packages/cli"]
        Framework["Framework Packages\n(packages/framework, core, wallets, etc.)"]
        PyWrapper["Python Wrapper\n(packages/python-wrapper)"]
        JSBridge["JS Bridge Client\n(packages/julia-bridge)"]

        CLI -->|"imports"| Framework
        U2 -->|"calls API"| Framework
        U2 -->|"calls"| PyWrapper
        Framework -->|"bridges to"| JSBridge
        PyWrapper -->|"bridges to"| JSBridge
    end

    %% Communication Layer
    subgraph "Communication Layer\n(WebSocket / HTTP)"
        direction TB
        BridgeComms["WebSocket / HTTP | Port 8052"]
    end

    %% Server Layer - Julia Backend
    subgraph "Server Layer \n(Julia Backend)"
        direction TB
        JuliaServer["Julia Server\n(julia_server.jl)"]
        JuliaBridge["Julia Bridge Server\n(src/Bridge.jl)"]

        subgraph "Core Modules (julia/src)"
            direction TB
            AS["AgentSystem.jl\n(Core orchestration)"]
            SwarmAlg["Swarms.jl\n(DE, PSO, GWO, ACO, GA, WOA)"]
            SwarmMgr["SwarmManager.jl\n(Execution & Scaling)"]
            Blockchain["Blockchain.jl\n(EVM interactions)"]
            DEX["DEX.jl\n(Uniswap V3 logic)"]
            Web3Store["Web3Storage.jl\n(Ceramic, IPFS)"]
            OpenAIAdapter["OpenAISwarmAdapter.jl\n(OpenAI API)"]
            SecurityMgr["SecurityManager.jl\n(Auth & Policy)"]
            UserModules["UserModules.jl\n(Custom logic)"]
        end

        JuliaServer -->|"receives"| JuliaBridge
        JuliaBridge -->|"dispatches to"| AS
        JuliaBridge -->|"dispatches to"| SwarmAlg
        JuliaBridge -->|"dispatches to"| SwarmMgr
        JuliaBridge -->|"dispatches to"| Blockchain
        JuliaBridge -->|"dispatches to"| DEX
        JuliaBridge -->|"dispatches to"| Web3Store
        JuliaBridge -->|"dispatches to"| OpenAIAdapter
        SwarmMgr --> DEX
        SwarmMgr --> Blockchain
    end

    %% External Services
    subgraph "External Services"
        direction TB
        RPC["Blockchain RPC Nodes\n(e.g., Infura, Alchemy)"]
        W3S["Web3.Storage API\n(IPFS Pinning)"]
        Ceramic["Ceramic Network Node"]
        OpenAIExt["OpenAI API"]
    end

    %% Connections
    U1 --> CLI
    JSBridge -- "sends/receives" --> BridgeComms
    BridgeComms -- "sends/receives" --> JuliaServer
    Blockchain -- interacts with --> RPC
    Web3Store -- interacts with --> W3S
    Web3Store -- interacts with --> Ceramic
    OpenAIAdapter -- interacts with --> OpenAIExt

    %% Styling
    classDef userLayer fill:#cdeaf2,stroke:#333,stroke-width:1px;
    classDef clientLayer fill:#d4f4fa,stroke:#333,stroke-width:1px;
    classDef commLayer fill:#fef4c1,stroke:#333,stroke-width:1px;
    classDef serverLayer fill:#fad4d4,stroke:#333,stroke-width:1px;
    classDef externalLayer fill:#d4f7d4,stroke:#333,stroke-width:1px;
    class U1,U2 userLayer;
    class CLI,Framework,PyWrapper,JSBridge clientLayer;
    class BridgeComms commLayer;
    class JuliaServer,JuliaBridge,AS,SwarmAlg,SwarmMgr,Blockchain,DEX,Web3Store,OpenAIAdapter,SecurityMgr,UserModules serverLayer;
    class RPC,W3S,Ceramic,OpenAIExt externalLayer;
```
## 🧑‍🤝‍🧑 Community & Contribution

JuliaOS is an open-source project, and we welcome contributions from the community! Whether you're a developer, a researcher, or an enthusiast in decentralized technologies, AI, and blockchain, there are many ways to get involved.

### Join Our Community

The primary hub for the JuliaOS community is our GitHub repository:

* **GitHub Repository:** [https://github.com/Juliaoscode/JuliaOS](https://github.com/Juliaoscode/JuliaOS)
    * **Issues:** Report bugs, request features, or discuss specific technical challenges.
    * **Discussions:** (Consider enabling GitHub Discussions) For broader questions, ideas, and community conversations.
    * **Pull Requests:** Contribute code, documentation, and improvements.

### Ways to Contribute

We appreciate all forms of contributions, including but not limited to:

* **💻 Code Contributions:**
    * Implementing new features for agents, swarms, or neural network capabilities.
    * Adding support for new blockchains or bridges.
    * Improving existing code, performance, or security.
    * Writing unit and integration tests.
    * Developing new use cases or example applications.
* **📖 Documentation:**
    * Improving existing documentation for clarity and completeness.
    * Writing new tutorials or guides.
    * Adding examples to the API reference.
    * Translating documentation.
* **🐞 Bug Reports & Testing:**
    * Identifying and reporting bugs with clear reproduction steps.
    * Helping test new releases and features.
* **💡 Ideas & Feedback:**
    * Suggesting new features or enhancements.
    * Providing feedback on the project's direction and usability.
* ** evangelism & Advocacy:**
    * Spreading the word about JuliaOS.
    * Writing blog posts or creating videos about your experiences with JuliaOS.

### Getting Started with Contributions

1.  **Set Up Your Environment:** Follow the [Quick Start](#quick-start) or [Local machine deployment](#local-machine-deployment-and-running-guide) sections to get JuliaOS running on your system. Ensure you can build the project using `npm run build`.
2.  **Find an Issue:** Browse the [GitHub Issues](https://github.com/Juliaoscode/JuliaOS/issues) page. Look for issues tagged with `good first issue` or `help wanted` if you're new.
3.  **Discuss Your Plans:** For new features or significant changes, it's a good idea to open an issue first to discuss your ideas with the maintainers and community.
4.  **Contribution Workflow:**
    * Fork the [JuliaOS repository](https://github.com/Juliaoscode/JuliaOS) to your own GitHub account.
    * Create a new branch for your changes (e.g., `git checkout -b feature/my-new-feature` or `fix/bug-description`).
    * Make your changes, adhering to any coding style guidelines (to be defined, see below).
    * Write or update tests for your changes.
    * Commit your changes with clear and descriptive commit messages.
    * Push your branch to your fork on GitHub.
    * Open a Pull Request (PR) against the `main` or appropriate development branch of the `Juliaoscode/JuliaOS` repository.
    * Clearly describe the changes in your PR and link to any relevant issues.
    * Be responsive to feedback and participate in the review process.

### Contribution Guidelines (To Be Established)

We are in the process of formalizing our contribution guidelines. In the meantime, please aim for:

* **Clear Code:** Write readable and maintainable code. Add comments where necessary.
* **Testing:** Include tests for new functionality and bug fixes.
* **Commit Messages:** Write clear and concise commit messages (e.g., following Conventional Commits).

We plan to create a `CONTRIBUTING.md` file with detailed guidelines soon.

### Code of Conduct (To Be Established)

We are committed to fostering an open, welcoming, and inclusive community. All contributors and participants are expected to adhere to a Code of Conduct. We plan to adopt and publish a `CODE_OF_CONDUCT.md` file (e.g., based on the Contributor Covenant) in the near future.

### Questions?

If you have questions about contributing or want to discuss ideas, please open an issue or start a discussion on GitHub.

Thank you for your interest in JuliaOS! We look forward to your contributions and building a vibrant community together.
