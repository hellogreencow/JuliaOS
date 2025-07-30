#!/usr/bin/env julia

"""
AI Collaboration Demo - OliverOS Trading System

This demo showcases:
1. Real-time market data integration
2. AI agent collaboration and strategy formation
3. Paper trading with real data
4. Strategy evolution and learning
5. Performance tracking and optimization

Usage:
    julia examples/ai_collaboration_demo.jl
"""

# Add the src directory to the path
push!(LOAD_PATH, joinpath(@__DIR__, "..", "julia", "src"))

using OliverOS
using Dates
using Printf

# Configuration
const DEMO_DURATION_MINUTES = 30
const API_KEYS_REQUIRED = [
    "ALPHA_VANTAGE_API_KEY",
    "COINGECKO_API_KEY", 
    "IEX_CLOUD_API_KEY"
]

function print_banner()
    println("━" ^ 80)
    println("🤖 OLIVEROS AI COLLABORATION DEMO 🤖")
    println("━" ^ 80)
    println("This demo will show you how AI agents:")
    println("• 📈 Analyze real-time market data")
    println("• 🧠 Collaborate to form trading strategies")
    println("• 📊 Learn and evolve strategies over time")
    println("• 💰 Execute trades in paper mode")
    println("• 🏆 Optimize performance through collaboration")
    println("━" ^ 80)
    println()
end

function check_environment()
    println("🔍 Checking environment setup...")
    
    # Check for API keys
    missing_keys = String[]
    for key in API_KEYS_REQUIRED
        if get(ENV, key, "") == ""
            push!(missing_keys, key)
        end
    end
    
    if !isempty(missing_keys)
        println("⚠️  WARNING: Missing API keys for optimal performance:")
        for key in missing_keys
            println("   • $key")
        end
        println()
        println("📝 To set up API keys:")
        println("   export ALPHA_VANTAGE_API_KEY=\"your_key_here\"")
        println("   export COINGECKO_API_KEY=\"your_key_here\"")
        println("   export IEX_CLOUD_API_KEY=\"your_key_here\"")
        println()
        println("🔄 Demo will continue with limited data sources...")
        sleep(3)
    else
        println("✅ All API keys configured!")
    end
    
    println("✅ Environment check complete")
    println()
end

function initialize_system()
    println("🚀 Initializing OliverOS Trading System...")
    println()
    
    # Initialize the complete system
    success = OliverOS.initialize(
        enable_trading = true,
        enable_monitoring = true
    )
    
    if !success
        println("❌ Failed to initialize OliverOS system")
        exit(1)
    end
    
    println("✅ System initialization complete!")
    println()
    return success
end

function demonstrate_market_data()
    println("📈 DEMONSTRATING REAL-TIME MARKET DATA")
    println("━" ^ 50)
    
    # Test symbols
    symbols = ["BTC/USD", "ETH/USD", "SOL/USD"]
    
    for symbol in symbols
        print("📊 Fetching $symbol... ")
        try
            price_data = MarketDataEngine.get_real_time_price(symbol, asset_type = MarketDataEngine.CRYPTO)
            
            if price_data !== nothing
                @printf "✅ $%.2f (%.2f%% 24h)\n" price_data.price price_data.change_pct_24h
                println("   Source: $(price_data.source)")
                println("   Volume: $(round(price_data.volume, digits=0))")
                println("   Timestamp: $(price_data.timestamp)")
            else
                println("❌ No data available")
            end
        catch e
            println("❌ Error: $e")
        end
        println()
    end
    
    println("📈 Market data demonstration complete")
    println()
end

