/**
 * User Types
 *
 * Type definitions for user-related functionality
 * Centralized for consistency and reusability
 *
 * @version 1.0.0
 */

export interface User {
  id: string;
  address: string;
  username?: string;
  email?: string;
  avatar?: string;
  createdAt: Date;
  lastLoginAt?: Date;
  isVerified: boolean;
  level: number;
  experience: number;
}

export interface Wallet {
  address: string;
  balance: string;
  tokens: TokenBalance[];
  connected: boolean;
  chainId: number;
}

export interface TokenBalance {
  token: Token;
  balance: string;
  value: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: NotificationSettings;
  trading: TradingSettings;
  privacy: PrivacySettings;
}

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  priceAlerts: boolean;
  tradeConfirmations: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

export interface TradingSettings {
  defaultSlippage: number;
  defaultDeadline: number;
  gasPriceStrategy: 'slow' | 'standard' | 'fast';
  autoApprove: boolean;
  expertMode: boolean;
  showAdvanced: boolean;
}

export interface PrivacySettings {
  analyticsEnabled: boolean;
  marketingEnabled: boolean;
  profileVisible: boolean;
  tradingHistoryVisible: boolean;
}

export interface UserStats {
  totalTrades: number;
  totalVolume: string;
  profitLoss: number;
  profitLossPercentage: number;
  winRate: number;
  avgTradeSize: string;
  bestTrade: Trade;
  worstTrade: Trade;
  streak: {
    current: number;
    best: number;
  };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'trading' | 'social' | 'learning' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: Date;
  progress?: number;
  maxProgress?: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earnedAt?: Date;
}
