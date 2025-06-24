#!/bin/bash

# JuliaOS Quick Setup Script
# This script automates the essential setup steps for JuliaOS

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Progress tracking
STEP=1
TOTAL_STEPS=8

print_step() {
    echo -e "${BLUE}[${STEP}/${TOTAL_STEPS}] $1${NC}"
    ((STEP++))
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running in correct directory
check_directory() {
    if [[ ! -f "package.json" ]] || [[ ! -d "julia" ]]; then
        print_error "Please run this script from the JuliaOS project root directory"
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    print_step "Checking system requirements..."
    
    # Check memory
    if command -v free >/dev/null 2>&1; then
        MEMORY_KB=$(free | grep '^Mem:' | awk '{print $2}')
        MEMORY_GB=$((MEMORY_KB / 1024 / 1024))
        if [ $MEMORY_GB -lt 6 ]; then
            print_warning "Low memory detected (${MEMORY_GB}GB). Julia compilation may be slow or fail."
            print_warning "Consider using Docker deployment instead."
        else
            print_success "Memory check passed (${MEMORY_GB}GB available)"
        fi
    fi
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | sed 's/v//')
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
        if [ $NODE_MAJOR -ge 18 ]; then
            print_success "Node.js version $NODE_VERSION detected"
        else
            print_error "Node.js v18+ required. Found v$NODE_VERSION"
            exit 1
        fi
    else
        print_error "Node.js not found. Please install Node.js v18+"
        exit 1
    fi
    
    # Check Julia
    if command -v julia >/dev/null 2>&1; then
        JULIA_VERSION=$(julia --version | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
        print_success "Julia version $JULIA_VERSION detected"
    else
        print_error "Julia not found. Please install Julia v1.10+"
        exit 1
    fi
    
    # Check Docker (optional)
    if command -v docker >/dev/null 2>&1; then
        print_success "Docker detected (optional Docker deployment available)"
        DOCKER_AVAILABLE=true
    else
        print_warning "Docker not found (manual setup will be used)"
        DOCKER_AVAILABLE=false
    fi
}

# Offer deployment choice
choose_deployment() {
    print_step "Choosing deployment method..."
    
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "Choose deployment method:"
        echo "1) Docker (Recommended - Easier setup)"
        echo "2) Manual (Development - More control)"
        
        read -p "Enter choice (1 or 2): " CHOICE
        
        case $CHOICE in
            1)
                DEPLOYMENT_METHOD="docker"
                print_success "Docker deployment selected"
                ;;
            2)
                DEPLOYMENT_METHOD="manual"
                print_success "Manual deployment selected"
                ;;
            *)
                print_warning "Invalid choice. Defaulting to manual deployment."
                DEPLOYMENT_METHOD="manual"
                ;;
        esac
    else
        DEPLOYMENT_METHOD="manual"
        print_success "Manual deployment selected (Docker not available)"
    fi
}

# Set up environment configuration
setup_environment() {
    print_step "Setting up environment configuration..."
    
    # Copy configuration files if they don't exist
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            print_success ".env file created from example"
        else
            print_warning ".env.example not found, creating basic .env"
            cat > .env << 'EOF'
# Basic JuliaOS Configuration
OPENAI_API_KEY=your_openai_api_key_here
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
POLYGON_RPC_URL=https://polygon-rpc.com
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NODE_ENV=development
EOF
        fi
    else
        print_success ".env file already exists"
    fi
    
    # Julia config
    if [[ ! -f "julia/config/config.toml" ]]; then
        if [[ -f "julia/config/config.example.toml" ]]; then
            cp julia/config/config.example.toml julia/config/config.toml
            print_success "Julia config.toml created from example"
        else
            print_warning "Julia config example not found"
        fi
    else
        print_success "Julia config.toml already exists"
    fi
    
    print_warning "Remember to edit .env and julia/config/config.toml with your API keys!"
}

