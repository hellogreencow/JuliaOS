"""
OliverOS - Weapons-Grade AI Trading Platform

A comprehensive, institutional-level trading system featuring:
- 5-Agent AI Trading Team with inter-agent communication
- Sub-millisecond execution engine with smart order routing
- Enterprise-grade risk management with circuit breakers
- Military-grade security and authentication
- Real-time monitoring and metrics collection
- Cross-chain bridge integration
- High-performance swarm optimization algorithms
"""
module OliverOS

# Export core functionality
export initialize, shutdown, get_system_status
export API, Storage, Swarms, SwarmBase, Types, CommandHandler, Agents
export TradingAgentSystem, ExecutionEngine, RiskManager, SecurityManager
export Metrics, Blockchain, DEX, Bridges
export StrategyEngine, MarketDataEngine, TradingModes

# Core system dependencies
using Dates
using Logging
using JSON3

# Include core modules
include("core/types/types.jl")
using .Types

include("core/utils/Metrics.jl") 
using .Metrics

include("core/utils/SecurityManager.jl")
using .SecurityManager

include("core/utils/ExecutionEngine.jl") 
using .ExecutionEngine

include("core/utils/RiskManager.jl")
using .RiskManager

include("storage/Storage.jl")
using .Storage

include("swarm/AdvancedSwarm.jl")
using .AdvancedSwarm
const Swarms = AdvancedSwarm

include("swarm/SwarmBase.jl")
using .SwarmBase

include("api/Handlers.jl")
using .Handlers
const API = Handlers

include("blockchain/Blockchain.jl")
using .Blockchain

include("dex/DEX.jl")
using .DEX

include("bridges/bridges.jl")
using .Bridges

include("agents/Agents.jl")
using .Agents

include("trading/agents/TradingAgentSystem.jl")
using .TradingAgentSystem

include("trading/StrategyEngine.jl")
using .StrategyEngine

include("trading/MarketDataEngine.jl")
using .MarketDataEngine

include("trading/TradingModes.jl")
using .TradingModes

# Include swarm optimization algorithms
include("swarm/algorithms/PSO.jl")
using .PSO

include("swarm/algorithms/GWO.jl")
using .GWO

include("swarm/algorithms/ACO.jl")
using .ACO

include("swarm/algorithms/GA.jl")
using .GA

# Additional algorithms (to be implemented)
# include("swarm/algorithms/WOA.jl")
# include("swarm/algorithms/DE.jl")
# include("swarm/algorithms/DEPSO.jl")
# include("swarm/algorithms/FireflyAlgorithm.jl")
# include("swarm/algorithms/BatAlgorithm.jl")
# include("swarm/algorithms/CuckooSearch.jl")
# include("swarm/algorithms/HarmonySearch.jl")

include("command_handler.jl")
using .CommandHandler

# Global system state
mutable struct JuliaOSSystem
    is_initialized::Bool
    start_time::DateTime
    trading_team::Union{TradingAgentTeam, Nothing}
    execution_engine::Union{OrderManager, Nothing}
    risk_engine::Union{RiskEngine, Nothing}
    security_managers::Union{Tuple, Nothing}
    storage_initialized::Bool
    api_server_running::Bool
    monitoring_active::Bool
    emergency_halt::Bool
    
    function JuliaOSSystem()
        new(false, now(), nothing, nothing, nothing, nothing, 
            false, false, false, false)
    end
end

const SYSTEM_STATE = JuliaOSSystem()

