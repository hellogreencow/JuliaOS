#!/usr/bin/env python3
"""
JuliaOS Trading MVP - A minimal viable trading system
that runs independently while Julia components compile.
"""

import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
import websockets
import aiohttp
import numpy as np

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class MarketData:
    symbol: str
    price: float
    volume: float
    timestamp: datetime
    bid: float
    ask: float
    
@dataclass
class Position:
    symbol: str
    quantity: float
    entry_price: float
    current_price: float
    pnl: float
    timestamp: datetime

@dataclass
class TradeSignal:
    symbol: str
    action: str  # 'BUY', 'SELL', 'HOLD'
    quantity: float
    confidence: float
    timestamp: datetime
    strategy: str

class MockMarketDataProvider:
    """Simulates real market data for testing"""
    
    def __init__(self):
        self.symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'AVAX/USD']
        self.base_prices = {
            'BTC/USD': 45000.0,
            'ETH/USD': 2500.0,
            'SOL/USD': 100.0,
            'AVAX/USD': 35.0
        }
        self.last_prices = self.base_prices.copy()
        
    async def get_market_data(self, symbol: str) -> MarketData:
        """Generate simulated market data"""
        # Simulate price movement with some volatility
        last_price = self.last_prices[symbol]
        change_percent = (random.random() - 0.5) * 0.02  # ±1% volatility
        new_price = last_price * (1 + change_percent)
        self.last_prices[symbol] = new_price
        
        # Generate bid/ask spread
        spread = new_price * 0.001  # 0.1% spread
        bid = new_price - spread/2
        ask = new_price + spread/2
        
        volume = random.uniform(1000, 10000)
        
        return MarketData(
            symbol=symbol,
            price=new_price,
            volume=volume,
            timestamp=datetime.now(),
            bid=bid,
            ask=ask
        )
        
    async def stream_market_data(self):
        """Stream continuous market data"""
        while True:
            for symbol in self.symbols:
                data = await self.get_market_data(symbol)
                yield data
            await asyncio.sleep(1)  # Update every second

class SimpleMovingAverageStrategy:
    """Basic moving average crossover strategy"""
    
    def __init__(self, short_window: int = 5, long_window: int = 20):
        self.short_window = short_window
        self.long_window = long_window
        self.price_history: Dict[str, List[float]] = {}
        
    def add_price(self, symbol: str, price: float):
        """Add new price to history"""
        if symbol not in self.price_history:
            self.price_history[symbol] = []
            
        self.price_history[symbol].append(price)
        
        # Keep only the required window size
        max_window = max(self.short_window, self.long_window)
        if len(self.price_history[symbol]) > max_window:
            self.price_history[symbol] = self.price_history[symbol][-max_window:]
    
    def generate_signal(self, symbol: str, current_price: float) -> Optional[TradeSignal]:
        """Generate trading signal based on moving average crossover"""
        self.add_price(symbol, current_price)
        
        prices = self.price_history.get(symbol, [])
        if len(prices) < self.long_window:
            return None
            
        # Calculate moving averages
        short_ma = np.mean(prices[-self.short_window:])
        long_ma = np.mean(prices[-self.long_window:])
        prev_short_ma = np.mean(prices[-self.short_window-1:-1])
        prev_long_ma = np.mean(prices[-self.long_window-1:-1])
        
        # Determine signal
        action = 'HOLD'
        confidence = 0.0
        
        # Bullish crossover
        if short_ma > long_ma and prev_short_ma <= prev_long_ma:
            action = 'BUY'
            confidence = min(abs(short_ma - long_ma) / long_ma * 100, 1.0)
            
        # Bearish crossover
        elif short_ma < long_ma and prev_short_ma >= prev_long_ma:
            action = 'SELL'
            confidence = min(abs(long_ma - short_ma) / long_ma * 100, 1.0)
        
        if action != 'HOLD':
            return TradeSignal(
                symbol=symbol,
                action=action,
                quantity=1.0,  # Fixed quantity for now
                confidence=confidence,
                timestamp=datetime.now(),
                strategy='SMA_Crossover'
            )
        
        return None

