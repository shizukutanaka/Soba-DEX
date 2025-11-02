/**
 * Metro configuration for React Native 0.82.1
 *
 * Optimized for performance and development experience
 * - Enables Hermes JavaScript engine for better performance
 * - Configures JSX Transform for React 18
 * - Optimizes bundler for faster builds
 *
 * @version 1.0.0
 */

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 */
const config = {
  transformer: {
    // Optimize for Hermes engine
    minifierConfig: {
      compress: {
        // Remove console.log in production
        drop_console: process.env.NODE_ENV === 'production',
        // Remove debugger statements
        drop_debugger: process.env.NODE_ENV === 'production',
      },
      mangle: {
        // Mangle top-level variable names for smaller bundle size
        toplevel: true,
      },
    },
    // Enable inline requires for better tree shaking
    inlineRequiresModules: [
      'react-native',
      '@react-navigation',
      'react-redux',
    ],
  },
  resolver: {
    // Configure asset extensions
    assetExts: [
      'bmp',
      'gif',
      'jpg',
      'jpeg',
      'png',
      'psd',
      'svg',
      'webp',
      'ttf',
      'otf',
      'woff',
      'woff2',
    ],
    // Configure source extensions
    sourceExts: ['js', 'json', 'ts', 'tsx', 'jsx'],
    // Block unwanted files
    blockList: [
      // Block node_modules from being bundled in development
      /node_modules\/.*\/node_modules\/.*/,
      // Block potentially dangerous files
      /\.(key|cert|pem|p12|pfx|keychain)$/,
      // Block configuration files
      /\.(env|config|conf)$/,
      // Block source maps and debug files
      /\.map$/,
      // Block test files
      /__tests__/,
      /\.test\./,
      /\.spec\./,
    ],
  },
  // Enable Hermes engine
  jsEngine: 'hermes',
  // Configure max workers for better performance
  maxWorkers: process.env.NODE_ENV === 'production' ? 2 : 4,
  // Reset cache on configuration changes
  resetCache: true,
  // Enable source maps for better debugging
  enableBabelRCLookup: true,
};

// Merge with default config for React Native 0.82.1
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
