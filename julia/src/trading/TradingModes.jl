"""
TradingModes.jl - Trading Mode Management (Paper vs Production)

This module manages the distinction between paper trading (simulation) and production trading,
ensuring safe operation with real funds and proper mode switching.
"""
module TradingModes

export TradingMode, PaperTradingMode, ProductionTradingMode, MockExchange, RealExchange
export get_current_mode, set_trading_mode!, is_paper_mode, is_production_mode
export execute_trade, get_balance, get_portfolio, reset_paper_account
export TradingModeConfig, validate_production_switch

using Dates
using JSON3
using ..Types
using ..Storage
using ..SecurityManager
using ..Metrics
using Logging

# Trading mode types
@enum TradingModeType begin
    PAPER = 1
    PRODUCTION = 2
end

"""
Abstract base for trading modes
"""
abstract type TradingMode end

"""
Configuration for trading modes
"""
mutable struct TradingModeConfig
    mode_type::TradingModeType
    initial_balance::Dict{String, Float64}
    trading_enabled::Bool
    max_position_size::Float64
    max_daily_loss::Float64
    require_2fa_for_production::Bool
    production_unlock_code::String
    audit_all_trades::Bool
    
    function TradingModeConfig(mode_type::TradingModeType = PAPER)
        new(
            mode_type,
            Dict("USD" => 100000.0),  # Default $100k paper trading
            true,
            0.1,  # 10% max position
            0.02,  # 2% max daily loss
            true,  # Require 2FA for production
            "",   # Production unlock code
            true  # Audit all trades
        )
    end
end

"""
Paper Trading Mode - Simulated trading with fake money
"""
mutable struct PaperTradingMode <: TradingMode
    config::TradingModeConfig
    balances::Dict{String, Float64}
    positions::Dict{String, Dict{String, Any}}
    trade_history::Vector{Dict{String, Any}}
    performance_metrics::Dict{String, Float64}
    start_time::DateTime
    
    function PaperTradingMode(config::TradingModeConfig)
        new(
            config,
            copy(config.initial_balance),
            Dict{String, Dict{String, Any}}(),
            Vector{Dict{String, Any}}(),
            Dict(
                "total_pnl" => 0.0,
                "win_rate" => 0.0,
                "sharpe_ratio" => 0.0,
                "max_drawdown" => 0.0,
                "total_trades" => 0.0
            ),
            now()
        )
    end
end

"""
Production Trading Mode - Real trading with actual funds
"""
mutable struct ProductionTradingMode <: TradingMode
    config::TradingModeConfig
    exchange_connections::Dict{String, Any}
    wallet_addresses::Dict{String, String}
    api_keys::Dict{String, Dict{String, String}}
    real_balances::Dict{String, Float64}
    safety_checks_enabled::Bool
    emergency_stop_active::Bool
    last_audit_time::DateTime
    
    function ProductionTradingMode(config::TradingModeConfig)
        new(
            config,
            Dict{String, Any}(),
            Dict{String, String}(),
            Dict{String, Dict{String, String}}(),
            Dict{String, Float64}(),
            true,  # Safety checks always on
            false,
            now()
        )
    end
end

# Global trading mode state
const TRADING_MODE_LOCK = ReentrantLock()
const CURRENT_MODE = Ref{Union{TradingMode, Nothing}}(nothing)

"""
Initialize trading system in paper mode by default
"""
function initialize_trading_modes()
    lock(TRADING_MODE_LOCK) do
        if CURRENT_MODE[] === nothing
            config = TradingModeConfig(PAPER)
            CURRENT_MODE[] = PaperTradingMode(config)
            @info "Trading system initialized in PAPER mode"
            
            # Record metric
            Metrics.increment_counter("trading_mode_switches", Dict("mode" => "paper"))
        end
    end
end

"""
Get current trading mode
"""
function get_current_mode()::TradingMode
    lock(TRADING_MODE_LOCK) do
        if CURRENT_MODE[] === nothing
            initialize_trading_modes()
        end
        return CURRENT_MODE[]
    end
end

