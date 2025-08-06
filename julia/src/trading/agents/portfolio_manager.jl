"""
Portfolio Manager Agent Implementation

This agent is responsible for:
- Portfolio optimization and allocation decisions
- Risk-adjusted position sizing
- Dynamic rebalancing and correlation analysis
- Signal processing and trade decision making
- Performance attribution and analysis
"""

"""
Main execution loop for Portfolio Manager agent
"""
function run_portfolio_manager(agent::PortfolioManager, message_bus::Channel{AgentMessage})
    @info "Starting Portfolio Manager agent $(agent.agent_id)"
    
    agent.status = "RUNNING"
    last_rebalance_check = now()
    last_optimization = now()
    
    while agent.status == "RUNNING"
        try
            current_time = now()
            
            # Process incoming messages
            while !isempty(agent.message_queue)
                message = dequeue!(agent.message_queue)
                handle_portfolio_manager_message(agent, message, message_bus)
            end
            
            # Check for rebalancing opportunities every 2 minutes
            if (current_time - last_rebalance_check) >= Millisecond(120000)
                check_rebalancing_needs(agent, message_bus)
                last_rebalance_check = current_time
            end
            
            # Run portfolio optimization every 15 minutes
            if (current_time - last_optimization) >= Millisecond(900000)
                optimize_portfolio_allocation(agent, message_bus)
                last_optimization = current_time
            end
            
            # Update portfolio metrics
            update_portfolio_metrics(agent)
            
            sleep(5)  # 5-second processing cycle
            
        catch e
            @error "Error in Portfolio Manager $(agent.agent_id): $e"
            sleep(10)
        end
    end
    
    @info "Portfolio Manager agent $(agent.agent_id) stopped"
end

"""
Handle incoming messages for Portfolio Manager
"""
function handle_portfolio_manager_message(agent::PortfolioManager, message::AgentMessage, message_bus::Channel{AgentMessage})
    if message.type == SIGNAL
        # Process trading signal from Signal Generator
        process_trading_signal(agent, message.payload, message_bus)
        
    elseif message.type == FILL
        # Process execution fill report
        process_fill_report(agent, message.payload)
        
    elseif message.type == RISK_ALERT
        # Handle risk alerts from Risk Controller
        handle_risk_alert(agent, message.payload, message_bus)
        
    elseif message.type == HEALTH_CHECK
        # Respond with portfolio manager status
        response = AgentMessage(
            agent.agent_id,
            message.sender,
            HEALTH_CHECK,
            Dict(
                "status" => agent.status,
                "signals_processed_last_hour" => count_recent_signals(agent, 3600),
                "orders_sent_last_hour" => count_recent_orders(agent, 3600),
                "current_allocations" => agent.current_weights,
                "target_allocations" => agent.target_allocations,
                "last_rebalance" => agent.last_rebalance,
                "portfolio_sharpe_ratio" => calculate_portfolio_sharpe_ratio(agent)
            )
        )
        put!(message_bus, response)
    end
end

"""
Process trading signal and make allocation decisions
"""
function process_trading_signal(agent::PortfolioManager, signal::Dict{String, Any}, message_bus::Channel{AgentMessage})
    symbol = get(signal, "symbol", "")
    signal_type = get(signal, "signal_type", "HOLD")
    confidence = get(signal, "confidence", 0.0)
    
    if isempty(symbol) || signal_type == "HOLD"
        return
    end
    
    @info "Processing signal: $symbol $signal_type (confidence: $(round(confidence, digits=2)))"
    
    # Calculate optimal position size based on signal and risk parameters
    optimal_size = calculate_optimal_position_size(agent, signal)
    
    if optimal_size > 0
        # Create order for execution
        order = create_order_from_signal(agent, signal, optimal_size)
        
        # Send order to Execution Engine
        send_order_to_execution(agent, order, message_bus)
        
        # Update target allocations
        update_target_allocation(agent, symbol, signal_type, optimal_size)
    else
        @debug "Signal $symbol $signal_type rejected - optimal size is zero"
    end
end

