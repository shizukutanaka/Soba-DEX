/**
 * Real-time Translation Service
 * Provides instant translation for user-generated content and live interactions
 *
 * Features:
 * - Instant translation of chat messages
 * - Real-time voice translation
 * - Live subtitle generation
 * - Collaborative translation
 * - Translation memory
 * - Context-aware suggestions
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { aiTranslationService } from './aiTranslation';

export interface RealTimeTranslationProps {
  text: string;
  sourceLanguage: string;
  targetLanguages: string[];
  onTranslation?: (translations: Record<string, string>) => void;
  autoTranslate?: boolean;
  preserveFormatting?: boolean;
  context?: string;
}

export interface VoiceTranslationProps {
  audioStream: MediaStream;
  targetLanguage: string;
  onTranscription?: (text: string) => void;
  onTranslation?: (translation: string) => void;
  continuous?: boolean;
}

export interface LiveSubtitleProps {
  videoElement: HTMLVideoElement;
  targetLanguages: string[];
  onSubtitleUpdate?: (subtitles: Record<string, string[]>) => void;
  style?: 'overlay' | 'separate';
}

/**
 * Real-time Translation Hook
 */
export const useRealTimeTranslation = (props: RealTimeTranslationProps) => {
  const { text, sourceLanguage, targetLanguages, onTranslation, autoTranslate = true } = props;
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translateText = useCallback(async () => {
    if (!text.trim() || !autoTranslate) return;

    setIsTranslating(true);
    setError(null);

    try {
      const translationPromises = targetLanguages.map(async (targetLang) => {
        const result = await aiTranslationService.translate({
          text,
          sourceLanguage,
          targetLanguage: targetLang,
          context: props.context,
          options: {
            preserveFormatting: props.preserveFormatting
          }
        });
        return { language: targetLang, translation: result.translatedText };
      });

      const results = await Promise.all(translationPromises);
      const newTranslations = results.reduce((acc, { language, translation }) => {
        acc[language] = translation;
        return acc;
      }, {} as Record<string, string>);

      setTranslations(newTranslations);
      onTranslation?.(newTranslations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setIsTranslating(false);
    }
  }, [text, sourceLanguage, targetLanguages, autoTranslate, onTranslation, props.context, props.preserveFormatting]);

  useEffect(() => {
    const debounceTimer = setTimeout(translateText, 300); // Debounce translations
    return () => clearTimeout(debounceTimer);
  }, [translateText]);

  return {
    translations,
    isTranslating,
    error,
    retranslate: translateText
  };
};

/**
 * Voice Translation Hook
 */
export const useVoiceTranslation = (props: VoiceTranslationProps) => {
  const { audioStream, targetLanguage, onTranscription, onTranslation, continuous = true } = props;
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    recognitionRef.current.continuous = continuous;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = targetLanguage;

    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current.onresult = async (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const fullTranscript = finalTranscript || interimTranscript;
      setTranscription(fullTranscript);
      onTranscription?.(fullTranscript);

      if (finalTranscript && targetLanguage !== 'en') {
        setIsProcessing(true);
        try {
          const result = await aiTranslationService.translate({
            text: finalTranscript,
            sourceLanguage: 'en', // Assume English input
            targetLanguage: targetLanguage
          });

          setTranslation(result.translatedText);
          onTranslation?.(result.translatedText);
        } catch (error) {
          console.error('Voice translation failed:', error);
        } finally {
          setIsProcessing(false);
        }
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      if (continuous) {
        // Restart listening for continuous mode
        setTimeout(() => startListening(), 1000);
      }
    };

    recognitionRef.current.start();
  }, [targetLanguage, continuous, onTranscription, onTranslation]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    startListening,
    stopListening,
    isListening,
    transcription,
    translation,
    isProcessing
  };
};

/**
 * Real-time Translation Component
 */
