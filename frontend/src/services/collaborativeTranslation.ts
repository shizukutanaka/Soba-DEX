/**
 * Real-time Collaborative Translation Service
 * Enables multiple translators to work together in real-time
 *
 * Features:
 * - Live translation editing
 * - Real-time synchronization
 * - Translation suggestions and voting
 * - Quality review workflow
 * - Translation history and versioning
 * - User presence and activity tracking
 * - Conflict resolution
 * - Integration with translation memory
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface CollaborativeSession {
  id: string;
  title: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguages: string[];
  participants: Participant[];
  translations: Record<string, TranslationSegment[]>;
  status: 'active' | 'review' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  settings: SessionSettings;
}

export interface Participant {
  id: string;
  name: string;
  avatar?: string;
  role: 'translator' | 'reviewer' | 'admin';
  languages: string[];
  isOnline: boolean;
  lastSeen: Date;
  cursor?: { segmentId: string; position: number };
  activity: Activity[];
}

export interface TranslationSegment {
  id: string;
  sourceText: string;
  targetText: string;
  language: string;
  translator: string;
  status: 'draft' | 'review' | 'approved' | 'rejected';
  confidence: number;
  suggestions: string[];
  comments: Comment[];
  votes: Vote[];
  editedAt: Date;
  version: number;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
  segmentId: string;
  type: 'question' | 'suggestion' | 'correction' | 'approval';
}

export interface Vote {
  userId: string;
  type: 'up' | 'down';
  timestamp: Date;
}

export interface Activity {
  type: 'edit' | 'comment' | 'vote' | 'join' | 'leave';
  timestamp: Date;
  details: any;
}

export interface SessionSettings {
  allowSuggestions: boolean;
  requireReview: boolean;
  autoSave: boolean;
  maxParticipants: number;
  votingEnabled: boolean;
  deadline?: Date;
  qualityThreshold: number;
}

/**
 * Collaborative Translation Service
 */
export class CollaborativeTranslationService {
  private sessions: Map<string, CollaborativeSession> = new Map();
  private websocket?: WebSocket;
  private eventListeners: Map<string, Function[]> = new Map();
  private translationMemory: Map<string, any> = new Map();

  constructor() {
    this.initializeWebSocket();
  }

  private initializeWebSocket() {
    if (typeof window !== 'undefined' && 'WebSocket' in window) {
      // In production, connect to actual WebSocket server
      this.websocket = new WebSocket('wss://api.example.com/translation/collaborate');

      this.websocket.onmessage = (event) => {
        this.handleWebSocketMessage(JSON.parse(event.data));
      };

      this.websocket.onopen = () => {
        console.log('Collaborative translation WebSocket connected');
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    }
  }

  /**
   * Create new collaborative session
   */
  async createSession(
    title: string,
    sourceText: string,
    sourceLanguage: string,
    targetLanguages: string[],
    creator: Participant
  ): Promise<CollaborativeSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: CollaborativeSession = {
      id: sessionId,
      title,
      sourceText,
      sourceLanguage,
      targetLanguages,
      participants: [creator],
      translations: {},
      status: 'active',
      createdAt: now,
      updatedAt: now,
      settings: {
        allowSuggestions: true,
        requireReview: false,
        autoSave: true,
        maxParticipants: 10,
        votingEnabled: true,
        qualityThreshold: 0.8
      }
    };

    // Initialize translations for each target language
    targetLanguages.forEach(lang => {
      session.translations[lang] = this.segmentText(sourceText, lang);
    });

    this.sessions.set(sessionId, session);
    this.notifyParticipants(sessionId, 'session_created', { session });

    return session;
  }

  /**
   * Join collaborative session
   */
  async joinSession(sessionId: string, participant: Participant): Promise<CollaborativeSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if participant already exists
    const existingParticipant = session.participants.find(p => p.id === participant.id);
    if (existingParticipant) {
      existingParticipant.isOnline = true;
      existingParticipant.lastSeen = new Date();
    } else {
      if (session.participants.length >= session.settings.maxParticipants) {
        throw new Error('Session is full');
      }
      session.participants.push(participant);
    }

