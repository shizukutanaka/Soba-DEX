/**
 * Execute Button Component
 *
 * Reusable execute trading button component
 * Extracted from ARTradingScreen for better modularity
 *
 * @version 1.0.0
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ExecuteButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
}

export const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  title,
  onPress,
  disabled = false,
  style
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { opacity: disabled ? 0.5 : 1 },
        style
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ExecuteButton;
