"""
MarketDataEngine.jl - Real-Time Market Data Integration

This module provides real-time market data from multiple sources including:
- Alpha Vantage (stocks, forex, crypto)  
- Yahoo Finance (comprehensive market data)
- CoinGecko (cryptocurrency data)
- Binance API (crypto real-time)
- IEX Cloud (financial data)

Supports both streaming and REST API data with caching and fallback mechanisms.
"""
module MarketDataEngine

export MarketDataProvider, DataSource, MarketDataPoint, PriceStream
export initialize_market_data, get_real_time_price, get_historical_data
export subscribe_to_symbol, unsubscribe_from_symbol, get_market_status
export DataStreamManager, CacheManager, FailoverManager

using HTTP
using JSON3
using WebSockets
using Dates
using Statistics
using ..Types
using ..Storage
using ..Metrics
using ..TradingModes
using Logging
using Base.Threads

# Data source types
@enum DataSourceType begin
    ALPHA_VANTAGE = 1
    YAHOO_FINANCE = 2
    COINGECKO = 3
    BINANCE = 4
    IEX_CLOUD = 5
    TWELVE_DATA = 6
end

# Asset types
@enum AssetType begin
    STOCK = 1
    CRYPTO = 2
    FOREX = 3
    COMMODITY = 4
    INDEX = 5
end

# Data update frequency
@enum UpdateFrequency begin
    REAL_TIME = 1    # < 1 second
    HIGH_FREQ = 2    # 1-5 seconds
    NORMAL = 3       # 5-30 seconds
    LOW_FREQ = 4     # 1+ minutes
end

"""
Real-time market data point
"""
struct MarketDataPoint
    symbol::String
    timestamp::DateTime
    price::Float64
    volume::Float64
    bid::Float64
    ask::Float64
    high_24h::Float64
    low_24h::Float64
    change_24h::Float64
    change_pct_24h::Float64
    source::DataSourceType
    asset_type::AssetType
    metadata::Dict{String, Any}
    
    function MarketDataPoint(
        symbol::String,
        price::Float64,
        source::DataSourceType,
        asset_type::AssetType;
        timestamp::DateTime = now(),
        volume::Float64 = 0.0,
        bid::Float64 = 0.0,
        ask::Float64 = 0.0,
        high_24h::Float64 = 0.0,
        low_24h::Float64 = 0.0,
        change_24h::Float64 = 0.0,
        change_pct_24h::Float64 = 0.0,
        metadata::Dict{String, Any} = Dict{String, Any}()
    )
        new(symbol, timestamp, price, volume, bid, ask, high_24h, low_24h, 
            change_24h, change_pct_24h, source, asset_type, metadata)
    end
end

"""
Market data provider configuration
"""
mutable struct MarketDataProvider
    source_type::DataSourceType
    api_key::String
    base_url::String
    rate_limit_per_minute::Int
    last_request_time::DateTime
    request_count::Int
    active::Bool
    fallback_priority::Int
    
    function MarketDataProvider(
        source_type::DataSourceType,
        api_key::String,
        base_url::String;
        rate_limit_per_minute::Int = 60,
        fallback_priority::Int = 1
    )
        new(source_type, api_key, base_url, rate_limit_per_minute, 
            now(), 0, true, fallback_priority)
    end
end

"""
Price stream for real-time data
"""
mutable struct PriceStream
    symbol::String
    asset_type::AssetType
    subscribers::Set{String}  # Agent IDs
    last_update::DateTime
    current_price::Float64
    price_history::Vector{MarketDataPoint}
    update_frequency::UpdateFrequency
    websocket_connection::Union{WebSocket, Nothing}
    
    function PriceStream(symbol::String, asset_type::AssetType, frequency::UpdateFrequency = NORMAL)
        new(symbol, asset_type, Set{String}(), now(), 0.0, 
            Vector{MarketDataPoint}(), frequency, nothing)
    end
end

