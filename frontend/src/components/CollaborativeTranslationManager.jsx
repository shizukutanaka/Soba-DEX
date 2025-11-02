/**
 * 共同翻訳管理コンポーネント
 * 2025年最新技術対応版
 */

import React, { useState, useEffect } from 'react';
import { useAITranslation } from '../hooks/useAITranslation';
import './CollaborativeTranslationManager.css';

const CollaborativeTranslationManager = () => {
  const {
    getSupportedLanguages,
    translate,
    translateBulk
  } = useAITranslation();

  const [languages, setLanguages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [currentUser, setCurrentUser] = useState({
    id: 'user_' + Math.random().toString(36).substr(2, 9),
    name: 'Translator',
    languages: ['en', 'ja'],
    role: 'translator'
  });

  // セッション作成フォーム
  const [newSession, setNewSession] = useState({
    title: '',
    sourceText: '',
    sourceLanguage: 'en',
    targetLanguages: ['ja', 'zh', 'es']
  });

  // 翻訳セグメント
  const [segments, setSegments] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [newTranslation, setNewTranslation] = useState('');

  useEffect(() => {
    loadLanguages();
    loadSessions();
  }, []);

  const loadLanguages = async () => {
    try {
      const languagesData = await getSupportedLanguages();
      setLanguages(languagesData.languages);
    } catch (error) {
      console.error('Failed to load languages:', error);
    }
  };

  const loadSessions = async () => {
    // 実際にはAPIからセッション一覧を取得
    setSessions([
      {
        id: 'session_1',
        title: 'Product Documentation Translation',
        sourceText: 'Welcome to Soba DEX, the most advanced decentralized exchange platform.',
        sourceLanguage: 'en',
        targetLanguages: ['ja', 'zh', 'es', 'fr'],
        participants: [
          { id: 'user_1', name: 'Alice', role: 'admin' },
          { id: 'user_2', name: 'Bob', role: 'translator' }
        ],
        status: 'active',
        createdAt: new Date().toISOString()
      }
    ]);
  };

  const createSession = async () => {
    if (!newSession.title || !newSession.sourceText) return;

    try {
      const response = await fetch('/api/i18n/collaborative/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newSession.title,
          sourceText: newSession.sourceText,
          sourceLanguage: newSession.sourceLanguage,
          targetLanguages: newSession.targetLanguages,
          creator: currentUser
        })
      });

      const result = await response.json();
      if (result.success) {
        setSessions(prev => [result.data, ...prev]);
        setActiveSession(result.data);
        setNewSession({
          title: '',
          sourceText: '',
          sourceLanguage: 'en',
          targetLanguages: ['ja', 'zh', 'es']
        });
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const joinSession = async (sessionId) => {
    try {
      const response = await fetch(`/api/i18n/collaborative/session/${sessionId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: currentUser })
      });

      const result = await response.json();
      if (result.success) {
        setActiveSession(result.data);
        loadSegments(sessionId);
      }
    } catch (error) {
      console.error('Failed to join session:', error);
    }
  };

  const loadSegments = (sessionId) => {
    // 実際にはAPIからセグメントを取得
    const textSegments = activeSession.sourceText.split('. ').map((text, index) => ({
      id: `segment_${index}`,
      originalText: text + (index < activeSession.sourceText.split('. ').length - 1 ? '.' : ''),
      translations: {},
      status: 'pending'
    }));

    setSegments(textSegments);
  };

  const submitTranslation = async (segmentId, language, translation) => {
    if (!activeSession || !translation.trim()) return;

    try {
      const response = await fetch(`/api/i18n/collaborative/session/${activeSession.id}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language,
          segmentId,
          newTranslation: translation,
          userId: currentUser.id
        })
      });

      const result = await response.json();
      if (result.success) {
        setSegments(prev => prev.map(segment =>
          segment.id === segmentId
            ? {
                ...segment,
                translations: {
                  ...segment.translations,
                  [language]: result.data.translations.find(t => t.userId === currentUser.id)?.text || translation
                }
              }
            : segment
        ));
        setNewTranslation('');
      }
    } catch (error) {
      console.error('Failed to submit translation:', error);
    }
  };

  const voteTranslation = async (segmentId, language, userId, voteType) => {
    if (!activeSession) return;

    try {
      await fetch(`/api/i18n/collaborative/session/${activeSession.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language,
          segmentId,
          userId,
          voteType
        })
      });
    } catch (error) {
      console.error('Failed to vote:', error);
    }
  };

  return (
    <div className="collaborative-translation-manager">
      <div className="header">
        <h2>Collaborative Translation Platform</h2>
        <div className="user-info">
          <span>User: {currentUser.name}</span>
          <span>Languages: {currentUser.languages.join(', ')}</span>
        </div>
      </div>

      <div className="main-content">
        {/* セッション一覧 */}
        <div className="sessions-panel">
          <div className="panel-header">
            <h3>Translation Sessions</h3>
            <button
              className="create-session-btn"
              onClick={() => setActiveSession(null)}
            >
              Create New Session
            </button>
          </div>

          <div className="sessions-list">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
                onClick={() => joinSession(session.id)}
              >
                <div className="session-info">
                  <h4>{session.title}</h4>
                  <p>{session.sourceText.substring(0, 100)}...</p>
                  <div className="session-meta">
                    <span>Languages: {session.targetLanguages.join(', ')}</span>
                    <span>Participants: {session.participants.length}</span>
                    <span>Status: {session.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* メイン作業エリア */}
        <div className="workspace-panel">
          {!activeSession ? (
            /* セッション作成フォーム */
            <div className="session-creation">
              <h3>Create New Translation Session</h3>

              <div className="form-group">
                <label>Session Title:</label>
                <input
                  type="text"
                  value={newSession.title}
                  onChange={(e) => setNewSession(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter session title..."
                />
              </div>

              <div className="form-group">
                <label>Source Text:</label>
                <textarea
                  value={newSession.sourceText}
                  onChange={(e) => setNewSession(prev => ({ ...prev, sourceText: e.target.value }))}
                  placeholder="Enter the text to be translated..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>Source Language:</label>
                <select
                  value={newSession.sourceLanguage}
                  onChange={(e) => setNewSession(prev => ({ ...prev, sourceLanguage: e.target.value }))}
                >
                  {languages.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName} ({lang.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Target Languages:</label>
                <div className="language-checkboxes">
                  {languages.filter(lang => lang.code !== newSession.sourceLanguage).map(lang => (
                    <label key={lang.code} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newSession.targetLanguages.includes(lang.code)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewSession(prev => ({
                              ...prev,
                              targetLanguages: [...prev.targetLanguages, lang.code]
                            }));
                          } else {
                            setNewSession(prev => ({
                              ...prev,
                              targetLanguages: prev.targetLanguages.filter(l => l !== lang.code)
                            }));
                          }
                        }}
                      />
                      {lang.nativeName}
                    </label>
                  ))}
                </div>
              </div>

              <button className="create-btn" onClick={createSession}>
                Create Session
              </button>
            </div>
          ) : (
            /* 翻訳作業エリア */
            <div className="translation-workspace">
              <div className="workspace-header">
                <h3>{activeSession.title}</h3>
                <div className="session-status">
                  <span className={`status ${activeSession.status}`}>
                    {activeSession.status}
                  </span>
                  <span>Participants: {activeSession.participants.length}</span>
                </div>
              </div>

              <div className="segments-container">
                {segments.map(segment => (
                  <div key={segment.id} className="segment-card">
                    <div className="segment-original">
                      <h4>Original Text</h4>
                      <p>{segment.originalText}</p>
                    </div>

                    <div className="segment-translations">
                      <h4>Translations</h4>

                      {activeSession.targetLanguages.map(lang => (
                        <div key={lang} className="translation-input">
                          <div className="language-header">
                            <span>{languages.find(l => l.code === lang)?.nativeName}</span>
                            <span className="rtl-indicator">
                              {languages.find(l => l.code === lang)?.rtl && '↩️'}
                            </span>
                          </div>

                          {/* 既存の翻訳 */}
                          {segment.translations[lang] && (
                            <div className="existing-translations">
                              {Array.isArray(segment.translations[lang])
                                ? segment.translations[lang].map((translation, index) => (
                                    <div key={index} className="translation-item">
                                      <p>{translation.text}</p>
                                      <div className="translation-meta">
                                        <span>by {activeSession.participants.find(p => p.id === translation.userId)?.name}</span>
                                        <div className="vote-buttons">
                                          <button
                                            onClick={() => voteTranslation(segment.id, lang, translation.userId, 'up')}
                                            className="vote-up"
                                          >
                                            👍
                                          </button>
                                          <button
                                            onClick={() => voteTranslation(segment.id, lang, translation.userId, 'down')}
                                            className="vote-down"
                                          >
                                            👎
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                : <p>{segment.translations[lang]}</p>
                              }
                            </div>
                          )}

                          {/* 新しい翻訳入力 */}
                          <div className="new-translation-input">
                            <textarea
                              placeholder={`Enter ${languages.find(l => l.code === lang)?.nativeName} translation...`}
                              value={selectedSegment?.id === segment.id ? newTranslation : ''}
                              onChange={(e) => {
                                setSelectedSegment(segment);
                                setNewTranslation(e.target.value);
                              }}
                              onFocus={() => setSelectedSegment(segment)}
                              rows={3}
                            />
                            <button
                              onClick={() => submitTranslation(segment.id, lang, newTranslation)}
                              disabled={!newTranslation.trim()}
                            >
                              Submit Translation
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollaborativeTranslationManager;
