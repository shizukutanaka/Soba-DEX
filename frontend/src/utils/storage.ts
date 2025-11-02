// Lightweight local storage utilities for essential data persistence
export const storage = {
  // Get item with fallback
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  // Set item safely
  set: (key: string, value: any): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  // Remove item
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silent fail
    }
  },

  // Clear all app data
  clear: (): void => {
    try {
      const keys = Object.keys(localStorage).filter(key =>
        key.startsWith('dex_')
      );
      keys.forEach(key => localStorage.removeItem(key));
    } catch {
      // Silent fail
    }
  },

  // Check if storage is available
  isAvailable: (): boolean => {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
};

// Storage keys for the app
export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'dex_wallet_address',
  SLIPPAGE_TOLERANCE: 'dex_slippage_tolerance',
  PRICE_ALERTS: 'dex_price_alerts',
  FAVORITE_TOKENS: 'dex_favorite_tokens',
  TRADE_HISTORY: 'dex_trade_history',
  USER_PREFERENCES: 'dex_user_preferences',
  PORTFOLIO_DATA: 'dex_portfolio_data',
};