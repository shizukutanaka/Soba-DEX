/**
 * ESLint configuration for React Native 0.82.1 and React 18
 *
 * Optimized for modern React Native development
 * - Supports React 18's new JSX Transform
 * - Enforces React Native best practices
 * - Integrates with TypeScript for strict type checking
 * - Includes performance optimizations
 *
 * @version 1.0.0
 */

module.exports = {
  root: true,
  extends: [
    '@react-native',
    // React 18 support
    'plugin:react/jsx-runtime',
    // Additional React Native rules
    'plugin:react-native/all',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'react',
    'react-native',
    'react-hooks',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  env: {
    'react-native/react-native': true,
    es6: true,
    node: true,
    jest: true,
  },
  rules: {
    // React 18 and JSX Transform
    'react/react-in-jsx-scope': 'off',
    'react/jsx-uses-react': 'off',

    // TypeScript strict rules
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // React Native specific rules
    'react-native/no-unused-styles': 'error',
    'react-native/split-platform-components': 'error',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-color-literals': 'warn',
    'react-native/no-raw-text': ['error', {
      skip: ['CustomText', 'CustomButton'],
    }],

    // Security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // React Native security
    'react-native/no-single-element-style-arrays': 'error',

    // General code quality
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'prefer-const': 'error',
    'no-var': 'error',

    // Performance optimizations
    'react/jsx-no-bind': ['error', {
      allowArrowFunctions: true,
      allowFunctions: false,
      allowBind: false,
    }],
    'react/no-array-index-key': 'warn',

    // Import organization
    'sort-imports': ['error', {
      ignoreCase: true,
      ignoreDeclarationSort: true,
      ignoreMemberSort: false,
    }],

    // Accessibility
    'react-native/accessibility-label': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
      pragma: 'React',
      fragment: 'Fragment',
    },
  },
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'react-native/no-raw-text': 'off',
      },
    },
  ],
};