"""
Calculate optimal position size using Kelly Criterion and risk management
"""
function calculate_optimal_position_size(agent::PortfolioManager, signal::Dict{String, Any})
    symbol = signal["symbol"]
    signal_type = signal["signal_type"]
    confidence = signal["confidence"]
    
    # Get current portfolio value
    portfolio_value = agent.shared_state.portfolio_value_usd
    if portfolio_value <= 0
        return 0.0
    end
    
    # Maximum position size as percentage of portfolio
    max_position_pct = agent.config["max_position_size_pct"] / 100
    
    # Kelly Criterion calculation (simplified)
    win_probability = confidence
    avg_win = 0.02  # Assumed 2% average win
    avg_loss = 0.01  # Assumed 1% average loss
    
    kelly_fraction = (win_probability * avg_win - (1 - win_probability) * avg_loss) / avg_win
    
    # Apply conservative scaling (25% of Kelly)
    kelly_fraction *= 0.25
    
    # Position size as percentage of portfolio
    position_pct = min(kelly_fraction, max_position_pct)
    position_pct = max(0.0, position_pct)  # No negative positions
    
    # Convert to dollar amount
    position_size_usd = portfolio_value * position_pct
    
    # Check minimum trade size
    min_trade_size = agent.config["min_trade_size_usd"]
    if position_size_usd < min_trade_size
        return 0.0
    end
    
    # Convert to quantity (assuming mock price)
    price = get(signal, "price", 50000.0)
    quantity = position_size_usd / price
    
    return quantity
end

"""
Create order from trading signal
"""
function create_order_from_signal(agent::PortfolioManager, signal::Dict{String, Any}, quantity::Float64)
    return Dict(
        "symbol" => signal["symbol"],
        "side" => signal["signal_type"] == "BUY" ? "BUY" : "SELL",
        "quantity" => abs(quantity),
        "type" => "MARKET",
        "strategy" => "signal_following",
        "urgency" => confidence_to_urgency(signal["confidence"]),
        "max_slippage_pct" => agent.config["max_position_size_pct"] > 10 ? 0.3 : 0.5,
        "source_signal" => signal,
        "timestamp" => now()
    )
end

"""
Convert signal confidence to order urgency
"""
function confidence_to_urgency(confidence::Float64)
    if confidence >= 0.9
        return "URGENT"
    elseif confidence >= 0.8
        return "HIGH"
    elseif confidence >= 0.6
        return "NORMAL"
    else
        return "LOW"
    end
end

"""
Send order to Execution Engine
"""
function send_order_to_execution(agent::PortfolioManager, order::Dict{String, Any}, message_bus::Channel{AgentMessage})
    order_message = AgentMessage(
        agent.agent_id,
        "execution_engine",
        ORDER,
        order;
        priority = order["urgency"] == "URGENT" ? 1 : 2
    )
    
    put!(message_bus, order_message)
    
    @info "Order sent: $(order["symbol"]) $(order["side"]) $(order["quantity"]) ($(order["urgency"]))"
end

"""
Process fill report from Execution Engine
"""
function process_fill_report(agent::PortfolioManager, fill_data::Dict{String, Any})
    if !get(fill_data, "success", false)
        @warn "Order execution failed: $(get(fill_data, "error", "unknown error"))"
        return
    end
    
    symbol = get(fill_data, "symbol", "")
    if isempty(symbol)
        return
    end
    
    filled_quantity = get(fill_data, "filled_quantity", 0.0)
    avg_price = get(fill_data, "avg_price", 0.0)
    
    # Update current weights
    update_current_weights(agent, symbol, filled_quantity, avg_price)
    
    @info "Fill processed: $symbol $(filled_quantity) @ $(round(avg_price, digits=2))"
end

"""
Update current portfolio weights after trade execution
"""
function update_current_weights(agent::PortfolioManager, symbol::String, quantity::Float64, price::Float64)
    position_value = abs(quantity * price)
    portfolio_value = agent.shared_state.portfolio_value_usd
    
    if portfolio_value > 0
        weight_change = (position_value / portfolio_value) * 100
        
        if haskey(agent.current_weights, symbol)
            agent.current_weights[symbol] += weight_change
        else
            agent.current_weights[symbol] = weight_change
        end
        
        # Ensure weights don't go negative
        agent.current_weights[symbol] = max(0.0, agent.current_weights[symbol])
        
        # Normalize weights to sum to 100%
        normalize_weights!(agent.current_weights)
    end
end

"""
Normalize portfolio weights to sum to 100%
"""
function normalize_weights!(weights::Dict{String, Float64})
    total_weight = sum(values(weights))
    
    if total_weight > 0
        for (symbol, weight) in weights
            weights[symbol] = (weight / total_weight) * 100
        end
    end
end

"""
Update target allocation based on signal
"""
function update_target_allocation(agent::PortfolioManager, symbol::String, signal_type::String, quantity::Float64)
    # For simplicity, update target based on signal direction
    if signal_type == "BUY"
        # Increase target allocation
        current_target = get(agent.target_allocations, symbol, 0.0)
        max_allocation = agent.config["max_position_size_pct"]
        agent.target_allocations[symbol] = min(current_target + 2.0, max_allocation)
    else
        # Decrease or eliminate target allocation
        agent.target_allocations[symbol] = max(get(agent.target_allocations, symbol, 0.0) - 2.0, 0.0)
    end
    
    # Normalize target allocations
    normalize_weights!(agent.target_allocations)
