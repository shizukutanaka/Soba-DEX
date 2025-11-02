/**
 * React Hook for AI Translation
 * 2025年最新技術対応版
 */

import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const useAITranslation = () => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationHistory, setTranslationHistory] = useState([]);

  /**
   * 単一テキスト翻訳
   */
  const translate = useCallback(async ({
    text,
    sourceLanguage = 'en',
    targetLanguage,
    context,
    domain = 'general',
    options = {}
  }) => {
    if (!text || !targetLanguage) {
      throw new Error('Missing required parameters: text and targetLanguage');
    }

    setIsTranslating(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/i18n/translate`, {
        text,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        options: {
          context,
          domain,
          ...options
        }
      });

      if (response.data.success) {
        const result = response.data.data;

        // 翻訳履歴に追加
        setTranslationHistory(prev => [{
          id: Date.now(),
          original: text,
          translated: result.text,
          sourceLanguage,
          targetLanguage,
          confidence: result.confidence,
          timestamp: new Date().toISOString()
        }, ...prev.slice(0, 49)]); // 最新50件を保持

        return result;
      } else {
        throw new Error(response.data.error || 'Translation failed');
      }
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  /**
   * 一括翻訳
   */
  const translateBulk = useCallback(async ({
    texts,
    sourceLanguage = 'en',
    targetLanguage,
    options = {}
  }) => {
    if (!Array.isArray(texts) || texts.length === 0 || !targetLanguage) {
      throw new Error('Missing required parameters: texts (array) and targetLanguage');
    }

    setIsTranslating(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/i18n/translate/bulk`, {
        texts,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
        options
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Bulk translation failed');
      }
    } catch (error) {
      console.error('Bulk translation error:', error);
      throw error;
    } finally {
      setIsTranslating(false);
    }
  }, []);

  /**
   * 翻訳品質評価
   */
  const evaluateTranslation = useCallback(async ({
    translation,
    original,
    sourceLanguage = 'en',
    targetLanguage
  }) => {
    if (!translation || !original || !targetLanguage) {
      throw new Error('Missing required parameters');
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/i18n/evaluate`, {
        translation,
        original,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage
      });

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Evaluation failed');
      }
    } catch (error) {
      console.error('Evaluation error:', error);
      throw error;
    }
  }, []);

  /**
   * サポート言語一覧取得
   */
  const getSupportedLanguages = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/i18n/languages`);

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to get languages');
      }
    } catch (error) {
      console.error('Get languages error:', error);
      throw error;
    }
  }, []);

  /**
   * 翻訳統計取得
   */
  const getTranslationStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/i18n/stats`);

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to get stats');
      }
    } catch (error) {
      console.error('Get stats error:', error);
      throw error;
    }
  }, []);

  /**
   * 翻訳履歴クリア
   */
  const clearHistory = useCallback(() => {
    setTranslationHistory([]);
  }, []);

  /**
   * キャッシュクリア（管理者用）
   */
  const clearCache = useCallback(async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/i18n/cache/clear`);

      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to clear cache');
      }
    } catch (error) {
      console.error('Clear cache error:', error);
      throw error;
    }
  }, []);

  return {
    // 翻訳機能
    translate,
    translateBulk,
    evaluateTranslation,

    // 情報取得
    getSupportedLanguages,
    getTranslationStats,

    // 状態
    isTranslating,
    translationHistory,

    // 管理機能
    clearHistory,
    clearCache
  };
};

export default useAITranslation;