"""
Check if currently in paper trading mode
"""
function is_paper_mode()::Bool
    mode = get_current_mode()
    return isa(mode, PaperTradingMode)
end

"""
Check if currently in production mode
"""
function is_production_mode()::Bool
    mode = get_current_mode()
    return isa(mode, ProductionTradingMode)
end

"""
Validate requirements for switching to production mode
"""
function validate_production_switch(unlock_code::String, user_id::String)::Tuple{Bool, String}
    # Check unlock code
    required_code = get(ENV, "PRODUCTION_UNLOCK_CODE", "")
    if required_code == "" || unlock_code != required_code
        return false, "Invalid production unlock code"
    end
    
    # Check user permissions
    if !SecurityManager.has_permission(user_id, "production_trading")
        return false, "User lacks production trading permission"
    end
    
    # Check 2FA status
    if !SecurityManager.is_2fa_enabled(user_id)
        return false, "2FA must be enabled for production trading"
    end
    
    # Check if paper trading has minimum history
    mode = get_current_mode()
    if isa(mode, PaperTradingMode)
        total_trades = mode.performance_metrics["total_trades"]
        if total_trades < 100
            return false, "Minimum 100 paper trades required before production"
        end
        
        win_rate = mode.performance_metrics["win_rate"]
        if win_rate < 0.4  # 40% win rate minimum
            return false, "Minimum 40% win rate required in paper trading"
        end
    end
    
    return true, "Validation passed"
end

"""
Switch trading mode with safety checks
"""
function set_trading_mode!(new_mode_type::TradingModeType, user_id::String, unlock_code::String = "")
    lock(TRADING_MODE_LOCK) do
        current = get_current_mode()
        
        # If switching to production, validate
        if new_mode_type == PRODUCTION
            valid, msg = validate_production_switch(unlock_code, user_id)
            if !valid
                @error "Failed to switch to production mode: $msg"
                throw(ErrorException(msg))
            end
            
            # Create production mode with safety checks
            config = TradingModeConfig(PRODUCTION)
            new_mode = ProductionTradingMode(config)
            
            # Audit the switch
            SecurityManager.log_security_event(
                "production_mode_enabled",
                Dict(
                    "user_id" => user_id,
                    "previous_mode" => "paper",
                    "timestamp" => now()
                )
            )
            
            @warn "SWITCHING TO PRODUCTION MODE - Real money at risk!"
            
        else
            # Switch to paper mode
            config = TradingModeConfig(PAPER)
            new_mode = PaperTradingMode(config)
            
            @info "Switched to paper trading mode"
        end
        
        # Save current state before switching
        save_mode_state(current)
        
        # Update global mode
        CURRENT_MODE[] = new_mode
        
        # Record metric
        Metrics.increment_counter(
            "trading_mode_switches", 
            Dict("mode" => new_mode_type == PAPER ? "paper" : "production")
        )
    end
end

"""
Execute a trade in the current mode
"""
function execute_trade(
    symbol::String,
    side::String,  # "buy" or "sell"
    quantity::Float64,
    price::Float64,
    order_type::String = "market"
)::Dict{String, Any}
    mode = get_current_mode()
    
    if isa(mode, PaperTradingMode)
        return execute_paper_trade(mode, symbol, side, quantity, price, order_type)
    else
        return execute_production_trade(mode, symbol, side, quantity, price, order_type)
    end
end

