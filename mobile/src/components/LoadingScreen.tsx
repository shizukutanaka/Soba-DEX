/**
 * Loading Screen Component
 *
 * Reusable loading screen with:
 * - Activity indicator
 * - Loading text
 * - Error state
 * - Retry functionality
 * - Customizable styling
 */

import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Styles
import { GlobalStyles } from '../styles/GlobalStyles';

const { width, height } = Dimensions.get('window');

interface LoadingScreenProps {
  title?: string;
  message?: string;
  error?: string | Error | null;
  onRetry?: () => void;
  showProgress?: boolean;
  progress?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  title = 'Loading...',
  message = 'Please wait',
  error = null,
  onRetry,
  showProgress = false,
  progress = 0,
}) => {
  const isError = error !== null && error !== undefined;

  return (
    <LinearGradient
      colors={GlobalStyles.colors.gradient}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo/Brand */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>DEX</Text>
          <Text style={styles.logoSubtext}>Mobile</Text>
        </View>

        {/* Loading State */}
        {!isError && (
          <>
            <ActivityIndicator
              size="large"
              color={GlobalStyles.colors.primary}
              style={styles.loader}
            />

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            {showProgress && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(Math.max(progress, 0), 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>{Math.round(progress)}%</Text>
              </View>
            )}
          </>
        )}

        {/* Error State */}
        {isError && (
          <>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>⚠️</Text>
            </View>

            <Text style={styles.title}>Oops!</Text>
            <Text style={styles.errorMessage}>
              {typeof error === 'string' ? error : error?.message || 'Something went wrong'}
            </Text>

            {onRetry && (
              <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isError ? 'Please check your connection and try again' : 'Initializing...'}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width,
    height,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: GlobalStyles.colors.primary,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoSubtext: {
    fontSize: 16,
    color: GlobalStyles.colors.textSecondary,
    marginTop: 4,
  },
  loader: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: GlobalStyles.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: GlobalStyles.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorIcon: {
    marginBottom: 24,
  },
  errorIconText: {
    fontSize: 48,
  },
  errorMessage: {
    fontSize: 16,
    color: GlobalStyles.colors.error,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  retryButton: {
    backgroundColor: GlobalStyles.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 3,
    shadowColor: GlobalStyles.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  retryButtonText: {
    color: GlobalStyles.colors.background,
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    width: '80%',
    marginBottom: 24,
  },
  progressBar: {
    height: 4,
    backgroundColor: GlobalStyles.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: GlobalStyles.colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: GlobalStyles.colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: GlobalStyles.colors.textSecondary,
    textAlign: 'center',
  },
});
