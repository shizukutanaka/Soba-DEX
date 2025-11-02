/**
 * User Fixtures for Testing
 * Provides reusable test data for user-related tests
 * @ai-generated Test fixture data
 */

const generateTestUser = (overrides = {}) => ({
  id: 'user-' + Math.random().toString(36).substr(2, 9),
  address: '0x' + '1'.repeat(40),
  nonce: Math.floor(Math.random() * 1000000),
  email: `test-${Math.random().toString(36).substr(2, 9)}@test.com`,
  displayName: 'Test User',
  avatar: 'https://example.com/avatar.jpg',
  bio: 'Test user bio',
  verified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLogin: null,
  ...overrides
});

const generateTestUsers = (count = 3, baseOverrides = {}) => {
  return Array.from({ length: count }, (_, i) =>
    generateTestUser({
      address: '0x' + (i + 1).toString().padStart(40, '0'),
      displayName: `Test User ${i + 1}`,
      email: `testuser${i + 1}@test.com`,
      ...baseOverrides
    })
  );
};

const testUserData = {
  // Minimal user (only required fields)
  minimal: {
    address: '0x' + '1'.repeat(40),
    nonce: 123456
  },

  // Complete user profile
  complete: {
    address: '0x' + '2'.repeat(40),
    nonce: 654321,
    email: 'complete@test.com',
    displayName: 'Complete User',
    avatar: 'https://example.com/avatar.jpg',
    bio: 'Complete user profile',
    verified: true
  },

  // User with activity
  withActivity: {
    address: '0x' + '3'.repeat(40),
    nonce: 999999,
    email: 'active@test.com',
    displayName: 'Active User',
    verified: true,
    lastLogin: new Date(Date.now() - 1000 * 60 * 5) // 5 minutes ago
  },

  // Unverified user
  unverified: {
    address: '0x' + '4'.repeat(40),
    nonce: 111111,
    email: 'unverified@test.com',
    displayName: 'Unverified User',
    verified: false
  }
};

const testUserIds = {
  alice: 'user-alice-' + Math.random().toString(36).substr(2, 5),
  bob: 'user-bob-' + Math.random().toString(36).substr(2, 5),
  charlie: 'user-charlie-' + Math.random().toString(36).substr(2, 5)
};

const testAddresses = {
  alice: '0x0000000000000000000000000000000000000001',
  bob: '0x0000000000000000000000000000000000000002',
  charlie: '0x0000000000000000000000000000000000000003',
  dave: '0x0000000000000000000000000000000000000004',
  eve: '0x0000000000000000000000000000000000000005'
};

module.exports = {
  generateTestUser,
  generateTestUsers,
  testUserData,
  testUserIds,
  testAddresses
};
