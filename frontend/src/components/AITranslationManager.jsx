/**
 * AI Translation Management Component
 * 2025年最新技術対応版
 */

import React, { useState, useEffect } from 'react';
import { useAITranslation } from '../hooks/useAITranslation';
import './AITranslationManager.css';

const AITranslationManager = () => {
  const {
    translate,
    translateBulk,
    getSupportedLanguages,
    getTranslationStats,
    isTranslating,
    translationHistory,
    clearHistory
  } = useAITranslation();

  const [languages, setLanguages] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedSourceLang, setSelectedSourceLang] = useState('en');
  const [selectedTargetLang, setSelectedTargetLang] = useState('ja');
  const [inputText, setInputText] = useState('');
  const [bulkTexts, setBulkTexts] = useState('');
  const [translationResult, setTranslationResult] = useState(null);
  const [bulkResults, setBulkResults] = useState([]);
  const [activeTab, setActiveTab] = useState('single');

  useEffect(() => {
    loadLanguagesAndStats();
  }, []);

  const loadLanguagesAndStats = async () => {
    try {
      const [languagesData, statsData] = await Promise.all([
        getSupportedLanguages(),
        getTranslationStats()
      ]);

      setLanguages(languagesData.languages);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleSingleTranslation = async () => {
    if (!inputText.trim()) return;

    try {
      const result = await translate({
        text: inputText,
        sourceLanguage: selectedSourceLang,
        targetLanguage: selectedTargetLang,
        context: 'DeFi trading platform interface',
        domain: 'technical'
      });

      setTranslationResult(result);
    } catch (error) {
      setTranslationResult({
        text: 'Translation failed',
        confidence: 'error',
        error: error.message
      });
    }
  };

  const handleBulkTranslation = async () => {
    const texts = bulkTexts.split('\n').filter(text => text.trim());

    if (texts.length === 0) return;

    try {
      const results = await translateBulk({
        texts,
        sourceLanguage: selectedSourceLang,
        targetLanguage: selectedTargetLang,
        options: {
          context: 'DeFi trading platform interface',
          domain: 'technical'
        }
      });

      setBulkResults(results);
    } catch (error) {
      console.error('Bulk translation failed:', error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // コピー成功の通知（実際にはtoastライブラリを使用）
    alert('Copied to clipboard!');
  };

  const exportBulkResults = () => {
    const csvContent = [
      ['Original', 'Translated', 'Confidence', 'Provider'],
      ...bulkResults.map(result => [
        result.original,
        result.translated,
        result.confidence,
        result.provider || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translations_${selectedTargetLang}_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="ai-translation-manager">
      <div className="header">
        <h2>AI Translation Manager</h2>
        <div className="stats">
          {stats && (
            <>
              <span>AI Enabled: {stats.aiEnabled ? '✅' : '❌'}</span>
              <span>Languages: {stats.statistics?.supportedLanguages || 0}</span>
              <span>Cache Hit Rate: {stats.aiStats?.cacheHitRate?.toFixed(1) || 0}%</span>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        <button
          className={activeTab === 'single' ? 'active' : ''}
          onClick={() => setActiveTab('single')}
        >
          Single Translation
        </button>
        <button
          className={activeTab === 'bulk' ? 'active' : ''}
          onClick={() => setActiveTab('bulk')}
        >
          Bulk Translation
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          History ({translationHistory.length})
        </button>
      </div>

      <div className="language-selector">
        <div className="selector-group">
          <label>Source Language:</label>
          <select
            value={selectedSourceLang}
            onChange={(e) => setSelectedSourceLang(e.target.value)}
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.name})
              </option>
            ))}
          </select>
        </div>

        <div className="selector-group">
          <label>Target Language:</label>
          <select
            value={selectedTargetLang}
            onChange={(e) => setSelectedTargetLang(e.target.value)}
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.name})
                {lang.rtl && ' ↩️'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeTab === 'single' && (
        <div className="single-translation">
          <div className="input-section">
            <label>Source Text:</label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter text to translate..."
              rows={4}
            />
          </div>

          <div className="controls">
            <button
              onClick={handleSingleTranslation}
              disabled={!inputText.trim() || isTranslating}
            >
              {isTranslating ? 'Translating...' : 'Translate'}
            </button>
          </div>

          {translationResult && (
            <div className="result-section">
              <label>Translation Result:</label>
              <div className="translation-result">
                <div className="result-text">
                  {translationResult.text}
                </div>
                <div className="result-meta">
                  <span className={`confidence ${translationResult.confidence}`}>
                    Confidence: {translationResult.confidence}
                  </span>
                  <span>Provider: {translationResult.provider}</span>
                  <span>Score: {translationResult.score}/100</span>
                </div>
                <div className="result-actions">
                  <button onClick={() => copyToClipboard(translationResult.text)}>
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bulk' && (
        <div className="bulk-translation">
          <div className="input-section">
            <label>Bulk Translation (one text per line):</label>
            <textarea
              value={bulkTexts}
              onChange={(e) => setBulkTexts(e.target.value)}
              placeholder="Enter multiple texts to translate, one per line..."
              rows={8}
            />
          </div>

          <div className="controls">
            <button
              onClick={handleBulkTranslation}
              disabled={!bulkTexts.trim() || isTranslating}
            >
              {isTranslating ? 'Translating...' : 'Translate All'}
            </button>
          </div>

          {bulkResults.length > 0 && (
            <div className="bulk-results">
              <div className="results-header">
                <h3>Translation Results ({bulkResults.length})</h3>
                <button onClick={exportBulkResults}>
                  Export CSV
                </button>
              </div>

              <div className="results-list">
                {bulkResults.map((result, index) => (
                  <div key={index} className="result-item">
                    <div className="original-text">
                      {result.original}
                    </div>
                    <div className="translated-text">
                      {result.translated}
                    </div>
                    <div className="result-meta">
                      <span className={`confidence ${result.confidence}`}>
                        {result.confidence}
                      </span>
                      {result.provider && <span>{result.provider}</span>}
                    </div>
                    <div className="result-actions">
                      <button onClick={() => copyToClipboard(result.translated)}>
                        Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="translation-history">
          <div className="history-controls">
            <button onClick={clearHistory}>Clear History</button>
          </div>

          <div className="history-list">
            {translationHistory.length === 0 ? (
              <div className="no-history">No translation history</div>
            ) : (
              translationHistory.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-original">
                    {item.original}
                  </div>
                  <div className="history-translated">
                    {item.translated}
                  </div>
                  <div className="history-meta">
                    <span>{item.sourceLanguage} → {item.targetLanguage}</span>
                    <span>{item.confidence}</span>
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AITranslationManager;
