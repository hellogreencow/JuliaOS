"""
Macro Contextualizer Agent Implementation

This agent is responsible for:
- Market regime detection and classification
- Macroeconomic indicator analysis
- News sentiment analysis and interpretation
- Central bank policy monitoring
- Cross-asset correlation analysis
- Providing market context to other agents
"""

"""
Main execution loop for Macro Contextualizer agent
"""
function run_macro_contextualizer(agent::MacroContextualizer, message_bus::Channel{AgentMessage})
    @info "Starting Macro Contextualizer agent $(agent.agent_id)"
    
    agent.status = "RUNNING"
    last_regime_update = now()
    last_indicator_update = now()
    last_sentiment_update = now()
    
    while agent.status == "RUNNING"
        try
            current_time = now()
            
            # Process incoming messages
            while !isempty(agent.message_queue)
                message = dequeue!(agent.message_queue)
                handle_macro_contextualizer_message(agent, message, message_bus)
            end
            
            # Update market regime every 15 minutes
            if (current_time - last_regime_update) >= Millisecond(900000)
                update_market_regime(agent, message_bus)
                last_regime_update = current_time
            end
            
            # Update economic indicators every 30 minutes
            if (current_time - last_indicator_update) >= Millisecond(1800000)
                update_economic_indicators(agent)
                last_indicator_update = current_time
            end
            
            # Update sentiment analysis every 10 minutes
            if (current_time - last_sentiment_update) >= Millisecond(600000)
                update_sentiment_analysis(agent)
                last_sentiment_update = current_time
            end
            
            # Continuous monitoring
            monitor_cross_asset_correlations(agent)
            
            sleep(30)  # 30-second processing cycle
            
        catch e
            @error "Error in Macro Contextualizer $(agent.agent_id): $e"
            sleep(60)
        end
    end
    
    @info "Macro Contextualizer agent $(agent.agent_id) stopped"
end

"""
Handle incoming messages for Macro Contextualizer
"""
function handle_macro_contextualizer_message(agent::MacroContextualizer, message::AgentMessage, message_bus::Channel{AgentMessage})
    if message.type == HEALTH_CHECK
        # Respond with macro contextualizer status
        response = AgentMessage(
            agent.agent_id,
            message.sender,
            HEALTH_CHECK,
            Dict(
                "status" => agent.status,
                "current_regime" => agent.shared_state.market_regime,
                "regime_confidence" => get_regime_confidence(agent),
                "economic_indicators" => agent.economic_indicators,
                "sentiment_scores" => agent.news_sentiment,
                "regime_probabilities" => agent.regime_probabilities,
                "last_regime_change" => get_last_regime_change_time(agent)
            )
        )
        put!(message_bus, response)
    end
end

"""
Update market regime detection and classification
"""
function update_market_regime(agent::MacroContextualizer, message_bus::Channel{AgentMessage})
    # Calculate regime probabilities based on multiple indicators
    new_probabilities = calculate_regime_probabilities(agent)
    
    # Determine the most likely regime
    current_regime = get_dominant_regime(new_probabilities)
    confidence = new_probabilities[current_regime]
    
    # Check if regime has changed significantly
    previous_regime = agent.shared_state.market_regime
    
    if current_regime != previous_regime && confidence > agent.config["regime_confidence_threshold"]
        # Regime change detected
        agent.shared_state.market_regime = current_regime
        agent.regime_probabilities = new_probabilities
        
        # Record regime change
        regime_signal = Dict(
            "previous_regime" => previous_regime,
            "new_regime" => current_regime,
            "confidence" => confidence,
            "probabilities" => new_probabilities,
            "timestamp" => now(),
            "trigger_indicators" => get_regime_triggers(agent)
        )
        
        push!(agent.macro_signals, regime_signal)
        
        # Broadcast regime change to all agents
        broadcast_regime_update(agent, message_bus, regime_signal)
        
        @info "Market regime changed: $previous_regime → $current_regime (confidence: $(round(confidence, digits=2)))"
    else
        # Update probabilities even if no regime change
        agent.regime_probabilities = new_probabilities
    end
end

