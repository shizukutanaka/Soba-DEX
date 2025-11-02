/**
 * AR Trading Screen - DISABLED
 *
 * This screen has been disabled due to:
 * 1. Overly complex AR implementation
 * 2. Missing dependencies (react-native-camera, react-native-voice)
 * 3. Unnecessary complexity for a DEX mobile app
 * 4. Potential privacy concerns with camera access
 * 5. Performance impact on mobile devices
 *
 * If AR trading is needed in the future, implement a simpler,
 * more practical version using basic camera features.
 *
 * @deprecated This screen is disabled and should be removed
 * @version 6.0.0
 */

import React from 'react';
import { View, Text } from 'react-native';

export const ARTradingScreen: React.FC<any> = ({ navigation }) => {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      <Text style={{ color: '#fff', fontSize: 18, marginBottom: 20 }}>
        AR Trading - Feature Disabled
      </Text>
      <Text style={{ color: '#ccc', fontSize: 14, textAlign: 'center' }}>
        This feature is not available in the current version
      </Text>
    </View>
  );
};

export default ARTradingScreen;
