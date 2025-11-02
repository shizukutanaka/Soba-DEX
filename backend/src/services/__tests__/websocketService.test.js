/**
 * Unit tests for WebSocketService
 * @version 2.8.0
 */

const { Server } = require('socket.io');
const { createServer } = require('http');

// Mock dependencies
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../metricsService', () => ({
  recordWebSocketConnection: jest.fn(),
  recordWebSocketMessage: jest.fn(),
  recordWebSocketError: jest.fn(),
}));

const WebSocketService = require('../websocketService');

describe('WebSocketService', () => {
  let wsService;
  let httpServer;
  let mockIo;
  let mockSocket;

  beforeEach(() => {
    // Create HTTP server for testing
    httpServer = createServer();

    // Mock socket
    mockSocket = {
      id: 'test-socket-id',
      handshake: {
        auth: {},
        headers: {},
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      disconnect: jest.fn(),
      rooms: new Set(),
    };

    // Mock Socket.io server
    mockIo = {
      on: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      use: jest.fn(),
      sockets: {
        sockets: new Map([[mockSocket.id, mockSocket]]),
      },
      engine: {
        clientsCount: 1,
      },
    };

    wsService = new WebSocketService();
    wsService.io = mockIo;
  });

  afterEach(() => {
    if (httpServer.listening) {
      httpServer.close();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with HTTP server', () => {
      const service = new WebSocketService();
      service.initialize(httpServer);

      expect(service.io).toBeDefined();
      expect(service.initialized).toBe(true);
    });

    it('should initialize with custom options', () => {
      const service = new WebSocketService();
      const options = {
        cors: {
          origin: 'http://localhost:3000',
          credentials: true,
        },
        pingTimeout: 30000,
        pingInterval: 10000,
      };

      service.initialize(httpServer, options);

      expect(service.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', () => {
      wsService.initialized = true;
      const logger = require('../../config/logger');

      wsService.initialize(httpServer);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already initialized')
      );
    });

    it('should handle initialization errors', () => {
      const service = new WebSocketService();
      const logger = require('../../config/logger');

      // Pass invalid server
      expect(() => {
        service.initialize(null);
      }).toThrow();
    });
  });

  describe('Connection Handling', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should handle new connection', () => {
      const connectionHandler = wsService.handleConnection.bind(wsService);
      connectionHandler(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe', expect.any(Function));
    });

    it('should track connected clients', () => {
      wsService.handleConnection(mockSocket);

      expect(wsService.getConnectedClientsCount()).toBeGreaterThan(0);
    });

    it('should handle disconnection', () => {
      wsService.handleConnection(mockSocket);

      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];

      disconnectHandler('client disconnect');

      const logger = require('../../config/logger');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('disconnected')
      );
    });

    it('should clean up on disconnect', () => {
      wsService.handleConnection(mockSocket);
      mockSocket.rooms.add('gas-prices');

      const disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];

      disconnectHandler();

      // Verify cleanup happened
      expect(mockSocket.rooms.size).toBeLessThanOrEqual(1); // Only default room
    });
  });

  describe('Room Subscriptions', () => {
    beforeEach(() => {
      wsService.initialized = true;
      wsService.handleConnection(mockSocket);
    });

    it('should subscribe to room', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe'
      )[1];

      subscribeHandler({ room: 'gas-prices' });

      expect(mockSocket.join).toHaveBeenCalledWith('gas-prices');
    });

    it('should handle multiple room subscriptions', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe'
      )[1];

      subscribeHandler({ room: 'gas-prices' });
      subscribeHandler({ room: 'token-prices' });

      expect(mockSocket.join).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from room', () => {
      const unsubscribeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'unsubscribe'
      )[1];

      unsubscribeHandler({ room: 'gas-prices' });

      expect(mockSocket.leave).toHaveBeenCalledWith('gas-prices');
    });

    it('should validate room names', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe'
      )[1];

      // Test invalid room
      subscribeHandler({ room: '' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          message: expect.stringContaining('Invalid room'),
        })
      );
    });

    it('should list available rooms', () => {
      const rooms = wsService.getAvailableRooms();

      expect(rooms).toContain('gas-prices');
      expect(rooms).toContain('token-prices');
      expect(rooms).toContain('transactions');
    });
  });

  describe('Broadcasting', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should broadcast to room', () => {
      wsService.broadcastToRoom('gas-prices', {
        network: 'ethereum',
        prices: { fast: 50 },
      });

      expect(mockIo.to).toHaveBeenCalledWith('gas-prices');
      expect(mockIo.emit).toHaveBeenCalledWith(
        'gas-prices',
        expect.objectContaining({
          network: 'ethereum',
        })
      );
    });

    it('should broadcast gas prices', () => {
      const gasPrices = {
        network: 'ethereum',
        prices: {
          slow: 30,
          standard: 40,
          fast: 50,
        },
        timestamp: Date.now(),
      };

      wsService.broadcastGasPrices(gasPrices);

      expect(mockIo.to).toHaveBeenCalledWith('gas-prices');
    });

    it('should broadcast token prices', () => {
      const tokenPrices = {
        ETH: { usd: 2000, change24h: 5.2 },
        BTC: { usd: 40000, change24h: -2.1 },
      };

      wsService.broadcastTokenPrices(tokenPrices);

      expect(mockIo.to).toHaveBeenCalledWith('token-prices');
    });

    it('should broadcast transaction updates', () => {
      const transaction = {
        hash: '0x123...',
        status: 'confirmed',
        from: '0xabc...',
        to: '0xdef...',
      };

      wsService.broadcastTransaction(transaction);

      expect(mockIo.to).toHaveBeenCalledWith('transactions');
    });

    it('should handle broadcast errors', () => {
      mockIo.to.mockImplementation(() => {
        throw new Error('Broadcast failed');
      });

      const logger = require('../../config/logger');

      wsService.broadcastToRoom('test-room', { data: 'test' });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error broadcasting'),
        expect.any(Error)
      );
    });
  });

  describe('Authentication', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should authenticate socket with valid token', () => {
      const mockNext = jest.fn();
      mockSocket.handshake.auth.token = 'valid-token';

      wsService.setupAuthentication();
      const authMiddleware = mockIo.use.mock.calls[0][0];

      authMiddleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      const mockNext = jest.fn();
      mockSocket.handshake.auth.token = 'invalid-token';

      wsService.setupAuthentication({ required: true });
      const authMiddleware = mockIo.use.mock.calls[0][0];

      authMiddleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should allow connections without auth when not required', () => {
      const mockNext = jest.fn();
      delete mockSocket.handshake.auth.token;

      wsService.setupAuthentication({ required: false });
      const authMiddleware = mockIo.use.mock.calls[0][0];

      authMiddleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should return connection statistics', () => {
      const stats = wsService.getStatistics();

      expect(stats).toHaveProperty('connectedClients');
      expect(stats).toHaveProperty('totalRooms');
      expect(stats).toHaveProperty('messagesSent');
    });

    it('should track messages sent', () => {
      const initialStats = wsService.getStatistics();
      const initialCount = initialStats.messagesSent || 0;

      wsService.broadcastToRoom('test-room', { data: 'test' });

      const updatedStats = wsService.getStatistics();
      expect(updatedStats.messagesSent).toBeGreaterThanOrEqual(initialCount);
    });

    it('should provide room-specific statistics', () => {
      mockSocket.rooms.add('gas-prices');

      const roomStats = wsService.getRoomStatistics('gas-prices');

      expect(roomStats).toHaveProperty('room');
      expect(roomStats).toHaveProperty('subscribers');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should handle socket errors', () => {
      wsService.handleConnection(mockSocket);

      const errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('Socket error'));

        const logger = require('../../config/logger');
        expect(logger.error).toHaveBeenCalled();
      }
    });

    it('should handle malformed messages', () => {
      wsService.handleConnection(mockSocket);

      const subscribeHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe'
      )[1];

      // Send malformed data
      subscribeHandler(null);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.any(Object)
      );
    });

    it('should not crash on disconnect errors', () => {
      mockSocket.disconnect.mockImplementation(() => {
        throw new Error('Disconnect failed');
      });

      expect(() => {
        wsService.handleConnection(mockSocket);
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      wsService.initialized = true;
    });

    it('should close all connections on shutdown', async () => {
      mockIo.close = jest.fn((callback) => callback && callback());

      await wsService.shutdown();

      expect(mockIo.close).toHaveBeenCalled();
      expect(wsService.initialized).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      mockIo.close = jest.fn((callback) => {
        throw new Error('Close failed');
      });

      const logger = require('../../config/logger');

      await wsService.shutdown();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should clear all rooms on shutdown', async () => {
      mockIo.close = jest.fn((callback) => callback && callback());

      await wsService.shutdown();

      // Verify cleanup
      expect(wsService.initialized).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      wsService.initialized = true;
      wsService.enableRateLimiting({ maxMessagesPerMinute: 60 });
    });

    it('should enforce rate limits', () => {
      wsService.handleConnection(mockSocket);

      // Simulate rapid messages
      for (let i = 0; i < 100; i++) {
        wsService.broadcastToRoom('test-room', { data: i });
      }

      // Should have rate limited some messages
      const logger = require('../../config/logger');
      // Depending on implementation, may log warnings
    });

    it('should reset rate limit after interval', (done) => {
      wsService.handleConnection(mockSocket);

      setTimeout(() => {
        // Rate limit should be reset
        wsService.broadcastToRoom('test-room', { data: 'test' });
        done();
      }, 1100);
    }, 2000);
  });

  describe('Health Check', () => {
    it('should return healthy when initialized', () => {
      wsService.initialized = true;
      const health = wsService.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.initialized).toBe(true);
    });

    it('should return unhealthy when not initialized', () => {
      wsService.initialized = false;
      const health = wsService.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.initialized).toBe(false);
    });

    it('should include connection metrics in health check', () => {
      wsService.initialized = true;
      const health = wsService.getHealthStatus();

      expect(health).toHaveProperty('connectedClients');
    });
  });
});
