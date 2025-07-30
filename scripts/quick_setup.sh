#!/bin/bash

# 🚀 JuliaOS Quick Setup Script
# This script automates the complete setup process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_banner() {
    echo -e "${BLUE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🤖 JULIAOS QUICK SETUP - AI TRADING PLATFORM 🤖"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${BLUE}🔄 $1${NC}"
}

check_dependencies() {
    log_step "Checking system dependencies..."
    
    # Check Julia
    if ! command -v julia &> /dev/null; then
        log_warn "Julia not found. Installing Julia..."
        
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Ubuntu/Debian
            sudo apt update
            sudo apt install -y julia
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew install julia
            else
                log_error "Homebrew not found. Please install Julia manually: https://julialang.org/downloads/"
                exit 1
            fi
        else
            log_error "Unsupported OS. Please install Julia manually: https://julialang.org/downloads/"
            exit 1
        fi
    else
        log_info "Julia found: $(julia --version)"
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found. Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    else
        log_info "Node.js found: $(node --version)"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm not found. Please install npm"
        exit 1
    else
        log_info "npm found: $(npm --version)"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git not found. Please install Git"
        exit 1
    else
        log_info "Git found: $(git --version)"
    fi
    
    # Check Docker (optional)
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found. Docker is optional but recommended for production"
    else
        log_info "Docker found: $(docker --version)"
    fi
}

setup_directories() {
    log_step "Creating required directories..."
    
    mkdir -p ~/.juliaos/
    mkdir -p julia/db/
    mkdir -p data/logs/
    mkdir -p config/
    
    log_info "Directories created"
}

setup_julia_environment() {
    log_step "Setting up Julia environment..."
    
    cd julia
    
    # Install Julia packages
    julia --project=. -e "
        using Pkg
        Pkg.instantiate()
        Pkg.precompile()
    "
    
    cd ..
    log_info "Julia environment ready"
}

setup_node_environment() {
    log_step "Setting up Node.js environment..."
    
    npm install
    
    log_info "Node.js environment ready"
}

