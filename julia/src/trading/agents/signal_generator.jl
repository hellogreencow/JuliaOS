"""
Signal Generator Agent Implementation

This agent is responsible for:
- Real-time market signal detection
- Technical indicator analysis across multiple timeframes
- Pattern recognition and trend analysis
- Sentiment analysis integration
- Signal confidence scoring and filtering
"""

"""
Main execution loop for Signal Generator agent
"""
function run_signal_generator(agent::SignalGenerator, message_bus::Channel{AgentMessage})
    @info "Starting Signal Generator agent $(agent.agent_id)"
    
    agent.status = "RUNNING"
    last_analysis = now()
    
    while agent.status == "RUNNING"
        try
            current_time = now()
            
            # Process incoming messages
            while !isempty(agent.message_queue)
                message = dequeue!(agent.message_queue)
                handle_signal_generator_message(agent, message, message_bus)
            end
            
            # Perform signal analysis every minute
            if (current_time - last_analysis) >= Millisecond(60000)
                signals = analyze_market_signals(agent)
                
                for signal in signals
                    if signal["confidence"] >= agent.config["min_signal_confidence"]
                        send_signal_to_portfolio_manager(agent, signal, message_bus)
                        push!(agent.signal_history, signal)
                        agent.last_signal_time = current_time
                    end
                end
                
                last_analysis = current_time
            end
            
            # Update technical indicators every 30 seconds
            if rand() < 0.1  # 10% chance to update (simulating real-time data)
                update_technical_indicators(agent)
            end
            
            sleep(1)  # 1-second processing cycle
            
        catch e
            @error "Error in Signal Generator $(agent.agent_id): $e"
            sleep(5)
        end
    end
    
    @info "Signal Generator agent $(agent.agent_id) stopped"
end

"""
Handle incoming messages for Signal Generator
"""
function handle_signal_generator_message(agent::SignalGenerator, message::AgentMessage, message_bus::Channel{AgentMessage})
    if message.type == MACRO_UPDATE
        # Update market regime context
        regime = get(message.payload, "market_regime", "NORMAL")
        agent.shared_state.market_regime = regime
        
        # Adjust signal generation based on regime
        adjust_signal_sensitivity(agent, regime)
        
        @debug "Signal Generator received macro update: $regime"
        
    elseif message.type == HEALTH_CHECK
        # Respond to health check
        response = AgentMessage(
            agent.agent_id,
            message.sender,
            HEALTH_CHECK,
            Dict(
                "status" => agent.status,
                "signals_generated_last_hour" => count_recent_signals(agent, 3600),
                "avg_signal_confidence" => calculate_avg_confidence(agent),
                "technical_indicators" => agent.technical_indicators
            )
        )
        put!(message_bus, response)
    end
end

"""
Analyze market signals using technical indicators and ML models
"""
function analyze_market_signals(agent::SignalGenerator)
    signals = Dict{String, Any}[]
    
    # Mock implementation - in production, this would connect to real market data
    symbols = ["BTC/USD", "ETH/USD", "SOL/USD", "MATIC/USD", "AVAX/USD"]
    
    for symbol in symbols
        # Generate mock price data
        current_price = 50000 + rand(-5000:5000)  # Mock BTC price
        price_change_pct = (rand() - 0.5) * 4  # -2% to +2%
        
        # Calculate technical indicators
        indicators = calculate_technical_indicators(agent, symbol, current_price)
        
        # Generate signals based on indicators
        signal_type, confidence, reasoning = generate_signal_from_indicators(agent, indicators, symbol)
        
        if signal_type != "HOLD"
            signal = Dict(
                "timestamp" => now(),
                "symbol" => symbol,
                "signal_type" => signal_type,  # BUY, SELL, HOLD
                "confidence" => confidence,    # 0.0 to 1.0
                "reasoning" => reasoning,
                "technical_indicators" => indicators,
                "price" => current_price,
                "price_change_pct" => price_change_pct,
                "timeframe" => "1m",
                "agent_id" => agent.agent_id
            )
            
            push!(signals, signal)
        end
    end
    
    return signals
end

"""
Calculate technical indicators for a symbol
"""
function calculate_technical_indicators(agent::SignalGenerator, symbol::String, current_price::Float64)
    # Mock technical indicator calculations
    # In production, these would use real price history
    
    indicators = Dict(
        "rsi_14" => 30 + rand() * 40,  # RSI between 30-70
        "macd_signal" => (rand() - 0.5) * 2,  # MACD signal
        "bb_position" => rand(),  # Bollinger Band position (0-1)
        "volume_profile" => rand(),  # Volume profile strength
        "momentum_score" => (rand() - 0.5) * 2,  # Momentum score
        "support_level" => current_price * (0.95 + rand() * 0.05),
        "resistance_level" => current_price * (1.05 + rand() * 0.05),
        "trend_strength" => rand(),  # 0-1 trend strength
        "volatility_percentile" => rand() * 100  # 0-100 volatility percentile
    )
    
    # Update agent's technical indicators
    for (key, value) in indicators
        agent.technical_indicators["$(symbol)_$(key)"] = value
    end
    
    return indicators
end

