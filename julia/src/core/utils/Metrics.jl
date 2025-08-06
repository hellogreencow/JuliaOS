module Metrics

export init_metrics, record_trade_execution, record_portfolio_update, record_agent_health
export record_risk_metric, record_bridge_health, record_dex_trade, get_metrics_snapshot

using HTTP
using JSON3
using Dates
using Statistics
using Base.Threads

# Metrics storage
const METRICS_STORE = Dict{String, Any}()
const METRICS_LOCK = ReentrantLock()

# Prometheus metrics endpoint
const PROMETHEUS_PORT = 8054

"""
Initialize the metrics collection system
"""
function init_metrics()
    # Initialize metrics categories
    lock(METRICS_LOCK) do
        METRICS_STORE["trading"] = Dict{String, Any}()
        METRICS_STORE["agents"] = Dict{String, Any}()
        METRICS_STORE["risk"] = Dict{String, Any}()
        METRICS_STORE["bridges"] = Dict{String, Any}()
        METRICS_STORE["dex"] = Dict{String, Any}()
        METRICS_STORE["system"] = Dict{String, Any}()
    end
    
    # Start metrics server
    @spawn start_metrics_server()
    
    @info "Metrics system initialized on port $PROMETHEUS_PORT"
end

"""
Record trade execution metrics
"""
function record_trade_execution(
    agent_id::String,
    strategy::String,
    symbol::String,
    side::String,
    quantity::Float64,
    price::Float64,
    latency_ms::Float64,
    slippage_pct::Float64,
    success::Bool
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["trading"], "executions")
            METRICS_STORE["trading"]["executions"] = []
        end
        
        push!(METRICS_STORE["trading"]["executions"], Dict(
            "timestamp" => timestamp,
            "agent_id" => agent_id,
            "strategy" => strategy,
            "symbol" => symbol,
            "side" => side,
            "quantity" => quantity,
            "price" => price,
            "latency_ms" => latency_ms,
            "slippage_pct" => slippage_pct,
            "success" => success,
            "value_usd" => quantity * price
        ))
        
        # Update aggregated metrics
        update_trading_aggregates()
    end
end

"""
Record portfolio updates
"""
function record_portfolio_update(
    total_value_usd::Float64,
    pnl_usd::Float64,
    positions::Dict{String, Any}
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["trading"], "portfolio")
            METRICS_STORE["trading"]["portfolio"] = []
        end
        
        push!(METRICS_STORE["trading"]["portfolio"], Dict(
            "timestamp" => timestamp,
            "total_value_usd" => total_value_usd,
            "pnl_usd" => pnl_usd,
            "position_count" => length(positions),
            "positions" => positions
        ))
        
        # Update portfolio metrics
        update_portfolio_metrics(total_value_usd, pnl_usd)
    end
end

"""
Record agent health metrics
"""
function record_agent_health(
    agent_id::String,
    status::String,
    memory_usage_mb::Float64,
    cpu_usage_pct::Float64,
    task_queue_length::Int,
    last_activity::DateTime
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["agents"], agent_id)
            METRICS_STORE["agents"][agent_id] = []
        end
        
        push!(METRICS_STORE["agents"][agent_id], Dict(
            "timestamp" => timestamp,
            "status" => status,
            "memory_usage_mb" => memory_usage_mb,
            "cpu_usage_pct" => cpu_usage_pct,
            "task_queue_length" => task_queue_length,
            "last_activity" => last_activity,
            "uptime_seconds" => (timestamp - last_activity).value / 1000
        ))
        
        # Keep only last 1000 entries per agent
        if length(METRICS_STORE["agents"][agent_id]) > 1000
            splice!(METRICS_STORE["agents"][agent_id], 1:100)
        end
    end
end

"""
Record risk metrics
"""
function record_risk_metric(
    metric_name::String,
    value::Float64,
    threshold::Float64,
    alert_level::String
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["risk"], metric_name)
            METRICS_STORE["risk"][metric_name] = []
        end
        
        push!(METRICS_STORE["risk"][metric_name], Dict(
            "timestamp" => timestamp,
            "value" => value,
            "threshold" => threshold,
            "alert_level" => alert_level,
            "breach" => value > threshold
        ))
        
        # Keep only last 10000 entries per metric
        if length(METRICS_STORE["risk"][metric_name]) > 10000
            splice!(METRICS_STORE["risk"][metric_name], 1:1000)
        end
    end
end

"""
Record bridge health metrics
"""
function record_bridge_health(
    bridge_name::String,
    status::String,
    response_time_ms::Float64,
    error_count::Int,
    success_rate::Float64
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["bridges"], bridge_name)
            METRICS_STORE["bridges"][bridge_name] = []
        end
        
        push!(METRICS_STORE["bridges"][bridge_name], Dict(
            "timestamp" => timestamp,
            "status" => status,
            "response_time_ms" => response_time_ms,
            "error_count" => error_count,
            "success_rate" => success_rate,
            "healthy" => status == "healthy" && response_time_ms < 5000
        ))
    end
end