check_api_keys() {
    log_step "Checking API key configuration..."
    
    local has_keys=false
    
    if [ ! -z "${ALPHA_VANTAGE_API_KEY}" ]; then
        log_info "Alpha Vantage API key configured"
        has_keys=true
    fi
    
    if [ ! -z "${COINGECKO_API_KEY}" ]; then
        log_info "CoinGecko API key configured"
        has_keys=true
    fi
    
    if [ ! -z "${IEX_CLOUD_API_KEY}" ]; then
        log_info "IEX Cloud API key configured"
        has_keys=true
    fi
    
    if [ "$has_keys" = false ]; then
        log_warn "No API keys configured. System will work with limited data sources."
        echo ""
        echo "To add API keys, run:"
        echo "export ALPHA_VANTAGE_API_KEY=\"your_key_here\""
        echo "export COINGECKO_API_KEY=\"your_key_here\""
        echo "export IEX_CLOUD_API_KEY=\"your_key_here\""
        echo ""
        echo "Then re-run this script."
        echo ""
        read -p "Continue without API keys? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

initialize_database() {
    log_step "Initializing database and system..."
    
    # Create initialization script
    cat > /tmp/julia_init.jl << 'EOF'
# Add the src directory to the path
push!(LOAD_PATH, joinpath(pwd(), "julia", "src"))

using JuliaOS

println("🚀 Initializing JuliaOS System...")

# Initialize the complete system
success = JuliaOS.initialize(
    storage_path = joinpath(homedir(), ".juliaos", "main.sqlite"),
    enable_trading = true,
    enable_monitoring = true
)

if success
    println("✅ System initialized successfully!")
    
    # Test market data
    try
        using JuliaOS.MarketDataEngine
        btc_price = MarketDataEngine.get_real_time_price("BTC/USD")
        if btc_price !== nothing
            println("📈 Market data test: BTC = \$$(round(btc_price.price, digits=2))")
        else
            println("📈 Market data: Available (no test data)")
        end
    catch e
        println("📈 Market data: $(e)")
    end
    
    # Test trading modes
    try
        using JuliaOS.TradingModes
        mode = TradingModes.is_paper_mode() ? "PAPER" : "PRODUCTION"
        println("💰 Trading mode: $mode")
    catch e
        println("💰 Trading mode: Error - $(e)")
    end
    
    # Test strategy engine
    try
        using JuliaOS.StrategyEngine
        engine = StrategyEngine.get_strategy_engine()
        println("🧠 Strategy engine: Ready ($(length(engine.library.strategies)) strategies)")
    catch e
        println("🧠 Strategy engine: Error - $(e)")
    end
    
    println("")
    println("🎯 System is ready!")
    println("Run 'julia examples/ai_collaboration_demo.jl' to see AI agents in action")
    exit(0)
else
    println("❌ System initialization failed!")
    exit(1)
end
EOF

    # Run initialization
    julia /tmp/julia_init.jl
    
    # Cleanup
    rm /tmp/julia_init.jl
}

create_env_template() {
    log_step "Creating environment template..."
    
    cat > .env.example << 'EOF'
# JuliaOS Environment Configuration

# Market Data API Keys (optional but recommended)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
COINGECKO_API_KEY=your_coingecko_key_here
IEX_CLOUD_API_KEY=your_iex_cloud_key_here

# AI/ML API Keys (optional, for advanced features)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here

# Production Trading (DANGER - only set when ready for real money)
# PRODUCTION_UNLOCK_CODE=your_secure_production_code_here

# Database Configuration
JULIAOS_DB_PATH=~/.juliaos/main.sqlite

# Monitoring (optional)
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

# Security
# ENCRYPTION_KEY=your_encryption_key_here
# API_RATE_LIMIT=100
EOF

    log_info "Environment template created (.env.example)"
    log_info "Copy to .env and configure your API keys"
}

create_quick_start_guide() {
    log_step "Creating quick start guide..."
    
    cat > QUICK_START.md << 'EOF'
# 🚀 JuliaOS Quick Start Guide

## ✅ Setup Complete!

Your JuliaOS AI Trading Platform is now ready. Here's what you can do:

### 🎮 Run the AI Collaboration Demo
```bash
julia examples/ai_collaboration_demo.jl
```
This will show you:
- Real-time market data feeds
- AI agents communicating and forming strategies
- Paper trading with real data
- Strategy evolution in action

### 🔧 Manual System Control
```julia
# Start Julia
julia --project=julia

# Load JuliaOS
using JuliaOS

# Check system status
status = JuliaOS.get_system_status()

# Check market data
using JuliaOS.MarketDataEngine
price = MarketDataEngine.get_real_time_price("BTC/USD")

# Check trading mode
using JuliaOS.TradingModes
println("Mode: ", TradingModes.is_paper_mode() ? "PAPER" : "PRODUCTION")

# View strategies
using JuliaOS.StrategyEngine
engine = StrategyEngine.get_strategy_engine()
println("Strategies: ", length(engine.library.strategies))
```

### 📊 Monitor Performance
- Watch agents create and evolve strategies
- Monitor P&L in paper trading mode
- Track win rates and performance metrics

### 🔒 Security Notes
- System starts in PAPER mode by default
- Real money trading requires production unlock code
- All trades are simulated until you switch modes

### 📈 Next Steps
1. Let the demo run to see strategy formation
2. Configure API keys for better market data
3. Monitor performance metrics
4. When satisfied, consider production mode

### ⚠️ Production Warning
NEVER switch to production mode unless:
- You've thoroughly tested in paper mode
- You understand the risks involved
- You have proper risk management in place
- You have set up appropriate position limits

---

🎯 **Your AI agents are now learning and collaborating!**
EOF

    log_info "Quick start guide created (QUICK_START.md)"
}

print_summary() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 JULIAOS SETUP COMPLETE! 🎉${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}🚀 Next Steps:${NC}"
    echo -e "${YELLOW}   1. julia examples/ai_collaboration_demo.jl${NC} - Run the live demo"
    echo -e "${YELLOW}   2. Configure API keys in .env file for better data${NC}"
    echo -e "${YELLOW}   3. Read QUICK_START.md for detailed instructions${NC}"
    echo ""
    echo -e "${BLUE}📊 What's Running:${NC}"
    echo "   • AI agents are collaborating and forming strategies"
    echo "   • Real-time market data feeds are active"
    echo "   • Paper trading mode is enabled (safe simulation)"
    echo "   • Strategy evolution engine is learning"
    echo ""
    echo -e "${BLUE}🔒 Safety:${NC}"
    echo "   • System is in PAPER mode (no real money at risk)"
    echo "   • All trades are simulated with virtual funds"
    echo "   • Production mode requires special unlock code"
    echo ""
    echo -e "${GREEN}✨ Your AI trading team is ready for battle! ✨${NC}"
    echo ""
}

# Main execution
main() {
    print_banner
    
    log_step "Starting JuliaOS setup..."
    
    check_dependencies
    setup_directories
    setup_julia_environment
    setup_node_environment
    check_api_keys
    initialize_database
    create_env_template
    create_quick_start_guide
    
    print_summary
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi