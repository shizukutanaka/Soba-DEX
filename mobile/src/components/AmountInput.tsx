/**
 * Amount Input Component
 *
 * Reusable amount input display component
 * Extracted from ARTradingScreen for better modularity
 *
 * @version 1.0.0
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface AmountInputProps {
  label: string;
  value: string;
  style?: any;
}

export const AmountInput: React.FC<AmountInputProps> = ({
  label,
  value,
  style
}) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  value: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default AmountInput;
