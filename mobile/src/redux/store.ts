/**
 * Redux Store Configuration
 *
 * Centralized state management for the mobile app:
 * - User authentication and profile
 * - Trading state and preferences
 * - Portfolio data
 * - Market data
 * - App settings and theme
 * - Security settings
 * - Network status
 */

import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';

// Reducers
import userReducer from './slices/userSlice';
import tradingReducer from './slices/tradingSlice';
import portfolioReducer from './slices/portfolioSlice';
import marketReducer from './slices/marketSlice';
import settingsReducer from './slices/settingsSlice';
import securityReducer from './slices/securitySlice';
import networkReducer from './slices/networkSlice';

// Persist configuration
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['user', 'settings', 'security'], // Only persist these slices
  blacklist: ['trading', 'market', 'network'], // Don't persist these (too large or temporary)
};

// Combine reducers
const rootReducer = {
  user: persistReducer(
    {
      key: 'user',
      storage: AsyncStorage,
      whitelist: ['profile', 'preferences', 'biometrics'],
    },
    userReducer
  ),
  trading: tradingReducer,
  portfolio: persistReducer(
    {
      key: 'portfolio',
      storage: AsyncStorage,
      whitelist: ['watchlist', 'favorites'],
    },
    portfolioReducer
  ),
  market: marketReducer,
  settings: persistReducer(
    {
      key: 'settings',
      storage: AsyncStorage,
    },
    settingsReducer
  ),
  security: persistReducer(
    {
      key: 'security',
      storage: AsyncStorage,
    },
    securityReducer
  ),
  network: networkReducer,
};

// Configure store
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: __DEV__,
});

// Persist store
export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