end

"""
Check if portfolio rebalancing is needed
"""
function check_rebalancing_needs(agent::PortfolioManager, message_bus::Channel{AgentMessage})
    if isempty(agent.target_allocations) || isempty(agent.current_weights)
        return
    end
    
    # Check time since last rebalance
    time_since_rebalance = now() - agent.last_rebalance
    min_rebalance_interval = Hour(agent.config["rebalance_frequency_hours"])
    
    if time_since_rebalance < min_rebalance_interval
        return
    end
    
    # Calculate allocation differences
    max_deviation = 0.0
    rebalance_trades = []
    
    for (symbol, target_weight) in agent.target_allocations
        current_weight = get(agent.current_weights, symbol, 0.0)
        deviation = abs(target_weight - current_weight)
        max_deviation = max(max_deviation, deviation)
        
        if deviation > agent.rebalance_threshold * 100  # Convert to percentage
            # Calculate rebalance trade
            portfolio_value = agent.shared_state.portfolio_value_usd
            if portfolio_value > 0
                target_value = (target_weight / 100) * portfolio_value
                current_value = (current_weight / 100) * portfolio_value
                trade_value = target_value - current_value
                
                # Convert to quantity (mock price)
                price = 50000.0  # Mock price
                quantity = abs(trade_value) / price
                side = trade_value > 0 ? "BUY" : "SELL"
                
                if quantity * price >= agent.config["min_trade_size_usd"]
                    push!(rebalance_trades, Dict(
                        "symbol" => symbol,
                        "side" => side,
                        "quantity" => quantity,
                        "reason" => "rebalance",
                        "deviation_pct" => deviation
                    ))
                end
            end
        end
    end
    
    # Execute rebalance trades if needed
    if max_deviation > agent.rebalance_threshold * 100
        execute_rebalance_trades(agent, rebalance_trades, message_bus)
        agent.last_rebalance = now()
        
        @info "Portfolio rebalanced - max deviation: $(round(max_deviation, digits=2))%"
    end
end

"""
Execute rebalancing trades
"""
function execute_rebalance_trades(agent::PortfolioManager, trades::Vector{Dict{String, Any}}, message_bus::Channel{AgentMessage})
    for trade in trades
        rebalance_order = Dict(
            "symbol" => trade["symbol"],
            "side" => trade["side"],
            "quantity" => trade["quantity"],
            "type" => "MARKET",
            "strategy" => "rebalancing",
            "urgency" => "LOW",  # Rebalancing is not urgent
            "max_slippage_pct" => 0.5,
            "timestamp" => now()
        )
        
        send_order_to_execution(agent, rebalance_order, message_bus)
        
        @info "Rebalance order: $(trade["symbol"]) $(trade["side"]) $(round(trade["quantity"], digits=4)) (deviation: $(round(trade["deviation_pct"], digits=2))%)"
    end
end

"""
Optimize portfolio allocation using Modern Portfolio Theory
"""
function optimize_portfolio_allocation(agent::PortfolioManager, message_bus::Channel{AgentMessage})
    symbols = collect(keys(agent.current_weights))
    
    if length(symbols) < 2
        return  # Need at least 2 assets for optimization
    end
    
    # Generate correlation matrix (mock data)
    n_assets = length(symbols)
    correlation_matrix = generate_correlation_matrix(symbols)
    
    # Calculate expected returns (mock data)
    expected_returns = calculate_expected_returns(symbols)
    
    # Optimize for maximum Sharpe ratio
    optimal_weights = optimize_sharpe_ratio(expected_returns, correlation_matrix)
    
    # Update target allocations with optimized weights
    for (i, symbol) in enumerate(symbols)
        agent.target_allocations[symbol] = optimal_weights[i] * 100  # Convert to percentage
    end
    
    @info "Portfolio optimization completed - new targets calculated"
end

"""
Generate correlation matrix for assets (mock implementation)
"""
function generate_correlation_matrix(symbols::Vector{String})
    n = length(symbols)
    corr_matrix = Matrix{Float64}(I, n, n)  # Start with identity matrix
    
    # Add some realistic correlations
    for i in 1:n
        for j in i+1:n
            # Crypto assets tend to be moderately correlated
            correlation = 0.3 + rand() * 0.4  # 0.3 to 0.7 correlation
            corr_matrix[i, j] = correlation
            corr_matrix[j, i] = correlation
        end
    end
    
    return corr_matrix
end

