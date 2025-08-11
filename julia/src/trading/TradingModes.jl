module TradingModes

export is_paper_mode, current_mode

"""
Return the current trading mode string: "paper" (default) or "live".
Reads ENV["TRADING_MODE"]. Any value other than "live" is treated as "paper".
"""
function current_mode()::String
    mode = get(ENV, "TRADING_MODE", "paper")
    lowercase(mode) == "live" ? "live" : "paper"
end

"""
Return true if running in paper trading mode.
"""
function is_paper_mode()::Bool
    return current_mode() == "paper"
end

end # module