"""
    initialize(; storage_path::String, enable_trading::Bool, enable_monitoring::Bool, 
               security_config::SecurityConfig, risk_config::Dict)

Initialize the complete JuliaOS trading platform with all enterprise-grade components.

# Arguments
- `storage_path::String`: Path for persistent storage (default: ~/.juliaos/juliaos.sqlite)
- `enable_trading::Bool`: Enable the AI trading team (default: true)
- `enable_monitoring::Bool`: Enable real-time monitoring (default: true)
- `security_config::SecurityConfig`: Security configuration (default: SecurityConfig())
- `risk_config::Dict`: Risk management configuration (default: empty)

# Returns
- `Bool`: true if initialization successful, false otherwise
"""
function initialize(; 
    storage_path::String = joinpath(homedir(), ".juliaos", "juliaos.sqlite"),
    enable_trading::Bool = true,
    enable_monitoring::Bool = true,
    security_config::SecurityConfig = SecurityConfig(),
    risk_config::Dict{String, Any} = Dict{String, Any}()
)
    @info "🚀 Initializing OliverOS Weapons-Grade AI Trading Platform"
    @info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    try
        # Reset emergency halt
        SYSTEM_STATE.emergency_halt = false
        SYSTEM_STATE.start_time = now()
        
        # 1. Initialize Storage Layer
        @info "📁 Initializing storage layer..."
        try
            Storage.initialize(provider_type=:local, config=Dict{String, Any}("db_path" => storage_path))
            SYSTEM_STATE.storage_initialized = true
            @info "✅ Storage initialized at $storage_path"
        catch e
            @error "❌ Failed to initialize Storage: $e"
            return false
        end
        
        # 2. Initialize Security System
        @info "🔒 Initializing military-grade security system..."
        try
            SYSTEM_STATE.security_managers = SecurityManager.initialize_security_system(security_config)
            @info "✅ Security system initialized with enterprise-grade protection"
        catch e
            @error "❌ Failed to initialize security system: $e"
            return false
        end
        
        # 3. Initialize Metrics and Monitoring
        if enable_monitoring
            @info "📊 Initializing real-time metrics and monitoring..."
            try
                Metrics.init_metrics()
                SYSTEM_STATE.monitoring_active = true
                @info "✅ Monitoring system active on multiple endpoints"
            catch e
                @error "❌ Failed to initialize monitoring: $e"
                # Continue without monitoring
                SYSTEM_STATE.monitoring_active = false
            end
        end
        
        # 4. Initialize Risk Management Engine
        @info "⚠️  Initializing enterprise-grade risk management..."
        try
            SYSTEM_STATE.risk_engine = RiskManager.initialize_risk_engine()
            RiskManager.start_risk_monitoring!(SYSTEM_STATE.risk_engine)
            @info "✅ Risk management engine active with circuit breakers"
        catch e
            @error "❌ Failed to initialize risk management: $e"
            return false
        end
        
        # 5. Initialize Trading Modes (Paper/Production)
        @info "📋 Initializing trading modes (defaults to paper trading)..."
        try
            TradingModes.initialize_trading_modes()
            mode_status = TradingModes.is_paper_mode() ? "PAPER TRADING" : "PRODUCTION"
            @info "✅ Trading mode: $mode_status (Real money protection active)"
        catch e
            @error "❌ Failed to initialize trading modes: $e"
            return false
        end
        
        # 6. Initialize Market Data Engine
        @info "📈 Initializing real-time market data engine..."
        try
            MarketDataEngine.initialize_market_data()
            @info "✅ Market data engine active (Multiple provider fallback system)"
        catch e
            @error "❌ Failed to initialize market data engine: $e"
            return false
        end
        
        # 7. Initialize Strategy Engine
        @info "🧠 Initializing AI strategy formation engine..."
        try
            StrategyEngine.initialize_strategy_engine()
            @info "✅ Strategy engine active (Collaborative evolution system)"
        catch e
            @error "❌ Failed to initialize strategy engine: $e"
            return false
        end
        
        # 8. Initialize High-Performance Execution Engine
        @info "⚡ Initializing sub-millisecond execution engine..."
        try
            SYSTEM_STATE.execution_engine = ExecutionEngine.initialize_execution_engine()
            ExecutionEngine.start_execution_engine!(SYSTEM_STATE.execution_engine)
            @info "✅ Execution engine active with microsecond precision"
        catch e
            @error "❌ Failed to initialize execution engine: $e"
            return false
        end
        
        # 9. Initialize AI Trading Team
        if enable_trading
            @info "🤖 Initializing 5-agent AI trading team..."
            try
                SYSTEM_STATE.trading_team = TradingAgentSystem.TradingAgentTeam("MAIN_TEAM")
                TradingAgentSystem.initialize_trading_team(SYSTEM_STATE.trading_team)
                TradingAgentSystem.start_trading_team(SYSTEM_STATE.trading_team)
                @info "✅ AI trading team deployed and operational"
                @info "   • Signal Generator: ACTIVE"
                @info "   • Portfolio Manager: ACTIVE" 
                @info "   • Execution Engine: ACTIVE"
                @info "   • Risk Controller: ACTIVE"
                @info "   • Macro Contextualizer: ACTIVE"
            catch e
                @error "❌ Failed to initialize trading team: $e"
                # Continue without trading team
                SYSTEM_STATE.trading_team = nothing
            end
        end
        
        # 10. Initialize API Server
        @info "🌐 Starting API server..."
        try
            # Start API server in background (assuming it's implemented)
            # API.start_server() # Uncomment when API server is ready
            SYSTEM_STATE.api_server_running = false  # Set to true when API is active
            @info "🔄 API server initialization deferred"
        catch e
            @warn "⚠️  API server not started: $e"
            SYSTEM_STATE.api_server_running = false
        end
        
        SYSTEM_STATE.is_initialized = true
        
        # Log system status
        @info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        @info "🎯 JuliaOS INITIALIZATION COMPLETE"
        @info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        @info "🛡️  Security: ACTIVE (Military-grade authentication & encryption)"
        @info "📊 Monitoring: $(SYSTEM_STATE.monitoring_active ? "ACTIVE" : "DISABLED") (Prometheus/Grafana stack)"
        @info "📋 Trading Mode: $(TradingModes.is_paper_mode() ? "PAPER" : "PRODUCTION") (Real money protection)"
        @info "📈 Market Data: ACTIVE (Real-time multi-provider feeds)"
        @info "🧠 Strategy Engine: ACTIVE (AI collaborative evolution)"
        @info "⚠️  Risk Management: ACTIVE (Circuit breakers & VaR monitoring)"
        @info "⚡ Execution Engine: ACTIVE (Sub-millisecond targeting)"
        @info "🤖 AI Trading Team: $(SYSTEM_STATE.trading_team !== nothing ? "OPERATIONAL" : "DISABLED") (5-agent system)"
        @info "🌐 API Server: $(SYSTEM_STATE.api_server_running ? "RUNNING" : "STANDBY")"
        @info "🚨 Emergency Halt: $(SYSTEM_STATE.emergency_halt ? "ACTIVE" : "STANDBY")"
        @info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        @info "✅ WEAPONS-GRADE AI TRADING PLATFORM: READY FOR BATTLE"
        @info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        # Record initialization metrics
        if SYSTEM_STATE.monitoring_active
            Metrics.record_metric("system_initialization", 1.0)
            Metrics.record_metric("system_start_time", datetime2unix(SYSTEM_STATE.start_time))
        end
        
        return true
        
    catch e
        @error "💥 CRITICAL ERROR during JuliaOS initialization: $e"
        @error "🛑 System initialization FAILED"
        SYSTEM_STATE.is_initialized = false
        return false
    end