    this.notifyParticipants(sessionId, 'participant_joined', { participant });
    return session;
  }

  /**
   * Update translation segment
   */
  async updateTranslation(
    sessionId: string,
    language: string,
    segmentId: string,
    newText: string,
    translator: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const segments = session.translations[language];
    if (!segments) return;

    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Check if user can edit this segment
    const participant = session.participants.find(p => p.id === translator);
    if (!participant || participant.role === 'reviewer') {
      throw new Error('Permission denied');
    }

    // Update segment
    segment.targetText = newText;
    segment.translator = translator;
    segment.editedAt = new Date();
    segment.version++;
    segment.status = 'draft';

    // Add activity
    participant.activity.push({
      type: 'edit',
      timestamp: new Date(),
      details: { segmentId, language, previousText: segment.targetText }
    });

    // Auto-save if enabled
    if (session.settings.autoSave) {
      this.saveSession(sessionId);
    }

    // Notify other participants
    this.notifyParticipants(sessionId, 'translation_updated', {
      language,
      segmentId,
      newText,
      translator
    });
  }

  /**
   * Add suggestion to translation
   */
  async addSuggestion(
    sessionId: string,
    language: string,
    segmentId: string,
    suggestion: string,
    author: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (!session.settings.allowSuggestions) {
      throw new Error('Suggestions not allowed in this session');
    }

    const segments = session.translations[language];
    const segment = segments?.find(s => s.id === segmentId);

    if (segment) {
      segment.suggestions.push(suggestion);
      segment.editedAt = new Date();

      this.notifyParticipants(sessionId, 'suggestion_added', {
        language,
        segmentId,
        suggestion,
        author
      });
    }
  }

  /**
   * Vote on translation quality
   */
  async voteTranslation(
    sessionId: string,
    language: string,
    segmentId: string,
    voteType: 'up' | 'down',
    voter: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.settings.votingEnabled) return;

    const segments = session.translations[language];
    const segment = segments?.find(s => s.id === segmentId);

    if (segment) {
      // Remove existing vote from same user
      segment.votes = segment.votes.filter(v => v.userId !== voter);

      // Add new vote
      segment.votes.push({
        userId: voter,
        type: voteType,
        timestamp: new Date()
      });

      // Update segment status based on votes
      const upVotes = segment.votes.filter(v => v.type === 'up').length;
      const downVotes = segment.votes.filter(v => v.type === 'down').length;

      if (upVotes > downVotes && upVotes >= 2) {
        segment.status = 'approved';
      } else if (downVotes > upVotes) {
        segment.status = 'rejected';
      }

      this.notifyParticipants(sessionId, 'vote_cast', {
        language,
        segmentId,
        voteType,
        voter,
        upVotes,
        downVotes
      });
    }
  }

  /**
   * Add comment to translation
   */
  async addComment(
    sessionId: string,
    language: string,
    segmentId: string,
    comment: string,
    author: string,
    type: Comment['type']
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const segments = session.translations[language];
    const segment = segments?.find(s => s.id === segmentId);

    if (segment) {
      const newComment: Comment = {
        id: this.generateCommentId(),
        author,
        text: comment,
        timestamp: new Date(),
        segmentId,
        type
      };

      segment.comments.push(newComment);

      this.notifyParticipants(sessionId, 'comment_added', {
        language,
        segmentId,
        comment: newComment
      });
    }
  }

  /**
   * Get translation suggestions from AI
   */
  async getAISuggestions(
    sessionId: string,
    language: string,
    segmentId: string
  ): Promise<string[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const segments = session.translations[language];
    const segment = segments?.find(s => s.id === segmentId);

    if (!segment) return [];

    // Use neural translation service to get alternatives
    try {
      const { neuralTranslationService } = await import('./neuralTranslation');

      // This would integrate with the neural translation service
      // For now, return mock suggestions
      return [
        'Alternative translation 1',
        'Alternative translation 2',
        'Alternative translation 3'
      ];
    } catch (error) {
      console.error('Failed to get AI suggestions:', error);
      return [];
    }
  }

  /**
   * Segment text into translatable units
   */
  private segmentText(text: string, language: string): TranslationSegment[] {
    // Simple segmentation by sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    return sentences.map((sentence, index) => ({
      id: `${language}_${index}`,
      sourceText: sentence.trim(),
      targetText: '',
      language,
      translator: '',
      status: 'draft',
      confidence: 0,
      suggestions: [],
      comments: [],
      votes: [],
      editedAt: new Date(),
      version: 1
    }));
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(data: any) {
    switch (data.type) {
      case 'translation_update':
        this.handleTranslationUpdate(data);
        break;
      case 'participant_activity':
        this.handleParticipantActivity(data);
        break;
      case 'session_update':
        this.handleSessionUpdate(data);
        break;
    }
  }

  private handleTranslationUpdate(data: any) {
    const listeners = this.eventListeners.get('translation_update') || [];
    listeners.forEach(listener => listener(data));
  }

  private handleParticipantActivity(data: any) {
    const listeners = this.eventListeners.get('participant_activity') || [];
    listeners.forEach(listener => listener(data));
  }

  private handleSessionUpdate(data: any) {
    const listeners = this.eventListeners.get('session_update') || [];
    listeners.forEach(listener => listener(data));
  }

  /**
   * Subscribe to real-time events
   */
  subscribe(eventType: string, callback: Function): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }

    this.eventListeners.get(eventType)!.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Save session to persistent storage
   */
  private async saveSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // In production, save to database
      localStorage.setItem(`collab_session_${sessionId}`, JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Load session from storage
   */
  async loadSession(sessionId: string): Promise<CollaborativeSession | null> {
    try {
      const saved = localStorage.getItem(`collab_session_${sessionId}`);
      if (saved) {
        const session = JSON.parse(saved);
        this.sessions.set(sessionId, session);
        return session;
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }

    return null;
  }

  /**
   * Utility methods
   */
  private generateSessionId(): string {
    return `collab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCommentId(): string {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyParticipants(sessionId: string, eventType: string, data: any) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: eventType,
        sessionId,
        ...data
      }));
    }
  }
}

// Export singleton instance
export const collaborativeTranslationService = new CollaborativeTranslationService();

/**
 * React Hook for Collaborative Translation
 */
export const useCollaborativeTranslation = (sessionId?: string) => {
  const { t } = useTranslation();
  const [session, setSession] = useState<CollaborativeSession | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentSegment, setCurrentSegment] = useState<TranslationSegment | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribeTranslation = collaborativeTranslationService.subscribe('translation_update', (data) => {
      if (data.sessionId === sessionId) {
        setSession(prev => prev ? { ...prev, translations: data.translations } : null);
      }
    });

    const unsubscribeParticipants = collaborativeTranslationService.subscribe('participant_activity', (data) => {
      if (data.sessionId === sessionId) {
        setParticipants(data.participants);
      }
    });

    return () => {
      unsubscribeTranslation();
      unsubscribeParticipants();
    };
  }, [sessionId]);

  const createSession = useCallback(async (
    title: string,
    sourceText: string,
    sourceLanguage: string,
    targetLanguages: string[],
    user: Participant
  ) => {
    try {
      const newSession = await collaborativeTranslationService.createSession(
        title,
        sourceText,
        sourceLanguage,
        targetLanguages,
        user
      );
      setSession(newSession);
      setParticipants(newSession.participants);
      setIsConnected(true);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      throw err;
    }
  }, []);

  const joinSession = useCallback(async (sessionId: string, user: Participant) => {
    try {
      const joinedSession = await collaborativeTranslationService.joinSession(sessionId, user);
      setSession(joinedSession);
      setParticipants(joinedSession.participants);
      setIsConnected(true);
      return joinedSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
      throw err;
    }
  }, []);

  const updateTranslation = useCallback(async (
    language: string,
    segmentId: string,
    newText: string,
    userId: string
  ) => {
    if (!sessionId) return;

    try {
      await collaborativeTranslationService.updateTranslation(sessionId, language, segmentId, newText, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update translation');
      throw err;
    }
  }, [sessionId]);

  const addSuggestion = useCallback(async (
    language: string,
    segmentId: string,
    suggestion: string,
    userId: string
  ) => {
    if (!sessionId) return;

    try {
      await collaborativeTranslationService.addSuggestion(sessionId, language, segmentId, suggestion, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add suggestion');
      throw err;
    }
  }, [sessionId]);

  const voteTranslation = useCallback(async (
    language: string,
    segmentId: string,
    voteType: 'up' | 'down',
    userId: string
  ) => {
    if (!sessionId) return;

    try {
      await collaborativeTranslationService.voteTranslation(sessionId, language, segmentId, voteType, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to vote');
      throw err;
    }
  }, [sessionId]);

  const addComment = useCallback(async (
    language: string,
    segmentId: string,
    comment: string,
    userId: string,
    type: Comment['type']
  ) => {
    if (!sessionId) return;

    try {
      await collaborativeTranslationService.addComment(sessionId, language, segmentId, comment, userId, type);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
      throw err;
    }
  }, [sessionId]);

  const getAISuggestions = useCallback(async (language: string, segmentId: string) => {
    if (!sessionId) return [];

    try {
      const suggestions = await collaborativeTranslationService.getAISuggestions(sessionId, language, segmentId);
      setSuggestions(suggestions);
      return suggestions;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI suggestions');
      return [];
    }
  }, [sessionId]);

  return {
    session,
    participants,
    currentSegment,
    suggestions,
    comments,
    isConnected,
    error,
    createSession,
    joinSession,
    updateTranslation,
    addSuggestion,
    voteTranslation,
    addComment,
    getAISuggestions,
    clearError: () => setError(null)
  };
};

/**
 * Collaborative Translation Component
 */
export const CollaborativeTranslator: React.FC<{
  sessionId?: string;
  user: Participant;
  onSessionCreate?: (session: CollaborativeSession) => void;
}> = ({ sessionId, user, onSessionCreate }) => {
  const { t } = useTranslation();
  const {
    session,
    participants,
    currentSegment,
    suggestions,
    isConnected,
    error,
    createSession,
    joinSession,
    updateTranslation,
    addSuggestion,
    voteTranslation,
    addComment,
    getAISuggestions
  } = useCollaborativeTranslation(sessionId);

  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [translationText, setTranslationText] = useState('');
  const [newSuggestion, setNewSuggestion] = useState('');
  const [newComment, setNewComment] = useState('');

  // Initialize session
  useEffect(() => {
    if (sessionId && !session) {
      joinSession(sessionId, user);
    }
  }, [sessionId, session, joinSession, user]);

  const handleCreateSession = async () => {
    try {
      const newSession = await createSession(
        'New Translation Project',
        'Sample text to translate...',
        'en',
        ['es', 'fr', 'de'],
        user
      );
      onSessionCreate?.(newSession);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleSegmentSelect = (segment: TranslationSegment) => {
    setCurrentSegment(segment);
    setSelectedSegment(segment.id);
    setTranslationText(segment.targetText);
  };

  const handleTranslationUpdate = async () => {
    if (!currentSegment || !selectedLanguage) return;

    try {
      await updateTranslation(selectedLanguage, selectedSegment, translationText, user.id);
    } catch (err) {
      console.error('Failed to update translation:', err);
    }
  };

  const handleAddSuggestion = async () => {
    if (!newSuggestion.trim() || !currentSegment || !selectedLanguage) return;

    try {
      await addSuggestion(selectedLanguage, selectedSegment, newSuggestion, user.id);
      setNewSuggestion('');
    } catch (err) {
      console.error('Failed to add suggestion:', err);
    }
  };

  const handleVote = async (voteType: 'up' | 'down') => {
    if (!currentSegment || !selectedLanguage) return;

    try {
      await voteTranslation(selectedLanguage, selectedSegment, voteType, user.id);
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  if (!session) {
    return (
      <div className="collaborative-setup">
        <h2>{t('collaborative.startSession')}</h2>
        <button onClick={handleCreateSession}>
          {t('collaborative.createSession')}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="collaborative-translation">
      <div className="session-header">
        <h3>{session.title}</h3>
        <div className="participants">
          {participants.filter(p => p.isOnline).map(participant => (
            <div key={participant.id} className="participant">
              <span className="avatar">{participant.name[0]}</span>
              <span className="name">{participant.name}</span>
              <span className="role">{participant.role}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="translation-workspace">
        <div className="source-text">
          <h4>{t('collaborative.sourceText')}</h4>
          <div className="text-content">
            {session.sourceText}
          </div>
        </div>

        <div className="target-languages">
          {session.targetLanguages.map(language => (
            <div key={language} className="language-column">
              <h4>{t(`languages.${language}`)}</h4>

              <div className="segments">
                {session.translations[language]?.map(segment => (
                  <div
                    key={segment.id}
                    className={`segment ${segment.id === selectedSegment ? 'selected' : ''}`}
                    onClick={() => handleSegmentSelect(segment)}
                  >
                    <div className="source">{segment.sourceText}</div>
                    <div className="target">
                      <textarea
                        value={segment.id === selectedSegment ? translationText : segment.targetText}
                        onChange={(e) => setTranslationText(e.target.value)}
                        placeholder={t('collaborative.enterTranslation')}
                        disabled={segment.id !== selectedSegment}
                      />
                    </div>
                    <div className="segment-actions">
                      <button onClick={() => handleVote('up')}>👍</button>
                      <button onClick={() => handleVote('down')}>👎</button>
                      <span className="status">{segment.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="suggestions-panel">
          <h4>{t('collaborative.suggestions')}</h4>
          <div className="suggestions-list">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="suggestion">
                {suggestion}
                <button onClick={() => setTranslationText(suggestion)}>
                  {t('collaborative.use')}
                </button>
              </div>
            ))}
          </div>

          <div className="add-suggestion">
            <textarea
              value={newSuggestion}
              onChange={(e) => setNewSuggestion(e.target.value)}
              placeholder={t('collaborative.addSuggestion')}
            />
            <button onClick={handleAddSuggestion}>
              {t('collaborative.submitSuggestion')}
            </button>
          </div>
        </div>

        <div className="comments-panel">
          <h4>{t('collaborative.comments')}</h4>
          <div className="comments-list">
            {/* Comments would be rendered here */}
          </div>

          <div className="add-comment">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t('collaborative.addComment')}
            />
            <button onClick={() => addComment(selectedLanguage, selectedSegment, newComment, user.id, 'suggestion')}>
              {t('collaborative.submitComment')}
            </button>
          </div>
        </div>
      </div>

      <div className="action-bar">
        <button onClick={handleTranslationUpdate}>
          {t('collaborative.saveTranslation')}
        </button>
        <button onClick={() => getAISuggestions(selectedLanguage, selectedSegment)}>
          {t('collaborative.getAISuggestions')}
        </button>
        <button onClick={() => setSelectedLanguage('')}>
          {t('collaborative.switchLanguage')}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
};

/**
 * Real-time Translation Chat Component
 */
export const TranslationChat: React.FC<{
  sessionId: string;
  user: Participant;
}> = ({ sessionId, user }) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const message = {
      id: Date.now().toString(),
      text: newMessage,
      author: user.name,
      timestamp: new Date(),
      language: user.languages[0]
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');

    // Translate message for other participants
    try {
      const session = await collaborativeTranslationService.loadSession(sessionId);
      if (session) {
        // This would translate and broadcast to other participants
        console.log('Message translated for participants:', session.participants.map(p => p.languages));
      }
    } catch (error) {
      console.error('Failed to translate chat message:', error);
    }
  };

  return (
    <div className="translation-chat">
      <div className="chat-header">
        <h4>{t('collaborative.teamChat')}</h4>
        <div className="participants-status">
          {user.languages.map(lang => (
            <span key={lang} className="language-badge">
              {lang}
            </span>
          ))}
        </div>
      </div>

      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className="chat-message">
            <div className="message-header">
              <span className="author">{message.author}</span>
              <span className="timestamp">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">
              {message.text}
            </div>
            <div className="message-translations">
              {/* Translated versions would appear here */}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={t('collaborative.typeMessage')}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <button onClick={sendMessage}>
          {t('collaborative.send')}
        </button>
      </div>

      {isTyping && (
        <div className="typing-indicator">
          {t('collaborative.someoneTyping')}
        </div>
      )}
    </div>
  );
};

/**
 * Translation Quality Dashboard
 */
export const TranslationQualityDashboard: React.FC<{
  sessionId: string;
}> = ({ sessionId }) => {
  const { t } = useTranslation();
  const [qualityMetrics, setQualityMetrics] = useState<any>({});
  const [reviewQueue, setReviewQueue] = useState<TranslationSegment[]>([]);

  useEffect(() => {
    // Load quality metrics and review queue
    const loadMetrics = async () => {
      try {
        const session = await collaborativeTranslationService.loadSession(sessionId);
        if (session) {
          // Calculate quality metrics
          const metrics = calculateQualityMetrics(session);
          setQualityMetrics(metrics);

          // Get segments that need review
          const needsReview = getSegmentsNeedingReview(session);
          setReviewQueue(needsReview);
        }
      } catch (error) {
        console.error('Failed to load quality metrics:', error);
      }
    };

    loadMetrics();
  }, [sessionId]);

  const calculateQualityMetrics = (session: CollaborativeSession) => {
    const totalSegments = Object.values(session.translations).flat().length;
    const completedSegments = Object.values(session.translations).flat()
      .filter(segment => segment.targetText.trim().length > 0).length;
    const approvedSegments = Object.values(session.translations).flat()
      .filter(segment => segment.status === 'approved').length;

    return {
      completionRate: (completedSegments / totalSegments) * 100,
      approvalRate: (approvedSegments / completedSegments) * 100,
      averageConfidence: Object.values(session.translations).flat()
        .reduce((sum, segment) => sum + segment.confidence, 0) / totalSegments,
      pendingReviews: reviewQueue.length
    };
  };

  const getSegmentsNeedingReview = (session: CollaborativeSession): TranslationSegment[] => {
    return Object.values(session.translations).flat()
      .filter(segment => segment.status === 'draft' || segment.votes.length > 0);
  };

  return (
    <div className="quality-dashboard">
      <div className="metrics-grid">
        <div className="metric-card">
          <h4>{t('collaborative.completionRate')}</h4>
          <div className="metric-value">
            {qualityMetrics.completionRate?.toFixed(1)}%
          </div>
        </div>

        <div className="metric-card">
          <h4>{t('collaborative.approvalRate')}</h4>
          <div className="metric-value">
            {qualityMetrics.approvalRate?.toFixed(1)}%
          </div>
        </div>

        <div className="metric-card">
          <h4>{t('collaborative.averageConfidence')}</h4>
          <div className="metric-value">
            {qualityMetrics.averageConfidence?.toFixed(2)}
          </div>
        </div>

        <div className="metric-card">
          <h4>{t('collaborative.pendingReviews')}</h4>
          <div className="metric-value">
            {qualityMetrics.pendingReviews || 0}
          </div>
        </div>
      </div>

      <div className="review-queue">
        <h4>{t('collaborative.reviewQueue')}</h4>
        <div className="queue-items">
          {reviewQueue.map(segment => (
            <div key={segment.id} className="queue-item">
              <div className="source-text">{segment.sourceText}</div>
              <div className="target-text">{segment.targetText}</div>
              <div className="item-actions">
                <button>{t('collaborative.approve')}</button>
                <button>{t('collaborative.reject')}</button>
                <button>{t('collaborative.edit')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Translation Progress Visualization
 */
export const TranslationProgressChart: React.FC<{
  session: CollaborativeSession;
}> = ({ session }) => {
  const [progressData, setProgressData] = useState<any>({});

  useEffect(() => {
    const data = calculateProgressData(session);
    setProgressData(data);
  }, [session]);

  const calculateProgressData = (session: CollaborativeSession) => {
    const data: Record<string, any> = {};

    session.targetLanguages.forEach(language => {
      const segments = session.translations[language] || [];
      const total = segments.length;
      const completed = segments.filter(s => s.targetText.trim().length > 0).length;
      const approved = segments.filter(s => s.status === 'approved').length;

      data[language] = {
        total,
        completed,
        approved,
        completionRate: (completed / total) * 100,
        approvalRate: completed > 0 ? (approved / completed) * 100 : 0
      };
    });

    return data;
  };

  return (
    <div className="progress-visualization">
      <div className="progress-bars">
        {Object.entries(progressData).map(([language, data]: [string, any]) => (
          <div key={language} className="language-progress">
            <div className="language-label">{language}</div>
            <div className="progress-bar">
              <div
                className="progress-fill completed"
                style={{ width: `${data.completionRate}%` }}
              />
              <div
                className="progress-fill approved"
                style={{ width: `${data.approvalRate}%` }}
              />
            </div>
            <div className="progress-stats">
              <span>{data.completed}/{data.total}</span>
              <span>{data.approvalRate.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="overall-stats">
        <div className="stat">
          <span className="label">Total Segments</span>
          <span className="value">
            {Object.values(progressData).reduce((sum: number, data: any) => sum + data.total, 0)}
          </span>
        </div>
        <div className="stat">
          <span className="label">Overall Progress</span>
          <span className="value">
            {Object.values(progressData).reduce((sum: number, data: any) => sum + data.completionRate, 0) / Object.keys(progressData).length}%
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Real-time Cursor Tracking
 */
export const useCursorTracking = (sessionId: string, userId: string) => {
  const [cursors, setCursors] = useState<Record<string, any>>({});
  const [myCursor, setMyCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateCursor = (event: MouseEvent) => {
      const newPosition = { x: event.clientX, y: event.clientY };
      setMyCursor(newPosition);

      // Send cursor position to other participants
      collaborativeTranslationService.websocket?.send(JSON.stringify({
        type: 'cursor_update',
        sessionId,
        userId,
        position: newPosition
      }));
    };

    document.addEventListener('mousemove', updateCursor);
    return () => document.removeEventListener('mousemove', updateCursor);
  }, [sessionId, userId]);

  // Subscribe to other participants' cursor movements
  useEffect(() => {
    const unsubscribe = collaborativeTranslationService.subscribe('cursor_update', (data) => {
      if (data.userId !== userId) {
        setCursors(prev => ({
          ...prev,
          [data.userId]: data.position
        }));
      }
    });

    return unsubscribe;
  }, [userId]);

  return { myCursor, otherCursors: cursors };
};