"""
Cache manager for market data
"""
mutable struct CacheManager
    price_cache::Dict{String, MarketDataPoint}
    historical_cache::Dict{String, Vector{MarketDataPoint}}
    cache_ttl_seconds::Int
    max_cache_size::Int
    
    function CacheManager(ttl_seconds::Int = 30, max_size::Int = 10000)
        new(Dict{String, MarketDataPoint}(), 
            Dict{String, Vector{MarketDataPoint}}(),
            ttl_seconds, max_size)
    end
end

"""
Data stream manager
"""
mutable struct DataStreamManager
    providers::Dict{DataSourceType, MarketDataProvider}
    price_streams::Dict{String, PriceStream}
    cache_manager::CacheManager
    active_subscriptions::Dict{String, Set{String}}  # symbol -> agent_ids
    stream_tasks::Dict{String, Task}
    
    function DataStreamManager()
        new(
            Dict{DataSourceType, MarketDataProvider}(),
            Dict{String, PriceStream}(),
            CacheManager(),
            Dict{String, Set{String}}(),
            Dict{String, Task}()
        )
    end
end

# Global market data manager
const MARKET_DATA_MANAGER = Ref{Union{DataStreamManager, Nothing}}(nothing)
const MARKET_DATA_LOCK = ReentrantLock()

"""
Initialize market data engine with API keys from environment
"""
function initialize_market_data()
    lock(MARKET_DATA_LOCK) do
        if MARKET_DATA_MANAGER[] === nothing
            manager = DataStreamManager()
            
            # Initialize providers based on available API keys
            setup_providers!(manager)
            
            MARKET_DATA_MANAGER[] = manager
            @info "Market data engine initialized" providers=length(manager.providers)
            
            # Start health monitoring
            @spawn monitor_data_streams()
        end
    end
end

"""
Setup data providers based on available API keys
"""
function setup_providers!(manager::DataStreamManager)
    # Alpha Vantage
    alpha_vantage_key = get(ENV, "ALPHA_VANTAGE_API_KEY", "")
    if alpha_vantage_key != ""
        manager.providers[ALPHA_VANTAGE] = MarketDataProvider(
            ALPHA_VANTAGE,
            alpha_vantage_key,
            "https://www.alphavantage.co/query",
            rate_limit_per_minute = 5,  # Free tier limit
            fallback_priority = 1
        )
        @info "Alpha Vantage provider configured"
    end
    
    # Yahoo Finance (no API key required)
    manager.providers[YAHOO_FINANCE] = MarketDataProvider(
        YAHOO_FINANCE,
        "",
        "https://query1.finance.yahoo.com/v8/finance/chart",
        rate_limit_per_minute = 100,
        fallback_priority = 2
    )
    @info "Yahoo Finance provider configured"
    
    # CoinGecko
    coingecko_key = get(ENV, "COINGECKO_API_KEY", "")
    manager.providers[COINGECKO] = MarketDataProvider(
        COINGECKO,
        coingecko_key,
        "https://api.coingecko.com/api/v3",
        rate_limit_per_minute = coingecko_key == "" ? 50 : 500,
        fallback_priority = 3
    )
    @info "CoinGecko provider configured"
    
    # Binance (public API, no key required for basic data)
    manager.providers[BINANCE] = MarketDataProvider(
        BINANCE,
        "",
        "https://api.binance.com/api/v3",
        rate_limit_per_minute = 1200,
        fallback_priority = 4
    )
    @info "Binance provider configured"
    
    # IEX Cloud
    iex_key = get(ENV, "IEX_CLOUD_API_KEY", "")
    if iex_key != ""
        manager.providers[IEX_CLOUD] = MarketDataProvider(
            IEX_CLOUD,
            iex_key,
            "https://cloud.iexapis.com/stable",
            rate_limit_per_minute = 100,
            fallback_priority = 5
        )
        @info "IEX Cloud provider configured"
    end
end

"""
Get market data manager
"""
function get_market_data_manager()::DataStreamManager
    if MARKET_DATA_MANAGER[] === nothing
        initialize_market_data()
    end
    return MARKET_DATA_MANAGER[]
