/**
 * QR Scan Button Component
 *
 * Reusable QR code scanning button
 * Extracted from ARTradingScreen for better modularity
 *
 * @version 1.0.0
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface QRScanButtonProps {
  onPress: () => void;
  style?: any;
}

export const QRScanButton: React.FC<QRScanButtonProps> = ({
  onPress,
  style
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>📱 Scan QR</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 50,
    right: 20,
    padding: 15,
    borderRadius: 25,
    backgroundColor: '#444',
    zIndex: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default QRScanButton;
