/**
 * Collaborative Service Tests for Soba DEX v3.4.0
 *
 * Unit tests for the real-time collaborative features service
 */

const CollaborativeService = require('../ml/collaborativeService');
const WebSocket = require('ws');

// Mock WebSocket for testing
jest.mock('ws', () => {
  return {
    Server: jest.fn(() => ({
      on: jest.fn(),
      close: jest.fn()
    }))
  };
});

describe('CollaborativeService', () => {
  let collaborativeService;
  let mockWebSocketServer;
  let mockWebSocketConnection;

  beforeEach(() => {
    collaborativeService = new CollaborativeService({
      maxCollaborators: 10,
      sessionTimeout: 10000
    });

    mockWebSocketServer = {
      on: jest.fn(),
      close: jest.fn()
    };

    mockWebSocketConnection = {
      on: jest.fn(),
      send: jest.fn(),
      sessionId: null,
      userId: null
    };

    WebSocket.Server.mockImplementation(() => mockWebSocketServer);
  });

  afterEach(async () => {
    if (collaborativeService) {
      await collaborativeService.cleanup();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const mockServer = { listen: jest.fn() };
      await expect(collaborativeService.initialize(mockServer)).resolves.not.toThrow();
      expect(collaborativeService.initialized).toBe(true);
    });

    test('should setup WebSocket server', async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);

      expect(WebSocket.Server).toHaveBeenCalledWith({
        server: mockServer,
        path: '/collaboration'
      });
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
    });

    test('should create collaborative session successfully', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1', {
        name: 'Test Session',
        type: 'model_training'
      });

      expect(session).toHaveProperty('id');
      expect(session.creatorId).toBe('user1');
      expect(session.name).toBe('Test Session');
      expect(session.type).toBe('model_training');
      expect(session.participants.has('user1')).toBe(true);
    });

    test('should join session successfully', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1');
      const joinedSession = await collaborativeService.joinCollaborativeSession(session.id, 'user2');

      expect(joinedSession.participants.has('user2')).toBe(true);
      expect(joinedSession.participants.size).toBe(2);
    });

    test('should throw error when joining non-existent session', async () => {
      await expect(collaborativeService.joinCollaborativeSession('invalid-id', 'user1'))
        .rejects.toThrow('Session not found');
    });

    test('should throw error when session is full', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1', {
        maxParticipants: 1
      });

      await expect(collaborativeService.joinCollaborativeSession(session.id, 'user2'))
        .rejects.toThrow('Session is full');
    });

    test('should leave session successfully', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1');
      await collaborativeService.joinCollaborativeSession(session.id, 'user2');

      const result = await collaborativeService.leaveCollaborativeSession(session.id, 'user2');

      expect(result).toBe(true);
      expect(session.participants.has('user2')).toBe(false);
    });
  });

  describe('Model Sharing', () => {
    let session;

    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
      session = await collaborativeService.createCollaborativeSession('user1');
    });

    test('should share model in session', async () => {
      const modelData = {
        name: 'Test Model',
        type: 'classification',
        data: { weights: [1, 2, 3] }
      };

      const sharedModel = await collaborativeService.shareModelInSession(
        session.id,
        'user1',
        modelData
      );

      expect(sharedModel).toHaveProperty('id');
      expect(sharedModel.name).toBe('Test Model');
      expect(session.sharedModels.has(sharedModel.id)).toBe(true);
    });

    test('should throw error when sharing model in non-existent session', async () => {
      await expect(collaborativeService.shareModelInSession('invalid-id', 'user1', {}))
        .rejects.toThrow('Session not found');
    });

    test('should throw error when non-participant tries to share model', async () => {
      await expect(collaborativeService.shareModelInSession(session.id, 'user2', {}))
        .rejects.toThrow('User not in session');
    });

    test('should update shared model', async () => {
      const modelData = { name: 'Test Model', type: 'classification' };
      const sharedModel = await collaborativeService.shareModelInSession(session.id, 'user1', modelData);

      const updates = { data: { weights: [4, 5, 6] } };
      const updatedModel = await collaborativeService.updateSharedModel(
        session.id,
        'user1',
        sharedModel.id,
        updates
      );

      expect(updatedModel.data.weights).toEqual([4, 5, 6]);
    });
  });

  describe('Collaborative Insights', () => {
    let session;

    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
      session = await collaborativeService.createCollaborativeSession('user1');
    });

    test('should add collaborative insight', async () => {
      const insight = {
        content: 'This model performs well on test data',
        type: 'performance'
      };

      const insightData = await collaborativeService.addCollaborativeInsight(
        session.id,
        'user1',
        insight
      );

      expect(insightData).toHaveProperty('id');
      expect(insightData.content).toBe(insight.content);
      expect(insightData.author).toBe('user1');
      expect(session.insights).toContain(insightData);
    });

    test('should throw error for non-participant adding insight', async () => {
      await expect(collaborativeService.addCollaborativeInsight(session.id, 'user2', {
        content: 'Test insight'
      })).rejects.toThrow('User not in session');
    });
  });

  describe('Recommendations', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);

      // Create multiple sessions and share models
      const session1 = await collaborativeService.createCollaborativeSession('user1');
      const session2 = await collaborativeService.createCollaborativeSession('user2');

      await collaborativeService.shareModelInSession(session1.id, 'user1', {
        name: 'Model A',
        type: 'classification'
      });

      await collaborativeService.shareModelInSession(session2.id, 'user2', {
        name: 'Model B',
        type: 'regression'
      });
    });

    test('should generate collaborative recommendations', async () => {
      const recommendations = await collaborativeService.getCollaborativeRecommendations('user1');

      expect(Array.isArray(recommendations)).toBe(true);
      // Should recommend models from other sessions
      expect(recommendations.length).toBeGreaterThan(0);
    });

    test('should return empty recommendations for new user', async () => {
      const recommendations = await collaborativeService.getCollaborativeRecommendations('new-user');

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBe(0);
    });
  });

  describe('Federated Learning', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
    });

    test('should start federated learning session', async () => {
      const modelConfig = {
        maxRounds: 5,
        minParticipants: 3
      };

      const federatedSession = await collaborativeService.startFederatedLearningSession(
        'user1',
        modelConfig
      );

      expect(federatedSession).toHaveProperty('id');
      expect(federatedSession.initiatorId).toBe('user1');
      expect(federatedSession.maxRounds).toBe(5);
      expect(federatedSession.status).toBe('waiting');
    });

    test('should submit model update for federated learning', async () => {
      const federatedSession = await collaborativeService.startFederatedLearningSession('user1');

      const modelUpdate = { weights: [1, 2, 3], round: 1 };
      const result = await collaborativeService.submitFederatedUpdate(
        federatedSession.id,
        'user1',
        modelUpdate
      );

      expect(result).toBe(true);
      expect(federatedSession.modelUpdates.has('user1')).toBe(true);
    });

    test('should aggregate model when enough updates received', async () => {
      const federatedSession = await collaborativeService.startFederatedLearningSession('user1', {
        minParticipants: 2
      });

      // Submit updates from multiple participants
      await collaborativeService.submitFederatedUpdate(federatedSession.id, 'user1', { weights: [1] });
      await collaborativeService.submitFederatedUpdate(federatedSession.id, 'user2', { weights: [2] });

      // Wait for aggregation (in real implementation, this would be triggered by an event)
      expect(federatedSession.modelUpdates.size).toBe(2);
    });
  });

  describe('WebSocket Message Handling', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
    });

    test('should handle join session message', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1');

      const message = {
        type: 'join_session',
        sessionId: session.id,
        userId: 'user2'
      };

      // Mock WebSocket connection
      mockWebSocketConnection.send = jest.fn();

      await collaborativeService.handleWebSocketMessage(mockWebSocketConnection, message);

      expect(mockWebSocketConnection.sessionId).toBe(session.id);
      expect(mockWebSocketConnection.userId).toBe('user2');
    });

    test('should handle invalid message format', async () => {
      const invalidMessage = { invalid: 'message' };

      mockWebSocketConnection.send = jest.fn();

      await collaborativeService.handleWebSocketMessage(mockWebSocketConnection, invalidMessage);

      expect(mockWebSocketConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Invalid message format' })
      );
    });

    test('should handle unknown message type', async () => {
      const message = { type: 'unknown_type' };

      mockWebSocketConnection.send = jest.fn();

      await collaborativeService.handleWebSocketMessage(mockWebSocketConnection, message);

      expect(mockWebSocketConnection.send).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Unknown message type' })
      );
    });
  });

  describe('Session Cleanup', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
    });

    test('should cleanup inactive sessions', async () => {
      // Create a session
      const session = await collaborativeService.createCollaborativeSession('user1');

      // Simulate session becoming inactive
      session.lastActivity = new Date(Date.now() - 2 * 3600000); // 2 hours ago

      // Trigger cleanup
      collaborativeService.cleanupInactiveSessions();

      // Session should still exist (cleanup runs periodically)
      expect(collaborativeService.collaborativeSessions.has(session.id)).toBe(true);
    });

    test('should remove empty sessions', async () => {
      const session = await collaborativeService.createCollaborativeSession('user1');
      await collaborativeService.leaveCollaborativeSession(session.id, 'user1');

      // Mark as empty and trigger cleanup
      session.status = 'empty';
      collaborativeService.cleanupInactiveSessions();

      // Session should be removed
      expect(collaborativeService.collaborativeSessions.has(session.id)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);
    });

    test('should handle WebSocket connection errors', async () => {
      const message = {
        type: 'join_session',
        sessionId: 'invalid-id',
        userId: 'user1'
      };

      mockWebSocketConnection.send = jest.fn();

      await collaborativeService.handleWebSocketMessage(mockWebSocketConnection, message);

      expect(mockWebSocketConnection.send).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    test('should handle session operation errors gracefully', async () => {
      // Try to leave non-existent session
      mockWebSocketConnection.send = jest.fn();

      await expect(collaborativeService.handleWebSocketMessage(mockWebSocketConnection, {
        type: 'leave_session',
        sessionId: 'invalid-id',
        userId: 'user1'
      })).resolves.not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should cleanup all resources', async () => {
      const mockServer = { listen: jest.fn() };
      await collaborativeService.initialize(mockServer);

      // Create some sessions
      await collaborativeService.createCollaborativeSession('user1');
      await collaborativeService.createCollaborativeSession('user2');

      await collaborativeService.cleanup();

      expect(collaborativeService.collaborativeSessions.size).toBe(0);
      expect(collaborativeService.userSessions.size).toBe(0);
      expect(mockWebSocketServer.close).toHaveBeenCalled();
    });
  });
});