end

"""
    shutdown(; emergency::Bool = false)

Gracefully shutdown all JuliaOS components.

# Arguments
- `emergency::Bool`: Emergency shutdown (immediate halt) vs graceful shutdown

# Returns
- `Bool`: true if shutdown successful
"""
function shutdown(; emergency::Bool = false)
    if emergency
        @warn "🚨 EMERGENCY SHUTDOWN INITIATED"
        SYSTEM_STATE.emergency_halt = true
    else
        @info "🔄 Initiating graceful JuliaOS shutdown..."
    end
    
    try
        # 1. Halt trading operations
        if SYSTEM_STATE.trading_team !== nothing
            @info "🛑 Stopping AI trading team..."
            TradingAgentSystem.stop_trading_team(SYSTEM_STATE.trading_team)
        end
        
        # 2. Stop execution engine
        if SYSTEM_STATE.execution_engine !== nothing
            @info "⚡ Stopping execution engine..."
            ExecutionEngine.shutdown_execution_engine!(SYSTEM_STATE.execution_engine)
        end
        
        # 3. Stop risk monitoring
        if SYSTEM_STATE.risk_engine !== nothing
            @info "⚠️  Stopping risk monitoring..."
            RiskManager.stop_risk_monitoring!(SYSTEM_STATE.risk_engine)
        end
        
        # 4. Stop API server
        if SYSTEM_STATE.api_server_running
            @info "🌐 Stopping API server..."
            # API.stop_server() # Uncomment when implemented
            SYSTEM_STATE.api_server_running = false
        end
        
        # 5. Final cleanup
        SYSTEM_STATE.is_initialized = false
        
        @info "✅ JuliaOS shutdown complete"
        return true
        
    catch e
        @error "❌ Error during shutdown: $e"
        return false
    end