"""
Record DEX trade metrics
"""
function record_dex_trade(
    dex_name::String,
    pair::String,
    volume_usd::Float64,
    fee_usd::Float64,
    slippage_pct::Float64,
    success::Bool
)
    timestamp = now()
    
    lock(METRICS_LOCK) do
        if !haskey(METRICS_STORE["dex"], dex_name)
            METRICS_STORE["dex"][dex_name] = []
        end
        
        push!(METRICS_STORE["dex"][dex_name], Dict(
            "timestamp" => timestamp,
            "pair" => pair,
            "volume_usd" => volume_usd,
            "fee_usd" => fee_usd,
            "slippage_pct" => slippage_pct,
            "success" => success
        ))
    end
end

"""
Update trading aggregate metrics
"""
function update_trading_aggregates()
    executions = METRICS_STORE["trading"]["executions"]
    if isempty(executions)
        return
    end
    
    # Calculate recent performance (last 1000 trades)
    recent_trades = executions[max(1, end-999):end]
    
    # Win rate calculation
    successful_trades = count(t -> t["success"], recent_trades)
    win_rate = successful_trades / length(recent_trades)
    
    # Average latency
    avg_latency = mean(t -> t["latency_ms"], recent_trades)
    p99_latency = quantile([t["latency_ms"] for t in recent_trades], 0.99)
    
    # Total volume
    total_volume = sum(t -> t["value_usd"], recent_trades)
    
    # Update metrics
    METRICS_STORE["trading"]["win_rate"] = win_rate
    METRICS_STORE["trading"]["avg_latency_ms"] = avg_latency
    METRICS_STORE["trading"]["p99_latency_ms"] = p99_latency
    METRICS_STORE["trading"]["total_volume_usd"] = total_volume
end

"""
Update portfolio metrics
"""
function update_portfolio_metrics(current_value::Float64, current_pnl::Float64)
    portfolio_history = METRICS_STORE["trading"]["portfolio"]
    if length(portfolio_history) < 2
        return
    end
    
    # Calculate drawdown
    peak_value = maximum(p -> p["total_value_usd"], portfolio_history)
    drawdown_pct = ((peak_value - current_value) / peak_value) * 100
    
    # Calculate Sharpe ratio (simplified)
    returns = []
    for i in 2:length(portfolio_history)
        prev_val = portfolio_history[i-1]["total_value_usd"]
        curr_val = portfolio_history[i]["total_value_usd"]
        if prev_val > 0
            push!(returns, (curr_val - prev_val) / prev_val)
        end
    end
    
    if !isempty(returns)
        mean_return = mean(returns)
        std_return = std(returns)
        sharpe_ratio = std_return > 0 ? mean_return / std_return : 0.0
        
        METRICS_STORE["trading"]["sharpe_ratio"] = sharpe_ratio
    end
    
    METRICS_STORE["trading"]["drawdown_pct"] = drawdown_pct
    METRICS_STORE["trading"]["current_value_usd"] = current_value
    METRICS_STORE["trading"]["current_pnl_usd"] = current_pnl
end

"""
Start metrics HTTP server for Prometheus scraping
"""
function start_metrics_server()
    server = HTTP.serve("0.0.0.0", PROMETHEUS_PORT) do request::HTTP.Request
        if request.target == "/metrics"
            return HTTP.Response(200, export_prometheus_metrics())
        elseif request.target == "/agent-metrics"
            return HTTP.Response(200, export_agent_metrics())
        elseif request.target == "/trading-metrics"
            return HTTP.Response(200, export_trading_metrics())
        elseif request.target == "/risk-metrics"
            return HTTP.Response(200, export_risk_metrics())
        elseif request.target == "/bridge-health"
            return HTTP.Response(200, export_bridge_metrics())
        elseif request.target == "/dex-metrics"
            return HTTP.Response(200, export_dex_metrics())
        else
            return HTTP.Response(404, "Not Found")
        end
    end
    
    @info "Metrics server started on port $PROMETHEUS_PORT"
end

"""
Export metrics in Prometheus format
"""
function export_prometheus_metrics()
    lock(METRICS_LOCK) do
        metrics = String[]
        
        # Trading metrics
        if haskey(METRICS_STORE["trading"], "win_rate")
            push!(metrics, "# TYPE trading_strategy_win_rate gauge")
            push!(metrics, "trading_strategy_win_rate $(METRICS_STORE["trading"]["win_rate"])")
        end
        
        if haskey(METRICS_STORE["trading"], "avg_latency_ms")
            push!(metrics, "# TYPE trading_execution_latency_seconds histogram")
            latency_sec = METRICS_STORE["trading"]["avg_latency_ms"] / 1000
            push!(metrics, "trading_execution_latency_seconds{quantile=\"0.50\"} $latency_sec")
        end
        
        if haskey(METRICS_STORE["trading"], "p99_latency_ms")
            latency_sec = METRICS_STORE["trading"]["p99_latency_ms"] / 1000
            push!(metrics, "trading_execution_latency_seconds{quantile=\"0.99\"} $latency_sec")
        end
        
        if haskey(METRICS_STORE["trading"], "sharpe_ratio")
            push!(metrics, "# TYPE trading_portfolio_sharpe_ratio gauge")
            push!(metrics, "trading_portfolio_sharpe_ratio $(METRICS_STORE["trading"]["sharpe_ratio"])")
        end
        
        if haskey(METRICS_STORE["trading"], "drawdown_pct")
            push!(metrics, "# TYPE trading_portfolio_drawdown_pct gauge")
            push!(metrics, "trading_portfolio_drawdown_pct $(METRICS_STORE["trading"]["drawdown_pct"])")
        end
        
        if haskey(METRICS_STORE["trading"], "current_value_usd")
            push!(metrics, "# TYPE trading_portfolio_value_usd gauge")
            push!(metrics, "trading_portfolio_value_usd $(METRICS_STORE["trading"]["current_value_usd"])")
        end
        
        if haskey(METRICS_STORE["trading"], "current_pnl_usd")
            push!(metrics, "# TYPE trading_portfolio_pnl_total gauge")
            push!(metrics, "trading_portfolio_pnl_total $(METRICS_STORE["trading"]["current_pnl_usd"])")
        end
        
        return join(metrics, "\n")
    end