"""
Calculate regime probabilities based on economic indicators
"""
function calculate_regime_probabilities(agent::MacroContextualizer)
    probabilities = Dict("BULL" => 0.0, "BEAR" => 0.0, "SIDEWAYS" => 0.0, "CRISIS" => 0.0)
    
    # VIX analysis
    vix_level = get(agent.economic_indicators, "vix", 20.0)
    if vix_level < 15
        probabilities["BULL"] += 0.3
    elseif vix_level > 30
        probabilities["BEAR"] += 0.2
        if vix_level > 50
            probabilities["CRISIS"] += 0.4
        end
    else
        probabilities["SIDEWAYS"] += 0.2
    end
    
    # Yield curve analysis
    yield_curve_slope = get(agent.economic_indicators, "yield_curve_slope", 1.0)
    if yield_curve_slope > 1.5
        probabilities["BULL"] += 0.2
    elseif yield_curve_slope < 0
        probabilities["BEAR"] += 0.3
        probabilities["CRISIS"] += 0.2
    end
    
    # Dollar strength analysis
    dxy_change = get(agent.economic_indicators, "dxy_change_pct", 0.0)
    if dxy_change > 2.0
        probabilities["BEAR"] += 0.2  # Strong dollar often bearish for risk assets
    elseif dxy_change < -2.0
        probabilities["BULL"] += 0.2
    end
    
    # Bitcoin correlation (crypto market leading indicator)
    btc_momentum = get(agent.economic_indicators, "btc_momentum", 0.0)
    if btc_momentum > 0.1
        probabilities["BULL"] += 0.25
    elseif btc_momentum < -0.1
        probabilities["BEAR"] += 0.25
    else
        probabilities["SIDEWAYS"] += 0.1
    end
    
    # News sentiment analysis
    overall_sentiment = calculate_overall_sentiment(agent)
    if overall_sentiment > 0.3
        probabilities["BULL"] += 0.15
    elseif overall_sentiment < -0.3
        probabilities["BEAR"] += 0.15
        if overall_sentiment < -0.6
            probabilities["CRISIS"] += 0.2
        end
    else
        probabilities["SIDEWAYS"] += 0.1
    end
    
    # Cross-asset correlation analysis
    correlation_stress = calculate_correlation_stress(agent)
    if correlation_stress > 0.8
        probabilities["CRISIS"] += 0.3
        probabilities["BEAR"] += 0.2
    end
    
    # Normalize probabilities
    total_prob = sum(values(probabilities))
    if total_prob > 0
        for regime in keys(probabilities)
            probabilities[regime] /= total_prob
        end
    else
        # Default to sideways if no clear signals
        probabilities["SIDEWAYS"] = 1.0
    end
    
    return probabilities
end

"""
Get the dominant regime from probabilities
"""
function get_dominant_regime(probabilities::Dict{String, Float64})
    return argmax(probabilities)
end

"""
Update economic indicators from various sources
"""
function update_economic_indicators(agent::MacroContextualizer)
    # Mock economic indicator updates
    # In production, these would fetch from real data sources
    
    # VIX (Volatility Index)
    agent.economic_indicators["vix"] = 15.0 + rand() * 30.0  # 15-45 range
    
    # Yield curve slope (10Y - 2Y)
    agent.economic_indicators["yield_curve_slope"] = -0.5 + rand() * 3.0  # -0.5 to 2.5
    
    # Dollar Index (DXY) percentage change
    agent.economic_indicators["dxy_change_pct"] = (rand() - 0.5) * 6.0  # ±3%
    
    # Bitcoin momentum indicator
    agent.economic_indicators["btc_momentum"] = (rand() - 0.5) * 0.4  # ±0.2
    
    # Fed policy indicator (hawkish/dovish scale)
    agent.economic_indicators["fed_policy_score"] = rand() * 2.0 - 1.0  # -1 to 1
    
    # Credit spreads
    agent.economic_indicators["credit_spreads_bps"] = 50 + rand() * 300  # 50-350 bps
    
    # Commodity momentum
    agent.economic_indicators["commodity_momentum"] = (rand() - 0.5) * 0.3
    
    # Equity market momentum
    agent.economic_indicators["equity_momentum"] = (rand() - 0.5) * 0.4
    
    @debug "Updated economic indicators: VIX=$(round(agent.economic_indicators["vix"], digits=1)), Yield Curve=$(round(agent.economic_indicators["yield_curve_slope"], digits=2))"
end

