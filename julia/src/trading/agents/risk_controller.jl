"""
Risk Controller Agent Implementation

This agent is responsible for:
- Real-time risk monitoring and limit enforcement
- Value-at-Risk (VaR) calculations and stress testing
- Position limit and concentration checks
- Emergency halt and liquidation procedures
- Risk breach detection and alerting
"""

"""
Main execution loop for Risk Controller agent
"""
function run_risk_controller(agent::RiskController, message_bus::Channel{AgentMessage})
    @info "Starting Risk Controller agent $(agent.agent_id)"
    
    agent.status = "RUNNING"
    last_risk_check = now()
    last_stress_test = now()
    
    while agent.status == "RUNNING"
        try
            current_time = now()
            
            # Process incoming messages
            while !isempty(agent.message_queue)
                message = dequeue!(agent.message_queue)
                handle_risk_controller_message(agent, message, message_bus)
            end
            
            # Perform risk checks every 5 seconds
            if (current_time - last_risk_check) >= Millisecond(5000)
                perform_risk_checks(agent, message_bus)
                last_risk_check = current_time
            end
            
            # Run stress tests every 5 minutes
            if (current_time - last_stress_test) >= Millisecond(300000)
                run_stress_tests(agent)
                last_stress_test = current_time
            end
            
            # Update risk metrics continuously
            update_risk_metrics(agent)
            
            sleep(1)  # 1-second risk monitoring cycle
            
        catch e
            @error "Error in Risk Controller $(agent.agent_id): $e"
            sleep(5)
        end
    end
    
    @info "Risk Controller agent $(agent.agent_id) stopped"
end

"""
Handle incoming messages for Risk Controller
"""
function handle_risk_controller_message(agent::RiskController, message::AgentMessage, message_bus::Channel{AgentMessage})
    if message.type == FILL
        # Process trade fill and update positions
        process_trade_fill(agent, message.payload, message_bus)
        
    elseif message.type == POSITION_UPDATE
        # Update position data
        update_position_data(agent, message.payload)
        
    elseif message.type == HEALTH_CHECK
        # Respond with risk controller status
        response = AgentMessage(
            agent.agent_id,
            message.sender,
            HEALTH_CHECK,
            Dict(
                "status" => agent.status,
                "risk_breaches_last_hour" => count_recent_breaches(agent, 3600),
                "current_var_pct" => get_current_var(agent),
                "portfolio_leverage" => calculate_portfolio_leverage(agent),
                "position_concentration" => calculate_position_concentration(agent),
                "emergency_halt" => agent.shared_state.emergency_halt
            )
        )
        put!(message_bus, response)
    end
end

"""
Process trade fill and update risk calculations
"""
function process_trade_fill(agent::RiskController, fill_data::Dict{String, Any}, message_bus::Channel{AgentMessage})
    if !get(fill_data, "success", false)
        return  # Skip failed trades
    end
    
    symbol = get(fill_data, "symbol", "")
    if isempty(symbol)
        return
    end
    
    # Update position in shared state
    if !haskey(agent.shared_state.positions, symbol)
        agent.shared_state.positions[symbol] = Dict(
            "quantity" => 0.0,
            "avg_price" => 0.0,
            "total_cost" => 0.0,
            "unrealized_pnl" => 0.0
        )
    end
    
    position = agent.shared_state.positions[symbol]
    filled_quantity = get(fill_data, "filled_quantity", 0.0)
    avg_price = get(fill_data, "avg_price", 0.0)
    
    # Update position
    old_quantity = position["quantity"]
    old_cost = position["total_cost"]
    
    position["quantity"] += filled_quantity
    position["total_cost"] += filled_quantity * avg_price
    
    if position["quantity"] != 0
        position["avg_price"] = position["total_cost"] / position["quantity"]
    end
    
    # Check if this trade creates a risk breach
    check_position_limits(agent, symbol, position, message_bus)
    check_concentration_limits(agent, message_bus)
    
    # Update portfolio metrics
    update_portfolio_value(agent)
    
    @debug "Updated position for $symbol: $(position["quantity"]) @ $(round(position["avg_price"], digits=2))"
end