"""
Execute a paper trade (simulated)
"""
function execute_paper_trade(
    mode::PaperTradingMode,
    symbol::String,
    side::String,
    quantity::Float64,
    price::Float64,
    order_type::String
)::Dict{String, Any}
    
    # Calculate trade value
    base_currency, quote_currency = split(symbol, "/")
    trade_value = quantity * price
    
    # Check balance
    if side == "buy"
        if get(mode.balances, quote_currency, 0.0) < trade_value
            return Dict(
                "success" => false,
                "error" => "Insufficient balance",
                "available" => get(mode.balances, quote_currency, 0.0),
                "required" => trade_value
            )
        end
    else
        if get(mode.balances, base_currency, 0.0) < quantity
            return Dict(
                "success" => false,
                "error" => "Insufficient balance",
                "available" => get(mode.balances, base_currency, 0.0),
                "required" => quantity
            )
        end
    end
    
    # Execute trade
    trade_id = string(hash(now()))
    timestamp = now()
    
    if side == "buy"
        # Deduct quote currency
        mode.balances[quote_currency] = get(mode.balances, quote_currency, 0.0) - trade_value
        # Add base currency
        mode.balances[base_currency] = get(mode.balances, base_currency, 0.0) + quantity
    else
        # Deduct base currency
        mode.balances[base_currency] = get(mode.balances, base_currency, 0.0) - quantity
        # Add quote currency
        mode.balances[quote_currency] = get(mode.balances, quote_currency, 0.0) + trade_value
    end
    
    # Update positions
    if !haskey(mode.positions, symbol)
        mode.positions[symbol] = Dict(
            "quantity" => 0.0,
            "avg_price" => 0.0,
            "realized_pnl" => 0.0,
            "unrealized_pnl" => 0.0
        )
    end
    
    position = mode.positions[symbol]
    if side == "buy"
        # Update average price
        total_value = position["quantity"] * position["avg_price"] + trade_value
        position["quantity"] += quantity
        position["avg_price"] = position["quantity"] > 0 ? total_value / position["quantity"] : 0.0
    else
        # Calculate realized P&L
        if position["quantity"] > 0
            realized_pnl = quantity * (price - position["avg_price"])
            position["realized_pnl"] += realized_pnl
            mode.performance_metrics["total_pnl"] += realized_pnl
        end
        position["quantity"] -= quantity
    end
    
    # Record trade
    trade_record = Dict(
        "id" => trade_id,
        "timestamp" => timestamp,
        "symbol" => symbol,
        "side" => side,
        "quantity" => quantity,
        "price" => price,
        "value" => trade_value,
        "order_type" => order_type,
        "status" => "filled",
        "mode" => "paper"
    )
    
    push!(mode.trade_history, trade_record)
    
    # Update metrics
    mode.performance_metrics["total_trades"] += 1
    update_performance_metrics!(mode)
    
    # Log trade
    @info "Paper trade executed" trade_id symbol side quantity price
    
    # Record metrics
    Metrics.increment_counter(
        "trades_executed",
        Dict("mode" => "paper", "side" => side, "symbol" => symbol)
    )
    
    return Dict(
        "success" => true,
        "trade" => trade_record,
        "balances" => copy(mode.balances),
        "position" => copy(position)
    )
end

"""
Execute a production trade (real money)
"""
function execute_production_trade(
    mode::ProductionTradingMode,
    symbol::String,
    side::String,
    quantity::Float64,
    price::Float64,
    order_type::String
)::Dict{String, Any}
    
    # Safety check
    if mode.emergency_stop_active
        return Dict(
            "success" => false,
            "error" => "Emergency stop is active - trading disabled"
        )
    end
    
    # Validate trade parameters
    if !mode.safety_checks_enabled || !validate_trade_safety(mode, symbol, side, quantity, price)
        return Dict(
            "success" => false,
            "error" => "Trade failed safety checks"
        )
    end
    
    # TODO: Implement actual exchange integration
    # For now, return a mock response
    @warn "Production trade attempted - Exchange integration not yet implemented"
    
    return Dict(
        "success" => false,
        "error" => "Production trading not yet implemented - use paper mode"
    )
end

"""
Validate trade safety in production mode
"""
function validate_trade_safety(
    mode::ProductionTradingMode,
    symbol::String,
    side::String,
    quantity::Float64,
    price::Float64
)::Bool
    
    # Check position size limits
    trade_value = quantity * price
    total_portfolio_value = sum(values(mode.real_balances))
    
    if total_portfolio_value > 0
        position_size = trade_value / total_portfolio_value
        if position_size > mode.config.max_position_size
            @error "Trade exceeds max position size" position_size max=mode.config.max_position_size
            return false
        end
    end
    
    # TODO: Add more safety checks
    # - Daily loss limits
    # - Correlation limits
    # - Liquidity checks
    # - Market hours validation
    
    return true
