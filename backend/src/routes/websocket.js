/**
 * WebSocket Routes
 * Health check and statistics endpoints for WebSocket service
 * Version: 2.8.0
 */

const express = require('express');
const router = express.Router();
const websocketService = require('../services/websocketService');

/**
 * GET /api/websocket/status
 * Get WebSocket service status
 */
router.get('/status', (req, res) => {
  const isInitialized = websocketService.isInitialized();
  const stats = isInitialized ? websocketService.getStats() : null;

  res.json({
    success: true,
    data: {
      initialized: isInitialized,
      enabled: process.env.ENABLE_WEBSOCKET !== 'false',
      stats: stats || {
        message: 'WebSocket service not initialized',
      },
    },
  });
});

/**
 * GET /api/websocket/stats
 * Get detailed WebSocket statistics
 */
router.get('/stats', (req, res) => {
  if (!websocketService.isInitialized()) {
    return res.status(503).json({
      success: false,
      error: 'WebSocket service not initialized',
    });
  }

  const stats = websocketService.getStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/websocket/health
 * Health check endpoint for WebSocket service
 */
router.get('/health', (req, res) => {
  const isInitialized = websocketService.isInitialized();
  const enabled = process.env.ENABLE_WEBSOCKET !== 'false';

  if (!enabled) {
    return res.status(200).json({
      success: true,
      status: 'disabled',
      message: 'WebSocket service is disabled',
    });
  }

  if (!isInitialized) {
    return res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'WebSocket service not initialized',
    });
  }

  const connectedClients = websocketService.getConnectedClients();

  res.json({
    success: true,
    status: 'healthy',
    connectedClients,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/websocket/rooms
 * Get available WebSocket rooms
 */
router.get('/rooms', (req, res) => {
  res.json({
    success: true,
    data: {
      rooms: [
        {
          name: 'gas-prices',
          description: 'Real-time gas price updates',
          event: 'gas-price',
        },
        {
          name: 'token-prices',
          description: 'Real-time token price updates',
          event: 'token-price',
        },
        {
          name: 'transactions',
          description: 'Real-time transaction updates (all)',
          event: 'transaction',
        },
        {
          name: 'user-transactions-{address}',
          description: 'Real-time transaction updates for specific address',
          event: 'transaction',
          requiresAuth: false,
          dynamic: true,
        },
      ],
      usage: {
        subscribe: 'socket.emit("subscribe", { room: "gas-prices" })',
        unsubscribe: 'socket.emit("unsubscribe", { room: "gas-prices" })',
      },
    },
  });
});

module.exports = router;