"""
Perform comprehensive risk checks
"""
function perform_risk_checks(agent::RiskController, message_bus::Channel{AgentMessage})
    risk_breaches = []
    
    # 1. Portfolio VaR check
    current_var = calculate_portfolio_var(agent)
    if current_var > agent.risk_limits["max_var_1d_pct"]
        breach = Dict(
            "type" => "VAR_BREACH",
            "metric" => "1_day_var",
            "current_value" => current_var,
            "limit" => agent.risk_limits["max_var_1d_pct"],
            "severity" => "HIGH",
            "timestamp" => now()
        )
        push!(risk_breaches, breach)
        push!(agent.risk_breaches, breach)
    end
    
    # 2. Drawdown check
    current_drawdown = calculate_current_drawdown(agent)
    if current_drawdown > agent.config["max_drawdown_pct"]
        breach = Dict(
            "type" => "DRAWDOWN_BREACH",
            "metric" => "max_drawdown",
            "current_value" => current_drawdown,
            "limit" => agent.config["max_drawdown_pct"],
            "severity" => "CRITICAL",
            "timestamp" => now()
        )
        push!(risk_breaches, breach)
        push!(agent.risk_breaches, breach)
    end
    
    # 3. Leverage check
    current_leverage = calculate_portfolio_leverage(agent)
    if current_leverage > agent.config["max_leverage_ratio"]
        breach = Dict(
            "type" => "LEVERAGE_BREACH",
            "metric" => "leverage_ratio",
            "current_value" => current_leverage,
            "limit" => agent.config["max_leverage_ratio"],
            "severity" => "HIGH",
            "timestamp" => now()
        )
        push!(risk_breaches, breach)
        push!(agent.risk_breaches, breach)
    end
    
    # 4. Position concentration check
    max_concentration = calculate_position_concentration(agent)
    if max_concentration > agent.risk_limits["max_position_concentration_pct"]
        breach = Dict(
            "type" => "CONCENTRATION_BREACH",
            "metric" => "position_concentration",
            "current_value" => max_concentration,
            "limit" => agent.risk_limits["max_position_concentration_pct"],
            "severity" => "MEDIUM",
            "timestamp" => now()
        )
        push!(risk_breaches, breach)
        push!(agent.risk_breaches, breach)
    end
    
    # Process risk breaches
    for breach in risk_breaches
        handle_risk_breach(agent, breach, message_bus)
        
        # Record risk metric
        Metrics.record_risk_metric(
            breach["metric"],
            breach["current_value"],
            breach["limit"],
            breach["severity"]
        )
    end
    
    # Update shared state risk metrics
    agent.shared_state.risk_metrics["var_1d_pct"] = current_var
    agent.shared_state.risk_metrics["drawdown_pct"] = current_drawdown
    agent.shared_state.risk_metrics["leverage_ratio"] = current_leverage
    agent.shared_state.risk_metrics["position_concentration_pct"] = max_concentration
    
    agent.shared_state.last_update = now()
end

"""
Calculate portfolio Value-at-Risk (1-day, 95% confidence)
"""
function calculate_portfolio_var(agent::RiskController)
    if isempty(agent.shared_state.positions)
        return 0.0
    end
    
    total_portfolio_value = agent.shared_state.portfolio_value_usd
    if total_portfolio_value <= 0
        return 0.0
    end
    
    # Simplified VaR calculation using position volatilities
    # In production, this would use historical returns and correlation matrices
    total_var = 0.0
    
    for (symbol, position) in agent.shared_state.positions
        position_value = abs(position["quantity"] * position["avg_price"])
        position_weight = position_value / total_portfolio_value
        
        # Mock volatility based on asset type
        daily_volatility = get_asset_volatility(symbol)
        
        # Individual position VaR (assuming normal distribution)
        position_var = position_weight * daily_volatility * 1.645  # 95% confidence
        total_var += position_var^2  # Assuming zero correlation (simplified)
    end
    
    # Portfolio VaR as percentage
    portfolio_var_pct = sqrt(total_var) * 100
    
    return portfolio_var_pct
end

"""
Get daily volatility estimate for an asset
"""
function get_asset_volatility(symbol::String)
    # Mock volatility data (in production, this would use historical price data)
    volatilities = Dict(
        "BTC/USD" => 0.04,   # 4% daily volatility
        "ETH/USD" => 0.05,   # 5% daily volatility
        "SOL/USD" => 0.08,   # 8% daily volatility
        "MATIC/USD" => 0.07, # 7% daily volatility
        "AVAX/USD" => 0.09   # 9% daily volatility
    )
    
    return get(volatilities, symbol, 0.06)  # Default 6% volatility
end

"""
Calculate current portfolio drawdown
"""
function calculate_current_drawdown(agent::RiskController)
    current_value = agent.shared_state.portfolio_value_usd
    
    # For simplicity, assume peak was initial capital
    # In production, track running maximum
    initial_capital = 100000.0  # $100k starting capital
    peak_value = max(initial_capital, current_value)
    
    if peak_value <= 0
        return 0.0
    end
    
    drawdown_pct = ((peak_value - current_value) / peak_value) * 100
    return max(0.0, drawdown_pct)
end

