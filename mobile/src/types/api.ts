/**
 * API Type Definitions
 *
 * TypeScript definitions for API responses and requests:
 * - Generic API response structure
 * - Error types
 * - Request/response interfaces
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
  timestamp: string;
  requestId?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  message: string;
  code: string;
  statusCode?: number;
  details?: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface FilterParams {
  [key: string]: any;
}

// User types
export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  verified: boolean;
  kycStatus: 'none' | 'pending' | 'approved' | 'rejected';
  createdAt: string;
  lastLogin?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  currency: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  priceAlerts: boolean;
  marketing: boolean;
  security: boolean;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private';
  showPortfolio: boolean;
  allowMessages: boolean;
  dataSharing: boolean;
}

// Trading types
export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap?: number;
  liquidity?: number;
}

export interface SwapQuote {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOut: string;
  price: number;
  priceImpact: number;
  slippage: number;
  fee: string;
  route: string[];
  estimatedGas: string;
}

export interface Transaction {
  id: string;
  type: 'swap' | 'transfer' | 'deposit' | 'withdraw';
  status: 'pending' | 'confirmed' | 'failed';
  from: string;
  to: string;
  amount: string;
  token: Token;
  fee: string;
  gasUsed?: string;
  gasPrice?: string;
  blockNumber?: number;
  timestamp: string;
  hash: string;
}

// Portfolio types
export interface Portfolio {
  totalValue: number;
  change24h: number;
  changePercent24h: number;
  assets: PortfolioAsset[];
  performance: PerformanceData;
}

export interface PortfolioAsset {
  token: Token;
  balance: string;
  value: number;
  change24h: number;
  changePercent24h: number;
  allocation: number;
  avgCost?: number;
}

export interface PerformanceData {
  totalReturn: number;
  totalReturnPercent: number;
  dailyReturn: number;
  dailyReturnPercent: number;
  weeklyReturn: number;
  weeklyReturnPercent: number;
  monthlyReturn: number;
  monthlyReturnPercent: number;
  yearlyReturn: number;
  yearlyReturnPercent: number;
}

// Market types
export interface MarketData {
  fearGreedIndex: number;
  dominance: {
    btc: number;
    eth: number;
  };
  volume24h: number;
  marketCap: number;
  change24h: number;
  changePercent24h: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  type: 'above' | 'below';
  price: number;
  message?: string;
  active: boolean;
  createdAt: string;
  triggeredAt?: string;
}

// Security types
export interface SecuritySettings {
  twoFactorEnabled: boolean;
  biometricEnabled: boolean;
  sessionTimeout: number;
  allowedIPs: string[];
  deviceLimit: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser?: string;
  trusted: boolean;
  lastSeen: string;
  location?: string;
}

// Chart types
export interface ChartData {
  symbol: string;
  timeframe: string;
  data: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  indicators?: {
    [key: string]: Array<{
      timestamp: number;
      value: number;
    }>;
  };
}

// Social types
export interface SocialPost {
  id: string;
  userId: string;
  user: {
    username: string;
    avatar?: string;
  };
  content: string;
  type: 'text' | 'image' | 'chart' | 'trade';
  likes: number;
  comments: number;
  shares: number;
  createdAt: string;
  tags: string[];
}

export interface ChatMessage {
  id: string;
  chatId: string;
  userId: string;
  user: {
    username: string;
    avatar?: string;
  };
  content: string;
  type: 'text' | 'image' | 'file';
  timestamp: string;
  read: boolean;
}

// Settings types
export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  currency: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  trading: TradingSettings;
  security: SecuritySettings;
}

export interface TradingSettings {
  defaultSlippage: number;
  gasPrice: 'slow' | 'standard' | 'fast';
  autoSlippage: boolean;
  confirmations: number;
  defaultAmount: string;
  favoritePairs: string[];
  riskTolerance: 'low' | 'medium' | 'high';
}

export interface NotificationSettings {
  priceAlerts: boolean;
  tradeConfirmations: boolean;
  securityAlerts: boolean;
  marketingEmails: boolean;
  pushNotifications: boolean;
  soundEnabled: boolean;
}

export interface PrivacySettings {
  showPortfolio: boolean;
  allowScreenshots: boolean;
  analyticsEnabled: boolean;
  dataSharing: boolean;
  profileVisibility: 'public' | 'friends' | 'private';
}