export const RealTimeTranslator: React.FC<RealTimeTranslationProps> = (props) => {
  const { t } = useTranslation();
  const { translations, isTranslating, error } = useRealTimeTranslation(props);

  return (
    <div className="real-time-translator">
      {isTranslating && (
        <div className="translation-loading">
          {t('common.translating')}...
        </div>
      )}

      {error && (
        <div className="translation-error">
          {t('errors.translationFailed')}: {error}
        </div>
      )}

      {Object.entries(translations).map(([language, translation]) => (
        <div key={language} className="translation-result">
          <span className="language-flag">
            {getLanguageFlag(language)}
          </span>
          <span className="translated-text">
            {translation}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Voice Translation Component
 */
export const VoiceTranslator: React.FC<VoiceTranslationProps> = (props) => {
  const { t } = useTranslation();
  const { startListening, stopListening, isListening, transcription, translation, isProcessing } = useVoiceTranslation(props);

  return (
    <div className="voice-translator">
      <div className="controls">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`voice-button ${isListening ? 'listening' : ''}`}
        >
          {isListening ? t('common.stopListening') : t('common.startListening')}
        </button>
      </div>

      {transcription && (
        <div className="transcription">
          <strong>{t('common.transcription')}:</strong> {transcription}
        </div>
      )}

      {isProcessing && (
        <div className="processing">
          {t('common.translating')}...
        </div>
      )}

      {translation && (
        <div className="translation">
          <strong>{t('common.translation')}:</strong> {translation}
        </div>
      )}
    </div>
  );
};

/**
 * Live Subtitle Component
 */
export const LiveSubtitleGenerator: React.FC<LiveSubtitleProps> = (props) => {
  const { videoElement, targetLanguages, onSubtitleUpdate, style = 'overlay' } = props;
  const [subtitles, setSubtitles] = useState<Record<string, string[]>>({});
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const updateSubtitles = async () => {
      // This would integrate with video processing services
      // For now, simulate subtitle generation
      const newSubtitles: Record<string, string[]> = {};

      for (const targetLang of targetLanguages) {
        newSubtitles[targetLang] = [
          `Subtitle in ${targetLang} at ${Math.floor(currentTime)}s`,
          `Line 2 in ${targetLang}`
        ];
      }

      setSubtitles(newSubtitles);
      onSubtitleUpdate?.(newSubtitles);
    };

    const interval = setInterval(updateSubtitles, 1000);
    return () => clearInterval(interval);
  }, [targetLanguages, currentTime, onSubtitleUpdate]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(videoElement.currentTime);
    videoElement.addEventListener('timeupdate', updateTime);
    return () => videoElement.removeEventListener('timeupdate', updateTime);
  }, [videoElement]);

  if (style === 'separate') {
    return (
      <div className="live-subtitles-separate">
        {Object.entries(subtitles).map(([language, lines]) => (
          <div key={language} className="subtitle-track">
            <div className="language-label">{getLanguageName(language)}</div>
            {lines.map((line, index) => (
              <div key={index} className="subtitle-line">
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="live-subtitles-overlay">
      {Object.entries(subtitles).map(([language, lines]) => (
        <div key={language} className="subtitle-overlay">
          <div className="subtitle-text">
            {lines.join(' ')}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Translation Memory Service
 */
export class TranslationMemory {
  private memory: Map<string, { translation: string; confidence: number; timestamp: number }> = new Map();
  private maxSize = 10000;

  add(original: string, translation: string, sourceLang: string, targetLang: string, confidence: number) {
    const key = `${sourceLang}:${targetLang}:${original.toLowerCase()}`;

    if (this.memory.size >= this.maxSize) {
      // Remove oldest entry
      const oldestKey = this.memory.keys().next().value;
      this.memory.delete(oldestKey);
    }

    this.memory.set(key, {
      translation,
      confidence,
      timestamp: Date.now()
    });
  }

  find(original: string, sourceLang: string, targetLang: string): string | null {
    const key = `${sourceLang}:${targetLang}:${original.toLowerCase()}`;
    const entry = this.memory.get(key);

    if (entry && entry.confidence > 0.9) {
      return entry.translation;
    }

    return null;
  }

  getStats() {
    return {
      totalEntries: this.memory.size,
      averageConfidence: Array.from(this.memory.values()).reduce((sum, entry) => sum + entry.confidence, 0) / this.memory.size,
      oldestEntry: Math.min(...Array.from(this.memory.values()).map(entry => entry.timestamp)),
      newestEntry: Math.max(...Array.from(this.memory.values()).map(entry => entry.timestamp))
    };
  }

  clear() {
    this.memory.clear();
  }
}

// Export translation memory instance
export const translationMemory = new TranslationMemory();

/**
 * Context-aware Translation Service
 */
export class ContextAwareTranslation {
  private contextPatterns: Map<string, RegExp> = new Map();
  private domainSpecificTerms: Map<string, Record<string, string>> = new Map();

  constructor() {
    this.initializeContextPatterns();
    this.initializeDomainTerms();
  }

  private initializeContextPatterns() {
    this.contextPatterns.set('technical', /\b(algorithm|protocol|blockchain|smart.contract|liquidity|staking|yield.farming)\b/gi);
    this.contextPatterns.set('financial', /\b(price|market|trading|exchange|currency|fee|tax|profit|loss)\b/gi);
    this.contextPatterns.set('formal', /\b(mr|mrs|dr|prof|please|thank.you|regards|best.wishes)\b/gi);
  }

  private initializeDomainTerms() {
    // DeFi specific terms
    this.domainSpecificTerms.set('defi', {
      'smart contract': 'スマートコントラクト',
      'liquidity pool': '流動性プール',
      'yield farming': 'イールドファーミング',
      'total value locked': '総ロック価値',
      'automated market maker': '自動マーケットメーカー',
      'decentralized exchange': '分散型取引所',
      'governance token': 'ガバナンストークン'
    });

    // Technical terms
    this.domainSpecificTerms.set('technical', {
      'application programming interface': 'アプリケーションプログラミングインターフェース',
      'user interface': 'ユーザーインターフェース',
      'user experience': 'ユーザーエクスペリエンス',
      'application': 'アプリケーション',
      'framework': 'フレームワーク',
      'library': 'ライブラリ'
    });
  }

  analyzeContext(text: string): { domain: string; formality: 'formal' | 'informal'; technical: boolean } {
    const analysis = {
      domain: 'general',
      formality: 'informal' as 'formal' | 'informal',
      technical: false
    };

    // Detect technical content
    if (this.contextPatterns.get('technical')!.test(text)) {
      analysis.technical = true;
      analysis.domain = 'technical';
    }

    // Detect financial content
    if (this.contextPatterns.get('financial')!.test(text)) {
      analysis.domain = 'financial';
    }

    // Detect formal language
    if (this.contextPatterns.get('formal')!.test(text)) {
      analysis.formality = 'formal';
    }

    return analysis;
  }

  getDomainSpecificTranslation(text: string, domain: string, sourceLang: string, targetLang: string): string {
    const domainTerms = this.domainSpecificTerms.get(domain);
    if (!domainTerms) return text;

    let translated = text;

    Object.entries(domainTerms).forEach(([source, target]) => {
      const regex = new RegExp(source, 'gi');
      translated = translated.replace(regex, target);
    });

    return translated;
  }
}

// Export context-aware translation instance
export const contextAwareTranslation = new ContextAwareTranslation();

/**
 * Utility functions
 */
export const getLanguageFlag = (language: string): string => {
  const flags: Record<string, string> = {
    en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
    pt: '🇵🇹', ru: '🇷🇺', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳',
    ar: '🇸🇦', hi: '🇮🇳', nl: '🇳🇱', sv: '🇸🇪', da: '🇩🇰',
    no: '🇳🇴', fi: '🇫🇮', pl: '🇵🇱', tr: '🇹🇷', he: '🇮🇱',
    th: '🇹🇭', vi: '🇻🇳', uk: '🇺🇦', cs: '🇨🇿', ro: '🇷🇴',
    el: '🇬🇷', hu: '🇭🇺', bg: '🇧🇬', hr: '🇭🇷', sr: '🇷🇸',
    sk: '🇸🇰', sl: '🇸🇮', et: '🇪🇪', lv: '🇱🇻', lt: '🇱🇹',
    mt: '🇲🇹', ga: '🇮🇪', cy: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', is: '🇮🇸', fo: '🇫🇴',
    mk: '🇲🇰', sq: '🇦🇱', bs: '🇧🇦', me: '🇲🇪', xh: '🇿🇦',
    zu: '🇿🇦', af: '🇿🇦', st: '🇿🇦', tn: '🇿🇦', ts: '🇿🇦',
    ss: '🇿🇦', ve: '🇿🇦', nr: '🇿🇦', yo: '🇳🇬', ig: '🇳🇬',
    ha: '🇳🇬', sw: '🇰🇪', so: '🇸🇴', am: '🇪🇹', om: '🇪🇹',
    ti: '🇪🇹', ne: '🇳🇵', rw: '🇷🇼', rn: '🇧🇮', sn: '🇿🇼',
    ny: '🇲🇼', mg: '🇲🇬', ml: '🇮🇳', si: '🇱🇰', ta: '🇮🇳',
    te: '🇮🇳', kn: '🇮🇳', mr: '🇮🇳', gu: '🇮🇳', pa: '🇮🇳',
    or: '🇮🇳', as: '🇮🇳', bn: '🇧🇩', my: '🇲🇲', km: '🇰🇭',
    lo: '🇱🇦', mn: '🇲🇳', ka: '🇬🇪', hy: '🇦🇲', az: '🇦🇿',
    kk: '🇰🇿', uz: '🇺🇿', ky: '🇰🇬', tg: '🇹🇯', tk: '🇹🇲',
    ps: '🇦🇫', ur: '🇵🇰', sd: '🇵🇰', ku: '🇹🇷', fa: '🇮🇷',
    ckb: '🇮🇶', syr: '🇸🇾', yi: '🇮🇱', jv: '🇮🇩', su: '🇮🇩',
    ms: '🇲🇾', tl: '🇵🇭', ceb: '🇵🇭', ilo: '🇵🇭', haw: '🇺🇸',
    sm: '🇼🇸', to: '🇹🇴', fj: '🇫🇯', mi: '🇳🇿'
  };

  return flags[language] || '🌐';
};

export const getLanguageName = (language: string): string => {
  const names: Record<string, string> = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano',
    pt: 'Português', ru: 'Русский', ja: '日本語', ko: '한국어', zh: '中文',
    ar: 'العربية', hi: 'हिन्दी', nl: 'Nederlands', sv: 'Svenska', da: 'Dansk',
    no: 'Norsk', fi: 'Suomi', pl: 'Polski', tr: 'Türkçe', he: 'עברית',
    th: 'ไทย', vi: 'Tiếng Việt', uk: 'Українська', cs: 'Čeština', ro: 'Română',
    el: 'Ελληνικά', hu: 'Magyar', bg: 'Български', hr: 'Hrvatski', sr: 'Српски',
    sk: 'Slovenčina', sl: 'Slovenščina', et: 'Eesti', lv: 'Latviešu', lt: 'Lietuvių',
    mt: 'Malti', ga: 'Gaeilge', cy: 'Cymraeg', is: 'Íslenska', fo: 'Føroyskt',
    mk: 'Македонски', sq: 'Shqip', bs: 'Bosanski', me: 'Crnogorski', xh: 'isiXhosa',
    zu: 'isiZulu', af: 'Afrikaans', st: 'Sesotho', tn: 'Setswana', ts: 'Xitsonga',
    ss: 'siSwati', ve: 'Tshivenda', nr: 'isiNdebele', yo: 'Yorùbá', ig: 'Igbo',
    ha: 'Hausa', sw: 'Kiswahili', so: 'Soomaali', am: 'አማርኛ', om: 'Afaan Oromoo',
    ti: 'ትግርኛ', ne: 'नेपाली', rw: 'Kinyarwanda', rn: 'Kirundi', sn: 'chiShona',
    ny: 'Chichewa', mg: 'Malagasy', ml: 'മലയാളം', si: 'සිංහල', ta: 'தமிழ்',
    te: 'తెలుగు', kn: 'ಕನ್ನಡ', mr: 'मराठी', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ',
    or: 'ଓଡ଼ିଆ', as: 'অসমীয়া', bn: 'বাংলা', my: 'မြန်မာဘာသာ', km: 'ខ្មែរ',
    lo: 'ລາວ', mn: 'Монгол', ka: 'ქართული', hy: 'Հայերեն', az: 'Azərbaycan',
    kk: 'Қазақша', uz: 'Oʻzbekcha', ky: 'Кыргызча', tg: 'Тоҷикӣ', tk: 'Türkmençe',
    ps: 'پښتو', ur: 'اردو', sd: 'سنڌي', ku: 'Kurdî', fa: 'فارسی',
    ckb: 'كوردی', syr: 'ܣܘܪܝܝܐ', yi: 'ייִדיש', jv: 'Jawa', su: 'Sunda',
    ms: 'Bahasa Melayu', tl: 'Filipino', ceb: 'Cebuano', ilo: 'Ilokano', haw: 'ʻŌlelo Hawaiʻi',
    sm: 'Gagana Samoa', to: 'Lea Faka-Tonga', fj: 'Na Vosa Vakaviti', mi: 'Māori'
  };

  return names[language] || language;
};

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
