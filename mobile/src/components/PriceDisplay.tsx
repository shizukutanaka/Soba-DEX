/**
 * Price Display Component
 *
 * Reusable price display component with change indicators
 * Extracted from ARTradingScreen for better modularity
 *
 * @version 1.0.0
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PriceDisplayProps {
  symbol: string;
  price: number;
  change: number;
  style?: any;
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  symbol,
  price,
  change,
  style
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.priceText}>
        {symbol}: ${price.toFixed(2)}
      </Text>
      <Text style={[
        styles.changeText,
        { color: change >= 0 ? '#00ff00' : '#ff0000' }
      ]}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  priceText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  changeText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
});

export default PriceDisplay;
