/**
 * Common Types
 *
 * Shared type definitions used across multiple modules
 * Centralized for consistency and reusability
 *
 * @version 1.0.0
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

export interface LoadingState {
  loading: boolean;
  error: string | null;
}

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  icon?: string;
}

export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  order: SortOrder;
}

export interface FilterConfig {
  key: string;
  value: any;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
}

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  dark: boolean;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export interface ToastProps {
  message: string;
  type?: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  type: DeviceType;
  os: 'ios' | 'android' | 'web';
  version: string;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface NetworkInfo {
  type: 'wifi' | 'cellular' | 'bluetooth' | 'wimax' | 'vpn' | 'other' | 'none';
  isConnected: boolean;
  isInternetReachable: boolean;
  strength?: number;
  carrier?: string;
}

export interface LocationInfo {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

export interface PermissionStatus {
  granted: boolean;
  status: 'granted' | 'denied' | 'blocked' | 'unavailable';
  canAskAgain: boolean;
}

export interface Permissions {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  location: PermissionStatus;
  notifications: PermissionStatus;
  contacts: PermissionStatus;
  storage: PermissionStatus;
  biometric: PermissionStatus;
}

export interface AppState {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  network: NetworkInfo;
  device: DeviceInfo;
  permissions: Permissions;
  theme: Theme;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
