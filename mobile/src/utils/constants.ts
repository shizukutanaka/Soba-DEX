/**
 * Constants
 *
 * Application-wide constants for consistency
 * Centralized to avoid magic numbers and strings
 *
 * @version 1.0.0
 */

// Trading Constants
export const TRADING = {
  MIN_AMOUNT: 0.000001,
  MAX_SLIPPAGE: 50,
  DEFAULT_SLIPPAGE: 0.5,
  MAX_DEADLINE_MINUTES: 60,
  MIN_DEADLINE_MINUTES: 5,
  DECIMAL_PRECISION: 8,
} as const;

// Network Constants
export const NETWORK = {
  CHAINS: {
    ETHEREUM: 1,
    BSC: 56,
    POLYGON: 137,
    ARBITRUM: 42161,
    OPTIMISM: 10,
  },
  DEFAULT_CHAIN: 1,
  RPC_TIMEOUT: 10000,
  BLOCK_TIME: 12000, // 12 seconds
} as const;

// UI Constants
export const UI = {
  BUTTON_HEIGHT: 44,
  INPUT_HEIGHT: 44,
  BORDER_RADIUS: 10,
  PADDING: 16,
  MARGIN: 8,
  ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
} as const;

// Camera Constants
export const CAMERA = {
  QUALITY: 0.5,
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1080,
  VIDEO_QUALITY: 'medium',
  FLASH_MODE: 'off',
} as const;

// Voice Constants
export const VOICE = {
  LANGUAGE: 'en-US',
  MAX_DURATION: 10000, // 10 seconds
  SILENCE_TIMEOUT: 3000, // 3 seconds
  RECOGNITION_TIMEOUT: 5000, // 5 seconds
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences',
  WALLET_ADDRESS: 'wallet_address',
  SELECTED_TOKEN: 'selected_token',
  THEME: 'theme',
  LANGUAGE: 'language',
  NOTIFICATIONS: 'notifications',
} as const;

// API Constants
export const API = {
  BASE_URL: __DEV__ ? 'http://localhost:3001' : 'https://api.yourdomain.com',
  TIMEOUT: 15000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

// Error Messages
export const ERRORS = {
  NETWORK_ERROR: 'Network connection failed',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  INVALID_ADDRESS: 'Invalid wallet address',
  TRANSACTION_FAILED: 'Transaction failed',
  PERMISSION_DENIED: 'Permission denied',
  CAMERA_UNAVAILABLE: 'Camera unavailable',
  VOICE_NOT_SUPPORTED: 'Voice recognition not supported',
  QR_SCAN_FAILED: 'QR code scan failed',
  AMOUNT_TOO_LOW: 'Amount too low',
  AMOUNT_TOO_HIGH: 'Amount too high',
  SLIPPAGE_TOO_HIGH: 'Slippage tolerance too high',
  DEADLINE_EXPIRED: 'Transaction deadline expired',
} as const;

// Success Messages
export const SUCCESS = {
  TRANSACTION_SENT: 'Transaction sent successfully',
  WALLET_CONNECTED: 'Wallet connected',
  SETTINGS_SAVED: 'Settings saved',
  QR_SCANNED: 'QR code scanned successfully',
  VOICE_COMMAND: 'Voice command recognized',
} as const;

// Colors
export const COLORS = {
  PRIMARY: '#007AFF',
  SUCCESS: '#00ff00',
  DANGER: '#ff0000',
  WARNING: '#ffaa00',
  INFO: '#007AFF',
  BACKGROUND: '#000000',
  SURFACE: 'rgba(0,0,0,0.8)',
  TEXT: '#ffffff',
  TEXT_SECONDARY: '#cccccc',
  BORDER: '#333333',
  DISABLED: '#666666',
} as const;

// Animation Constants
export const ANIMATION = {
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_OUT: 'ease-in-out',
  BOUNCE: 'bounce',
  SPRING: {
    tension: 300,
    friction: 10,
    mass: 1,
  },
} as const;
