#!/usr/bin/env python3
"""
🌉 INTEGRATED SYSTEM LAUNCHER
JuliaOS + Elite Swarm Integration Demo
"""

import asyncio
import sys
import os

# Add integration path
sys.path.append('integration/bridges')

def print_header():
    print("🌉" * 50)
    print("🚀 JULIAOS + ELITE SWARM INTEGRATION")
    print("💀 UNIFIED BANK BREAKING SYSTEM 💀")
    print("🌉" * 50)
    print()

def print_integration_overview():
    print("🔗 INTEGRATION OVERVIEW:")
    print("-" * 40)
    print("📊 JuliaOS Core: Mathematical powerhouse")
    print("🤖 Elite Swarm: Agent coordination")
    print("🌉 Bridge Layer: Unified communication")
    print("⚡ TypeScript APIs: Existing infrastructure")
    print("🔗 Blockchain: Real trading capabilities")
    print()

def print_capabilities():
    print("💪 COMBINED CAPABILITIES:")
    print("-" * 40)
    print("• 🕵️ Intelligence Agent + Julia math = Superhuman analysis")
    print("• 🧠 Strategy Agent + Julia optimization = Perfect strategies")  
    print("• 🛡️ Risk Agent + Julia risk models = Bulletproof protection")
    print("• ⚡ Execution Agent + TypeScript APIs = Real trading")
    print("• 🏹 Arbitrage Hunter + Blockchain = Cross-chain profits")
    print("• 🧠 Swarm Coordinator = Emergent intelligence")
    print()

async def test_integration_demo():
    """Run a demo of the integrated system"""
    print("🧪 RUNNING INTEGRATION DEMO...")
    print("-" * 40)
    
    try:
        # Import the bridge
        from juliaos_swarm_bridge import JuliaOSSwarmBridge
        
        # Create bridge instance
        bridge = JuliaOSSwarmBridge()
        
        print("✅ Bridge created successfully")
        
        # Test connection components
        print("🔍 Testing connection components...")
        
        # Initialize bridge (will test all connections)
        await bridge.initialize()
        
        print("✅ Integration demo completed successfully!")
        
        # Show integration status
        print("\n📊 INTEGRATION STATUS:")
        print("-" * 30)
        for service, status in bridge.integration_status.items():
            status_emoji = "✅" if status == "connected" else "⚠️" if status == "fallback" else "❌"
            print(f"{status_emoji} {service}: {status}")
        
        overall_health = bridge.calculate_overall_health()
        print(f"\n💓 Overall Health: {overall_health.upper()}")
        
        return bridge
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("💡 Make sure all dependencies are installed")
        return None
        
    except Exception as e:
        print(f"❌ Integration error: {e}")
        print("💡 Check your JuliaOS configuration")
        return None

def print_next_steps():
    print("\n🚀 NEXT STEPS:")
    print("-" * 30)
    print("1. 📊 Customize bridge for your JuliaOS setup")
    print("2. 🔗 Connect to your existing TypeScript APIs")  
    print("3. 🧮 Integrate with your Julia mathematical models")
    print("4. 🌐 Add your blockchain/DeFi connections")
    print("5. 🚀 Launch full integrated system")
    print()

def print_integration_commands():
    print("📝 INTEGRATION COMMANDS:")
    print("-" * 30)
    print("# Test integration")
    print("python3 launch_integrated_system.py")
    print()
    print("# Run bridge directly")  
    print("python3 integration/bridges/juliaos_swarm_bridge.py")
    print()
    print("# Run original elite swarm")
    print("python3 elite_trading_swarm.py")
    print()
    print("# Run original MVP")
    print("python3 trading_mvp.py")
    print()

async def main():
    """Main integration launcher"""
    print_header()
    print_integration_overview()
    print_capabilities()
    
    # Run integration demo
    bridge = await test_integration_demo()
    
    if bridge:
        print("\n🎉 INTEGRATION SUCCESSFUL!")
        print("🔥 Your JuliaOS system is now enhanced with Elite Swarm agents!")
        
        print("\n🎯 WHAT YOU NOW HAVE:")
        print("• Elite agents coordinating in real-time")
        print("• Julia mathematical power behind agent decisions")
        print("• TypeScript infrastructure for real trading")
        print("• Blockchain connections for actual profits")
        print("• Unified system greater than sum of parts")
        
        print_next_steps()
        print_integration_commands()
        
        # Option to start full system
        try:
            print("🚀 Starting integrated Elite Swarm with JuliaOS enhancements...")
            print("   Press Ctrl+C to stop")
            print("-" * 50)
            
            # Start the swarm with JuliaOS integration
            if bridge.swarm_coordinator:
                await bridge.swarm_coordinator.start_swarm()
                
        except KeyboardInterrupt:
            print("\n🛑 Integrated system stopped")
            
    else:
        print("\n⚠️ INTEGRATION NEEDS SETUP")
        print("💡 Your existing JuliaOS system needs to be connected")
        print("📋 Follow the integration guide to complete setup")
        
        print_next_steps()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"\n❌ System error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n👋 Integration test complete")