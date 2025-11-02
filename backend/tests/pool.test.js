const { DatabasePool } = require('../src/database/pool');

describe('DatabasePool', () => {
  let pool;

  beforeEach(() => {
    pool = new DatabasePool({
      maxConnections: 5,
      minConnections: 2,
      idleTimeout: 5000,
      acquireTimeout: 3000
    });
  });

  afterEach(async () => {
    await pool.close();
  });

  describe('Initialization', () => {
    test('should initialize with minimum connections', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      const stats = pool.getStats();

      expect(stats.poolSize).toBeGreaterThanOrEqual(2);
    });

    test('should track statistics', () => {
      const stats = pool.getStats();

      expect(stats).toHaveProperty('created');
      expect(stats).toHaveProperty('acquired');
      expect(stats).toHaveProperty('released');
      expect(stats).toHaveProperty('poolSize');
      expect(stats).toHaveProperty('activeConnections');
    });
  });

  describe('Connection Acquisition', () => {
    test('should acquire connection successfully', async () => {
      const connection = await pool.acquire();

      expect(connection).toBeDefined();
      expect(connection).toHaveProperty('id');
      expect(connection.inUse).toBe(true);

      pool.release(connection);
    });

    test('should reuse released connections', async () => {
      const conn1 = await pool.acquire();
      const id1 = conn1.id;
      pool.release(conn1);

      const conn2 = await pool.acquire();

      expect(conn2.id).toBe(id1);
      pool.release(conn2);
    });

    test('should create new connection when pool is empty', async () => {
      const connections = [];

      for (let i = 0; i < 3; i++) {
        connections.push(await pool.acquire());
      }

      expect(connections.length).toBe(3);
      expect(new Set(connections.map(c => c.id)).size).toBe(3);

      connections.forEach(c => pool.release(c));
    });
  });

  describe('Connection Limits', () => {
    test('should respect max connections limit', async () => {
      const connections = [];

      for (let i = 0; i < 5; i++) {
        connections.push(await pool.acquire());
      }

      const stats = pool.getStats();
      expect(stats.activeConnections + stats.poolSize).toBeLessThanOrEqual(5);

      connections.forEach(c => pool.release(c));
    });

    test('should queue requests when pool is full', async () => {
      const connections = [];

      for (let i = 0; i < 5; i++) {
        connections.push(await pool.acquire());
      }

      const acquirePromise = pool.acquire();
      const stats = pool.getStats();

      expect(stats.waitingRequests).toBeGreaterThan(0);

      pool.release(connections[0]);
      const queuedConnection = await acquirePromise;

      expect(queuedConnection).toBeDefined();

      connections.slice(1).forEach(c => pool.release(c));
      pool.release(queuedConnection);
    });
  });

  describe('Connection Release', () => {
    test('should release connection back to pool', async () => {
      const connection = await pool.acquire();
      const initialStats = pool.getStats();

      pool.release(connection);
      const afterStats = pool.getStats();

      expect(afterStats.activeConnections).toBeLessThan(initialStats.activeConnections);
    });

    test('should handle null connection release', () => {
      expect(() => pool.release(null)).not.toThrow();
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await pool.healthCheck();

      expect(health).toHaveProperty('status');
      expect(health.status).toBe('healthy');
      expect(health).toHaveProperty('poolSize');
      expect(health).toHaveProperty('active');
    });

    test('should detect degraded status with high timeouts', async () => {
      pool.stats.timeouts = 15;
      const health = await pool.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health).toHaveProperty('warning');
    });
  });

  describe('Pool Closure', () => {
    test('should close pool successfully', async () => {
      const connection = await pool.acquire();
      pool.release(connection);

      await pool.close();

      const stats = pool.getStats();
      expect(stats.poolSize).toBe(0);
      expect(stats.activeConnections).toBe(0);
    });

    test('should reject new acquisitions after closure', async () => {
      await pool.close();

      await expect(pool.acquire()).rejects.toThrow('Pool is closed');
    });
  });
});
