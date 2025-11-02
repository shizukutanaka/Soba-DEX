/**
 * Real-time Collaborative Features Service for Soba DEX v3.4.0
 *
 * Features:
 * - Collaborative filtering and recommendations
 * - Real-time model sharing and synchronization
 * - Live collaborative analytics sessions
 * - Federated learning coordination
 * - Collaborative dashboard sharing
 */

const EventEmitter = require('events');
const WebSocket = require('ws');

class CollaborativeService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxCollaborators: options.maxCollaborators || 100,
      sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
      syncInterval: options.syncInterval || 5000, // 5 seconds
      ...options
    };

    this.collaborativeSessions = new Map(); // sessionId -> session
    this.userSessions = new Map(); // userId -> sessionId[]
    this.sharedModels = new Map(); // modelId -> collaborators
    this.federatedLearningSessions = new Map(); // sessionId -> federatedSession
    this.websocketServer = null;

    this.cleanupTimer = null;
  }

  /**
   * Initialize the collaborative service
   */
  async initialize(server) {
    console.log('🚀 Initializing Collaborative Service...');

    // Setup WebSocket server for real-time collaboration
    this.setupWebSocketServer(server);

    // Start cleanup timer
    this.startCleanupTimer();

    console.log('✅ Collaborative Service initialized');
    this.emit('initialized');
  }

  /**
   * Setup WebSocket server for real-time collaboration
   */
  setupWebSocketServer(server) {
    this.websocketServer = new WebSocket.Server({ server, path: '/collaboration' });

    this.websocketServer.on('connection', (ws, request) => {
      console.log('🔗 New collaboration WebSocket connection');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        this.handleWebSocketClose(ws);
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(ws, data) {
    const { type, sessionId, userId, payload } = data;

    switch (type) {
      case 'join_session':
        await this.handleJoinSession(ws, sessionId, userId, payload);
        break;
      case 'leave_session':
        await this.handleLeaveSession(ws, sessionId, userId);
        break;
      case 'share_model':
        await this.handleShareModel(sessionId, userId, payload);
        break;
      case 'update_model':
        await this.handleUpdateModel(sessionId, userId, payload);
        break;
      case 'request_sync':
        await this.handleRequestSync(ws, sessionId, userId);
        break;
      case 'collaborative_insight':
        await this.handleCollaborativeInsight(sessionId, userId, payload);
        break;
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  /**
   * Create a new collaborative session
   */
  async createCollaborativeSession(creatorId, options = {}) {
    const sessionId = this.generateSessionId();

    const session = {
      id: sessionId,
      creatorId,
      name: options.name || `Session ${sessionId}`,
      description: options.description || '',
      type: options.type || 'general', // 'general', 'model_training', 'analytics'
      participants: new Set([creatorId]),
      maxParticipants: options.maxParticipants || this.options.maxCollaborators,
      sharedModels: new Map(),
      insights: [],
      chatMessages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
      settings: {
        allowModelSharing: options.allowModelSharing !== false,
        allowChat: options.allowChat !== false,
        allowInsights: options.allowInsights !== false,
        ...options.settings
      }
    };

    this.collaborativeSessions.set(sessionId, session);

    // Track user's sessions
    if (!this.userSessions.has(creatorId)) {
      this.userSessions.set(creatorId, new Set());
    }
    this.userSessions.get(creatorId).add(sessionId);

    console.log(`🏗️ Created collaborative session '${session.name}' (${sessionId})`);
    this.emit('sessionCreated', session);

    return session;
  }

  /**
   * Join an existing collaborative session
   */
  async joinCollaborativeSession(sessionId, userId) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.participants.size >= session.maxParticipants) {
      throw new Error('Session is full');
    }

    if (session.participants.has(userId)) {
      throw new Error('User already in session');
    }

    session.participants.add(userId);
    session.lastActivity = new Date();

    // Track user's sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(sessionId);

    // Notify other participants
    this.broadcastToSession(sessionId, {
      type: 'user_joined',
      userId,
      sessionId,
      timestamp: new Date()
    }, userId);

    console.log(`👋 User ${userId} joined session ${sessionId}`);
    this.emit('userJoined', { sessionId, userId });

    return session;
  }

  /**
   * Leave a collaborative session
   */
  async leaveCollaborativeSession(sessionId, userId) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.participants.has(userId)) {
      throw new Error('User not in session');
    }

    session.participants.delete(userId);
    session.lastActivity = new Date();

    // Remove from user's sessions
    const userSessions = this.userSessions.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(userId);
      }
    }

    // If session is empty, mark for cleanup
    if (session.participants.size === 0) {
      session.status = 'empty';
      this.scheduleSessionCleanup(sessionId);
    }

    // Notify other participants
    this.broadcastToSession(sessionId, {
      type: 'user_left',
      userId,
      sessionId,
      timestamp: new Date()
    }, userId);

    console.log(`👋 User ${userId} left session ${sessionId}`);
    this.emit('userLeft', { sessionId, userId });

    return true;
  }

  /**
   * Share a model in a collaborative session
   */
  async shareModelInSession(sessionId, userId, modelData) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.participants.has(userId)) {
      throw new Error('User not in session');
    }

    if (!session.settings.allowModelSharing) {
      throw new Error('Model sharing not allowed in this session');
    }

    const sharedModel = {
      id: this.generateModelId(),
      name: modelData.name,
      type: modelData.type,
      data: modelData.data,
      metadata: modelData.metadata || {},
      sharedBy: userId,
      sharedAt: new Date(),
      collaborators: new Set([userId])
    };

    session.sharedModels.set(sharedModel.id, sharedModel);
    session.lastActivity = new Date();

    // Notify participants about the shared model
    this.broadcastToSession(sessionId, {
      type: 'model_shared',
      model: {
        id: sharedModel.id,
        name: sharedModel.name,
        type: sharedModel.type,
        sharedBy: sharedModel.sharedBy,
        sharedAt: sharedModel.sharedAt
      },
      sessionId,
      timestamp: new Date()
    });

    console.log(`📊 Model '${sharedModel.name}' shared in session ${sessionId}`);
    this.emit('modelShared', { sessionId, sharedModel });

    return sharedModel;
  }

  /**
   * Update a shared model collaboratively
   */
  async updateSharedModel(sessionId, userId, modelId, updates) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const sharedModel = session.sharedModels.get(modelId);
    if (!sharedModel) {
      throw new Error('Model not found in session');
    }

    if (!sharedModel.collaborators.has(userId)) {
      throw new Error('User is not a collaborator on this model');
    }

    // Apply updates
    Object.assign(sharedModel.data, updates.data || {});
    Object.assign(sharedModel.metadata, updates.metadata || {});

    sharedModel.lastUpdated = new Date();
    sharedModel.updatedBy = userId;

    session.lastActivity = new Date();

    // Notify other collaborators
    this.broadcastToModelCollaborators(modelId, {
      type: 'model_updated',
      modelId,
      updates,
      updatedBy: userId,
      timestamp: new Date()
    }, userId);

    console.log(`✏️ Model ${modelId} updated by ${userId} in session ${sessionId}`);
    this.emit('modelUpdated', { sessionId, modelId, updates, userId });

    return sharedModel;
  }

  /**
   * Add a collaborative insight to the session
   */
  async addCollaborativeInsight(sessionId, userId, insight) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.participants.has(userId)) {
      throw new Error('User not in session');
    }

    if (!session.settings.allowInsights) {
      throw new Error('Insights not allowed in this session');
    }

    const insightData = {
      id: this.generateInsightId(),
      content: insight.content,
      type: insight.type || 'general',
      author: userId,
      createdAt: new Date(),
      likes: 0,
      comments: []
    };

    session.insights.push(insightData);
    session.lastActivity = new Date();

    // Notify participants
    this.broadcastToSession(sessionId, {
      type: 'insight_added',
      insight: insightData,
      sessionId,
      timestamp: new Date()
    });

    console.log(`💡 Insight added to session ${sessionId}`);
    this.emit('insightAdded', { sessionId, insight: insightData });

    return insightData;
  }

  /**
   * Get collaborative recommendations for a user
   */
  async getCollaborativeRecommendations(userId, context) {
    const userSessions = this.userSessions.get(userId);
    if (!userSessions || userSessions.size === 0) {
      return [];
    }

    const recommendations = [];

    // Analyze user's collaborative patterns
    for (const sessionId of userSessions) {
      const session = this.collaborativeSessions.get(sessionId);
      if (session) {
        // Recommend models shared in similar sessions
        for (const [modelId, model] of session.sharedModels) {
          if (!model.collaborators.has(userId)) {
            recommendations.push({
              type: 'model',
              modelId,
              modelName: model.name,
              reason: `Shared in session "${session.name}"`,
              confidence: 0.8
            });
          }
        }

        // Recommend insights from active sessions
        const recentInsights = session.insights
          .filter(i => i.author !== userId)
          .slice(-5);

        for (const insight of recentInsights) {
          recommendations.push({
            type: 'insight',
            insightId: insight.id,
            content: insight.content,
            reason: `From session "${session.name}"`,
            confidence: 0.6
          });
        }
      }
    }

    // Sort by confidence and return top recommendations
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  /**
   * Start federated learning session
   */
  async startFederatedLearningSession(initiatorId, modelConfig) {
    const sessionId = this.generateSessionId();

    const federatedSession = {
      id: sessionId,
      initiatorId,
      modelConfig,
      participants: new Set([initiatorId]),
      modelUpdates: new Map(), // userId -> modelUpdate
      aggregatedModel: null,
      round: 0,
      maxRounds: modelConfig.maxRounds || 10,
      minParticipants: modelConfig.minParticipants || 3,
      status: 'waiting',
      createdAt: new Date(),
      lastRound: new Date()
    };

    this.federatedLearningSessions.set(sessionId, federatedSession);

    console.log(`🧠 Started federated learning session ${sessionId}`);
    this.emit('federatedLearningStarted', federatedSession);

    return federatedSession;
  }

  /**
   * Submit model update for federated learning
   */
  async submitFederatedUpdate(sessionId, userId, modelUpdate) {
    const session = this.federatedLearningSessions.get(sessionId);
    if (!session) {
      throw new Error('Federated learning session not found');
    }

    if (!session.participants.has(userId)) {
      throw new Error('User not in federated learning session');
    }

    session.modelUpdates.set(userId, {
      userId,
      update: modelUpdate,
      submittedAt: new Date()
    });

    console.log(`📤 Model update submitted by ${userId} in session ${sessionId}`);

    // Check if we have enough updates to aggregate
    if (session.modelUpdates.size >= session.minParticipants) {
      await this.aggregateFederatedModel(sessionId);
    }

    return true;
  }

  /**
   * Aggregate model updates in federated learning
   */
  async aggregateFederatedModel(sessionId) {
    const session = this.federatedLearningSessions.get(sessionId);
    if (!session) return;

    try {
      // Simple federated averaging (in practice, this would be more sophisticated)
      const updates = Array.from(session.modelUpdates.values());
      const aggregatedUpdate = this.federatedAverage(updates.map(u => u.update));

      session.aggregatedModel = aggregatedUpdate;
      session.round++;
      session.lastRound = new Date();
      session.status = session.round >= session.maxRounds ? 'completed' : 'active';

      // Distribute aggregated model back to participants
      this.broadcastToFederatedSession(sessionId, {
        type: 'model_aggregated',
        round: session.round,
        aggregatedModel: aggregatedUpdate,
        timestamp: new Date()
      });

      console.log(`🔄 Aggregated model for round ${session.round} in session ${sessionId}`);
      this.emit('federatedModelAggregated', { sessionId, round: session.round });

    } catch (error) {
      console.error(`Federated aggregation failed for session ${sessionId}:`, error);
    }
  }

  /**
   * Simple federated averaging (placeholder)
   */
  federatedAverage(updates) {
    // In a real implementation, this would properly average model weights
    return {
      averaged: true,
      updateCount: updates.length,
      timestamp: new Date()
    };
  }

  /**
   * Broadcast message to all participants in a session
   */
  broadcastToSession(sessionId, message, excludeUserId = null) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) return;

    // In a real implementation, this would send via WebSocket to all participants
    // For demo, we'll just emit the event
    this.emit('sessionBroadcast', { sessionId, message, excludeUserId });
  }

  /**
   * Broadcast to model collaborators
   */
  broadcastToModelCollaborators(modelId, message, excludeUserId = null) {
    // Find all sessions that have this model shared
    for (const session of this.collaborativeSessions.values()) {
      if (session.sharedModels.has(modelId)) {
        this.broadcastToSession(session.id, message, excludeUserId);
        break;
      }
    }
  }

  /**
   * Broadcast to federated learning session
   */
  broadcastToFederatedSession(sessionId, message) {
    const session = this.federatedLearningSessions.get(sessionId);
    if (!session) return;

    // In a real implementation, send to all participants
    this.emit('federatedBroadcast', { sessionId, message });
  }

  /**
   * Handle WebSocket message: join session
   */
  async handleJoinSession(ws, sessionId, userId, payload) {
    try {
      await this.joinCollaborativeSession(sessionId, userId);
      ws.sessionId = sessionId;
      ws.userId = userId;

      ws.send(JSON.stringify({
        type: 'session_joined',
        sessionId,
        userId,
        timestamp: new Date()
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  }

  /**
   * Handle WebSocket message: leave session
   */
  async handleLeaveSession(ws, sessionId, userId) {
    try {
      await this.leaveCollaborativeSession(sessionId, userId);

      ws.send(JSON.stringify({
        type: 'session_left',
        sessionId,
        userId,
        timestamp: new Date()
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  }

  /**
   * Handle WebSocket message: share model
   */
  async handleShareModel(sessionId, userId, payload) {
    try {
      const sharedModel = await this.shareModelInSession(sessionId, userId, payload);

      this.broadcastToSession(sessionId, {
        type: 'model_shared',
        model: sharedModel,
        sharedBy: userId,
        timestamp: new Date()
      });
    } catch (error) {
      // Send error to the specific user
      this.sendToUser(userId, {
        type: 'error',
        message: error.message
      });
    }
  }

  /**
   * Handle WebSocket message: update model
   */
  async handleUpdateModel(sessionId, userId, payload) {
    try {
      await this.updateSharedModel(sessionId, userId, payload.modelId, payload.updates);

      this.broadcastToSession(sessionId, {
        type: 'model_updated',
        modelId: payload.modelId,
        updates: payload.updates,
        updatedBy: userId,
        timestamp: new Date()
      });
    } catch (error) {
      this.sendToUser(userId, {
        type: 'error',
        message: error.message
      });
    }
  }

  /**
   * Handle WebSocket message: request sync
   */
  async handleRequestSync(ws, sessionId, userId) {
    const session = this.collaborativeSessions.get(sessionId);
    if (!session) {
      ws.send(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    const syncData = {
      session: {
        id: session.id,
        name: session.name,
        description: session.description,
        participants: Array.from(session.participants),
        sharedModels: Array.from(session.sharedModels.entries()),
        insights: session.insights,
        chatMessages: session.chatMessages
      },
      timestamp: new Date()
    };

    ws.send(JSON.stringify({
      type: 'session_sync',
      data: syncData
    }));
  }

  /**
   * Handle WebSocket message: collaborative insight
   */
  async handleCollaborativeInsight(sessionId, userId, payload) {
    try {
      const insight = await this.addCollaborativeInsight(sessionId, userId, payload);

      this.broadcastToSession(sessionId, {
        type: 'insight_added',
        insight,
        timestamp: new Date()
      });
    } catch (error) {
      this.sendToUser(userId, {
        type: 'error',
        message: error.message
      });
    }
  }

  /**
   * Handle WebSocket close
   */
  handleWebSocketClose(ws) {
    if (ws.sessionId && ws.userId) {
      this.leaveCollaborativeSession(ws.sessionId, ws.userId).catch(console.error);
    }
  }

  /**
   * Send message to specific user (placeholder)
   */
  sendToUser(userId, message) {
    // In a real implementation, this would send via WebSocket to the specific user
    console.log(`Sending to user ${userId}:`, message);
  }

  /**
   * Get user's active sessions
   */
  getUserSessions(userId) {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    return Array.from(sessionIds).map(sessionId =>
      this.collaborativeSessions.get(sessionId)
    ).filter(Boolean);
  }

  /**
   * Get session details
   */
  getSession(sessionId) {
    return this.collaborativeSessions.get(sessionId) || null;
  }

  /**
   * List all active sessions
   */
  listSessions() {
    return Array.from(this.collaborativeSessions.values());
  }

  /**
   * Start cleanup timer for inactive sessions
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.options.sessionTimeout / 4); // Check every 15 minutes
  }

  /**
   * Cleanup inactive sessions
   */
  cleanupInactiveSessions() {
    const now = Date.now();
    const timeout = this.options.sessionTimeout;

    for (const [sessionId, session] of this.collaborativeSessions) {
      if (session.status === 'empty' ||
          (now - session.lastActivity.getTime()) > timeout) {
        this.collaborativeSessions.delete(sessionId);
        console.log(`🧹 Cleaned up inactive session ${sessionId}`);
      }
    }
  }

  /**
   * Schedule session cleanup
   */
  scheduleSessionCleanup(sessionId) {
    setTimeout(() => {
      const session = this.collaborativeSessions.get(sessionId);
      if (session && session.status === 'empty') {
        this.collaborativeSessions.delete(sessionId);
        console.log(`🗑️ Removed empty session ${sessionId}`);
      }
    }, 300000); // 5 minutes grace period
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique model ID
   */
  generateModelId() {
    return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique insight ID
   */
  generateInsightId() {
    return `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.websocketServer) {
      this.websocketServer.close();
    }

    this.collaborativeSessions.clear();
    this.userSessions.clear();
    this.sharedModels.clear();
    this.federatedLearningSessions.clear();
  }
}

module.exports = CollaborativeService;
