#!/usr/bin/env python3
"""
🔥 ELITE SWARM LAUNCHER 🔥
Launches the complete multi-agent trading system with all components
"""

import asyncio
import subprocess
import time
import os
import signal
import sys
from datetime import datetime

class EliteSwarmLauncher:
    def __init__(self):
        self.processes = []
        self.running = False
        
    def print_header(self):
        print("🔥" * 60)
        print("💀 ELITE TRADING SWARM LAUNCHER 💀")
        print("🚀 BANK BREAKING MULTI-AGENT SYSTEM 🚀")
        print("🔥" * 60)
        print()
        
    def print_agent_info(self):
        agents = [
            ("🕵️ Intelligence Agent", "Market analysis & pattern recognition"),
            ("🧠 Strategy Agent", "Strategy development & optimization"),
            ("🛡️ Risk Agent", "Capital protection & position sizing"),
            ("⚡ Execution Agent", "Optimal trade execution"),
            ("🏹 Arbitrage Hunter", "Cross-market opportunity discovery"),
            ("🧠 Swarm Coordinator", "Agent coordination & emergent intelligence")
        ]
        
        print("👥 ELITE AGENT SPECIALISTS:")
        print("-" * 50)
        for name, description in agents:
            print(f"{name:<20} | {description}")
        print()
        
    def print_coordination_flow(self):
        print("🔗 AGENT COORDINATION FLOW:")
        print("-" * 50)
        print("📈 Market Data → 🕵️ Intelligence → 🧠 Strategy → 🛡️ Risk → ⚡ Execution → 💰 Profit")
        print("📈 Market Data → 🕵️ Intelligence → 🏹 Arbitrage → 🛡️ Risk → ⚡ Execution → 💰 Profit")
        print("🧠 All agents ↔ 🧠 Swarm Coordinator (Real-time coordination)")
        print()
        
    def start_component(self, name, command, port=None):
        """Start a system component"""
        print(f"🚀 Starting {name}...")
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid
            )
            self.processes.append((name, process, port))
            time.sleep(2)  # Give it time to start
            
            if process.poll() is None:
                print(f"✅ {name} started successfully")
                if port:
                    print(f"   📡 Available at: http://localhost:{port}")
            else:
                print(f"❌ {name} failed to start")
                stdout, stderr = process.communicate()
                print(f"   Error: {stderr.decode()}")
                
        except Exception as e:
            print(f"❌ Failed to start {name}: {e}")
            
    def check_system_status(self):
        """Check status of all components"""
        print("\n📊 SYSTEM STATUS:")
        print("-" * 40)
        
        all_running = True
        for name, process, port in self.processes:
            if process.poll() is None:
                status = "🟢 RUNNING"
            else:
                status = "🔴 STOPPED"
                all_running = False
                
            port_info = f" (:{port})" if port else ""
            print(f"{name:<25} {status}{port_info}")
            
        return all_running
        
    def launch_elite_swarm(self):
        """Launch the complete elite swarm system"""
        self.print_header()
        self.print_agent_info()
        self.print_coordination_flow()
        
        print("🚀 LAUNCHING ELITE SWARM COMPONENTS...")
        print("=" * 50)
        
        # Start original MVP for comparison
        self.start_component(
            "Original MVP", 
            "python3 trading_mvp.py",
            8080
        )
        
        # Start elite swarm dashboard
        self.start_component(
            "Elite Dashboard",
            "python3 swarm_dashboard.py", 
            8081
        )
        
        # Start elite trading swarm
        self.start_component(
            "Elite Trading Swarm",
            "python3 elite_trading_swarm.py"
        )
        
        print("\n" + "=" * 50)
        
        # Check if all systems started
        if self.check_system_status():
            print("\n🎉 ALL SYSTEMS OPERATIONAL!")
            print("\n🌐 ACCESS POINTS:")
            print("   📊 Original MVP: http://localhost:8080")
            print("   🔥 Elite Swarm: http://localhost:8081")
            
            print("\n🎯 SYSTEM CAPABILITIES:")
            print("   • 🕵️ Real-time market intelligence")
            print("   • 🧠 Dynamic strategy optimization")
            print("   • 🛡️ Advanced risk management")
            print("   • ⚡ Optimal trade execution")
            print("   • 🏹 Cross-market arbitrage")
            print("   • 🧠 Emergent swarm intelligence")
            
            print("\n💀 COMPETITIVE ADVANTAGES:")
            print("   • Millisecond agent coordination")
            print("   • Superhuman pattern recognition")
            print("   • Zero-emotion trading")
            print("   • 24/7 market monitoring")
            print("   • Exponential performance scaling")
            
            self.running = True
            return True
        else:
            print("\n⚠️ Some systems failed to start")
            return False
            
    def monitor_system(self):
        """Monitor system and provide status updates"""
        print("\n🔍 MONITORING ELITE SWARM...")
        print("   Press Ctrl+C to stop all systems")
        print("-" * 40)
        
        try:
            while self.running:
                time.sleep(30)  # Check every 30 seconds
                
                print(f"\n📊 Status Update - {datetime.now().strftime('%H:%M:%S')}")
                if not self.check_system_status():
                    print("⚠️ System degradation detected")
                    
        except KeyboardInterrupt:
            print("\n🛑 Shutdown signal received...")
            self.shutdown_all()
            
    def shutdown_all(self):
        """Shutdown all system components"""
        print("\n🛑 SHUTTING DOWN ELITE SWARM...")
        
        for name, process, _ in self.processes:
            if process.poll() is None:
                print(f"   Stopping {name}...")
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    process.wait(timeout=5)
                except:
                    try:
                        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                    except:
                        pass
                        
        print("✅ All systems stopped")
        print("👋 Elite swarm operations terminated")
        
    def run(self):
        """Main run method"""
        try:
            if self.launch_elite_swarm():
                self.monitor_system()
        except Exception as e:
            print(f"❌ Critical error: {e}")
        finally:
            self.shutdown_all()

def main():
    """Main entry point"""
    launcher = EliteSwarmLauncher()
    launcher.run()

if __name__ == "__main__":
    main()