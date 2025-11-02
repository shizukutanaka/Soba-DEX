// SAND Cluster - Multi-core optimization
const cluster = require('cluster');
const os = require('os');
const express = require('express');
const processMonitor = require('./utils/processMonitor');

if (cluster.isMaster) {
  // Master process
  const numCPUs = Math.min(os.cpus().length, 4); // Max 4 workers
  console.log(`[SAND Cluster] Master ${process.pid} starting ${numCPUs} workers`);

  // Start process monitor
  const _monitor = processMonitor.start({
    name: 'SAND-Cluster',
    checkInterval: 15000,
    maxMemory: 50 * 1024 * 1024, // 50MB per worker
    autoRestart: true
  });

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    console.log(`[SAND Cluster] Worker ${worker.process.pid} started`);
  }

  // Handle worker messages
  cluster.on('message', (worker, message) => {
    if (message.type === 'ready') {
      console.log(`[SAND Cluster] Worker ${worker.process.pid} ready`);
    }
  });

  // Handle worker exit
  cluster.on('exit', (worker, code, signal) => {
    console.log(`[SAND Cluster] Worker ${worker.process.pid} died (${signal || code})`);

    if (!worker.exitedAfterDisconnect) {
      console.log('[SAND Cluster] Starting replacement worker');
      cluster.fork();
    }
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`[SAND Cluster] Received ${signal}, shutting down`);

    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM');
    }

    setTimeout(() => {
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

} else {
  // Worker process
  const app = express();
  const PORT = process.env.PORT || 3001;

  // Basic middleware
  app.use(express.json({ limit: '100kb' }));

  // Worker info endpoint
  app.get('/worker', (req, res) => {
    res.json({
      worker: cluster.worker.id,
      pid: process.pid,
      memory: Math.round(process.memoryUsage().heapUsed / 1048576),
      uptime: process.uptime()
    });
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      worker: cluster.worker.id,
      pid: process.pid
    });
  });

  // Simple API endpoint
  app.get('/api/data', (req, res) => {
    res.json({
      data: 'Response from worker ' + cluster.worker.id,
      timestamp: Date.now()
    });
  });

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`[Worker ${cluster.worker.id}] Listening on port ${PORT}`);
    process.send({ type: 'ready' });
  });

  // Worker shutdown
  process.on('SIGTERM', () => {
    console.log(`[Worker ${cluster.worker.id}] Shutting down`);
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = cluster;