"""
Calculate portfolio leverage ratio
"""
function calculate_portfolio_leverage(agent::RiskController)
    total_position_value = 0.0
    
    for (symbol, position) in agent.shared_state.positions
        total_position_value += abs(position["quantity"] * position["avg_price"])
    end
    
    if agent.shared_state.portfolio_value_usd <= 0
        return 0.0
    end
    
    leverage_ratio = total_position_value / agent.shared_state.portfolio_value_usd
    return leverage_ratio
end

"""
Calculate maximum position concentration
"""
function calculate_position_concentration(agent::RiskController)
    if isempty(agent.shared_state.positions) || agent.shared_state.portfolio_value_usd <= 0
        return 0.0
    end
    
    max_concentration = 0.0
    
    for (symbol, position) in agent.shared_state.positions
        position_value = abs(position["quantity"] * position["avg_price"])
        concentration_pct = (position_value / agent.shared_state.portfolio_value_usd) * 100
        max_concentration = max(max_concentration, concentration_pct)
    end
    
    return max_concentration
end

"""
Check individual position limits
"""
function check_position_limits(agent::RiskController, symbol::String, position::Dict{String, Any}, message_bus::Channel{AgentMessage})
    position_value = abs(position["quantity"] * position["avg_price"])
    
    if agent.shared_state.portfolio_value_usd > 0
        concentration_pct = (position_value / agent.shared_state.portfolio_value_usd) * 100
        
        if concentration_pct > agent.risk_limits["max_position_concentration_pct"]
            breach = Dict(
                "type" => "POSITION_LIMIT_BREACH",
                "symbol" => symbol,
                "concentration_pct" => concentration_pct,
                "limit" => agent.risk_limits["max_position_concentration_pct"],
                "severity" => "HIGH",
                "timestamp" => now()
            )
            
            handle_risk_breach(agent, breach, message_bus)
        end
    end
end

"""
Check portfolio concentration limits
"""
function check_concentration_limits(agent::RiskController, message_bus::Channel{AgentMessage})
    max_concentration = calculate_position_concentration(agent)
    
    if max_concentration > agent.risk_limits["max_position_concentration_pct"]
        breach = Dict(
            "type" => "PORTFOLIO_CONCENTRATION_BREACH",
            "concentration_pct" => max_concentration,
            "limit" => agent.risk_limits["max_position_concentration_pct"],
            "severity" => "HIGH",
            "timestamp" => now()
        )
        
        handle_risk_breach(agent, breach, message_bus)
    end
end

"""
Handle risk breach with appropriate actions
"""
function handle_risk_breach(agent::RiskController, breach::Dict{String, Any}, message_bus::Channel{AgentMessage})
    @warn "Risk breach detected: $(breach["type"]) - $(breach["current_value"]) > $(breach["limit"])"
    
    # Send risk alert to all agents
    risk_alert = AgentMessage(
        agent.agent_id,
        "ALL",
        RISK_ALERT,
        breach;
        priority = 1  # Highest priority
    )
    put!(message_bus, risk_alert)
    
    # Take action based on severity
    if breach["severity"] == "CRITICAL"
        # Emergency halt trading
        @error "CRITICAL risk breach - initiating emergency halt"
        initiate_emergency_halt(agent, message_bus)
        
    elseif breach["severity"] == "HIGH"
        # Reduce position sizes or halt new positions
        @warn "HIGH risk breach - implementing risk controls"
        implement_risk_controls(agent, breach, message_bus)
        
    elseif breach["severity"] == "MEDIUM"
        # Warning only, monitor closely
        @warn "MEDIUM risk breach - monitoring closely"
    end
end

"""
Initiate emergency halt of all trading
"""
function initiate_emergency_halt(agent::RiskController, message_bus::Channel{AgentMessage})
    agent.shared_state.emergency_halt = true
    
    # Send emergency halt message to all agents
    halt_message = AgentMessage(
        agent.agent_id,
        "ALL",
        EMERGENCY_HALT,
        Dict(
            "reason" => "Critical risk breach detected",
            "timestamp" => now(),
            "halt_duration_minutes" => 30  # 30-minute halt
        );
        priority = 1
    )
    put!(message_bus, halt_message)
    
    @error "EMERGENCY HALT INITIATED - All trading suspended"
end

"""
Implement specific risk controls based on breach type
"""
function implement_risk_controls(agent::RiskController, breach::Dict{String, Any}, message_bus::Channel{AgentMessage})
    if breach["type"] == "POSITION_LIMIT_BREACH"
        # Send position reduction order
        symbol = breach["symbol"]
        @warn "Sending position reduction order for $symbol"
        
        # This would send a reduce position message to portfolio manager
        # Implementation depends on specific position reduction strategy
        
    elseif breach["type"] == "LEVERAGE_BREACH"
        # Reduce overall leverage
        @warn "Implementing leverage reduction controls"
        
        # This would send leverage reduction orders
        
    end
