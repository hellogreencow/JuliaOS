"""
Signal Generator Agent Implementation

This agent is responsible for:
- Real-time market signal detection using real market data
- Technical indicator analysis across multiple timeframes
- Pattern recognition and trend analysis
- Strategy formation and collaboration with other agents
- Continuous learning and strategy evolution
"""

using ..MarketDataEngine
using ..StrategyEngine
using ..TradingModes

"""
Main execution loop for Signal Generator agent
"""
function run_signal_generator(agent::SignalGenerator, message_bus::Channel{AgentMessage})
    @info "Starting Signal Generator agent $(agent.agent_id)"
    
    agent.status = "RUNNING"
    last_analysis = now()
    last_strategy_review = now()
    
    # Subscribe to market data for key symbols
    initialize_market_subscriptions(agent)
    
    # Initialize or join existing strategies
    initialize_agent_strategies(agent)
    
    while agent.status == "RUNNING"
        try
            current_time = now()
            
            # Process incoming messages
            while !isempty(agent.message_queue)
                message = dequeue!(agent.message_queue)
                handle_signal_generator_message(agent, message, message_bus)
            end
            
            # Perform signal analysis every 30 seconds with real data
            if (current_time - last_analysis) >= Millisecond(30000)
                signals = analyze_market_signals_real_data(agent)
                
                for signal in signals
                    if signal["confidence"] >= agent.config["min_signal_confidence"]
                        # Send to portfolio manager
                        send_signal_to_portfolio_manager(agent, signal, message_bus)
                        
                        # Record in history
                        push!(agent.signal_history, signal)
                        agent.last_signal_time = current_time
                        
                        # Share insights with other agents
                        share_signal_insights(agent, signal, message_bus)
                    end
                end
                
                last_analysis = current_time
            end
            
            # Review and evolve strategies every 10 minutes
            if (current_time - last_strategy_review) >= Millisecond(600000)
                review_and_evolve_strategies(agent, message_bus)
                last_strategy_review = current_time
            end
            
            # Collaborate on existing strategies
            collaborate_on_strategies(agent, message_bus)
            
            sleep(5)  # 5-second processing cycle for real-time responsiveness
            
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
Initialize market data subscriptions for the agent
"""
function initialize_market_subscriptions(agent::SignalGenerator)
    # Subscribe to key crypto symbols for real-time data
    symbols = ["BTC/USD", "ETH/USD", "SOL/USD", "MATIC/USD", "AVAX/USD", "ADA/USD", "DOT/USD"]
    
    for symbol in symbols
        MarketDataEngine.subscribe_to_symbol(agent.agent_id, symbol, MarketDataEngine.CRYPTO)
    end
    
    @info "Market subscriptions initialized" agent=agent.agent_id symbols=length(symbols)
end

"""
Initialize or join existing strategies
"""
function initialize_agent_strategies(agent::SignalGenerator)
    # Check if there are existing strategies to join
    engine = StrategyEngine.get_strategy_engine()
    
    # Look for strategies that need signal generation components
    for (strategy_id, strategy) in engine.library.strategies
        if !haskey(strategy.components, StrategyEngine.SIGNAL_DETECTION) && strategy.active
            # Propose to contribute a signal detection component
            propose_signal_component(agent, strategy_id)
        end
    end
    
    # Create a new strategy if none exist or we want to explore new approaches
    if length(engine.library.strategies) < 5  # Keep exploring new strategies
        create_new_strategy(agent)
    end
end

"""
Propose a signal detection component to an existing strategy
"""
function propose_signal_component(agent::SignalGenerator, strategy_id::String)
    # Create a new signal detection component
    component = StrategyEngine.StrategyComponent(
        "Multi_Timeframe_Signal_Detection",
        StrategyEngine.SIGNAL_DETECTION,
        (market_data, params) -> begin
            # Multi-timeframe signal detection logic
            signals = analyze_multiple_timeframes(market_data, params)
            return signals
        end,
        agent.agent_id,
        parameters = Dict(
            "timeframes" => ["1m", "5m", "15m", "1h"],
            "rsi_period" => 14,
            "macd_fast" => 12,
            "macd_slow" => 26,
            "signal_period" => 9,
            "volume_threshold" => 1.5,
            "confidence_threshold" => 0.7
        )
    )
    
    # Collaborate on the strategy
    success = StrategyEngine.collaborate_on_strategy(
        strategy_id,
        agent.agent_id,
        StrategyEngine.SIGNAL_DETECTION,
        component
    )
    
    if success
        @info "Successfully contributed to strategy" agent=agent.agent_id strategy=strategy_id
    end
end

"""
Create a new strategy
"""
function create_new_strategy(agent::SignalGenerator)
    strategy_name = "Adaptive_Signal_Strategy_$(agent.agent_id)_$(Dates.format(now(), "HHMMss"))"
    
    # Create initial signal component
    signal_component = StrategyEngine.StrategyComponent(
        "Adaptive_Technical_Signals",
        StrategyEngine.SIGNAL_DETECTION,
        (market_data, params) -> begin
            # Adaptive signal detection that learns from market conditions
            return adaptive_signal_detection(market_data, params)
        end,
        agent.agent_id,
        parameters = Dict(
            "adaptation_rate" => 0.05,
            "market_regime_sensitivity" => 0.8,
            "volatility_adjustment" => true,
            "multi_asset_correlation" => true
        )
    )
    
    # Create the strategy
    strategy = StrategyEngine.create_strategy(strategy_name, agent.agent_id, [signal_component])
    
    @info "Created new strategy" agent=agent.agent_id strategy=strategy.name
end

"""
Analyze market signals using real market data
"""
function analyze_market_signals_real_data(agent::SignalGenerator)
    signals = Dict{String, Any}[]
    
    # Real symbols we're subscribed to
    symbols = ["BTC/USD", "ETH/USD", "SOL/USD", "MATIC/USD", "AVAX/USD"]
    
    for symbol in symbols
        try
            # Get real-time market data
            market_data = MarketDataEngine.get_real_time_price(symbol, asset_type = MarketDataEngine.CRYPTO)
            
            if market_data === nothing
                @debug "No market data available for symbol" symbol=symbol
                continue
            end
            
            # Get historical data for technical analysis
            historical_data = MarketDataEngine.get_historical_data(symbol, 30, "1d", asset_type = MarketDataEngine.CRYPTO)
            
            if isempty(historical_data)
                @debug "No historical data available for symbol" symbol=symbol
                continue
            end
            
            # Calculate technical indicators with real data
            indicators = calculate_technical_indicators_real(agent, market_data, historical_data)
            
            # Generate signals based on indicators and market regime
            signal_type, confidence, reasoning = generate_signal_from_real_data(agent, market_data, indicators, historical_data)
            
            # Apply strategy-based filtering
            confidence = apply_strategy_filters(agent, symbol, signal_type, confidence, indicators)
            
            if signal_type != "HOLD" && confidence >= agent.config["min_signal_confidence"]
                signal = Dict(
                    "timestamp" => now(),
                    "symbol" => symbol,
                    "signal_type" => signal_type,  # BUY, SELL, HOLD
                    "confidence" => confidence,    # 0.0 to 1.0
                    "reasoning" => reasoning,
                    "technical_indicators" => indicators,
                    "price" => market_data.price,
                    "volume" => market_data.volume,
                    "change_24h" => market_data.change_24h,
                    "change_pct_24h" => market_data.change_pct_24h,
                    "source" => string(market_data.source),
                    "timeframe" => "real_time",
                    "agent_id" => agent.agent_id,
                    "market_regime" => agent.shared_state.market_regime
                )
                
                push!(signals, signal)
                
                @info "Signal generated" symbol=symbol type=signal_type confidence=round(confidence, digits=3) price=market_data.price
            end
            
        catch e
            @error "Error analyzing signals for symbol" symbol=symbol error=e
            continue
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

"""
Calculate technical indicators using real market data
"""
function calculate_technical_indicators_real(
    agent::SignalGenerator,
    current_data::MarketDataEngine.MarketDataPoint,
    historical_data::Vector{MarketDataEngine.MarketDataPoint}
)
    indicators = Dict{String, Float64}()
    
    if length(historical_data) < 20
        @debug "Insufficient historical data for technical analysis" symbol=current_data.symbol count=length(historical_data)
        return indicators
    end
    
    # Extract price series
    prices = [data.price for data in historical_data]
    volumes = [data.volume for data in historical_data]
    
    # RSI Calculation
    indicators["rsi_14"] = calculate_rsi(prices, 14)
    
    # MACD Calculation
    macd_line, signal_line, histogram = calculate_macd(prices, 12, 26, 9)
    indicators["macd_line"] = macd_line
    indicators["macd_signal"] = signal_line
    indicators["macd_histogram"] = histogram
    
    # Moving Averages
    indicators["sma_20"] = mean(prices[end-19:end])
    indicators["sma_50"] = length(prices) >= 50 ? mean(prices[end-49:end]) : mean(prices)
    indicators["ema_20"] = calculate_ema(prices, 20)
    
    # Bollinger Bands
    bb_upper, bb_middle, bb_lower = calculate_bollinger_bands(prices, 20, 2.0)
    indicators["bb_upper"] = bb_upper
    indicators["bb_middle"] = bb_middle
    indicators["bb_lower"] = bb_lower
    indicators["bb_position"] = (current_data.price - bb_lower) / (bb_upper - bb_lower)
    
    # Volume indicators
    indicators["volume_sma"] = mean(volumes[max(1, end-19):end])
    indicators["volume_ratio"] = current_data.volume / indicators["volume_sma"]
    
    # Volatility
    returns = [log(prices[i] / prices[i-1]) for i in 2:length(prices)]
    indicators["volatility"] = std(returns) * sqrt(252)  # Annualized
    
    # Support and resistance levels
    highs = [max(prices[max(1, i-9):i]...) for i in 10:length(prices)]
    lows = [min(prices[max(1, i-9):i]...) for i in 10:length(prices)]
    indicators["resistance_level"] = length(highs) > 0 ? maximum(highs[end-min(4, length(highs)-1):end]) : current_data.price * 1.05
    indicators["support_level"] = length(lows) > 0 ? minimum(lows[end-min(4, length(lows)-1):end]) : current_data.price * 0.95
    
    # Trend strength
    indicators["trend_strength"] = calculate_trend_strength(prices)
    
    return indicators
end

"""
Calculate RSI (Relative Strength Index)
"""
function calculate_rsi(prices::Vector{Float64}, period::Int = 14)
    if length(prices) < period + 1
        return 50.0  # Neutral RSI
    end
    
    gains = Float64[]
    losses = Float64[]
    
    for i in 2:length(prices)
        change = prices[i] - prices[i-1]
        if change > 0
            push!(gains, change)
            push!(losses, 0.0)
        else
            push!(gains, 0.0)
            push!(losses, abs(change))
        end
    end
    
    if length(gains) < period
        return 50.0
    end
    
    avg_gain = mean(gains[end-period+1:end])
    avg_loss = mean(losses[end-period+1:end])
    
    if avg_loss == 0.0
        return 100.0
    end
    
    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    
    return rsi
end

"""
Calculate MACD (Moving Average Convergence Divergence)
"""
function calculate_macd(prices::Vector{Float64}, fast::Int = 12, slow::Int = 26, signal::Int = 9)
    if length(prices) < slow
        return 0.0, 0.0, 0.0
    end
    
    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)
    
    macd_line = ema_fast - ema_slow
    
    # Calculate signal line (EMA of MACD line)
    # Simplified: just use the current MACD value
    signal_line = macd_line * 0.8  # Approximation
    
    histogram = macd_line - signal_line
    
    return macd_line, signal_line, histogram
end

"""
Calculate EMA (Exponential Moving Average)
"""
function calculate_ema(prices::Vector{Float64}, period::Int)
    if length(prices) < period
        return mean(prices)
    end
    
    alpha = 2.0 / (period + 1)
    ema = prices[1]
    
    for i in 2:length(prices)
        ema = alpha * prices[i] + (1 - alpha) * ema
    end
    
    return ema
end

"""
Calculate Bollinger Bands
"""
function calculate_bollinger_bands(prices::Vector{Float64}, period::Int = 20, std_dev::Float64 = 2.0)
    if length(prices) < period
        sma = mean(prices)
        return sma * 1.02, sma, sma * 0.98
    end
    
    recent_prices = prices[end-period+1:end]
    sma = mean(recent_prices)
    std_price = std(recent_prices)
    
    upper = sma + (std_dev * std_price)
    lower = sma - (std_dev * std_price)
    
    return upper, sma, lower
end

"""
Calculate trend strength
"""
function calculate_trend_strength(prices::Vector{Float64})
    if length(prices) < 10
        return 0.5
    end
    
    # Linear regression slope as trend indicator
    n = length(prices)
    x = collect(1:n)
    y = prices
    
    x_mean = mean(x)
    y_mean = mean(y)
    
    numerator = sum((x .- x_mean) .* (y .- y_mean))
    denominator = sum((x .- x_mean).^2)
    
    if denominator == 0
        return 0.5
    end
    
    slope = numerator / denominator
    
    # Normalize slope to 0-1 range
    max_slope = maximum(abs.(y)) / n
    normalized_slope = abs(slope) / max_slope
    
    return min(normalized_slope, 1.0)
end

"""
Generate signals based on real market data and technical indicators
"""
function generate_signal_from_real_data(
    agent::SignalGenerator,
    market_data::MarketDataEngine.MarketDataPoint,
    indicators::Dict{String, Float64},
    historical_data::Vector{MarketDataEngine.MarketDataPoint}
)
    reasoning = String[]
    buy_score = 0.0
    sell_score = 0.0
    
    # RSI analysis
    rsi = get(indicators, "rsi_14", 50.0)
    if rsi < 30
        buy_score += 0.3
        push!(reasoning, "RSI oversold ($(round(rsi, digits=1)))")
    elseif rsi > 70
        sell_score += 0.3
        push!(reasoning, "RSI overbought ($(round(rsi, digits=1)))")
    end
    
    # MACD analysis
    macd_line = get(indicators, "macd_line", 0.0)
    macd_signal = get(indicators, "macd_signal", 0.0)
    if macd_line > macd_signal && macd_line > 0
        buy_score += 0.25
        push!(reasoning, "MACD bullish crossover")
    elseif macd_line < macd_signal && macd_line < 0
        sell_score += 0.25
        push!(reasoning, "MACD bearish crossover")
    end
    
    # Bollinger Bands analysis
    bb_position = get(indicators, "bb_position", 0.5)
    if bb_position < 0.1
        buy_score += 0.2
        push!(reasoning, "Price near lower Bollinger Band")
    elseif bb_position > 0.9
        sell_score += 0.2
        push!(reasoning, "Price near upper Bollinger Band")
    end
    
    # Volume analysis
    volume_ratio = get(indicators, "volume_ratio", 1.0)
    if volume_ratio > 1.5
        # High volume supports the signal
        buy_score *= 1.2
        sell_score *= 1.2
        push!(reasoning, "High volume confirmation")
    end
    
    # Price momentum from 24h change
    if market_data.change_pct_24h > 5.0
        sell_score += 0.15
        push!(reasoning, "Strong positive momentum ($(round(market_data.change_pct_24h, digits=1))%)")
    elseif market_data.change_pct_24h < -5.0
        buy_score += 0.15
        push!(reasoning, "Strong negative momentum ($(round(market_data.change_pct_24h, digits=1))%)")
    end
    
    # Trend analysis
    trend_strength = get(indicators, "trend_strength", 0.5)
    sma_20 = get(indicators, "sma_20", market_data.price)
    if market_data.price > sma_20 && trend_strength > 0.7
        buy_score += 0.2
        push!(reasoning, "Strong uptrend")
    elseif market_data.price < sma_20 && trend_strength > 0.7
        sell_score += 0.2
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
        confidence *= 0.7  # Reduce confidence during cooldown
    end
    
    reasoning_text = isempty(reasoning) ? "No clear signal" : join(reasoning, "; ")
    
    return signal_type, confidence, reasoning_text
end

"""
Apply strategy-based filters to adjust signal confidence
"""
function apply_strategy_filters(
    agent::SignalGenerator,
    symbol::String,
    signal_type::String,
    confidence::Float64,
    indicators::Dict{String, Float64}
)
    # Get strategies that this agent participates in
    engine = StrategyEngine.get_strategy_engine()
    adjusted_confidence = confidence
    
    for (strategy_id, strategy) in engine.library.strategies
        if agent.agent_id in strategy.contributor_agents && strategy.active
            # Apply strategy-specific filters
            strategy_performance = get(strategy.performance_metrics, "sharpe_ratio", 0.0)
            
            # Boost confidence for well-performing strategies
            if strategy_performance > 0.5
                adjusted_confidence *= 1.1
            elseif strategy_performance < -0.2
                adjusted_confidence *= 0.9
            end
            
            # Check market regime affinity
            current_regime = parse_market_regime(agent.shared_state.market_regime)
            regime_affinity = get(strategy.market_regime_affinity, current_regime, 0.5)
            adjusted_confidence *= (0.5 + regime_affinity)
        end
    end
    
    return min(adjusted_confidence, 1.0)
end

"""
Parse market regime string to enum
"""
function parse_market_regime(regime_str::String)
    regime_map = Dict(
        "BULL" => StrategyEngine.BULL_MARKET,
        "BEAR" => StrategyEngine.BEAR_MARKET,
        "SIDEWAYS" => StrategyEngine.SIDEWAYS_MARKET,
        "CRISIS" => StrategyEngine.CRISIS_MODE,
        "NORMAL" => StrategyEngine.SIDEWAYS_MARKET
    )
    
    return get(regime_map, regime_str, StrategyEngine.SIDEWAYS_MARKET)
end

"""
Share signal insights with other agents
"""
function share_signal_insights(agent::SignalGenerator, signal::Dict{String, Any}, message_bus::Channel{AgentMessage})
    # Create insights from the signal
    insights = Dict(
        "signal_type" => signal["signal_type"],
        "confidence" => signal["confidence"],
        "technical_strength" => get(signal["technical_indicators"], "trend_strength", 0.5),
        "volume_confirmation" => get(signal["technical_indicators"], "volume_ratio", 1.0) > 1.2,
        "price_momentum" => signal["change_pct_24h"],
        "market_conditions" => Dict(
            "volatility" => get(signal["technical_indicators"], "volatility", 0.2),
            "support_distance" => abs(signal["price"] - get(signal["technical_indicators"], "support_level", signal["price"])) / signal["price"],
            "resistance_distance" => abs(get(signal["technical_indicators"], "resistance_level", signal["price"]) - signal["price"]) / signal["price"]
        )
    )
    
    # Share with strategy engine
    market_regime = parse_market_regime(signal["market_regime"])
    StrategyEngine.share_insights(agent.agent_id, market_regime, insights)
    
    # Send message to macro contextualizer for regime analysis
    regime_message = AgentMessage(
        agent.agent_id,
        "macro_contextualizer",
        MACRO_UPDATE,
        Dict(
            "symbol" => signal["symbol"],
            "signal_data" => signal,
            "market_insights" => insights
        );
        priority = 3
    )
    
    put!(message_bus, regime_message)
end

"""
Review and evolve strategies
"""
function review_and_evolve_strategies(agent::SignalGenerator, message_bus::Channel{AgentMessage})
    engine = StrategyEngine.get_strategy_engine()
    
    # Find strategies this agent contributes to
    agent_strategies = filter(
        s -> agent.agent_id in s[2].contributor_agents,
        collect(engine.library.strategies)
    )
    
    for (strategy_id, strategy) in agent_strategies
        # Check strategy performance
        sharpe_ratio = get(strategy.performance_metrics, "sharpe_ratio", 0.0)
        
        if sharpe_ratio < 0.3  # Poor performance threshold
            @info "Strategy performing poorly, proposing evolution" strategy=strategy.name sharpe=sharpe_ratio
            
            # Propose strategy evolution
            evolved = StrategyEngine.evolve_strategy(strategy_id)
            if evolved !== nothing
                # Test the evolved strategy
                test_results = StrategyEngine.test_strategy(evolved, 3, 5000.0)  # 3-day test with $5k
                
                @info "Evolved strategy test completed" strategy=evolved.name pnl=test_results["final_metrics"]["total_pnl"]
            end
        end
    end
    
    # Look for collaboration opportunities
    seek_collaboration_opportunities(agent, message_bus)
end

"""
Collaborate on existing strategies
"""
function collaborate_on_strategies(agent::SignalGenerator, message_bus::Channel{AgentMessage})
    engine = StrategyEngine.get_strategy_engine()
    
    # Look for strategies that could benefit from signal improvements
    for (strategy_id, strategy) in engine.library.strategies
        if strategy.active && haskey(strategy.components, StrategyEngine.SIGNAL_DETECTION)
            signal_component = strategy.components[StrategyEngine.SIGNAL_DETECTION]
            
            # If component performance is declining, propose improvement
            if length(signal_component.performance_history) > 5
                recent_performance = mean(signal_component.performance_history[end-4:end])
                if recent_performance < 0.4
                    propose_component_improvement(agent, strategy_id, signal_component)
                end
            end
        end
    end
end

"""
Propose improvement to an existing strategy component
"""
function propose_component_improvement(
    agent::SignalGenerator,
    strategy_id::String,
    old_component::StrategyEngine.StrategyComponent
)
    # Create improved component with enhanced parameters
    improved_params = copy(old_component.parameters)
    
    # Adaptive improvements based on recent market conditions
    improved_params["adaptation_rate"] = get(improved_params, "adaptation_rate", 0.05) * 1.2
    improved_params["confidence_threshold"] = max(0.5, get(improved_params, "confidence_threshold", 0.7) - 0.1)
    improved_params["market_regime_weight"] = 0.3  # New parameter
    
    improved_component = StrategyEngine.StrategyComponent(
        "Enhanced_$(old_component.name)",
        old_component.type,
        old_component.logic_function,
        agent.agent_id,
        parameters = improved_params
    )
    
    # Propose the improvement
    success = StrategyEngine.collaborate_on_strategy(
        strategy_id,
        agent.agent_id,
        StrategyEngine.SIGNAL_DETECTION,
        improved_component
    )
    
    if success
        @info "Proposed component improvement" strategy=strategy_id component=old_component.name
    end
end

"""
Seek collaboration opportunities with other agents
"""
function seek_collaboration_opportunities(agent::SignalGenerator, message_bus::Channel{AgentMessage})
    # Send collaboration request to other agents
    collaboration_message = AgentMessage(
        agent.agent_id,
        "ALL",
        HEALTH_CHECK,
        Dict(
            "collaboration_request" => true,
            "agent_type" => "SignalGenerator",
            "specialization" => "technical_analysis",
            "available_for" => ["strategy_formation", "signal_validation", "market_regime_detection"]
        );
        priority = 4
    )
    
    put!(message_bus, collaboration_message)
end