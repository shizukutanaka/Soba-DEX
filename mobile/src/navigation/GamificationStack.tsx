/**
 * Gamification Stack Navigator
 *
 * Stack navigation for gamification features:
 * - Badge collection and achievements
 * - Level progression and benefits
 * - Leaderboards and competitions
 * - Daily challenges and rewards
 *
 * @version 6.0.0
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { BadgeScreen } from '../screens/BadgeScreen';
import { LevelScreen } from '../screens/LevelScreen';

const Stack = createStackNavigator();

export const GamificationStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1F2937',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="BadgeCollection"
        component={BadgeScreen}
        options={{
          title: 'Badges & Achievements',
          headerRight: () => (
            <TouchableOpacity style={{ marginRight: 15 }}>
              <Icon name="trophy" size={24} color="#F59E0B" />
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="LevelProgression"
        component={LevelScreen}
        options={{
          title: 'Level Progression',
        }}
      />
    </Stack.Navigator>
  );
};