end

"""
    get_system_status()

Get comprehensive system status report.

# Returns
- `Dict`: Detailed system status including all components
"""
function get_system_status()
    status = Dict{String, Any}(
        "initialized" => SYSTEM_STATE.is_initialized,
        "start_time" => SYSTEM_STATE.start_time,
        "uptime_seconds" => SYSTEM_STATE.is_initialized ? (now() - SYSTEM_STATE.start_time).value / 1000 : 0,
        "emergency_halt" => SYSTEM_STATE.emergency_halt,
        "components" => Dict{String, Any}()
    )
    
    # Storage status
    status["components"]["storage"] = Dict(
        "initialized" => SYSTEM_STATE.storage_initialized,
        "provider" => "local"
    )
    
    # Security status
    if SYSTEM_STATE.security_managers !== nothing
        auth_manager, api_manager, rate_limiter, encryption_manager = SYSTEM_STATE.security_managers
        status["components"]["security"] = Dict(
            "active" => true,
            "active_sessions" => length(auth_manager.active_sessions),
            "security_events_24h" => length(filter(e -> e.timestamp > now() - Day(1), auth_manager.security_events)),
            "api_keys_active" => length(filter(kv -> kv[2]["is_active"], api_manager.api_keys))
        )
    else
        status["components"]["security"] = Dict("active" => false)
    end
    
    # Monitoring status
    status["components"]["monitoring"] = Dict(
        "active" => SYSTEM_STATE.monitoring_active,
        "prometheus_endpoint" => SYSTEM_STATE.monitoring_active ? "http://localhost:8054" : "disabled"
    )
    
    # Risk management status
    if SYSTEM_STATE.risk_engine !== nothing
        risk_status = RiskManager.get_risk_status(SYSTEM_STATE.risk_engine)
        status["components"]["risk_management"] = risk_status
    else
        status["components"]["risk_management"] = Dict("active" => false)
    end
    
    # Execution engine status
    if SYSTEM_STATE.execution_engine !== nothing
        execution_status = ExecutionEngine.get_execution_status(SYSTEM_STATE.execution_engine)
        status["components"]["execution_engine"] = execution_status
    else
        status["components"]["execution_engine"] = Dict("active" => false)
    end
    
    # Trading team status
    if SYSTEM_STATE.trading_team !== nothing
        status["components"]["trading_team"] = Dict(
            "active" => true,
            "team_id" => SYSTEM_STATE.trading_team.team_id,
            "agents_count" => length(SYSTEM_STATE.trading_team.agents),
            "message_queue_size" => length(SYSTEM_STATE.trading_team.message_bus.data),
            "shared_state_updated" => SYSTEM_STATE.trading_team.shared_state.last_updated
        )
    else
        status["components"]["trading_team"] = Dict("active" => false)
    end
    
    # API server status
    status["components"]["api_server"] = Dict(
        "running" => SYSTEM_STATE.api_server_running,
        "endpoints" => SYSTEM_STATE.api_server_running ? ["http://localhost:8052"] : []
    )
    
    return status
end

"""
    emergency_halt!(reason::String = "Manual emergency halt")

Trigger emergency halt across all systems.

# Arguments
- `reason::String`: Reason for emergency halt
"""
function emergency_halt!(reason::String = "Manual emergency halt")
    @error "🚨 EMERGENCY HALT TRIGGERED: $reason"
    
    SYSTEM_STATE.emergency_halt = true
    
    # Trigger risk management emergency halt
    if SYSTEM_STATE.risk_engine !== nothing
        RiskManager.emergency_halt!(SYSTEM_STATE.risk_engine, reason)
    end
    
    # Stop all trading activities immediately
    if SYSTEM_STATE.trading_team !== nothing
        for (agent_id, agent) in SYSTEM_STATE.trading_team.agents
            agent.status = "EMERGENCY_HALT"
        end
    end
    
    # Record emergency halt
    if SYSTEM_STATE.monitoring_active
        Metrics.record_metric("emergency_halt", 1.0)
    end
    
    @error "🛑 ALL TRADING OPERATIONS HALTED"
