/**
 * Trading Button Component
 *
 * Reusable trading button component for buy/sell actions
 * Extracted from ARTradingScreen for better modularity
 *
 * @version 1.0.0
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface TradingButtonProps {
  title: string;
  onPress: () => void;
  variant: 'buy' | 'sell';
  disabled?: boolean;
  style?: any;
}

export const TradingButton: React.FC<TradingButtonProps> = ({
  title,
  onPress,
  variant,
  disabled = false,
  style
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[`${variant}Button`],
        disabled && styles.disabledButton,
        style
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[
        styles.buttonText,
        disabled && styles.disabledText
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  buyButton: {
    backgroundColor: '#00ff00',
  },
  sellButton: {
    backgroundColor: '#ff0000',
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledText: {
    color: '#999',
  },
});

export default TradingButton;