end

"""
Run stress tests on the portfolio
"""
function run_stress_tests(agent::RiskController)
    if isempty(agent.shared_state.positions)
        return
    end
    
    # Stress test scenarios
    scenarios = [
        Dict("name" => "market_crash", "shock_pct" => -20.0),
        Dict("name" => "volatility_spike", "shock_pct" => -10.0, "vol_multiplier" => 3.0),
        Dict("name" => "correlation_breakdown", "shock_pct" => -15.0),
        Dict("name" => "liquidity_crisis", "shock_pct" => -25.0)
    ]
    
    agent.stress_test_results = Dict{String, Float64}()
    
    for scenario in scenarios
        portfolio_shock = simulate_portfolio_shock(agent, scenario)
        agent.stress_test_results[scenario["name"]] = portfolio_shock
        
        @debug "Stress test $(scenario["name"]): $(round(portfolio_shock, digits=2))% portfolio impact"
        
        # Record stress test metric
        Metrics.record_risk_metric(
            "stress_test_$(scenario["name"])_pct",
            abs(portfolio_shock),
            agent.config["max_drawdown_pct"],
            portfolio_shock < -agent.config["max_drawdown_pct"] ? "HIGH" : "LOW"
        )
    end
end

"""
Simulate portfolio shock for stress testing
"""
function simulate_portfolio_shock(agent::RiskController, scenario::Dict{String, Any})
    total_portfolio_value = agent.shared_state.portfolio_value_usd
    if total_portfolio_value <= 0
        return 0.0
    end
    
    total_impact = 0.0
    shock_pct = scenario["shock_pct"] / 100  # Convert to decimal
    
    for (symbol, position) in agent.shared_state.positions
        position_value = position["quantity"] * position["avg_price"]
        
        # Apply scenario-specific shock
        if scenario["name"] == "volatility_spike"
            # Higher volatility assets hit harder
            asset_vol = get_asset_volatility(symbol)
            adjusted_shock = shock_pct * (1 + asset_vol)
        else
            adjusted_shock = shock_pct
        end
        
        position_impact = position_value * adjusted_shock
        total_impact += position_impact
    end
    
    portfolio_impact_pct = (total_impact / total_portfolio_value) * 100
    return portfolio_impact_pct
end

"""
Update portfolio value and PnL
"""
function update_portfolio_value(agent::RiskController)
    total_value = 0.0
    total_pnl = 0.0
    
    for (symbol, position) in agent.shared_state.positions
        # Mock current market price (in production, get from price feeds)
        current_price = position["avg_price"] * (0.95 + rand() * 0.1)  # ±5% price movement
        
        position_value = position["quantity"] * current_price
        total_value += position_value
        
        # Calculate unrealized PnL
        cost_basis = position["quantity"] * position["avg_price"]
        unrealized_pnl = position_value - cost_basis
        position["unrealized_pnl"] = unrealized_pnl
        total_pnl += unrealized_pnl
    end
    
    agent.shared_state.portfolio_value_usd = total_value
    agent.shared_state.total_pnl_usd = total_pnl
end

"""
Update position data from external source
"""
function update_position_data(agent::RiskController, position_data::Dict{String, Any})
    symbol = get(position_data, "symbol", "")
    if !isempty(symbol)
        agent.shared_state.positions[symbol] = position_data
        update_portfolio_value(agent)
    end
end

"""
Update risk metrics continuously
"""
function update_risk_metrics(agent::RiskController)
    # Update real-time risk metrics
    current_var = get_current_var(agent)
    current_leverage = calculate_portfolio_leverage(agent)
    current_concentration = calculate_position_concentration(agent)
    
    # Record metrics if they've changed significantly
    if abs(current_var - get(agent.shared_state.risk_metrics, "var_1d_pct", 0.0)) > 0.1
        Metrics.record_risk_metric("var_1d_pct", current_var, agent.risk_limits["max_var_1d_pct"], "INFO")
    end
    
    if abs(current_leverage - get(agent.shared_state.risk_metrics, "leverage_ratio", 0.0)) > 0.1
        Metrics.record_risk_metric("leverage_ratio", current_leverage, agent.config["max_leverage_ratio"], "INFO")
    end
end

"""
Get current VaR value
"""
function get_current_var(agent::RiskController)
    return calculate_portfolio_var(agent)
end

"""
Count recent risk breaches
"""
function count_recent_breaches(agent::RiskController, seconds::Int)
    cutoff_time = now() - Millisecond(seconds * 1000)
    return count(breach -> breach["timestamp"] > cutoff_time, agent.risk_breaches)
end