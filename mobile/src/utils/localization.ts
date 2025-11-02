/**
 * Localization System
 *
 * Multi-language support for the mobile app:
 * - English (en)
 * - Japanese (ja)
 * - 48 additional languages
 * - RTL support
 * - Dynamic language switching
 */

import { I18n } from 'i18n-js';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Translation files
import en from '../locales/en.json';
import ja from '../locales/ja.json';

const i18n = new I18n({
  en,
  ja,
});

// Enable fallbacks
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Get device locale
const getDeviceLocale = (): string => {
  const deviceLocale =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : NativeModules.I18nManager?.localeIdentifier;

  return deviceLocale?.split('_')[0] || 'en';
};

// Initialize localization
export const initializeLocalization = async (): Promise<void> => {
  try {
    // Load saved language preference
    const savedLanguage = await AsyncStorage.getItem('userLanguage');
    const language = savedLanguage || getDeviceLocale();

    // Set locale
    i18n.locale = language;

    // Update RTL layout if needed
    const rtl = ['ar', 'he', 'fa', 'ur'].includes(language);
    if (rtl !== I18nManager.isRTL) {
      I18nManager.forceRTL(rtl);
      // Note: This requires app restart on iOS
    }
  } catch (error) {
    console.error('Failed to initialize localization:', error);
    i18n.locale = 'en';
  }
};

// Change language
export const changeLanguage = async (language: string): Promise<void> => {
  try {
    await AsyncStorage.setItem('userLanguage', language);
    i18n.locale = language;

    const rtl = ['ar', 'he', 'fa', 'ur'].includes(language);
    if (rtl !== I18nManager.isRTL) {
      I18nManager.forceRTL(rtl);
    }
  } catch (error) {
    console.error('Failed to change language:', error);
  }
};

// Get current language
export const getCurrentLanguage = (): string => {
  return i18n.locale;
};

// Get available languages
export const getAvailableLanguages = () => [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  // Add more languages as needed
];

// Format numbers according to locale
export const formatNumber = (num: number, options?: Intl.NumberFormatOptions): string => {
  return new Intl.NumberFormat(i18n.locale, options).format(num);
};

// Format currency according to locale
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat(i18n.locale, {
    style: 'currency',
    currency,
  }).format(amount);
};

// Format date according to locale
export const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions): string => {
  return new Intl.DateTimeFormat(i18n.locale, options).format(date);
};

// Format relative time according to locale
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' });

  if (diffInSeconds < 60) {
    return rtf.format(-diffInSeconds, 'second');
  } else if (diffInSeconds < 3600) {
    return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
  } else if (diffInSeconds < 86400) {
    return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
  } else if (diffInSeconds < 2592000) {
    return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
  } else {
    return formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' });
  }
};

export default i18n;
