/**
 * Types Index
 *
 * Centralized exports for all type definitions
 * This improves modularity and makes imports cleaner
 *
 * @version 1.0.0
 */

// API Types
export * from './api';

// Navigation Types
export * from './navigation';

// Trading Types
export * from './trading';

// Global types
export * from './global';

// Component types
export * from './components';

// User Types
export * from './user';

// Common Types
export * from './common';

// Re-export commonly used types for convenience
export type {
  BaseComponentProps,
  EnhancedViewProps,
  EnhancedTextProps,
  EnhancedTouchableProps,
  ButtonProps,
  CardProps,
  ModalProps,
  LoadingProps,
  ErrorBoundaryProps,
  ToastProps,
  FormFieldProps,
  NavigationProps,
  ChartProps,
  QRCodeProps,
  CameraProps,
  MapProps,
  WebViewProps,
  AnimationProps,
  ThemeProps,
  LayoutProps,
} from './components';

export type {
  React18Hooks,
  ReactNative0821Types,
  Optional,
  Required,
  DeepPartial,
  ApiResponse,
  PaginatedResponse,
  TokenSymbol,
  TokenAddress,
  ChainId,
  TransactionHash,
  ErrorType,
  ThemeMode,
  AnimationType,
  PlatformType,
  NetworkType,
  PermissionStatus,
  LoadingState,
  SortOrder,
  FilterOperator,
  ComponentProps,
  EventHandler,
  AsyncEventHandler,
  FormData,
  FormErrors,
  RootState,
  AppDispatch,
  UseApiReturn,
  UseAsyncOperationReturn,
  WalletAddress,
  PrivateKey,
  Mnemonic,
  BlockNumber,
  GasPrice,
  GasLimit,
  ChartDataPoint,
  ChartDataset,
  NotificationPayload,
  NotificationPermission,
  BiometricType,
  CameraType,
  FlashMode,
  LocationData,
  FileData,
  DeepLinkData,
} from './global';

// Re-export commonly used types for convenience
export type {
  ApiResponse,
  PaginatedResponse,
  ErrorResponse,
  LoadingState,
  SelectOption,
  SortConfig,
  FilterConfig,
  Theme,
  Notification,
  ModalProps,
  ToastProps,
  DeviceInfo,
  NetworkInfo,
  PermissionStatus,
  Permissions,
  AppState,
} from './common';

export type {
  Token,
  TradingPair,
  SwapParams,
  LiquidityParams,
  Trade,
  PortfolioPosition,
  PriceAlert,
  GasEstimate,
  TransactionStatus,
  Order,
} from './trading';

export type {
  User,
  Wallet,
  UserPreferences,
  NotificationSettings,
  TradingSettings,
  PrivacySettings,
  UserStats,
  Achievement,
  Badge,
} from './user';
