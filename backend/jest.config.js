module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/archive/**',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/config/swagger.js'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '**/?(*.)+(spec|test).js'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  coverageReporters: ['text', 'lcov', 'html', 'json-summary']
};
