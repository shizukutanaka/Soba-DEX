module.exports = {
  env: {
    es2021: true,
    jest: true,
  },
  rules: {
    // Performance optimizations
    'prefer-const': 'warn',
    'no-var': 'error',
    'prefer-arrow-callback': 'warn',
    'prefer-template': 'warn',
    'object-shorthand': 'warn',
    'prefer-destructuring': 'warn',

    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',

    // Code quality
    'no-console': 'warn',
    'no-debugger': 'warn',
    'no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
};