"""
Update sentiment analysis from news sources
"""
function update_sentiment_analysis(agent::MacroContextualizer)
    # Mock sentiment analysis updates
    # In production, this would analyze real news feeds
    
    sources = agent.config["news_analysis_sources"]
    
    for source in sources
        # Generate sentiment score for each source
        if source == "fed"
            # Central bank communications tend to be more measured
            agent.news_sentiment[source] = (rand() - 0.5) * 0.6  # ±0.3 range
        elseif source == "bloomberg"
            # Financial news with broader sentiment range
            agent.news_sentiment[source] = (rand() - 0.5) * 1.0  # ±0.5 range
        elseif source == "reuters"
            # Similar to Bloomberg but slightly more conservative
            agent.news_sentiment[source] = (rand() - 0.5) * 0.8  # ±0.4 range
        end
    end
    
    @debug "Updated sentiment scores: $(agent.news_sentiment)"
end

"""
Calculate overall sentiment from multiple sources
"""
function calculate_overall_sentiment(agent::MacroContextualizer)
    if isempty(agent.news_sentiment)
        return 0.0
    end
    
    # Weighted average of sentiment sources
    weights = Dict(
        "fed" => 0.4,      # Fed communications weighted heavily
        "bloomberg" => 0.3, # Financial news important
        "reuters" => 0.3   # Balance with other financial news
    )
    
    weighted_sentiment = 0.0
    total_weight = 0.0
    
    for (source, sentiment) in agent.news_sentiment
        weight = get(weights, source, 0.2)
        weighted_sentiment += sentiment * weight
        total_weight += weight
    end
    
    return total_weight > 0 ? weighted_sentiment / total_weight : 0.0
end

"""
Monitor cross-asset correlations for stress indicators
"""
function monitor_cross_asset_correlations(agent::MacroContextualizer)
    # Mock correlation analysis
    # In production, this would calculate real correlations between asset classes
    
    # Generate mock correlation matrix for major asset classes
    # High correlations during stress periods indicate regime changes
    correlations = Dict(
        "equity_bond" => rand() * 0.8 - 0.2,  # Usually negative, becomes positive in crisis
        "equity_commodity" => rand() * 0.6 + 0.2,  # Usually positive
        "equity_crypto" => rand() * 0.8 + 0.1,     # Usually high positive
        "bond_dollar" => rand() * 0.6 - 0.3        # Variable relationship
    )
    
    # Store in economic indicators
    for (pair, correlation) in correlations
        agent.economic_indicators["correlation_$pair"] = correlation
    end
end

"""
Calculate correlation stress indicator
"""
function calculate_correlation_stress(agent::MacroContextualizer)
    # High correlations across uncorrelated assets indicates stress
    equity_bond_corr = abs(get(agent.economic_indicators, "correlation_equity_bond", 0.0))
    equity_crypto_corr = abs(get(agent.economic_indicators, "correlation_equity_crypto", 0.5))
    
    # Stress indicator: when normally uncorrelated assets become highly correlated
    stress_score = (equity_bond_corr + max(0, equity_crypto_corr - 0.5)) / 2
    
    return stress_score
end

"""
Get indicators that triggered regime change
"""
function get_regime_triggers(agent::MacroContextualizer)
    triggers = []
    
    # Check which indicators are at extreme levels
    vix = get(agent.economic_indicators, "vix", 20.0)
    if vix > 35
        push!(triggers, "High VIX: $(round(vix, digits=1))")
    elseif vix < 12
        push!(triggers, "Low VIX: $(round(vix, digits=1))")
    end
    
    yield_curve = get(agent.economic_indicators, "yield_curve_slope", 1.0)
    if yield_curve < 0
        push!(triggers, "Inverted yield curve: $(round(yield_curve, digits=2))")
    end
    
    sentiment = calculate_overall_sentiment(agent)
    if abs(sentiment) > 0.4
        push!(triggers, "Extreme sentiment: $(round(sentiment, digits=2))")
    end
    
    return triggers
end

