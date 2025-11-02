// Lightweight local storage service for DEX data
interface StorageData {
  timestamp: number;
  data: any;
}

interface WalletConnection {
  // SECURITY: Never store wallet address in localStorage
  // address: string; // REMOVED for security
  chainId: number;
  connected: boolean;
  timestamp: number;
}

interface TradeHistory {
  id: string;
  type: 'swap' | 'order' | 'liquidity';
  tokenA: string;
  tokenB: string;
  amount: number;
  price?: number;
  txHash: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

interface UserPreferences {
  slippageTolerance: number;
  theme: 'light' | 'dark';
  currency: 'USD' | 'ETH';
  notifications: boolean;
  autoRefresh: boolean;
}

class StorageService {
  private prefix = 'dex_';
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours

  // Generic storage methods
  private setItem(key: string, data: any, ttl?: number): void {
    try {
      const storageData: StorageData = {
        timestamp: Date.now(),
        data
      };

      if (ttl) {
        storageData.timestamp += ttl;
      }

      localStorage.setItem(this.prefix + key, JSON.stringify(storageData));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  private getItem<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(this.prefix + key);
      if (!item) return null;

      const storageData: StorageData = JSON.parse(item);

      // Check TTL if set
      if (storageData.timestamp > Date.now() + this.defaultTTL) {
        if (Date.now() > storageData.timestamp) {
          this.removeItem(key);
          return null;
        }
      }

      return storageData.data;
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  }

  private removeItem(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  // Wallet connection
  saveWalletConnection(connection: WalletConnection): void {
    this.setItem('wallet_connection', connection);
  }

  getWalletConnection(): WalletConnection | null {
    return this.getItem<WalletConnection>('wallet_connection');
  }

  clearWalletConnection(): void {
    this.removeItem('wallet_connection');
  }

  // Trade history
  saveTradeHistory(trades: TradeHistory[]): void {
    // Keep only last 100 trades
    const limitedTrades = trades.slice(0, 100);
    this.setItem('trade_history', limitedTrades);
  }

  getTradeHistory(): TradeHistory[] {
    return this.getItem<TradeHistory[]>('trade_history') || [];
  }

  addTrade(trade: TradeHistory): void {
    const history = this.getTradeHistory();
    history.unshift(trade);
    this.saveTradeHistory(history);
  }

  updateTradeStatus(tradeId: string, status: TradeHistory['status'], txHash?: string): void {
    const history = this.getTradeHistory();
    const trade = history.find(t => t.id === tradeId);

    if (trade) {
      trade.status = status;
      if (txHash) trade.txHash = txHash;
      this.saveTradeHistory(history);
    }
  }

  // User preferences
  saveUserPreferences(preferences: UserPreferences): void {
    this.setItem('user_preferences', preferences);
  }

  getUserPreferences(): UserPreferences {
    return this.getItem<UserPreferences>('user_preferences') || {
      slippageTolerance: 0.01, // 1%
      theme: 'light',
      currency: 'USD',
      notifications: true,
      autoRefresh: true
    };
  }

  updateUserPreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ): void {
    const preferences = this.getUserPreferences();
    preferences[key] = value;
    this.saveUserPreferences(preferences);
  }

  // Favorite trading pairs
  saveFavoritePairs(pairs: string[]): void {
    this.setItem('favorite_pairs', pairs);
  }

  getFavoritePairs(): string[] {
    return this.getItem<string[]>('favorite_pairs') || ['ETH/USDC', 'BTC/USDC'];
  }

  addFavoritePair(pair: string): void {
    const favorites = this.getFavoritePairs();
    if (!favorites.includes(pair)) {
      favorites.push(pair);
      this.saveFavoritePairs(favorites);
    }
  }

  removeFavoritePair(pair: string): void {
    const favorites = this.getFavoritePairs();
    const filtered = favorites.filter(p => p !== pair);
    this.saveFavoritePairs(filtered);
  }

  // Portfolio data
  savePortfolioData(portfolio: any): void {
    this.setItem('portfolio_data', portfolio, 60000); // 1 minute TTL
  }

  getPortfolioData(): any {
    return this.getItem('portfolio_data');
  }

  // Recent searches
  saveRecentSearches(searches: string[]): void {
    // Keep only last 10 searches
    const limitedSearches = searches.slice(0, 10);
    this.setItem('recent_searches', limitedSearches);
  }

  getRecentSearches(): string[] {
    return this.getItem<string[]>('recent_searches') || [];
  }

  addRecentSearch(search: string): void {
    const searches = this.getRecentSearches();
    // Remove if already exists
    const filtered = searches.filter(s => s !== search);
    // Add to beginning
    filtered.unshift(search);
    this.saveRecentSearches(filtered);
  }

  // Cache management
  clearCache(): void {
    try {
      // Remove only cache items (with TTL)
      const cacheKeys = ['portfolio_data'];
      cacheKeys.forEach(key => this.removeItem(key));
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  clearAllData(): void {
    try {
      // Clear all DEX-related data
      const keys = Object.keys(localStorage).filter(key =>
        key.startsWith(this.prefix)
      );

      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('Failed to clear all data:', error);
    }
  }

  // Export/Import data
  exportData(): string {
    try {
      const data = {
        tradeHistory: this.getTradeHistory(),
        userPreferences: this.getUserPreferences(),
        favoritePairs: this.getFavoritePairs(),
        recentSearches: this.getRecentSearches(),
        exportTime: Date.now()
      };

      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      return '{}';
    }
  }

  importData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData);

      if (data.tradeHistory) this.saveTradeHistory(data.tradeHistory);
      if (data.userPreferences) this.saveUserPreferences(data.userPreferences);
      if (data.favoritePairs) this.saveFavoritePairs(data.favoritePairs);
      if (data.recentSearches) this.saveRecentSearches(data.recentSearches);

      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  // Get storage usage info
  getStorageInfo(): { used: number; available: number; usage: string } {
    try {
      let used = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          const value = localStorage.getItem(key);
          used += (key.length + (value?.length || 0)) * 2; // UTF-16 encoding
        }
      }

      const available = 5 * 1024 * 1024; // Assume 5MB limit
      const usagePercent = ((used / available) * 100).toFixed(1);

      return {
        used,
        available,
        usage: `${usagePercent}%`
      };
    } catch (error) {
      console.warn('Failed to get storage info:', error);
      return { used: 0, available: 0, usage: '0%' };
    }
  }
}

export const storageService = new StorageService();
export type { WalletConnection, TradeHistory, UserPreferences };