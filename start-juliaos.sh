#!/bin/bash

echo "🚀 Starting JuliaOS CLI..."
echo "📍 Working Directory: $(pwd)"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the JuliaOS root directory"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build julia-bridge if needed
if [ ! -d "packages/julia-bridge/dist" ]; then
    echo "🔨 Building julia-bridge..."
    cd packages/julia-bridge && npm run build && cd ../..
fi

# Ask user if they want to start the mock server
echo "🎭 Would you like to start the mock Julia server? (y/n)"
echo "   This provides sample data and better CLI experience"
read -r response

if [[ "$response" == "y" || "$response" == "Y" || "$response" == "yes" || "$response" == "Yes" ]]; then
    echo "🎭 Starting mock Julia server..."
    node mock-julia-server.js &
    MOCK_PID=$!
    echo "✅ Mock server started (PID: $MOCK_PID)"
    
    # Wait a moment for server to start
    sleep 2
    
    # Function to cleanup on exit
    cleanup() {
        echo ""
        echo "🔴 Shutting down mock server..."
        kill $MOCK_PID 2>/dev/null
        echo "✅ Cleanup complete"
        exit 0
    }
    
    # Set trap for cleanup
    trap cleanup SIGINT SIGTERM
fi

echo "✨ Starting JuliaOS Interactive CLI..."
echo ""
if [[ "$response" == "y" || "$response" == "Y" || "$response" == "yes" || "$response" == "Yes" ]]; then
    echo "🟢 Mock server running - full CLI functionality available"
else
    echo "🔴 Note: Julia engine not available - running in mock mode"
    echo "🟡 Most features will work with sample data"
fi
echo "🟢 Wallet management and UI fully functional"
echo ""

# Start the CLI
node packages/cli/src/interactive.cjs

# Cleanup mock server if it was started
if [[ "$response" == "y" || "$response" == "Y" || "$response" == "yes" || "$response" == "Yes" ]]; then
    cleanup
fi