"""
Generate trading signal from technical indicators
"""
function generate_signal_from_indicators(agent::SignalGenerator, indicators::Dict, symbol::String)
    reasoning = String[]
    buy_score = 0.0
    sell_score = 0.0
    
    # RSI analysis
    rsi = indicators["rsi_14"]
    if rsi < 30
        buy_score += 0.3
        push!(reasoning, "RSI oversold ($(round(rsi, digits=1)))")
    elseif rsi > 70
        sell_score += 0.3
        push!(reasoning, "RSI overbought ($(round(rsi, digits=1)))")
    end
    
    # MACD analysis
    macd = indicators["macd_signal"]
    if macd > 0.1
        buy_score += 0.2
        push!(reasoning, "MACD bullish")
    elseif macd < -0.1
        sell_score += 0.2
        push!(reasoning, "MACD bearish")
    end
    
    # Bollinger Bands analysis
    bb_pos = indicators["bb_position"]
    if bb_pos < 0.2
        buy_score += 0.15
        push!(reasoning, "Price near lower Bollinger Band")
    elseif bb_pos > 0.8
        sell_score += 0.15
        push!(reasoning, "Price near upper Bollinger Band")
    end
    
    # Momentum analysis
    momentum = indicators["momentum_score"]
    if momentum > 0.5
        buy_score += 0.2
        push!(reasoning, "Strong positive momentum")
    elseif momentum < -0.5
        sell_score += 0.2
        push!(reasoning, "Strong negative momentum")
    end
    
    # Trend strength
    trend = indicators["trend_strength"]
    if trend > 0.7
        buy_score += 0.15
        push!(reasoning, "Strong uptrend")
    elseif trend < 0.3
        sell_score += 0.15
        push!(reasoning, "Strong downtrend")
    end
    
    # Market regime adjustment
    regime_multiplier = get_regime_multiplier(agent.shared_state.market_regime)
    buy_score *= regime_multiplier
    sell_score *= regime_multiplier
    
    # Determine signal
    signal_type = "HOLD"
    confidence = 0.0
    
    if buy_score > sell_score && buy_score > 0.5
        signal_type = "BUY"
        confidence = min(buy_score, 1.0)
    elseif sell_score > buy_score && sell_score > 0.5
        signal_type = "SELL"
        confidence = min(sell_score, 1.0)
    end
    
    # Apply signal cooldown
    if (now() - agent.last_signal_time) < Millisecond(agent.config["signal_cooldown_seconds"] * 1000)
        confidence *= 0.5  # Reduce confidence during cooldown
    end
    
    reasoning_text = isempty(reasoning) ? "No clear signal" : join(reasoning, "; ")
    
    return signal_type, confidence, reasoning_text
end

"""
Get market regime multiplier for signal strength
"""
function get_regime_multiplier(regime::String)
    regime_multipliers = Dict(
        "BULL" => 1.2,      # Amplify buy signals in bull market
        "BEAR" => 1.2,      # Amplify sell signals in bear market
        "SIDEWAYS" => 0.8,  # Reduce signal strength in sideways market
        "CRISIS" => 0.5,    # Heavily reduce signals during crisis
        "NORMAL" => 1.0     # Normal signal strength
    )
    
    return get(regime_multipliers, regime, 1.0)
end

"""
Send signal to Portfolio Manager
"""
function send_signal_to_portfolio_manager(agent::SignalGenerator, signal::Dict, message_bus::Channel{AgentMessage})
    message = AgentMessage(
        agent.agent_id,
        "portfolio_manager",
        SIGNAL,
        signal;
        priority = signal["signal_type"] == "SELL" ? 2 : 3  # Sell signals get higher priority
    )
    
    put!(message_bus, message)
    
    @info "Signal sent: $(signal["symbol"]) $(signal["signal_type"]) (confidence: $(round(signal["confidence"], digits=2)))"
end

"""
Update technical indicators with new market data
"""
function update_technical_indicators(agent::SignalGenerator)
    # Simulate updating indicators with new data
    for (key, value) in agent.technical_indicators
        # Add some noise to simulate market movement
        noise = (rand() - 0.5) * 0.1  # ±5% noise
        agent.technical_indicators[key] = value * (1 + noise)
    end
end

"""
Adjust signal sensitivity based on market regime
"""
function adjust_signal_sensitivity(agent::SignalGenerator, regime::String)
    if regime == "CRISIS"
        agent.config["min_signal_confidence"] = 0.9  # Very high confidence required
    elseif regime == "BULL"
        agent.config["min_signal_confidence"] = 0.6  # Lower confidence for buy signals
    elseif regime == "BEAR"
        agent.config["min_signal_confidence"] = 0.6  # Lower confidence for sell signals
    else
        agent.config["min_signal_confidence"] = 0.7  # Default confidence
    end
end

"""
Count recent signals generated within specified time window
"""
function count_recent_signals(agent::SignalGenerator, seconds::Int)
    cutoff_time = now() - Millisecond(seconds * 1000)
    return count(s -> s["timestamp"] > cutoff_time, agent.signal_history)
end

"""
Calculate average confidence of recent signals
"""
function calculate_avg_confidence(agent::SignalGenerator)
    if isempty(agent.signal_history)
        return 0.0
    end
    
    recent_signals = filter(s -> s["timestamp"] > (now() - Hour(1)), agent.signal_history)
    if isempty(recent_signals)
        return 0.0
    end
    
    return mean(s -> s["confidence"], recent_signals)
end