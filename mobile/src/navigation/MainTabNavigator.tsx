/**
 * Main Tab Navigator
 *
 * Bottom tab navigation for the main app features:
 * - Trading (Dashboard)
 * - Portfolio
 * - Markets
 * - Social
 * - Settings
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

// Navigation Stacks
import { TradeStack } from './TradeStack';
import { PortfolioStack } from './PortfolioStack';
import { MarketsStack } from './MarketsStack';
import { SocialStack } from './SocialStack';
import { SettingsStack } from './SettingsStack';
import { GamificationStack } from './GamificationStack';

// Styles
import { TabBarStyles } from '../styles/TabBarStyles';
import { GlobalStyles } from '../styles/GlobalStyles';

const Tab = createBottomTabNavigator();

export const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Trading':
              iconName = focused ? 'trending-up' : 'trending-up-outline';
              break;
            case 'Portfolio':
              iconName = focused ? 'pie-chart' : 'pie-chart-outline';
              break;
            case 'Markets':
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
              break;
            case 'Gamification':
              iconName = focused ? 'trophy' : 'trophy-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'circle';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: GlobalStyles.colors.primary,
        tabBarInactiveTintColor: GlobalStyles.colors.textSecondary,
        tabBarStyle: TabBarStyles.container,
        tabBarLabelStyle: TabBarStyles.label,
        headerShown: false,
        tabBarBackground: () => (
          <View style={TabBarStyles.background} />
        ),
      })}
    >
      <Tab.Screen
        name="Trading"
        component={TradeStack}
        options={{
          tabBarLabel: 'Trade',
          tabBarBadge: undefined, // Can add notification badge here
        }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioStack}
        options={{
          tabBarLabel: 'Portfolio',
        }}
      />
      <Tab.Screen
        name="Markets"
        component={MarketsStack}
        options={{
          tabBarLabel: 'Markets',
        }}
      />
      <Tab.Screen
        name="Gamification"
        component={GamificationStack}
        options={{
          tabBarLabel: 'Rewards',
          tabBarBadge: 3, // Example: show notification badge for new achievements
        }}
      />
      <Tab.Screen
        name="Social"
        component={SocialStack}
        options={{
          tabBarLabel: 'Social',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
};
