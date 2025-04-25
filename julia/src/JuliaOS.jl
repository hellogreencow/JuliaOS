module JuliaOS

# Export public modules
export initialize, API, Storage, Swarms, SwarmBase, Types, CommandHandler, Agents

# Constants for feature detection
const PYTHON_WRAPPER_EXISTS = isfile(joinpath(@__DIR__, "python/python_bridge.jl"))
const FRAMEWORK_EXISTS = isdir(joinpath(dirname(dirname(@__DIR__)), "packages/framework"))

# Core modules
include("core/types/types.jl")
include("core/utils/Errors.jl")
include("../config/config.jl")
include("core/logging/logging.jl")
include("core/utils/Utils.jl")
include("core/utils/Metrics.jl")
include("core/utils/SecurityTypes.jl")
include("core/utils/SecurityManager.jl")
include("core/utils/MLIntegration.jl")

# Use core modules
# Only import these modules if they're not already defined
if !isdefined(@__MODULE__, :Types)
    using .Types
end
if !isdefined(@__MODULE__, :SecurityTypes)
    using .SecurityTypes
end
if !isdefined(@__MODULE__, :Errors)
    using .Errors
end
if !isdefined(@__MODULE__, :Metrics)
    using .Metrics
end
if !isdefined(@__MODULE__, :SecurityManager)
    using .SecurityManager
end
if !isdefined(@__MODULE__, :MLIntegration)
    using .MLIntegration
end
# Config and Logging are not modules, they're just files with constants and functions
if !isdefined(@__MODULE__, :Utils)
    using .Utils
end

# Storage implementations
include("storage/Storage.jl")

# Use storage module
using .Storage

# Swarm base implementations (no dependencies)
include("swarm/SwarmBase.jl")

# Use swarm base module
using .SwarmBase

# API and Server
include("api/rest/server.jl")
include("api/rest/routes.jl")

# Now import the API module
using .API

# Blockchain functionality
include("blockchain/Blockchain.jl")
include("blockchain/chain_integration.jl")
include("blockchain/Wallet.jl")
include("blockchain/WalletIntegration.jl")
include("blockchain/CrossChainBridge.jl")
include("blockchain/CrossChainArbitrage.jl")
include("blockchain/MultichainBridge.jl")

# DEX implementations
include("dex/dex_interface.jl")
include("dex/market_data.jl")
# Only include DEX.jl if it's not already defined
if !isdefined(@__MODULE__, :DEX)
    include("dex/DEX.jl")
end
include("dex/DEXCommands.jl")

# Bridge implementations
include("bridges/bridge_interface.jl")
# Only include Bridge.jl if it's not already defined
if !isdefined(@__MODULE__, :Bridge)
    include("bridges/Bridge.jl")
end
include("bridges/WormholeBridge.jl")
include("bridges/AxelarBridge.jl")
include("bridges/LayerZeroBridge.jl")
include("bridges/StargateBridge.jl")
include("bridges/SynapseBridge.jl")
include("bridges/HopBridge.jl")
include("bridges/AcrossBridge.jl")
include("bridges/bridge_commands.jl")

# Agent implementations
include("agents/Agents.jl")

# Swarm implementations
include("swarm/Swarms.jl")
# include("swarm/AdvancedSwarm.jl") # Requires SwarmManager module
# include("swarm/OpenAISwarmAdapter.jl") # Requires OpenAI module
# Algorithm files
include("swarm/algorithms/de.jl")
include("swarm/algorithms/pso.jl")
include("swarm/algorithms/aco.jl")
include("swarm/algorithms/gwo.jl")
include("swarm/algorithms/woa.jl")
include("swarm/algorithms/ga.jl")
include("swarm/algorithms/DEPSO.jl")

# Use swarm modules
using .Swarms

# Include command handlers (after all modules are loaded)
# include("command_handler.jl")
include("api/rest/handlers/CommandHandler.jl")
include("api/rest/handlers/agent_commands.jl")
include("api/rest/handlers/blockchain_commands.jl")
include("api/rest/handlers/bridge_commands.jl")
include("api/rest/handlers/dex_commands.jl")
include("api/rest/handlers/storage_commands.jl")
include("api/rest/handlers/swarm_commands.jl")
include("api/rest/handlers/system_commands.jl")
include("api/rest/handlers/algorithm_commands.jl")
include("api/rest/handlers/metrics_commands.jl")
include("api/rest/handlers/portfolio_commands.jl")
include("api/rest/handlers/wallet_commands.jl")
include("api/rest/handlers/wormhole_commands.jl")

# Use the new CommandHandler module
using .CommandHandler

# Python integration
include("bridges/PythonBridge.jl")

# These modules are already imported above

# Initialize function
function initialize(; storage_path::String = joinpath(homedir(), ".juliaos", "juliaos.sqlite"))
    @info "Initializing JuliaOS..."

    # Initialize core systems
    # These modules might not have initialize functions
    # Just log that we're initializing them

    # Initialize Storage module
    try
        Storage.initialize(provider_type=:local, config=Dict{String, Any}("db_path" => storage_path))
        @info "Storage initialized at $storage_path"
    catch e
        @warn "Failed to initialize Storage: $e"
    end

    # Initialize Swarms module
    # No explicit initialization needed for Swarms module

    @info "JuliaOS initialized successfully"
    return true
end

end # module