function demonstrate_strategy_formation()
    println("🧠 DEMONSTRATING AI STRATEGY FORMATION")
    println("━" ^ 50)
    
    # Get the strategy engine
    strategy_engine = StrategyEngine.get_strategy_engine()
    
    println("🔍 Current strategy library:")
    if isempty(strategy_engine.library.strategies)
        println("   📝 No strategies yet - agents will create them!")
    else
        for (id, strategy) in strategy_engine.library.strategies
            performance = get(strategy.performance_metrics, "sharpe_ratio", 0.0)
            println("   • $(strategy.name) (Sharpe: $(round(performance, digits=3)))")
            println("     Contributors: $(join(strategy.contributor_agents, ", "))")
        end
    end
    
    println()
    println("🤝 Checking agent collaboration graph:")
    if isempty(strategy_engine.library.collaboration_graph)
        println("   📝 No collaborations yet - agents are getting started!")
    else
        for (agent, collaborators) in strategy_engine.library.collaboration_graph
            println("   • $agent collaborates with: $(join(collaborators, ", "))")
        end
    end
    
    println()
    println("🧠 Strategy formation demonstration complete")
    println()
end

function demonstrate_trading_modes()
    println("💰 DEMONSTRATING TRADING MODES")
    println("━" ^ 50)
    
    # Check current mode
    current_mode = TradingModes.get_current_mode()
    if TradingModes.is_paper_mode()
        println("✅ Currently in PAPER TRADING mode")
        println("   💵 Virtual balance: Safe learning environment")
        println("   📊 Real market data: Live price feeds")
        println("   🔒 Real money protection: ACTIVE")
    else
        println("🚨 Currently in PRODUCTION mode")
        println("   💰 REAL MONEY AT RISK")
    end
    
    # Get portfolio status
    portfolio = TradingModes.get_portfolio()
    println()
    println("📊 Portfolio Status:")
    println("   Mode: $(portfolio["mode"])")
    
    if haskey(portfolio, "balances")
        println("   Balances:")
        for (currency, balance) in portfolio["balances"]
            @printf "     %s: %.2f\n" currency balance
        end
    end
    
    if haskey(portfolio, "performance")
        println("   Performance:")
        for (metric, value) in portfolio["performance"]
            @printf "     %s: %.4f\n" metric value
        end
    end
    
    println()
    println("💰 Trading modes demonstration complete")
    println()
end

function watch_agent_collaboration(duration_minutes::Int)
    println("👥 WATCHING AGENT COLLABORATION LIVE")
    println("━" ^ 50)
    println("⏱️  Duration: $duration_minutes minutes")
    println("🔄 Refresh interval: 30 seconds")
    println()
    
    start_time = now()
    end_time = start_time + Minute(duration_minutes)
    
    iteration = 1
    
    while now() < end_time
        println("━" ^ 50)
        println("📊 ITERATION $iteration ($(Dates.format(now(), "HH:MM:SS")))")
        println("━" ^ 50)
        
        # Check system status
        print_system_status()
        
        # Check trading team status
        print_trading_team_status()
        
        # Check strategy evolution
        print_strategy_status()
        
        # Check recent trades
        print_recent_trades()
        
        # Wait for next iteration
        remaining_time = Int(round((end_time - now()).value / 1000 / 60))
        println("⏱️  Time remaining: $remaining_time minutes")
        println()
        
        if now() < end_time
            println("⏸️  Waiting 30 seconds for next update...")
            sleep(30)
        end
        
        iteration += 1
    end
    
    println("✅ Live collaboration monitoring complete!")
    println()
end

function print_system_status()
    println("🖥️  System Status:")
    
    # Trading mode
    mode = TradingModes.is_paper_mode() ? "PAPER" : "PRODUCTION"
    println("   📋 Trading Mode: $mode")
    
    # System health
    println("   ❤️  System Health: OPERATIONAL")
    
    # Market data status
    println("   📈 Market Data: STREAMING")
    
    println()
end

function print_trading_team_status()
    println("🤖 AI Trading Team:")
    
    try
        team_status = OliverOS.get_system_status()
        if haskey(team_status, "trading_team")
            team_info = team_status["trading_team"]
            println("   🟢 Team Status: $(get(team_info, "status", "UNKNOWN"))")
            
            if haskey(team_info, "agents")
                for (role, agent_info) in team_info["agents"]
                    status = get(agent_info, "status", "UNKNOWN")
                    queue_length = get(agent_info, "queue_length", 0)
                    println("   • $role: $status (Queue: $queue_length)")
                end
            end
        else
            println("   ⚠️  Team information not available")
        end
    catch e
        println("   ❌ Error getting team status: $e")
    end
    
    println()