end

"""
Get real-time price for a symbol
"""
function get_real_time_price(symbol::String; asset_type::AssetType = CRYPTO)::Union{MarketDataPoint, Nothing}
    manager = get_market_data_manager()
    
    # Check cache first
    cached_price = get_cached_price(manager, symbol)
    if cached_price !== nothing
        return cached_price
    end
    
    # Try providers in priority order
    providers = sort(collect(values(manager.providers)), by = p -> p.fallback_priority)
    
    for provider in providers
        if !provider.active
            continue
        end
        
        try
            price_data = fetch_price_from_provider(provider, symbol, asset_type)
            if price_data !== nothing
                # Cache the result
                cache_price!(manager, symbol, price_data)
                
                # Record metric
                Metrics.increment_counter(
                    "market_data_requests",
                    Dict("provider" => string(provider.source_type), "symbol" => symbol)
                )
                
                return price_data
            end
        catch e
            @warn "Failed to fetch price from provider" provider=provider.source_type symbol=symbol error=e
            continue
        end
    end
    
    @error "Failed to fetch price from all providers" symbol=symbol
    return nothing
end

"""
Fetch price from specific provider
"""
function fetch_price_from_provider(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    # Check rate limiting
    if !check_rate_limit(provider)
        @debug "Rate limit exceeded for provider" provider=provider.source_type
        return nothing
    end
    
    try
        if provider.source_type == ALPHA_VANTAGE
            return fetch_alpha_vantage_price(provider, symbol, asset_type)
        elseif provider.source_type == YAHOO_FINANCE
            return fetch_yahoo_price(provider, symbol, asset_type)
        elseif provider.source_type == COINGECKO
            return fetch_coingecko_price(provider, symbol, asset_type)
        elseif provider.source_type == BINANCE
            return fetch_binance_price(provider, symbol, asset_type)
        elseif provider.source_type == IEX_CLOUD
            return fetch_iex_price(provider, symbol, asset_type)
        end
    catch e
        @error "Error fetching from provider" provider=provider.source_type error=e
        return nothing
    end
    
    return nothing
end

"""
Fetch price from Alpha Vantage
"""
function fetch_alpha_vantage_price(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    function_type = if asset_type == CRYPTO
        "CURRENCY_EXCHANGE_RATE"
    elseif asset_type == FOREX
        "CURRENCY_EXCHANGE_RATE"
    else
        "GLOBAL_QUOTE"
    end
    
    params = Dict(
        "function" => function_type,
        "apikey" => provider.api_key
    )
    
    if asset_type == CRYPTO
        # Parse crypto symbol (e.g., "BTC/USD" -> from_currency=BTC, to_currency=USD)
        parts = split(symbol, "/")
        if length(parts) == 2
            params["from_currency"] = parts[1]
            params["to_currency"] = parts[2]
        else
            params["from_currency"] = symbol
            params["to_currency"] = "USD"
        end
    else
        params["symbol"] = symbol
    end
    
    url = provider.base_url * "?" * join(["$k=$v" for (k, v) in params], "&")
    
    response = HTTP.get(url)
    data = JSON3.read(response.body)
    
    update_rate_limit(provider)
    
    # Parse response based on function type
    if function_type == "CURRENCY_EXCHANGE_RATE"
        if haskey(data, "Realtime Currency Exchange Rate")
            rate_data = data["Realtime Currency Exchange Rate"]
            price = parse(Float64, rate_data["5. Exchange Rate"])
            
            return MarketDataPoint(
                symbol,
                price,
                ALPHA_VANTAGE,
                asset_type,
                timestamp = DateTime(rate_data["6. Last Refreshed"], "yyyy-mm-dd HH:MM:SS"),
                bid = parse(Float64, rate_data.get("8. Bid Price", "0")),
                ask = parse(Float64, rate_data.get("9. Ask Price", "0"))
            )
        end
    elseif function_type == "GLOBAL_QUOTE"
        if haskey(data, "Global Quote")
            quote_data = data["Global Quote"]
            price = parse(Float64, quote_data["05. price"])
            change = parse(Float64, quote_data["09. change"])
            change_pct = parse(Float64, quote_data["10. change percent"][1:end-1])  # Remove %
            
            return MarketDataPoint(
                symbol,
                price,
                ALPHA_VANTAGE,
                asset_type,
                change_24h = change,
                change_pct_24h = change_pct,
                high_24h = parse(Float64, quote_data["03. high"]),
                low_24h = parse(Float64, quote_data["04. low"]),
                volume = parse(Float64, quote_data["06. volume"])
            )
        end
    end
    
    return nothing
end

"""
Fetch price from Yahoo Finance
"""
function fetch_yahoo_price(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    # Convert symbol format for Yahoo (e.g., BTC/USD -> BTC-USD)
    yahoo_symbol = replace(symbol, "/" => "-")
    
    url = "$(provider.base_url)/$(yahoo_symbol)?interval=1m&range=1d"
    
    response = HTTP.get(url)
    data = JSON3.read(response.body)
    
    update_rate_limit(provider)
    
    if haskey(data, "chart") && !isempty(data["chart"]["result"])
        result = data["chart"]["result"][1]
        meta = result["meta"]
        
        # Get the latest price
        current_price = meta["regularMarketPrice"]
        
        return MarketDataPoint(
            symbol,
            current_price,
            YAHOO_FINANCE,
            asset_type,
            volume = meta.get("regularMarketVolume", 0),
            high_24h = meta.get("regularMarketDayHigh", 0),
            low_24h = meta.get("regularMarketDayLow", 0),
            change_24h = meta.get("regularMarketChange", 0),
            change_pct_24h = meta.get("regularMarketChangePercent", 0)
        )
    end
    
    return nothing
end

"""
Fetch price from CoinGecko
"""
function fetch_coingecko_price(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    # Convert symbol to CoinGecko format
    parts = split(symbol, "/")
    if length(parts) != 2
        return nothing
    end
    
    coin_id = lowercase(parts[1])
    vs_currency = lowercase(parts[2])
    
    # Map common symbols to CoinGecko IDs
    coin_id_map = Dict(
        "btc" => "bitcoin",
        "eth" => "ethereum", 
        "ada" => "cardano",
        "sol" => "solana",
        "dot" => "polkadot",
        "matic" => "polygon",
        "avax" => "avalanche-2"
    )
    
    coin_id = get(coin_id_map, coin_id, coin_id)
    
    url = "$(provider.base_url)/simple/price"
    params = Dict(
        "ids" => coin_id,
        "vs_currencies" => vs_currency,
        "include_24hr_change" => "true",
        "include_24hr_vol" => "true"
    )
    
    if provider.api_key != ""
        params["x_cg_demo_api_key"] = provider.api_key
    end
    
    query_string = join(["$k=$v" for (k, v) in params], "&")
    full_url = "$url?$query_string"
    
    response = HTTP.get(full_url)
    data = JSON3.read(response.body)
    
    update_rate_limit(provider)
    
    if haskey(data, coin_id)
        coin_data = data[coin_id]
        price = coin_data[vs_currency]
        
        return MarketDataPoint(
            symbol,
            price,
            COINGECKO,
            CRYPTO,
            volume = coin_data.get("$(vs_currency)_24h_vol", 0),
            change_pct_24h = coin_data.get("$(vs_currency)_24h_change", 0)
        )
    end
    
    return nothing
end

"""
Fetch price from Binance
"""
function fetch_binance_price(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    # Convert symbol to Binance format (e.g., BTC/USD -> BTCUSD)
    binance_symbol = replace(symbol, "/" => "")
    
    url = "$(provider.base_url)/ticker/24hr?symbol=$(binance_symbol)"
    
    response = HTTP.get(url)
    data = JSON3.read(response.body)
    
    update_rate_limit(provider)
    
    if haskey(data, "lastPrice")
        price = parse(Float64, data["lastPrice"])
        
        return MarketDataPoint(
            symbol,
            price,
            BINANCE,
            CRYPTO,
            volume = parse(Float64, data["volume"]),
            high_24h = parse(Float64, data["highPrice"]),
            low_24h = parse(Float64, data["lowPrice"]),
            change_24h = parse(Float64, data["priceChange"]),
            change_pct_24h = parse(Float64, data["priceChangePercent"])
        )
    end
    
    return nothing
end

"""
Fetch price from IEX Cloud
"""
function fetch_iex_price(
    provider::MarketDataProvider,
    symbol::String,
    asset_type::AssetType
)::Union{MarketDataPoint, Nothing}
    
    url = "$(provider.base_url)/stock/$(symbol)/quote?token=$(provider.api_key)"
    
    response = HTTP.get(url)
    data = JSON3.read(response.body)
    
    update_rate_limit(provider)
    
    if haskey(data, "latestPrice")
        price = data["latestPrice"]
        
        return MarketDataPoint(
            symbol,
            price,
            IEX_CLOUD,
            STOCK,
            volume = data.get("latestVolume", 0),
            high_24h = data.get("high", 0),
            low_24h = data.get("low", 0),
            change_24h = data.get("change", 0),
            change_pct_24h = data.get("changePercent", 0) * 100
        )
    end
    
    return nothing
end

"""
Subscribe agent to real-time price updates
"""
function subscribe_to_symbol(agent_id::String, symbol::String, asset_type::AssetType = CRYPTO)
    manager = get_market_data_manager()
    
    lock(MARKET_DATA_LOCK) do
        # Create price stream if it doesn't exist
        if !haskey(manager.price_streams, symbol)
            manager.price_streams[symbol] = PriceStream(symbol, asset_type, NORMAL)
        end
        
        # Add agent to subscribers
        push!(manager.price_streams[symbol].subscribers, agent_id)
        
        # Track subscription
        if !haskey(manager.active_subscriptions, symbol)
            manager.active_subscriptions[symbol] = Set{String}()
        end
        push!(manager.active_subscriptions[symbol], agent_id)
        
        # Start streaming task if not already running
        if !haskey(manager.stream_tasks, symbol)
            manager.stream_tasks[symbol] = @spawn stream_price_updates(symbol)
        end
    end
    
    @info "Agent subscribed to symbol" agent=agent_id symbol=symbol
    
    # Record metric
    Metrics.increment_counter("price_subscriptions", Dict("symbol" => symbol, "agent" => agent_id))
end

"""
Unsubscribe agent from price updates
"""
function unsubscribe_from_symbol(agent_id::String, symbol::String)
    manager = get_market_data_manager()
    
    lock(MARKET_DATA_LOCK) do
        if haskey(manager.price_streams, symbol)
            delete!(manager.price_streams[symbol].subscribers, agent_id)
            
            # If no more subscribers, stop the stream
            if isempty(manager.price_streams[symbol].subscribers)
                # Cancel the streaming task
                if haskey(manager.stream_tasks, symbol)
                    schedule(manager.stream_tasks[symbol], InterruptException(), error=true)
                    delete!(manager.stream_tasks, symbol)
                end
                
                delete!(manager.price_streams, symbol)
            end
        end
        
        if haskey(manager.active_subscriptions, symbol)
            delete!(manager.active_subscriptions[symbol], agent_id)
            if isempty(manager.active_subscriptions[symbol])
                delete!(manager.active_subscriptions, symbol)
            end
        end
    end
    
    @info "Agent unsubscribed from symbol" agent=agent_id symbol=symbol
end

"""
Stream price updates for a symbol
"""
function stream_price_updates(symbol::String)
    manager = get_market_data_manager()
    
    @info "Starting price stream" symbol=symbol
    
    while haskey(manager.price_streams, symbol)
        try
            # Get current price
            price_data = get_real_time_price(symbol)
            
            if price_data !== nothing
                stream = manager.price_streams[symbol]
                
                # Update stream data
                stream.current_price = price_data.price
                stream.last_update = now()
                push!(stream.price_history, price_data)
                
                # Keep only recent history (last 1000 points)
                if length(stream.price_history) > 1000
                    splice!(stream.price_history, 1:100)
                end
                
                # Notify subscribers (this would integrate with agent message system)
                notify_price_subscribers(symbol, price_data)
                
                # Record metric
                Metrics.record_gauge(
                    "market_price",
                    price_data.price,
                    Dict("symbol" => symbol, "source" => string(price_data.source))
                )
            end
            
            # Sleep based on update frequency
            sleep_duration = get_sleep_duration(manager.price_streams[symbol].update_frequency)
            sleep(sleep_duration)
            
        catch InterruptException
            @info "Price stream interrupted" symbol=symbol
            break
        catch e
            @error "Error in price stream" symbol=symbol error=e
            sleep(10)  # Back off on error
        end
    end
    
    @info "Price stream ended" symbol=symbol
end

"""
Get sleep duration based on update frequency
"""
function get_sleep_duration(frequency::UpdateFrequency)::Float64
    return if frequency == REAL_TIME
        0.5
    elseif frequency == HIGH_FREQ
        2.0
    elseif frequency == NORMAL
        10.0
    else  # LOW_FREQ
        60.0
    end
end

"""
Notify price subscribers (placeholder for agent notification)
"""
function notify_price_subscribers(symbol::String, price_data::MarketDataPoint)
    manager = get_market_data_manager()
    
    if haskey(manager.active_subscriptions, symbol)
        subscribers = manager.active_subscriptions[symbol]
        
        # TODO: Integrate with agent message system
        # For now, just log the notification
        @debug "Notifying price subscribers" symbol=symbol price=price_data.price subscribers=length(subscribers)
    end
end

"""
Check rate limiting for provider
"""
function check_rate_limit(provider::MarketDataProvider)::Bool
    current_time = now()
    time_window = Minute(1)
    
    # Reset counter if enough time has passed
    if current_time - provider.last_request_time > time_window
        provider.request_count = 0
        provider.last_request_time = current_time
    end
    
    return provider.request_count < provider.rate_limit_per_minute
end

"""
Update rate limit tracking
"""
function update_rate_limit(provider::MarketDataProvider)
    provider.request_count += 1
    provider.last_request_time = now()
end

"""
Get cached price if still valid
"""
function get_cached_price(manager::DataStreamManager, symbol::String)::Union{MarketDataPoint, Nothing}
    if haskey(manager.cache_manager.price_cache, symbol)
        cached_data = manager.cache_manager.price_cache[symbol]
        age_seconds = (now() - cached_data.timestamp).value / 1000
        
        if age_seconds < manager.cache_manager.cache_ttl_seconds
            return cached_data
        else
            # Remove expired cache entry
            delete!(manager.cache_manager.price_cache, symbol)
        end
    end
    
    return nothing
end

"""
Cache price data
"""
function cache_price!(manager::DataStreamManager, symbol::String, price_data::MarketDataPoint)
    # Check cache size limit
    if length(manager.cache_manager.price_cache) >= manager.cache_manager.max_cache_size
        # Remove oldest entries (simple FIFO for now)
        for (k, v) in manager.cache_manager.price_cache
            delete!(manager.cache_manager.price_cache, k)
            break
        end
    end
    
    manager.cache_manager.price_cache[symbol] = price_data
end

"""
Get historical data for a symbol
"""
function get_historical_data(
    symbol::String,
    days::Int = 30,
    interval::String = "1d";
    asset_type::AssetType = CRYPTO
)::Vector{MarketDataPoint}
    
    manager = get_market_data_manager()
    
    # Check cache first
    cache_key = "$(symbol)_$(days)d_$(interval)"
    if haskey(manager.cache_manager.historical_cache, cache_key)
        cached_data = manager.cache_manager.historical_cache[cache_key]
        if !isempty(cached_data)
            last_update = cached_data[end].timestamp
            if (now() - last_update).value / 1000 < 3600  # 1 hour cache
                return cached_data
            end
        end
    end
    
    # Fetch from providers
    providers = sort(collect(values(manager.providers)), by = p -> p.fallback_priority)
    
    for provider in providers
        if !provider.active
            continue
        end
        
        try
            historical_data = fetch_historical_from_provider(provider, symbol, days, interval, asset_type)
            if !isempty(historical_data)
                # Cache the result
                manager.cache_manager.historical_cache[cache_key] = historical_data
                return historical_data
            end
        catch e
            @warn "Failed to fetch historical data" provider=provider.source_type error=e
            continue
        end
    end
    
    @warn "Failed to fetch historical data from all providers" symbol=symbol
    return MarketDataPoint[]
end

"""
Fetch historical data from provider (simplified implementation)
"""
function fetch_historical_from_provider(
    provider::MarketDataProvider,
    symbol::String,
    days::Int,
    interval::String,
    asset_type::AssetType
)::Vector{MarketDataPoint}
    
    # This is a simplified implementation
    # In reality, each provider would have different historical data APIs
    
    historical_data = MarketDataPoint[]
    
    # Generate mock historical data for now
    # TODO: Implement actual historical data fetching for each provider
    
    start_date = now() - Day(days)
    current_price = get_real_time_price(symbol, asset_type = asset_type)
    base_price = current_price !== nothing ? current_price.price : 100.0
    
    for i in 1:days
        date = start_date + Day(i-1)
        # Simulate price movement
        price_change = (rand() - 0.5) * 0.05 * base_price  # ±2.5% daily
        price = base_price + price_change
        base_price = price
        
        data_point = MarketDataPoint(
            symbol,
            price,
            provider.source_type,
            asset_type,
            timestamp = date,
            volume = rand() * 1000000,
            high_24h = price * (1 + rand() * 0.02),
            low_24h = price * (1 - rand() * 0.02)
        )
        
        push!(historical_data, data_point)
    end
    
    return historical_data
end

"""
Get market status (open/closed)
"""
function get_market_status(market::String = "crypto")::Dict{String, Any}
    # Crypto markets are always open
    if market == "crypto"
        return Dict(
            "market" => market,
            "status" => "open",
            "next_close" => nothing,
            "next_open" => nothing
        )
    end
    
    # For stock markets, check business hours
    current_time = now()
    hour = Dates.hour(current_time)
    
    # Simplified US market hours (9:30 AM - 4:00 PM EST)
    is_open = hour >= 9 && hour < 16
    
    return Dict(
        "market" => market,
        "status" => is_open ? "open" : "closed",
        "current_time" => current_time,
        "local_hour" => hour
    )
end

"""
Monitor data streams and provider health
"""
function monitor_data_streams()
    @info "Starting market data monitoring"
    
    while true
        try
            manager = get_market_data_manager()
            
            # Check provider health
            for (source_type, provider) in manager.providers
                if provider.active
                    # Simple health check - try to fetch a test symbol
                    test_result = get_real_time_price("BTC/USD", asset_type = CRYPTO)
                    
                    if test_result === nothing
                        @warn "Provider health check failed" provider=source_type
                        # Don't disable automatically - let manual intervention decide
                    else
                        @debug "Provider health check passed" provider=source_type
                    end
                end
            end
            
            # Record metrics
            Metrics.record_gauge("active_price_streams", length(manager.price_streams))
            Metrics.record_gauge("active_providers", count(p -> p.active for p in values(manager.providers)))
            Metrics.record_gauge("cached_prices", length(manager.cache_manager.price_cache))
            
            sleep(300)  # Check every 5 minutes
            
        catch e
            @error "Error in data stream monitoring" error=e
            sleep(60)
        end
    end
end

# Initialize on module load
function __init__()
    # Don't auto-initialize to avoid API calls on module load
    # Call initialize_market_data() explicitly when needed
end

end # module