class PortfolioManager:
    """Manages trading portfolio and positions"""
    
    def __init__(self, initial_balance: float = 10000.0):
        self.initial_balance = initial_balance
        self.current_balance = initial_balance
        self.positions: Dict[str, Position] = {}
        self.trade_history: List[Dict] = []
        
    def get_portfolio_value(self, market_data: Dict[str, MarketData]) -> float:
        """Calculate total portfolio value"""
        total_value = self.current_balance
        
        for symbol, position in self.positions.items():
            if symbol in market_data:
                current_price = market_data[symbol].price
                position_value = position.quantity * current_price
                total_value += position_value
                
        return total_value
    
    def execute_trade(self, signal: TradeSignal, market_data: MarketData) -> bool:
        """Execute a trade based on signal"""
        symbol = signal.symbol
        current_price = market_data.price
        
        if signal.action == 'BUY':
            # Check if we have enough balance
            cost = signal.quantity * current_price
            if cost <= self.current_balance:
                self.current_balance -= cost
                
                if symbol in self.positions:
                    # Add to existing position
                    pos = self.positions[symbol]
                    total_quantity = pos.quantity + signal.quantity
                    avg_price = (pos.entry_price * pos.quantity + current_price * signal.quantity) / total_quantity
                    pos.quantity = total_quantity
                    pos.entry_price = avg_price
                else:
                    # Create new position
                    self.positions[symbol] = Position(
                        symbol=symbol,
                        quantity=signal.quantity,
                        entry_price=current_price,
                        current_price=current_price,
                        pnl=0.0,
                        timestamp=datetime.now()
                    )
                
                self.trade_history.append({
                    'action': 'BUY',
                    'symbol': symbol,
                    'quantity': signal.quantity,
                    'price': current_price,
                    'timestamp': datetime.now().isoformat(),
                    'strategy': signal.strategy
                })
                
                logger.info(f"Executed BUY: {signal.quantity} {symbol} @ ${current_price:.2f}")
                return True
                
        elif signal.action == 'SELL':
            # Check if we have the position
            if symbol in self.positions and self.positions[symbol].quantity >= signal.quantity:
                pos = self.positions[symbol]
                proceeds = signal.quantity * current_price
                self.current_balance += proceeds
                
                # Calculate PnL for this trade
                pnl = (current_price - pos.entry_price) * signal.quantity
                
                # Update position
                pos.quantity -= signal.quantity
                if pos.quantity <= 0:
                    del self.positions[symbol]
                
                self.trade_history.append({
                    'action': 'SELL',
                    'symbol': symbol,
                    'quantity': signal.quantity,
                    'price': current_price,
                    'pnl': pnl,
                    'timestamp': datetime.now().isoformat(),
                    'strategy': signal.strategy
                })
                
                logger.info(f"Executed SELL: {signal.quantity} {symbol} @ ${current_price:.2f}, PnL: ${pnl:.2f}")
                return True
        
        return False
    
    def update_positions(self, market_data: Dict[str, MarketData]):
        """Update current prices and PnL for all positions"""
        for symbol, position in self.positions.items():
            if symbol in market_data:
                current_price = market_data[symbol].price
                position.current_price = current_price
                position.pnl = (current_price - position.entry_price) * position.quantity