# Docker deployment
deploy_docker() {
    print_step "Building Docker images..."
    
    # Make scripts executable
    chmod +x scripts/*.sh 2>/dev/null || true
    
    # Build Docker images
    if [[ -f "scripts/run-docker.sh" ]]; then
        ./scripts/run-docker.sh build
        print_success "Docker images built successfully"
    else
        # Fallback to docker compose
        docker compose build
        print_success "Docker images built using docker compose"
    fi
    
    print_step "Starting Docker services..."
    
    # Start services
    if [[ -f "scripts/run-docker.sh" ]]; then
        echo "Starting Julia server..."
        ./scripts/run-docker.sh server &
        SERVER_PID=$!
        
        # Wait for server to be healthy
        echo "Waiting for server to be ready..."
        sleep 30
        
        echo "Server should be ready. You can now run:"
        echo "./scripts/run-docker.sh cli"
    else
        # Fallback
        echo "Starting services with docker compose..."
        docker compose up -d
        print_success "Services started"
    fi
}

# Manual deployment
deploy_manual() {
    print_step "Installing Node.js dependencies..."
    
    # Install Node.js packages
    echo "This may take 10-15 minutes..."
    npm install --force
    print_success "Node.js dependencies installed"
    
    # Build TypeScript packages
    echo "Building TypeScript packages..."
    npm run build
    print_success "TypeScript packages built"
    
    print_step "Installing Julia dependencies..."
    
    # Install Julia packages
    echo "This may take 30+ minutes for first-time setup..."
    cd julia
    
    # Create a more robust Julia installation script
    julia -e '
    using Pkg
    try
        println("Activating Julia environment...")
        Pkg.activate(".")
        
        println("Updating package registry...")
        Pkg.Registry.update()
        
        println("Installing and precompiling packages...")
        Pkg.instantiate()
        Pkg.precompile()
        
        println("Julia setup completed successfully!")
    catch e
        println("Error during Julia setup: ", e)
        println("Trying alternative approach...")
        try
            Pkg.activate(".")
            Pkg.resolve()
            Pkg.instantiate()
            println("Alternative setup succeeded!")
        catch e2
            println("Alternative setup also failed: ", e2)
            exit(1)
        end
    end
    '
    
    cd ..
    print_success "Julia dependencies installed"
    
    print_step "Verifying installation..."
    
    # Test Julia module loading
    echo "Testing Julia module loading..."
    cd julia
    julia -e '
    try
        include("src/JuliaOS.jl")
        println("✅ JuliaOS module loaded successfully")
    catch e
        println("❌ Error loading JuliaOS module: ", e)
        exit(1)
    end
    ' || {
        print_warning "Julia module test failed, but installation may still work"
    }
    cd ..
    
    print_success "Manual installation completed"
}

# Final instructions
show_instructions() {
    print_step "Setup completed! Next steps:"
    
    echo -e "\n${GREEN}🎉 JuliaOS setup is complete!${NC}\n"
    
    if [[ "$DEPLOYMENT_METHOD" == "docker" ]]; then
        echo -e "${BLUE}To start using JuliaOS with Docker:${NC}"
        echo "1. Wait for the server to be fully ready (check logs)"
        echo "2. Run: ./scripts/run-docker.sh cli"
        echo "3. Or run: docker compose logs -f juliaos-server (to monitor)"
        echo
    else
        echo -e "${BLUE}To start using JuliaOS manually:${NC}"
        echo "1. Terminal 1 - Start Julia server:"
        echo "   cd julia/server"
        echo "   julia --project=.. julia_server.jl"
        echo
        echo "2. Terminal 2 - Start CLI (after server is ready):"
        echo "   node packages/cli/src/interactive.cjs"
        echo
    fi
    
    echo -e "${YELLOW}Important reminders:${NC}"
    echo "• Edit .env with your API keys (OpenAI, RPC URLs, etc.)"
    echo "• Edit julia/config/config.toml for blockchain settings"
    echo "• First Julia server startup takes extra time for compilation"
    echo "• Check JULIAOS_DEPLOYMENT_PLAN.md for detailed troubleshooting"
    echo
    
    echo -e "${BLUE}Verification commands:${NC}"
    echo "• Health check: curl http://localhost:8052/health"
    echo "• API test: curl -X POST http://localhost:8052/api -d '{\"command\":\"system.ping\"}' -H 'Content-Type: application/json'"
    echo
    
    echo -e "${GREEN}Happy coding with JuliaOS! 🚀${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}🤖 JuliaOS Quick Setup Script${NC}"
    echo -e "${BLUE}==============================${NC}\n"
    
    check_directory
    check_requirements
    choose_deployment
    setup_environment
    
    if [[ "$DEPLOYMENT_METHOD" == "docker" ]]; then
        deploy_docker
    else
        deploy_manual
    fi
    
    show_instructions
}

# Run main function with error handling
if main; then
    echo -e "\n${GREEN}✅ Setup completed successfully!${NC}"
else
    echo -e "\n${RED}❌ Setup failed. Check the error messages above.${NC}"
    echo -e "${YELLOW}💡 For detailed troubleshooting, see JULIAOS_DEPLOYMENT_PLAN.md${NC}"
    exit 1
fi