end

"""
    get_trading_performance()

Get comprehensive trading performance metrics.

# Returns
- `Dict`: Trading performance data
"""
function get_trading_performance()
    if SYSTEM_STATE.trading_team === nothing
        return Dict("error" => "Trading team not active")
    end
    
    # Get performance metrics from various components
    performance = Dict{String, Any}(
        "timestamp" => now(),
        "team_id" => SYSTEM_STATE.trading_team.team_id
    )
    
    # Add execution metrics if available
    if SYSTEM_STATE.execution_engine !== nothing
        execution_status = ExecutionEngine.get_execution_status(SYSTEM_STATE.execution_engine)
        performance["execution"] = execution_status
    end
    
    # Add risk metrics if available
    if SYSTEM_STATE.risk_engine !== nothing
        risk_status = RiskManager.get_risk_status(SYSTEM_STATE.risk_engine)
        performance["risk"] = risk_status
    end
    
    # Add shared state metrics
    shared_state = SYSTEM_STATE.trading_team.shared_state
    performance["portfolio"] = Dict(
        "total_value" => shared_state.portfolio_value,
        "daily_pnl" => shared_state.daily_pnl,
        "total_trades" => shared_state.total_trades,
        "win_rate" => shared_state.win_rate,
        "sharpe_ratio" => shared_state.sharpe_ratio,
        "max_drawdown" => shared_state.max_drawdown
    )
    
    return performance
end

"""
    is_system_healthy()

Quick health check for all critical components.

# Returns
- `Bool`: true if all critical systems are healthy
"""
function is_system_healthy()
    if !SYSTEM_STATE.is_initialized || SYSTEM_STATE.emergency_halt
        return false
    end
    
    # Check critical components
    components_healthy = true
    
    # Risk management must be active
    if SYSTEM_STATE.risk_engine === nothing || !SYSTEM_STATE.risk_engine.is_monitoring
        components_healthy = false
    end
    
    # Execution engine must be running
    if SYSTEM_STATE.execution_engine === nothing || !SYSTEM_STATE.execution_engine.is_running
        components_healthy = false
    end
    
    # Security must be active
    if SYSTEM_STATE.security_managers === nothing
        components_healthy = false
    end
    
    return components_healthy
end

"""
    get_system_metrics()

Get real-time system metrics for monitoring dashboards.

# Returns
- `Dict`: Current system metrics
"""
function get_system_metrics()
    metrics = Dict{String, Any}(
        "timestamp" => now(),
        "system_healthy" => is_system_healthy(),
        "uptime_hours" => SYSTEM_STATE.is_initialized ? (now() - SYSTEM_STATE.start_time).value / (1000 * 3600) : 0
    )
    
    # Add component-specific metrics
    if SYSTEM_STATE.risk_engine !== nothing
        metrics["risk"] = Dict(
            "emergency_halt" => SYSTEM_STATE.risk_engine.emergency_halt_flag,
            "active_alerts" => length(filter(a -> a.resolved_at === nothing, SYSTEM_STATE.risk_engine.risk_alerts)),
            "circuit_breaker_triggers_24h" => SYSTEM_STATE.risk_engine.circuit_breaker.trigger_count_24h
        )
    end
    
    if SYSTEM_STATE.execution_engine !== nothing
        metrics["execution"] = Dict(
            "active_orders" => length(SYSTEM_STATE.execution_engine.active_orders),
            "total_fills" => length(SYSTEM_STATE.execution_engine.fills),
            "venues_active" => length(filter(v -> v.is_active, values(SYSTEM_STATE.execution_engine.smart_router.venues)))
        )
    end
    
    return metrics
end

end # module