"""
Broadcast regime update to all agents
"""
function broadcast_regime_update(agent::MacroContextualizer, message_bus::Channel{AgentMessage}, regime_signal::Dict{String, Any})
    update_message = AgentMessage(
        agent.agent_id,
        "ALL",
        MACRO_UPDATE,
        Dict(
            "market_regime" => regime_signal["new_regime"],
            "confidence" => regime_signal["confidence"],
            "probabilities" => regime_signal["probabilities"],
            "change_reason" => regime_signal["trigger_indicators"],
            "timestamp" => regime_signal["timestamp"]
        );
        priority = 2  # High priority for regime changes
    )
    
    put!(message_bus, update_message)
    
    @info "Regime update broadcasted to all agents: $(regime_signal["new_regime"])"
end

"""
Get regime confidence level
"""
function get_regime_confidence(agent::MacroContextualizer)
    current_regime = agent.shared_state.market_regime
    return get(agent.regime_probabilities, current_regime, 0.0)
end

"""
Get time of last regime change
"""
function get_last_regime_change_time(agent::MacroContextualizer)
    if isempty(agent.macro_signals)
        return "No regime changes recorded"
    end
    
    last_signal = agent.macro_signals[end]
    return string(last_signal["timestamp"])
end

"""
Analyze central bank policy changes
"""
function analyze_central_bank_policy(agent::MacroContextualizer)
    # Mock central bank policy analysis
    # In production, this would parse Fed statements, ECB communications, etc.
    
    fed_policy_score = get(agent.economic_indicators, "fed_policy_score", 0.0)
    
    policy_assessment = Dict(
        "stance" => fed_policy_score > 0.3 ? "hawkish" : (fed_policy_score < -0.3 ? "dovish" : "neutral"),
        "confidence" => abs(fed_policy_score),
        "impact_on_risk_assets" => fed_policy_score > 0 ? "negative" : "positive",
        "policy_uncertainty" => rand()  # Mock uncertainty measure
    )
    
    agent.economic_indicators["central_bank_policy"] = policy_assessment
    
    return policy_assessment
end

"""
Generate macro trading signals based on regime and indicators
"""
function generate_macro_signals(agent::MacroContextualizer)
    signals = []
    
    current_regime = agent.shared_state.market_regime
    regime_confidence = get_regime_confidence(agent)
    
    # Generate regime-based signals
    if current_regime == "BULL" && regime_confidence > 0.7
        push!(signals, Dict(
            "type" => "regime_signal",
            "direction" => "bullish",
            "confidence" => regime_confidence,
            "reasoning" => "Strong bull market regime detected",
            "asset_classes" => ["crypto", "equity", "commodity"]
        ))
    elseif current_regime == "BEAR" && regime_confidence > 0.7
        push!(signals, Dict(
            "type" => "regime_signal",
            "direction" => "bearish",
            "confidence" => regime_confidence,
            "reasoning" => "Strong bear market regime detected",
            "asset_classes" => ["crypto", "equity"]
        ))
    elseif current_regime == "CRISIS" && regime_confidence > 0.6
        push!(signals, Dict(
            "type" => "regime_signal",
            "direction" => "risk_off",
            "confidence" => regime_confidence,
            "reasoning" => "Crisis regime detected - flight to safety",
            "asset_classes" => ["crypto", "equity", "commodity"]
        ))
    end
    
    return signals
end

"""
Assess macro risk factors
"""
function assess_macro_risk_factors(agent::MacroContextualizer)
    risk_factors = Dict{String, Dict{String, Any}}()
    
    # VIX risk assessment
    vix_level = get(agent.economic_indicators, "vix", 20.0)
    risk_factors["volatility"] = Dict(
        "level" => vix_level,
        "risk_score" => vix_level > 30 ? "high" : (vix_level < 15 ? "low" : "medium"),
        "trend" => "stable"  # Would track change over time
    )
    
    # Credit risk assessment
    credit_spreads = get(agent.economic_indicators, "credit_spreads_bps", 100.0)
    risk_factors["credit"] = Dict(
        "level" => credit_spreads,
        "risk_score" => credit_spreads > 200 ? "high" : (credit_spreads < 75 ? "low" : "medium"),
        "trend" => "stable"
    )
    
    # Liquidity risk assessment
    correlation_stress = calculate_correlation_stress(agent)
    risk_factors["liquidity"] = Dict(
        "level" => correlation_stress,
        "risk_score" => correlation_stress > 0.7 ? "high" : (correlation_stress < 0.3 ? "low" : "medium"),
        "trend" => "stable"
    )
    
    return risk_factors
end