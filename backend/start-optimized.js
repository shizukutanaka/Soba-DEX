#!/usr/bin/env node

/**
 * Optimized DEX Platform Startup Script
 * Fast boot with minimal overhead
 */

// Enable garbage collection if not already enabled
if (typeof global.gc !== 'function') {
  console.log('⚠️  Garbage collection not exposed. Use --expose-gc flag for better memory management.');
}

// Set optimal Node.js flags programmatically
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = [
    '--max-old-space-size=2048',     // 2GB heap limit
    '--max-new-space-size=512',      // 512MB new space
    '--optimize-for-size',           // Optimize for memory usage
    '--gc-interval=100'              // More frequent GC
  ].join(' ');
}

// Environment setup
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3001';

// Performance monitoring
const startTime = process.hrtime.bigint();

// Require the optimized server
require('./src/server-optimized');

// Log startup time
process.nextTick(() => {
  const bootTime = Number(process.hrtime.bigint() - startTime) / 1000000;
  console.log(`🚀 Startup completed in ${bootTime.toFixed(2)}ms`);
});

// Handle startup errors
process.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Process exited with code ${code}`);
  }
});

console.log('🏁 Optimized DEX Platform starting...');