"""
Calculate expected returns for assets (mock implementation)
"""
function calculate_expected_returns(symbols::Vector{String})
    # Mock expected returns based on historical patterns
    return_estimates = Dict(
        "BTC/USD" => 0.08,   # 8% expected annual return
        "ETH/USD" => 0.12,   # 12% expected annual return
        "SOL/USD" => 0.15,   # 15% expected annual return
        "MATIC/USD" => 0.10, # 10% expected annual return
        "AVAX/USD" => 0.13   # 13% expected annual return
    )
    
    return [get(return_estimates, symbol, 0.08) for symbol in symbols]
end

"""
Optimize portfolio for maximum Sharpe ratio (simplified implementation)
"""
function optimize_sharpe_ratio(returns::Vector{Float64}, corr_matrix::Matrix{Float64})
    n_assets = length(returns)
    
    if n_assets == 0
        return Float64[]
    end
    
    # Simple equal-weight starting point
    weights = fill(1.0 / n_assets, n_assets)
    
    # Apply constraints (no short selling, max position limits)
    max_weight = 0.4  # Maximum 40% in any single asset
    for i in 1:n_assets
        weights[i] = min(weights[i], max_weight)
    end
    
    # Normalize weights
    weights ./= sum(weights)
    
    return weights
end

"""
Handle risk alerts from Risk Controller
"""
function handle_risk_alert(agent::PortfolioManager, alert::Dict{String, Any}, message_bus::Channel{AgentMessage})
    alert_type = get(alert, "type", "")
    severity = get(alert, "severity", "")
    
    @warn "Risk alert received: $alert_type ($severity)"
    
    if severity == "CRITICAL"
        # Stop all new position building
        @warn "Critical risk alert - halting new positions"
        # Implementation would set flags to prevent new orders
        
    elseif severity == "HIGH" && alert_type == "POSITION_LIMIT_BREACH"
        # Reduce position in specific symbol
        symbol = get(alert, "symbol", "")
        if !isempty(symbol)
            reduce_position_exposure(agent, symbol, message_bus)
        end
    end
end

"""
Reduce exposure to a specific position
"""
function reduce_position_exposure(agent::PortfolioManager, symbol::String, message_bus::Channel{AgentMessage})
    current_weight = get(agent.current_weights, symbol, 0.0)
    
    if current_weight > 0
        # Reduce target allocation by 50%
        agent.target_allocations[symbol] = current_weight * 0.5
        
        # Create immediate sell order for portion of position
        portfolio_value = agent.shared_state.portfolio_value_usd
        if portfolio_value > 0
            reduce_value = portfolio_value * (current_weight * 0.25 / 100)  # Sell 25% of position
            price = 50000.0  # Mock price
            quantity = reduce_value / price
            
            if quantity * price >= agent.config["min_trade_size_usd"]
                reduce_order = Dict(
                    "symbol" => symbol,
                    "side" => "SELL",
                    "quantity" => quantity,
                    "type" => "MARKET",
                    "strategy" => "risk_reduction",
                    "urgency" => "HIGH",
                    "max_slippage_pct" => 1.0,  # Allow higher slippage for risk reduction
                    "timestamp" => now()
                )
                
                send_order_to_execution(agent, reduce_order, message_bus)
                
                @warn "Position reduction order sent for $symbol: $(round(quantity, digits=4))"
            end
        end
    end
end

"""
Update portfolio performance metrics
"""
function update_portfolio_metrics(agent::PortfolioManager)
    # Update portfolio value and metrics
    if agent.shared_state.portfolio_value_usd > 0
        # Record portfolio metrics
        Metrics.record_portfolio_update(
            agent.shared_state.portfolio_value_usd,
            agent.shared_state.total_pnl_usd,
            agent.shared_state.positions
        )
    end
end

"""
Calculate portfolio Sharpe ratio
"""
function calculate_portfolio_sharpe_ratio(agent::PortfolioManager)
    # Simplified Sharpe ratio calculation
    # In production, this would use historical returns data
    
    if agent.shared_state.total_pnl_usd == 0
        return 0.0
    end
    
    # Mock calculation based on current PnL
    total_return = agent.shared_state.total_pnl_usd / 100000.0  # Assuming $100k initial
    annualized_return = total_return * 365  # Annualize (simplified)
    
    # Assume risk-free rate of 3% and portfolio volatility of 15%
    risk_free_rate = 0.03
    portfolio_volatility = 0.15
    
    sharpe_ratio = (annualized_return - risk_free_rate) / portfolio_volatility
    
    return sharpe_ratio
end

"""
Count recent signals processed
"""
function count_recent_signals(agent::PortfolioManager, seconds::Int)
    # This would track signals in production
    return rand(5:20)  # Mock value
end

"""
Count recent orders sent
"""
function count_recent_orders(agent::PortfolioManager, seconds::Int)
    # This would track orders in production
    return rand(2:10)  # Mock value
end