end

"""
Export agent-specific metrics
"""
function export_agent_metrics()
    lock(METRICS_LOCK) do
        metrics = String[]
        
        push!(metrics, "# TYPE up gauge")
        for (agent_id, history) in METRICS_STORE["agents"]
            if !isempty(history)
                latest = history[end]
                status_val = latest["status"] == "RUNNING" ? 1 : 0
                push!(metrics, "up{job=\"trading-agents\",agent_id=\"$agent_id\"} $status_val")
                
                push!(metrics, "# TYPE agent_memory_usage_bytes gauge")
                memory_bytes = latest["memory_usage_mb"] * 1024 * 1024
                push!(metrics, "agent_memory_usage_bytes{agent_id=\"$agent_id\"} $memory_bytes")
                
                push!(metrics, "# TYPE agent_cpu_usage_seconds_total counter")
                cpu_usage = latest["cpu_usage_pct"] / 100
                push!(metrics, "agent_cpu_usage_seconds_total{agent_id=\"$agent_id\"} $cpu_usage")
                
                push!(metrics, "# TYPE agent_task_queue_length gauge")
                push!(metrics, "agent_task_queue_length{agent_id=\"$agent_id\"} $(latest["task_queue_length"])")
            end
        end
        
        return join(metrics, "\n")
    end
end

"""
Export trading-specific metrics
"""
function export_trading_metrics()
    return export_prometheus_metrics()
end

"""
Export risk metrics
"""
function export_risk_metrics()
    lock(METRICS_LOCK) do
        metrics = String[]
        
        for (metric_name, history) in METRICS_STORE["risk"]
            if !isempty(history)
                latest = history[end]
                safe_name = replace(metric_name, "-" => "_")
                push!(metrics, "# TYPE risk_$safe_name gauge")
                push!(metrics, "risk_$safe_name $(latest["value"])")
            end
        end
        
        return join(metrics, "\n")
    end
end

"""
Export bridge health metrics
"""
function export_bridge_metrics()
    lock(METRICS_LOCK) do
        metrics = String[]
        
        push!(metrics, "# TYPE bridge_health_status gauge")
        push!(metrics, "# TYPE bridge_response_time_seconds gauge")
        
        for (bridge_name, history) in METRICS_STORE["bridges"]
            if !isempty(history)
                latest = history[end]
                status_val = latest["healthy"] ? 1 : 0
                response_time_sec = latest["response_time_ms"] / 1000
                
                push!(metrics, "bridge_health_status{bridge_name=\"$bridge_name\"} $status_val")
                push!(metrics, "bridge_response_time_seconds{bridge_name=\"$bridge_name\"} $response_time_sec")
            end
        end
        
        return join(metrics, "\n")
    end
end

"""
Export DEX metrics
"""
function export_dex_metrics()
    lock(METRICS_LOCK) do
        metrics = String[]
        
        push!(metrics, "# TYPE dex_connection_status gauge")
        push!(metrics, "# TYPE dex_trade_volume_usd_total counter")
        push!(metrics, "# TYPE dex_trade_slippage_pct gauge")
        
        for (dex_name, history) in METRICS_STORE["dex"]
            if !isempty(history)
                # Calculate aggregates
                recent_trades = history[max(1, end-99):end]  # Last 100 trades
                total_volume = sum(t -> t["volume_usd"], recent_trades)
                avg_slippage = mean(t -> t["slippage_pct"], recent_trades)
                connection_status = any(t -> t["success"], recent_trades) ? 1 : 0
                
                push!(metrics, "dex_connection_status{dex_name=\"$dex_name\"} $connection_status")
                push!(metrics, "dex_trade_volume_usd_total{dex_name=\"$dex_name\"} $total_volume")
                push!(metrics, "dex_trade_slippage_pct{dex_name=\"$dex_name\"} $avg_slippage")
            end
        end
        
        return join(metrics, "\n")
    end
end

"""
Get current metrics snapshot
"""
function get_metrics_snapshot()
    lock(METRICS_LOCK) do
        return deepcopy(METRICS_STORE)
    end
end

end # module