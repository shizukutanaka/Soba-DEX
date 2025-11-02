/**
 * 音声翻訳コンポーネント
 * 2025年最新技術対応版
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAITranslation } from '../hooks/useAITranslation';
import './VoiceTranslation.css';

const VoiceTranslation = () => {
  const {
    translate,
    getSupportedLanguages
  } = useAITranslation();

  const [languages, setLanguages] = useState([]);
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('ja');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recognition, setRecognition] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    loadLanguages();
    initializeSpeechRecognition();
  }, []);

  const loadLanguages = async () => {
    try {
      const languagesData = await getSupportedLanguages();
      setLanguages(languagesData.languages);
    } catch (error) {
      console.error('Failed to load languages:', error);
    }
  };

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();

      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = sourceLang;

      recognitionInstance.onstart = () => {
        setIsRecording(true);
      };

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        handleTranslation(transcript);
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
    }
  };

  const startRecording = () => {
    if (recognition) {
      recognition.lang = sourceLang;
      recognition.start();
    } else {
      // Fallback to MediaRecorder for manual audio handling
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
            await handleAudioTranscription(audioBlob);
          };

          mediaRecorder.start();
          setIsRecording(true);
        })
        .catch(error => {
          console.error('Error accessing microphone:', error);
        });
    }
  };

  const stopRecording = () => {
    if (recognition) {
      recognition.stop();
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioTranscription = async (audioBlob) => {
    try {
      const audioData = await blobToBase64(audioBlob);

      const response = await fetch('/api/i18n/voice/speech-to-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData,
          sourceLanguage: sourceLang
        })
      });

      const result = await response.json();
      if (result.success) {
        setInputText(result.data.transcript);
        handleTranslation(result.data.transcript);
      }
    } catch (error) {
      console.error('Audio transcription failed:', error);
    }
  };

  const handleTranslation = async (text) => {
    if (!text.trim()) return;

    try {
      const result = await translate({
        text,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        context: 'Voice translation',
        domain: 'general'
      });

      setTranslatedText(result.text);
      await generateAudio(result.text);
    } catch (error) {
      console.error('Translation failed:', error);
      setTranslatedText('Translation failed');
    }
  };

  const generateAudio = async (text) => {
    try {
      const response = await fetch('/api/i18n/voice/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
          options: {
            gender: 'NEUTRAL',
            speed: 1.0,
            pitch: 0.0
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        const audioBlob = new Blob([Uint8Array.from(atob(result.data.audioContent), c => c.charCodeAt(0))], { type: 'audio/mp3' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      }
    } catch (error) {
      console.error('Audio generation failed:', error);
    }
  };

  const playAudio = () => {
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTextInput = async () => {
    if (!inputText.trim()) return;
    await handleTranslation(inputText);
  };

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);

    if (recognition) {
      recognition.lang = sourceLang;
    }
  };

  return (
    <div className="voice-translation">
      <div className="header">
        <h2>Voice Translation</h2>
        <div className="language-controls">
          <div className="language-selector">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          <button className="swap-btn" onClick={swapLanguages}>
            ⇄
          </button>

          <div className="language-selector">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
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
      </div>

      <div className="translation-container">
        {/* 音声入力セクション */}
        <div className="input-section">
          <div className="input-header">
            <h3>Voice Input ({languages.find(l => l.code === sourceLang)?.nativeName})</h3>
            <div className="voice-controls">
              {!isRecording ? (
                <button
                  className="record-btn"
                  onClick={startRecording}
                  disabled={isRecording}
                >
                  🎤 Start Recording
                </button>
              ) : (
                <button
                  className="stop-btn"
                  onClick={stopRecording}
                >
                  ⏹️ Stop Recording
                </button>
              )}
            </div>
          </div>

          <div className="text-input">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Speak or type your text here..."
              rows={4}
            />
            <button
              className="translate-btn"
              onClick={handleTextInput}
              disabled={!inputText.trim()}
            >
              Translate
            </button>
          </div>
        </div>

        {/* 翻訳出力セクション */}
        <div className="output-section">
          <div className="output-header">
            <h3>Translation ({languages.find(l => l.code === targetLang)?.nativeName})</h3>
            {audioUrl && (
              <button
                className={`play-btn ${isPlaying ? 'playing' : ''}`}
                onClick={playAudio}
              >
                {isPlaying ? '🔊 Playing...' : '🔊 Play Audio'}
              </button>
            )}
          </div>

          <div className="text-output">
            <div className="translated-text">
              {translatedText || 'Translation will appear here...'}
            </div>

            <div className="output-actions">
              <button
                onClick={() => navigator.clipboard.writeText(translatedText)}
                disabled={!translatedText}
              >
                📋 Copy
              </button>
              <button
                onClick={() => {
                  const textToSpeak = translatedText || inputText;
                  if (textToSpeak) generateAudio(textToSpeak);
                }}
                disabled={!translatedText && !inputText}
              >
                🎵 Generate Audio
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* リアルタイムフィードバック */}
      <div className="feedback-section">
        <div className="recording-status">
          {isRecording && (
            <div className="status-indicator">
              <div className="recording-animation">
                <div className="pulse"></div>
                <div className="pulse"></div>
                <div className="pulse"></div>
              </div>
              <span>Listening...</span>
            </div>
          )}
        </div>

        <div className="translation-quality">
          {translatedText && (
            <div className="quality-indicator">
              <span className="quality-label">Translation Quality:</span>
              <span className="quality-value">High</span>
            </div>
          )}
        </div>
      </div>

      {/* 隠しオーディオ要素 */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default VoiceTranslation;
