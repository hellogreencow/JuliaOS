module OliverOS

# Lightweight top-level module wrapper if JuliaOS was removed/renamed
# Ensure TradingModes is available for plan Phase 0 validation

include("trading/TradingModes.jl")
using .TradingModes

export TradingModes

end # module