end

"""
Get current balance for a currency
"""
function get_balance(currency::String)::Float64
    mode = get_current_mode()
    
    if isa(mode, PaperTradingMode)
        return get(mode.balances, currency, 0.0)
    else
        return get(mode.real_balances, currency, 0.0)
    end
end

"""
Get full portfolio snapshot
"""
function get_portfolio()::Dict{String, Any}
    mode = get_current_mode()
    
    if isa(mode, PaperTradingMode)
        return Dict(
            "mode" => "paper",
            "balances" => copy(mode.balances),
            "positions" => copy(mode.positions),
            "performance" => copy(mode.performance_metrics),
            "trade_count" => length(mode.trade_history),
            "start_time" => mode.start_time
        )
    else
        return Dict(
            "mode" => "production",
            "balances" => copy(mode.real_balances),
            "safety_checks" => mode.safety_checks_enabled,
            "emergency_stop" => mode.emergency_stop_active,
            "last_audit" => mode.last_audit_time
        )
    end
end

"""
Reset paper trading account to initial state
"""
function reset_paper_account()
    mode = get_current_mode()
    
    if !isa(mode, PaperTradingMode)
        throw(ErrorException("Can only reset paper trading accounts"))
    end
    
    lock(TRADING_MODE_LOCK) do
        # Save history before reset
        save_mode_state(mode)
        
        # Reset to initial state
        mode.balances = copy(mode.config.initial_balance)
        mode.positions = Dict{String, Dict{String, Any}}()
        mode.trade_history = Vector{Dict{String, Any}}()
        mode.performance_metrics = Dict(
            "total_pnl" => 0.0,
            "win_rate" => 0.0,
            "sharpe_ratio" => 0.0,
            "max_drawdown" => 0.0,
            "total_trades" => 0.0
        )
        mode.start_time = now()
        
        @info "Paper trading account reset to initial state"
    end
end

"""
Update performance metrics for paper trading
"""
function update_performance_metrics!(mode::PaperTradingMode)
    if isempty(mode.trade_history)
        return
    end
    
    # Calculate win rate
    winning_trades = count(t -> get(t, "pnl", 0.0) > 0, mode.trade_history)
    mode.performance_metrics["win_rate"] = winning_trades / length(mode.trade_history)
    
    # Calculate drawdown
    equity_curve = Float64[]
    initial_balance = sum(values(mode.config.initial_balance))
    current_equity = initial_balance
    
    for trade in mode.trade_history
        current_equity += get(trade, "pnl", 0.0)
        push!(equity_curve, current_equity)
    end
    
    if !isempty(equity_curve)
        peak = maximum(equity_curve)
        trough = minimum(equity_curve[findlast(==(peak), equity_curve):end])
        mode.performance_metrics["max_drawdown"] = (peak - trough) / peak
    end
    
    # TODO: Calculate Sharpe ratio with proper risk-free rate
end

"""
Save trading mode state to storage
"""
function save_mode_state(mode::TradingMode)
    try
        state_data = Dict{String, Any}()
        
        if isa(mode, PaperTradingMode)
            state_data = Dict(
                "type" => "paper",
                "balances" => mode.balances,
                "positions" => mode.positions,
                "trade_history" => mode.trade_history,
                "performance_metrics" => mode.performance_metrics,
                "start_time" => mode.start_time
            )
        else
            state_data = Dict(
                "type" => "production",
                "last_audit_time" => mode.last_audit_time,
                "emergency_stop_active" => mode.emergency_stop_active
            )
        end
        
        # Save to storage
        timestamp = Dates.format(now(), "yyyymmdd_HHMMSS")
        filename = "trading_mode_state_$(timestamp).json"
        Storage.save_json(filename, state_data)
        
        @info "Trading mode state saved" filename
        
    catch e
        @error "Failed to save trading mode state" exception=e
    end
end

# Initialize on module load
function __init__()
    initialize_trading_modes()
end

end # module