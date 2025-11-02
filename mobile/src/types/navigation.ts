/**
 * Navigation Type Definitions
 *
 * TypeScript definitions for React Navigation:
 * - Stack parameters
 * - Tab parameters
 * - Route props
 */

export type TradeStackParamList = {
  Dashboard: undefined;
  Swap: { tokenIn?: string; tokenOut?: string; amount?: string };
  LimitOrder: { symbol?: string };
  TradingHistory: undefined;
  Chart: { symbol: string; timeframe?: string };
  OrderBook: { symbol: string };
  ARTrading: { symbol?: string; mode?: 'voice' | 'qr' | 'ar' };
  QuantumTrading: { userId?: string; portfolio?: string };
};

export type PortfolioStackParamList = {
  PortfolioOverview: undefined;
  AssetDetail: { symbol: string };
  TransactionDetail: { transactionId: string };
  AddAsset: undefined;
  Withdraw: { asset: string };
  Deposit: { asset: string };
};

export type MarketsStackParamList = {
  MarketsOverview: undefined;
  TokenDetail: { symbol: string };
  MarketNews: undefined;
  MarketAnalysis: undefined;
  PriceAlerts: undefined;
};

export type SocialStackParamList = {
  SocialFeed: undefined;
  UserProfile: { userId: string };
  Chat: { chatId: string };
  GroupChat: { groupId: string };
  NewsArticle: { articleId: string };
};

export type SettingsStackParamList = {
  SettingsOverview: undefined;
  Profile: undefined;
  Security: undefined;
  Notifications: undefined;
  Privacy: undefined;
  Help: undefined;
  About: undefined;
  Language: undefined;
  Currency: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyEmail: { email: string };
  BiometricSetup: undefined;
  SecurityQuestions: undefined;
  TwoFactorSetup: undefined;
};

export type RootTabParamList = {
  Trading: undefined;
  Portfolio: undefined;
  Markets: undefined;
  Social: undefined;
  Settings: undefined;
};
