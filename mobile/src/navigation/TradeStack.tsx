/**
 * Trading Stack Navigator
 *
 * Stack navigation for trading-related screens:
 * - Dashboard (main trading view)
 * - Swap interface
 * - Limit orders
 * - Trading history
 * - Price charts
 * - Order book
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import { DashboardScreen } from '../screens/DashboardScreen';
import { SwapScreen } from '../screens/SwapScreen';
import { LimitOrderScreen } from '../screens/LimitOrderScreen';
import { TradingHistoryScreen } from '../screens/TradingHistoryScreen';
import { ChartScreen } from '../screens/ChartScreen';
import { OrderBookScreen } from '../screens/OrderBookScreen';
import { ARTradingScreen } from '../screens/ARTradingScreen';
import { QuantumTradingDashboardScreen } from '../screens/QuantumTradingDashboardScreen';

// Types
import { TradeStackParamList } from '../types/navigation';

const Stack = createStackNavigator<TradeStackParamList>();

export const TradeStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1a1a',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 18,
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Trading Dashboard',
          headerRight: () => (
            // Add header actions like notifications, settings
            null
          ),
        }}
      />
      <Stack.Screen
        name="Swap"
        component={SwapScreen}
        options={{
          title: 'Swap Tokens',
          presentation: 'modal',
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="LimitOrder"
        component={LimitOrderScreen}
        options={{
          title: 'Limit Order',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="TradingHistory"
        component={TradingHistoryScreen}
        options={{
          title: 'Trading History',
        }}
      />
      <Stack.Screen
        name="Chart"
        component={ChartScreen}
        options={{
          title: 'Price Chart',
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen
        name="OrderBook"
        component={OrderBookScreen}
        options={{
          title: 'Order Book',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="ARTrading"
        component={ARTradingScreen}
        options={{
          title: 'AR Trading',
          presentation: 'fullScreenModal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="QuantumTrading"
        component={QuantumTradingDashboardScreen}
        options={{
          title: 'Quantum Trading',
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};
