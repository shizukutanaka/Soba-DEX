/**
 * Level Screen - DISABLED
 *
 * This screen has been disabled due to:
 * 1. Overly complex gamification system (500+ lines)
 * 2. Unnecessary gaming elements for a DEX mobile app
 * 3. Missing dependencies (expo-linear-gradient, @expo/vector-icons)
 * 4. Focus should be on trading functionality, not levels
 * 5. Potential distraction from core trading features
 *
 * @deprecated This screen is disabled and should be removed
 * @version 6.0.0
 */

import React from 'react';
import { View, Text } from 'react-native';

export const LevelScreen: React.FC<any> = ({ navigation }) => {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 18, marginBottom: 20 }}>
        Level System - Feature Disabled
      </Text>
      <Text style={{ color: '#ccc', fontSize: 14, textAlign: 'center' }}>
        This feature is not available in the current version
      </Text>
    </View>
  );
};

export default LevelScreen;
