#!/usr/bin/env node

const http = require('http');
const url = require('url');

const PORT = 8052;

// Mock data
const mockData = {
  health: {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0-mock",
    components: {
      storage: { status: "healthy" },
      server: { status: "healthy" },
      framework: { status: "healthy" }
    },
    uptime_seconds: 0
  },
  
  systemOverview: {
    cpu_usage: { percent: 25.5, cores: 8, threads: 16 },
    memory_usage: { total: 16384, used: 4096, percent: 25.0 },
    storage: { total: 512000, used: 128000, percent: 25.0 },
    uptime: { seconds: 3600, formatted: "1 hour" },
    active_agents: 2,
    active_swarms: 1,
    pending_tasks: 0,
    timestamp: new Date().toISOString()
  },

  algorithms: [
    { id: "differential_evolution", name: "Differential Evolution", type: "global_optimization" },
    { id: "particle_swarm", name: "Particle Swarm Optimization", type: "global_optimization" },
    { id: "genetic_algorithm", name: "Genetic Algorithm", type: "global_optimization" },
    { id: "simulated_annealing", name: "Simulated Annealing", type: "global_optimization" }
  ]
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health endpoint
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockData.health));
    return;
  }

  // API endpoints
  if (path === '/api' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const command = data.command;

        let response = { success: true, data: null };

        switch (command) {
          case 'system.ping':
            response.data = { message: "pong", timestamp: new Date().toISOString() };
            break;

          case 'system.health':
            response.data = mockData.health;
            break;

          case 'metrics.get_system_overview':
            response.data = mockData.systemOverview;
            break;

          case 'algorithms.list_algorithms':
            response.data = { algorithms: mockData.algorithms };
            break;

          case 'agents.create_agent':
            const agentName = data.params?.name || 'MockAgent';
            response.data = {
              id: `agent-${Date.now()}`,
              name: agentName,
              type: 99,
              status: 1,
              created: new Date().toISOString(),
              updated: new Date().toISOString()
            };
            break;

          default:
            response = {
              success: false,
              error: `Mock server: Command '${command}' not implemented`,
              available_commands: [
                'system.ping',
                'system.health', 
                'metrics.get_system_overview',
                'algorithms.list_algorithms',
                'agents.create_agent'
              ]
            };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Stats endpoint
  if (path === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...mockData.systemOverview,
      server_type: "mock",
      note: "This is a mock Julia server for development"
    }));
    return;
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path, method }));
});

server.listen(PORT, () => {
  console.log(`🎭 Mock Julia Server running on http://localhost:${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Stats: http://localhost:${PORT}/stats`);
  console.log(`🔌 API: POST http://localhost:${PORT}/api`);
  console.log('');
  console.log('Available commands:');
  console.log('- system.ping');
  console.log('- system.health'); 
  console.log('- metrics.get_system_overview');
  console.log('- algorithms.list_algorithms');
  console.log('- agents.create_agent');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔴 Shutting down mock server...');
  server.close(() => {
    console.log('✅ Mock server stopped');
    process.exit(0);
  });
});