/**
 * Language Selector Component
 * Dropdown for selecting from 100+ supported languages
 *
 * Features:
 * - Search functionality
 * - Grouped by region
 * - RTL support
 * - Flag emojis
 * - Keyboard navigation
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGE_CONFIGS,
  getLanguagesByRegion,
  changeLanguage,
  isRTL
} from '../services/i18n';
import './LanguageSelector.css';

interface LanguageSelectorProps {
  className?: string;
  showFlag?: boolean;
  showNativeName?: boolean;
  groupByRegion?: boolean;
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  className = '',
  showFlag = true,
  showNativeName = true,
  groupByRegion = true,
  compact = false
}) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentLang = i18n.language;
  const currentConfig = LANGUAGE_CONFIGS[currentLang] || LANGUAGE_CONFIGS.en;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter languages based on search
  const filteredLanguages = Object.entries(LANGUAGE_CONFIGS).filter(([code, config]) => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      code.toLowerCase().includes(query) ||
      config.name.toLowerCase().includes(query) ||
      config.nativeName.toLowerCase().includes(query)
    );
  });

  // Group languages by region
  const groupedLanguages = groupByRegion
    ? filteredLanguages.reduce((acc, [code, config]) => {
        if (!acc[config.region]) {
          acc[config.region] = [];
        }
        acc[config.region].push({ code, config });
        return acc;
      }, {} as Record<string, Array<{ code: string; config: typeof LANGUAGE_CONFIGS[string] }>>)
    : { all: filteredLanguages.map(([code, config]) => ({ code, config })) };

  const handleLanguageChange = async (lang: string) => {
    await changeLanguage(lang);
    setIsOpen(false);
    setSearchQuery('');
  };

  const regionNames: Record<string, string> = {
    global: t('regions.global', 'Global'),
    europe: t('regions.europe', 'Europe'),
    asia: t('regions.asia', 'Asia'),
    'middle-east': t('regions.middleEast', 'Middle East'),
    africa: t('regions.africa', 'Africa'),
    americas: t('regions.americas', 'Americas'),
    oceania: t('regions.oceania', 'Oceania')
  };

  return (
    <div
      ref={dropdownRef}
      className={`language-selector ${className} ${isOpen ? 'open' : ''} ${
        isRTL(currentLang) ? 'rtl' : ''
      }`}
    >
      {/* Current Language Button */}
      <button
        className={`language-selector__button ${compact ? 'compact' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('language.select', 'Select language')}
        aria-expanded={isOpen}
      >
        {showFlag && <span className="language-selector__flag">{currentConfig.flag}</span>}
        <span className="language-selector__label">
          {compact
            ? currentLang.toUpperCase()
            : showNativeName
            ? currentConfig.nativeName
            : currentConfig.name}
        </span>
        <svg
          className={`language-selector__arrow ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="language-selector__dropdown">
          {/* Search */}
          <div className="language-selector__search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('language.search', 'Search languages...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="language-selector__search-input"
            />
          </div>

          {/* Language List */}
          <div className="language-selector__list">
            {Object.entries(groupedLanguages).map(([region, languages]) => (
              <div key={region} className="language-selector__group">
                {groupByRegion && languages.length > 0 && (
                  <div className="language-selector__group-title">{regionNames[region]}</div>
                )}

                {languages.map(({ code, config }) => (
                  <button
                    key={code}
                    className={`language-selector__item ${
                      code === currentLang ? 'active' : ''
                    } ${isRTL(code) ? 'rtl' : ''}`}
                    onClick={() => handleLanguageChange(code)}
                  >
                    {showFlag && <span className="language-selector__flag">{config.flag}</span>}
                    <div className="language-selector__item-text">
                      <div className="language-selector__item-native">{config.nativeName}</div>
                      {showNativeName && config.nativeName !== config.name && (
                        <div className="language-selector__item-name">{config.name}</div>
                      )}
                    </div>
                    {code === currentLang && (
                      <svg
                        className="language-selector__check"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M13 4L6 11L3 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {filteredLanguages.length === 0 && (
              <div className="language-selector__empty">
                {t('language.noResults', 'No languages found')}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="language-selector__footer">
            <div className="language-selector__count">
              {t('language.count', {
                count: Object.keys(LANGUAGE_CONFIGS).length,
                defaultValue: '{{count}} languages supported'
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
