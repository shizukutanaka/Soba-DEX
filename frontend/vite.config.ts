/**
 * Vite Configuration for DEX Frontend
 *
 * Optimized for minimal bundle size and maximum performance
 * - Advanced code splitting and tree shaking
 * - Asset optimization and compression
 * - Dependency optimization and deduplication
 * - Performance monitoring and analysis
 *
 * @version 1.0.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Additional imports for optimization
import { visualizer } from 'rollup-plugin-visualizer';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Enable React Fast Refresh
      fastRefresh: true,
      // JSX runtime for React 18
      jsxRuntime: 'automatic'
    }),

    // Bundle analyzer for development
    mode === 'development' && visualizer({
      filename: 'dist/report.html',
      open: false,
      gzipSize: true,
      brotliSize: true
    }),

    // HTML optimization
    createHtmlPlugin({
      minify: true,
      inject: {
        data: {
          title: 'DEX Platform',
          description: 'Decentralized Exchange Platform'
        }
      }
    })
  ].filter(Boolean),

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/constants': path.resolve(__dirname, './src/constants'),
      '@/assets': path.resolve(__dirname, './src/assets'),
      '@/styles': path.resolve(__dirname, './src/styles')
    }
  },

  // Build configuration for optimal bundle size
  build: {
    // Enable source maps for production debugging
    sourcemap: process.env.NODE_ENV === 'development',

    // Output directory
    outDir: 'dist',

    // Asset file names
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // State management
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],

          // UI libraries
          'ui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],

          // Charts and visualization
          'charts-vendor': ['recharts', 'd3'],

          // Web3 and blockchain
          'web3-vendor': ['ethers', 'web3', '@web3-react/core'],

          // Utilities
          'utils-vendor': ['lodash', 'moment', 'axios'],

          // Large third-party libraries
          'heavy-vendor': ['@tensorflow/tfjs', 'onnxruntime-web']
        },

        // Asset naming for better caching
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') ?? [];
          const extType = info[info.length - 1];

          if (/\.(png|jpe?g|gif|svg|ico|webp)$/.test(assetInfo.name || '')) {
            return `assets/images/[name]-[hash][extname]`;
          }

          if (/\.(css)$/.test(assetInfo.name || '')) {
            return `assets/styles/[name]-[hash][extname]`;
          }

          if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name || '')) {
            return `assets/fonts/[name]-[hash][extname]`;
          }

          return `assets/[name]-[hash][extname]`;
        },

        // Chunk naming for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    },

    // Bundle size optimization
    target: 'esnext',
    minify: 'esbuild',

    // Enable tree shaking
    modulePreload: {
      polyfill: false
    },

    // CSS code splitting
    cssCodeSplit: true,

    // Asset optimization
    assetsInlineLimit: 4096, // 4KB - inline small assets

    // Compression
    reportCompressedSize: true,

    // Performance optimization
    terserOptions: {
      compress: {
        // Remove console.log in production
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true
      }
    },

    // Asset processing
    assetsDir: 'assets',
    emptyOutDir: true,

    // Chunk size warning limit
    chunkSizeWarningLimit: 1000 // 1MB
  },

  // Development server configuration
  server: {
    port: 3000,
    host: true,
    open: false,

    // Proxy configuration for API calls
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: true,
        ws: true
      }
    },

    // Performance optimizations
    hmr: {
      overlay: true
    },

    // Watch options for better performance
    watch: {
      usePolling: false,
      interval: 100
    }
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@reduxjs/toolkit',
      'react-redux',
      'axios',
      'lodash'
    ],

    // Exclude problematic dependencies from pre-bundling
    exclude: [
      '@tensorflow/tfjs',
      'onnxruntime-web'
    ]
  },

  // Environment variables
  envPrefix: ['VITE_', 'NODE_'],

  // Preview server (for production testing)
  preview: {
    port: 4173,
    host: true
  },

  // Performance monitoring
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  }
}));

  // Path resolution
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@/constants': path.resolve(__dirname, './src/constants'),
      '@/assets': path.resolve(__dirname, './src/assets'),
      '@/styles': path.resolve(__dirname, './src/styles')
    }
  },

  // Build configuration for optimal bundle size
  build: {
    // Enable source maps for production debugging
    sourcemap: process.env.NODE_ENV === 'development',

    // Output directory
    outDir: 'dist',

    // Asset file names
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // State management
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],

          // UI libraries
          'ui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],

          // Charts and visualization
          'charts-vendor': ['recharts', 'd3'],

          // Web3 and blockchain
          'web3-vendor': ['ethers', 'web3', '@web3-react/core'],

          // Utilities
          'utils-vendor': ['lodash', 'moment', 'axios'],

          // Large third-party libraries
          'heavy-vendor': ['@tensorflow/tfjs', 'onnxruntime-web']
        },

        // Asset naming for better caching
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') ?? [];
          const extType = info[info.length - 1];

          if (/\.(png|jpe?g|gif|svg|ico|webp)$/.test(assetInfo.name || '')) {
            return `assets/images/[name]-[hash][extname]`;
          }

          if (/\.(css)$/.test(assetInfo.name || '')) {
            return `assets/styles/[name]-[hash][extname]`;
          }

          if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name || '')) {
            return `assets/fonts/[name]-[hash][extname]`;
          }

          return `assets/[name]-[hash][extname]`;
        },

        // Chunk naming for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    },

    // Bundle size optimization
    target: 'esnext',
    minify: 'esbuild',

    // Enable tree shaking
    modulePreload: {
      polyfill: false
    },

    // CSS code splitting
    cssCodeSplit: true,

    // Asset optimization
    assetsInlineLimit: 4096, // 4KB - inline small assets

    // Compression
    reportCompressedSize: true,

    // Performance optimization
    terserOptions: {
      compress: {
        // Remove console.log in production
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true
      }
    }
  },

  // Development server configuration
  server: {
    port: 3000,
    host: true,
    open: false,

    // Proxy configuration for API calls
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: true,
        ws: true
      }
    },

    // Performance optimizations
    hmr: {
      overlay: true
    },

    // Watch options for better performance
    watch: {
      usePolling: false,
      interval: 100
    }
  },

  // Dependency optimization
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@reduxjs/toolkit',
      'react-redux',
      'axios',
      'lodash'
    ],

    // Exclude problematic dependencies from pre-bundling
    exclude: [
      '@tensorflow/tfjs',
      'onnxruntime-web'
    ]
  },

  // Environment variables
  envPrefix: ['VITE_', 'NODE_'],

  // Preview server (for production testing)
  preview: {
    port: 4173,
    host: true
  },

  // Performance monitoring
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  }
});
