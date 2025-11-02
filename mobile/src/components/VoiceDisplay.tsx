/**
 * Voice Display Component - DISABLED
 *
 * This component has been disabled due to:
 * 1. VoiceCommandService being disabled for security reasons
 * 2. Unnecessary complexity for a DEX mobile app
 * 3. Potential privacy concerns with voice data
 *
 * If voice commands are needed in the future, implement a simpler,
 * more secure version with proper validation and user confirmation.
 *
 * @deprecated This component is disabled and should be removed
 * @version 1.0.0
 */

import React from 'react';
import { View, Text } from 'react-native';

export const VoiceDisplay: React.FC<any> = () => {
  return (
    <View style={{ padding: 10, backgroundColor: '#f0f0f0', borderRadius: 5 }}>
      <Text style={{ textAlign: 'center', color: '#666' }}>
        Voice Display - Feature Disabled
      </Text>
    </View>
  );
};

export default VoiceDisplay;
