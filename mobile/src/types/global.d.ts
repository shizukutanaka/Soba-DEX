/**
 * Global Type Definitions for React Native 0.82.1 and React 18
 *
 * Enhanced type definitions for better development experience
 * - React 18 hooks and components
 * - React Native specific types
 * - Common utility types
 * - API response types
 *
 * @version 1.0.0
 */

// React 18 and React Native 0.82.1 types
declare global {
  // React 18 hooks types
  type React18Hooks = {
    useId: () => string;
    useDeferredValue: <T>(value: T) => T;
    useTransition: () => [boolean, (fn: () => void) => void];
    useSyncExternalStore: <T>(
      subscribe: (onStoreChange: () => void) => () => void,
      getSnapshot: () => T
    ) => T;
  };

  // React Native 0.82.1 enhanced types
  type ReactNative0821Types = {
    // Enhanced navigation types
    NavigationProp: any;
    RouteProp: any;

    // Enhanced component types
    ViewProps: import('react-native').ViewProps & {
      children?: React.ReactNode;
    };
    TextProps: import('react-native').TextProps & {
      children?: React.ReactNode;
    };

    // Enhanced style types
    ViewStyle: import('react-native').ViewStyle;
    TextStyle: import('react-native').TextStyle;
    ImageStyle: import('react-native').ImageStyle;
  };

  // Common utility types
  type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
  type Required<T, K extends keyof T> = T & Required<Pick<T, K>>;
  type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
  };

  // API response types
  type ApiResponse<T = any> = {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: string;
  };

  type PaginatedResponse<T = any> = {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };

  // Trading specific types
  type TokenSymbol = string;
  type TokenAddress = `0x${string}`;
  type ChainId = number;
  type TransactionHash = `0x${string}`;

  // Error types
  type ErrorType = 'network' | 'validation' | 'authentication' | 'authorization' | 'server' | 'unknown';

  // Theme types
  type ThemeMode = 'light' | 'dark' | 'auto';

  // Animation types
  type AnimationType = 'spring' | 'timing' | 'decay';

  // Platform types
  type PlatformType = 'ios' | 'android' | 'web';

  // Network types
  type NetworkType = 'wifi' | 'cellular' | 'bluetooth' | 'wimax' | 'vpn' | 'other' | 'none';

  // Permission types
  type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

  // Loading states
  type LoadingState = 'idle' | 'loading' | 'success' | 'error';

  // Sort and filter types
  type SortOrder = 'asc' | 'desc';
  type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'nin';

  // Component prop types
  type ComponentProps<T = any> = T extends React.ComponentType<infer P> ? P : never;

  // Event handler types
  type EventHandler<T = any> = (event: T) => void;
  type AsyncEventHandler<T = any> = (event: T) => Promise<void>;

  // Form types
  type FormData<T = any> = Record<string, T>;
  type FormErrors<T = any> = Partial<Record<keyof T, string>>;

  // Redux types
  type RootState = any; // Define based on your Redux store
  type AppDispatch = any; // Define based on your Redux store

  // Custom hook return types
  type UseApiReturn<T> = {
    data: T | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
  };

  type UseAsyncOperationReturn<T> = {
    execute: (...args: any[]) => Promise<T>;
    loading: boolean;
    error: string | null;
    data: T | null;
  };

  // Wallet and crypto types
  type WalletAddress = `0x${string}`;
  type PrivateKey = `0x${string}`;
  type Mnemonic = string;

  // Blockchain types
  type BlockNumber = number;
  type GasPrice = string;
  type GasLimit = string;

  // Chart and visualization types
  type ChartDataPoint = {
    x: number | string;
    y: number;
    label?: string;
  };

  type ChartDataset = {
    data: ChartDataPoint[];
    color?: string;
    label?: string;
  };

  // Notification types
  type NotificationPayload = {
    title: string;
    body: string;
    data?: Record<string, any>;
  };

  type NotificationPermission = 'default' | 'granted' | 'denied';

  // Biometric types
  type BiometricType = 'fingerprint' | 'facial' | 'iris';

  // Camera types
  type CameraType = 'front' | 'back';
  type FlashMode = 'off' | 'on' | 'auto' | 'torch';

  // Location types
  type LocationData = {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    heading?: number;
    speed?: number;
  };

  // File system types
  type FileData = {
    uri: string;
    type: string;
    fileName?: string;
    fileSize?: number;
  };

  // Deep linking types
  type DeepLinkData = {
    url: string;
    scheme?: string;
    host?: string;
    path?: string;
    queryParams?: Record<string, string>;
  };
}

// Export types for use in other files
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
};