class SwarmOptimizer:
    """Simplified particle swarm optimization for strategy parameters"""
    
    def __init__(self, n_particles: int = 10):
        self.n_particles = n_particles
        self.particles = []
        self.global_best_position = None
        self.global_best_fitness = float('-inf')
        
    def optimize_strategy_params(self, strategy_class, param_bounds: Dict, fitness_func):
        """Optimize strategy parameters using PSO"""
        # Initialize particles
        self.particles = []
        for _ in range(self.n_particles):
            particle = {}
            for param, (min_val, max_val) in param_bounds.items():
                particle[param] = random.uniform(min_val, max_val)
            self.particles.append({
                'position': particle,
                'velocity': {param: 0 for param in param_bounds},
                'best_position': particle.copy(),
                'best_fitness': float('-inf')
            })
        
        # Simple optimization loop
        for iteration in range(10):  # Limited iterations for MVP
            for particle in self.particles:
                # Evaluate fitness
                fitness = fitness_func(particle['position'])
                
                # Update personal best
                if fitness > particle['best_fitness']:
                    particle['best_fitness'] = fitness
                    particle['best_position'] = particle['position'].copy()
                
                # Update global best
                if fitness > self.global_best_fitness:
                    self.global_best_fitness = fitness
                    self.global_best_position = particle['position'].copy()
            
            # Update particle positions (simplified)
            for particle in self.particles:
                for param in param_bounds:
                    r1, r2 = random.random(), random.random()
                    cognitive = 2.0 * r1 * (particle['best_position'][param] - particle['position'][param])
                    social = 2.0 * r2 * (self.global_best_position[param] - particle['position'][param])
                    
                    particle['velocity'][param] = 0.5 * particle['velocity'][param] + cognitive + social
                    particle['position'][param] += particle['velocity'][param]
                    
                    # Clamp to bounds
                    min_val, max_val = param_bounds[param]
                    particle['position'][param] = max(min_val, min(max_val, particle['position'][param]))
        
        return self.global_best_position

