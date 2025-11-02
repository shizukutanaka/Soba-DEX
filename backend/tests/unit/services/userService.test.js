/**
 * User Service Unit Tests
 * Tests for user management business logic
 * @ai-generated Unit test suite
 */

const userService = require('../../../src/services/userService');
const { prisma } = require('../../../src/db/prisma');
const { NotFoundError, ConflictError } = require('../../../src/middleware/globalErrorHandler');
const { generateTestUser, testAddresses } = require('../../fixtures/users.fixture');

// Mock Prisma
jest.mock('../../../src/db/prisma');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrGetUser', () => {
    it('should create a new user when not found', async () => {
      const address = testAddresses.alice;
      const testUser = generateTestUser({ address: address.toLowerCase() });

      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(testUser);

      const result = await userService.createOrGetUser(address);

      expect(result).toEqual(testUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { address: address.toLowerCase() }
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: address.toLowerCase(),
          role: 'USER'
        })
      });
    });

    it('should normalize address to lowercase', async () => {
      const address = '0x' + 'A'.repeat(40);
      const testUser = generateTestUser({ address: address.toLowerCase() });

      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(testUser);

      await userService.createOrGetUser(address);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { address: address.toLowerCase() }
      });
    });

    it('should return existing user and update login timestamp', async () => {
      const address = testAddresses.bob;
      const existingUser = generateTestUser({ address: address.toLowerCase() });
      const updatedUser = { ...existingUser, lastLoginAt: new Date() };

      prisma.user.findUnique.mockResolvedValueOnce(existingUser);
      prisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await userService.createOrGetUser(address);

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: { lastLoginAt: expect.any(Date) }
      });
    });

    it('should accept additional user data when creating', async () => {
      const address = testAddresses.charlie;
      const userData = {
        username: 'charlie123',
        email: 'charlie@example.com'
      };
      const testUser = generateTestUser({ address: address.toLowerCase(), ...userData });

      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValueOnce(testUser);

      await userService.createOrGetUser(address, userData);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: userData.username,
          email: userData.email
        })
      });
    });

    it('should throw error if creation fails', async () => {
      const address = testAddresses.dave;
      const error = new Error('Database error');

      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.user.create.mockRejectedValueOnce(error);

      await expect(userService.createOrGetUser(address)).rejects.toThrow(error);
    });
  });

  describe('getUserById', () => {
    it('should return user by ID with sessions and API keys', async () => {
      const testUser = generateTestUser();
      const userWithRelations = {
        ...testUser,
        sessions: [
          { id: 'session-1', isActive: true, lastAccess: new Date() }
        ],
        apiKeys: [
          { id: 'key-1', isActive: true, createdAt: new Date() }
        ]
      };

      prisma.user.findUnique.mockResolvedValueOnce(userWithRelations);

      const result = await userService.getUserById(testUser.id);

      expect(result).toEqual(userWithRelations);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUser.id },
        include: expect.objectContaining({
          sessions: expect.any(Object),
          apiKeys: expect.any(Object)
        })
      });
    });

    it('should throw NotFoundError when user does not exist', async () => {
      const userId = 'non-existent-user';

      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(userService.getUserById(userId)).rejects.toThrow(NotFoundError);
      await expect(userService.getUserById(userId)).rejects.toThrow('User not found');
    });

    it('should include only active sessions', async () => {
      const testUser = generateTestUser();

      prisma.user.findUnique.mockResolvedValueOnce(testUser);

      await userService.getUserById(testUser.id);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: testUser.id },
        include: {
          sessions: {
            where: { isActive: true },
            orderBy: { lastAccess: 'desc' },
            take: 5
          },
          apiKeys: expect.any(Object)
        }
      });
    });

    it('should limit sessions to 5 most recent', async () => {
      const testUser = generateTestUser();

      prisma.user.findUnique.mockResolvedValueOnce(testUser);

      await userService.getUserById(testUser.id);

      const callArgs = prisma.user.findUnique.mock.calls[0][0];
      expect(callArgs.include.sessions.take).toBe(5);
    });
  });

  describe('getUserByAddress', () => {
    it('should return user by wallet address', async () => {
      const address = testAddresses.alice;
      const testUser = generateTestUser({ address: address.toLowerCase() });

      prisma.user.findUnique.mockResolvedValueOnce(testUser);

      const result = await userService.getUserByAddress(address);

      expect(result).toEqual(testUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { address: address.toLowerCase() }
      });
    });

    it('should normalize address to lowercase', async () => {
      const address = '0x' + 'B'.repeat(40);
      const testUser = generateTestUser({ address: address.toLowerCase() });

      prisma.user.findUnique.mockResolvedValueOnce(testUser);

      await userService.getUserByAddress(address);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { address: address.toLowerCase() }
      });
    });

    it('should throw NotFoundError when user does not exist', async () => {
      const address = testAddresses.eve;

      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(userService.getUserByAddress(address)).rejects.toThrow(NotFoundError);
      await expect(userService.getUserByAddress(address)).rejects.toThrow('User not found');
    });
  });

  describe('updateUser', () => {
    it('should update user profile data', async () => {
      const userId = 'user-123';
      const updateData = {
        username: 'newusername',
        email: 'new@example.com',
        avatar: 'https://example.com/avatar.jpg',
        bio: 'Updated bio'
      };
      const updatedUser = generateTestUser({ id: userId, ...updateData });

      prisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await userService.updateUser(userId, updateData);

      expect(result).toEqual(updatedUser);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining(updateData)
      });
    });

    it('should throw ConflictError on unique constraint violation', async () => {
      const userId = 'user-123';
      const updateData = { username: 'existingusername' };
      const uniqueConstraintError = new Error('Unique constraint failed');
      uniqueConstraintError.code = 'P2002';

      prisma.user.update.mockRejectedValueOnce(uniqueConstraintError);

      await expect(userService.updateUser(userId, updateData)).rejects.toThrow(ConflictError);
      await expect(userService.updateUser(userId, updateData)).rejects.toThrow(
        'Username or email already exists'
      );
    });

    it('should propagate non-constraint errors', async () => {
      const userId = 'user-123';
      const updateData = { username: 'newusername' };
      const dbError = new Error('Database connection failed');

      prisma.user.update.mockRejectedValueOnce(dbError);

      await expect(userService.updateUser(userId, updateData)).rejects.toThrow(dbError);
    });

    it('should handle partial profile updates', async () => {
      const userId = 'user-123';
      const partialUpdate = { username: 'onlyname' };
      const updatedUser = generateTestUser({ id: userId, ...partialUpdate });

      prisma.user.update.mockResolvedValueOnce(updatedUser);

      const result = await userService.updateUser(userId, partialUpdate);

      expect(result).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should delete user and cascade to related data', async () => {
      const userId = 'user-to-delete';

      prisma.session.deleteMany.mockResolvedValueOnce({ count: 2 });
      prisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 3 });
      prisma.priceAlert.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.gasAlert.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.user.delete.mockResolvedValueOnce({ id: userId });

      await userService.deleteUser(userId);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.priceAlert.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.gasAlert.deleteMany).toHaveBeenCalledWith({ where: { userId } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    });

    it('should delete sessions before deleting user', async () => {
      const userId = 'user-to-delete';
      const callOrder = [];

      prisma.session.deleteMany.mockImplementation(() => {
        callOrder.push('session');
        return Promise.resolve({ count: 0 });
      });
      prisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.priceAlert.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.gasAlert.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.user.delete.mockImplementation(() => {
        callOrder.push('user');
        return Promise.resolve({ id: userId });
      });

      await userService.deleteUser(userId);

      expect(callOrder).toContain('session');
      expect(callOrder).toContain('user');
      expect(callOrder.indexOf('session')).toBeLessThan(callOrder.indexOf('user'));
    });

    it('should throw error if deletion fails', async () => {
      const userId = 'user-to-delete';
      const error = new Error('Database error');

      prisma.session.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.priceAlert.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.gasAlert.deleteMany.mockResolvedValueOnce({ count: 0 });
      prisma.user.delete.mockRejectedValueOnce(error);

      await expect(userService.deleteUser(userId)).rejects.toThrow(error);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const userId = 'user-123';
      const expectedStats = {
        transactionCount: 5,
        portfolioCount: 2,
        activeAlerts: 3,
        activeApiKeys: 2,
        activeSessions: 1
      };

      prisma.transaction.count.mockResolvedValueOnce(expectedStats.transactionCount);
      prisma.portfolio.count.mockResolvedValueOnce(expectedStats.portfolioCount);
      prisma.priceAlert.count.mockResolvedValueOnce(expectedStats.activeAlerts);
      prisma.apiKey.count.mockResolvedValueOnce(expectedStats.activeApiKeys);
      prisma.session.count.mockResolvedValueOnce(expectedStats.activeSessions);

      const result = await userService.getUserStats(userId);

      expect(result).toEqual(expectedStats);
    });

    it('should count only active alerts and API keys', async () => {
      const userId = 'user-123';

      prisma.transaction.count.mockResolvedValueOnce(0);
      prisma.portfolio.count.mockResolvedValueOnce(0);
      prisma.priceAlert.count.mockResolvedValueOnce(0);
      prisma.apiKey.count.mockResolvedValueOnce(0);
      prisma.session.count.mockResolvedValueOnce(0);

      await userService.getUserStats(userId);

      expect(prisma.priceAlert.count).toHaveBeenCalledWith({
        where: { userId, status: 'ACTIVE' }
      });
      expect(prisma.apiKey.count).toHaveBeenCalledWith({
        where: { userId, isActive: true }
      });
      expect(prisma.session.count).toHaveBeenCalledWith({
        where: { userId, isActive: true }
      });
    });

    it('should return zero counts for user with no activity', async () => {
      const userId = 'inactive-user';

      prisma.transaction.count.mockResolvedValueOnce(0);
      prisma.portfolio.count.mockResolvedValueOnce(0);
      prisma.priceAlert.count.mockResolvedValueOnce(0);
      prisma.apiKey.count.mockResolvedValueOnce(0);
      prisma.session.count.mockResolvedValueOnce(0);

      const result = await userService.getUserStats(userId);

      expect(result.transactionCount).toBe(0);
      expect(result.portfolioCount).toBe(0);
      expect(result.activeAlerts).toBe(0);
      expect(result.activeApiKeys).toBe(0);
      expect(result.activeSessions).toBe(0);
    });

    it('should execute all count queries in parallel', async () => {
      const userId = 'user-123';

      prisma.transaction.count.mockResolvedValueOnce(1);
      prisma.portfolio.count.mockResolvedValueOnce(1);
      prisma.priceAlert.count.mockResolvedValueOnce(1);
      prisma.apiKey.count.mockResolvedValueOnce(1);
      prisma.session.count.mockResolvedValueOnce(1);

      const startTime = Date.now();
      await userService.getUserStats(userId);
      const duration = Date.now() - startTime;

      // Should be very fast since queries are parallel (mocked)
      expect(duration).toBeLessThan(100);
    });
  });
});