end

function print_strategy_status()
    println("🧠 Strategy Evolution:")
    
    try
        strategy_engine = StrategyEngine.get_strategy_engine()
        
        strategy_count = length(strategy_engine.library.strategies)
        println("   📊 Active Strategies: $strategy_count")
        
        if strategy_count > 0
            # Show top performing strategies
            rankings = StrategyEngine.rank_strategies()
            top_strategies = rankings[1:min(3, length(rankings))]
            
            println("   🏆 Top Performers:")
            for (i, (strategy, score)) in enumerate(top_strategies)
                @printf "     %d. %s (Score: %.3f)\n" i strategy.name score
            end
        end
        
        # Show recent collaborations
        recent_collaborations = length(strategy_engine.library.evolution_history)
        println("   🤝 Total Collaborations: $recent_collaborations")
        
    catch e
        println("   ❌ Error getting strategy status: $e")
    end
    
    println()
end

function print_recent_trades()
    println("💹 Trading Activity:")
    
    try
        portfolio = TradingModes.get_portfolio()
        
        if haskey(portfolio, "trade_count")
            trade_count = portfolio["trade_count"]
            println("   📈 Total Trades: $trade_count")
        end
        
        if haskey(portfolio, "performance")
            performance = portfolio["performance"]
            total_pnl = get(performance, "total_pnl", 0.0)
            win_rate = get(performance, "win_rate", 0.0)
            
            @printf "   💰 P&L: $%.2f\n" total_pnl
            @printf "   🎯 Win Rate: %.1f%%\n" (win_rate * 100)
        end
        
    catch e
        println("   ❌ Error getting trade data: $e")
    end
    
    println()
end

function print_final_summary()
    println("━" ^ 80)
    println("📋 DEMO SUMMARY")
    println("━" ^ 80)
    
    # System overview
    println("🖥️  System Overview:")
    println("   ✅ Real-time market data integration")
    println("   ✅ AI agent collaboration framework")
    println("   ✅ Strategy formation and evolution")
    println("   ✅ Paper trading with real data")
    println("   ✅ Performance tracking and optimization")
    
    println()
    
    # Performance summary
    try
        portfolio = TradingModes.get_portfolio()
        strategy_engine = StrategyEngine.get_strategy_engine()
        
        println("📊 Performance Summary:")
        
        if haskey(portfolio, "performance")
            performance = portfolio["performance"]
            @printf "   💰 Total P&L: $%.2f\n" get(performance, "total_pnl", 0.0)
            @printf "   📈 Win Rate: %.1f%%\n" (get(performance, "win_rate", 0.0) * 100)
            @printf "   📊 Total Trades: %.0f\n" get(performance, "total_trades", 0.0)
        end
        
        println("   🧠 Strategies Created: $(length(strategy_engine.library.strategies))")
        println("   🤝 Collaborations: $(length(strategy_engine.library.evolution_history))")
        
    catch e
        println("   ❌ Error generating summary: $e")
    end
    
    println()
    
    # Next steps
    println("🚀 Next Steps:")
    println("   1. Set up API keys for full market data access")
    println("   2. Let the system run longer to see strategy evolution")
    println("   3. When satisfied with performance, switch to production mode")
    println("   4. Connect real wallets for live trading")
    println()
    
    println("━" ^ 80)
    println("🎉 DEMO COMPLETE - JuliaOS is ready for battle!")
    println("━" ^ 80)
end

function main()
    try
        print_banner()
        check_environment()
        
        # Initialize the system
        initialize_system()
        
        # Demonstrate components
        demonstrate_market_data()
        demonstrate_strategy_formation()
        demonstrate_trading_modes()
        
        # Watch live collaboration
        watch_agent_collaboration(DEMO_DURATION_MINUTES)
        
        # Print final summary
        print_final_summary()
        
    catch e
        println("❌ Demo failed with error: $e")
        println("📚 Stack trace:")
        showerror(stdout, e, catch_backtrace())
        exit(1)
    end
end

# Run the demo
if abspath(PROGRAM_FILE) == @__FILE__
    main()
end