class TradingSystem:
    """Main trading system orchestrator"""
    
    def __init__(self):
        self.market_provider = MockMarketDataProvider()
        self.strategy = SimpleMovingAverageStrategy()
        self.portfolio = PortfolioManager()
        self.optimizer = SwarmOptimizer()
        self.is_running = False
        self.market_data_cache: Dict[str, MarketData] = {}
        
    async def start(self):
        """Start the trading system"""
        logger.info("🚀 Starting JuliaOS Trading MVP...")
        logger.info(f"💰 Initial Balance: ${self.portfolio.initial_balance:,.2f}")
        
        self.is_running = True
        
        # Start market data stream
        market_task = asyncio.create_task(self.process_market_data())
        
        # Start strategy optimization
        optimization_task = asyncio.create_task(self.periodic_optimization())
        
        # Start web dashboard
        dashboard_task = asyncio.create_task(self.start_dashboard())
        
        try:
            await asyncio.gather(market_task, optimization_task, dashboard_task)
        except KeyboardInterrupt:
            logger.info("🛑 Stopping trading system...")
            self.is_running = False
    
    async def process_market_data(self):
        """Process incoming market data and generate signals"""
        async for market_data in self.market_provider.stream_market_data():
            if not self.is_running:
                break
                
            self.market_data_cache[market_data.symbol] = market_data
            
            # Generate trading signal
            signal = self.strategy.generate_signal(market_data.symbol, market_data.price)
            
            if signal and signal.confidence > 0.3:  # Minimum confidence threshold
                # Execute trade
                success = self.portfolio.execute_trade(signal, market_data)
                if success:
                    await self.log_trade(signal, market_data)
            
            # Update portfolio
            self.portfolio.update_positions(self.market_data_cache)
            
            # Log portfolio status periodically
            if random.random() < 0.1:  # 10% chance
                await self.log_portfolio_status()
                
    async def periodic_optimization(self):
        """Periodically optimize strategy parameters"""
        while self.is_running:
            await asyncio.sleep(300)  # Every 5 minutes
            
            logger.info("🧠 Optimizing strategy parameters...")
            
            # Define parameter bounds for optimization
            param_bounds = {
                'short_window': (3, 10),
                'long_window': (15, 30)
            }
            
            # Simple fitness function (would be more sophisticated in production)
            def fitness_func(params):
                return random.random()  # Placeholder
                
            best_params = self.optimizer.optimize_strategy_params(
                SimpleMovingAverageStrategy, 
                param_bounds, 
                fitness_func
            )
            
            logger.info(f"📊 Optimized parameters: {best_params}")
            
            # Update strategy with new parameters
            self.strategy = SimpleMovingAverageStrategy(
                short_window=int(best_params['short_window']),
                long_window=int(best_params['long_window'])
            )
    
    async def log_trade(self, signal: TradeSignal, market_data: MarketData):
        """Log trade execution"""
        logger.info(f"📈 Signal: {signal.action} {signal.symbol} | "
                   f"Price: ${market_data.price:.2f} | "
                   f"Confidence: {signal.confidence:.1%}")
    
    async def log_portfolio_status(self):
        """Log current portfolio status"""
        total_value = self.portfolio.get_portfolio_value(self.market_data_cache)
        pnl = total_value - self.portfolio.initial_balance
        pnl_percent = (pnl / self.portfolio.initial_balance) * 100
        
        logger.info(f"💼 Portfolio: ${total_value:,.2f} | "
                   f"P&L: ${pnl:+,.2f} ({pnl_percent:+.2f}%) | "
                   f"Positions: {len(self.portfolio.positions)}")
    
    async def start_dashboard(self):
        """Simple web dashboard for monitoring"""
        from aiohttp import web, web_runner
        
        async def dashboard_handler(request):
            total_value = self.portfolio.get_portfolio_value(self.market_data_cache)
            pnl = total_value - self.portfolio.initial_balance
            
            html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>JuliaOS Trading MVP Dashboard</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: white; }}
                    .card {{ background: #2d2d2d; padding: 20px; margin: 10px 0; border-radius: 8px; }}
                    .positive {{ color: #00ff00; }}
                    .negative {{ color: #ff4444; }}
                    .metric {{ font-size: 24px; font-weight: bold; }}
                </style>
            </head>
            <body>
                <h1>🚀 JuliaOS Trading MVP Dashboard</h1>
                
                <div class="card">
                    <h2>Portfolio Status</h2>
                    <div class="metric">Total Value: ${total_value:,.2f}</div>
                    <div class="metric {'positive' if pnl >= 0 else 'negative'}">
                        P&L: ${pnl:+,.2f} ({(pnl/self.portfolio.initial_balance)*100:+.2f}%)
                    </div>
                    <div>Active Positions: {len(self.portfolio.positions)}</div>
                    <div>Cash Balance: ${self.portfolio.current_balance:,.2f}</div>
                </div>
                
                <div class="card">
                    <h2>Market Data</h2>
                    {''.join([f"<div>{data.symbol}: ${data.price:.2f}</div>" for data in self.market_data_cache.values()])}
                </div>
                
                <div class="card">
                    <h2>Recent Trades</h2>
                    {''.join([f"<div>{trade['action']} {trade['symbol']} @ ${trade['price']:.2f}</div>" for trade in self.portfolio.trade_history[-5:]])}
                </div>
                
                <div class="card">
                    <h2>System Status</h2>
                    <div>Status: {'🟢 Running' if self.is_running else '🔴 Stopped'}</div>
                    <div>Strategy: SMA Crossover ({self.strategy.short_window}/{self.strategy.long_window})</div>
                    <div>Last Update: {datetime.now().strftime('%H:%M:%S')}</div>
                </div>
            </body>
            </html>
            """
            return web.Response(text=html, content_type='text/html')
        
        app = web.Application()
        app.router.add_get('/', dashboard_handler)
        
        runner = web_runner.AppRunner(app)
        await runner.setup()
        site = web_runner.TCPSite(runner, 'localhost', 8080)
        await site.start()
        
        logger.info("🌐 Dashboard available at http://localhost:8080")
        
        # Keep the dashboard running
        while self.is_running:
            await asyncio.sleep(1)

async def main():
    """Main entry point"""
    system = TradingSystem()
    await system.start()

if __name__ == "__main__":
    print("🔥 JuliaOS Trading MVP")
    print("=" * 50)
    print("This is a minimal viable trading system that demonstrates")
    print("the core functionality while Julia components compile.")
    print("Features:")
    print("- Real-time market data simulation")
    print("- Moving average crossover strategy")
    print("- Portfolio management")
    print("- Swarm optimization")
    print("- Web dashboard at http://localhost:8080")
    print("=" * 50)
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Trading system stopped by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()