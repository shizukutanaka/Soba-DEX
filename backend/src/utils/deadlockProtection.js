// SAND Ultra-Fast Deadlock Protection
class DeadlockProtection {
  constructor() {
    this.locks = new Map();
    this.waiting = new Map();
    this.timeouts = new Map();
    this.config = {
      timeout: 5000, // 5 seconds
      checkInterval: 100, // 100ms
      maxWait: 10 // max waiting operations
    };
    this.intervalId = null;
    this.active = false;
  }

  // Ultra-fast lock acquisition
  async acquire(resource, timeout = this.config.timeout) {
    const lockId = `${resource}_${Date.now()}_${Math.random()}`;

    return new Promise((resolve, reject) => {
      // Quick lock check
      if (!this.locks.has(resource)) {
        this.locks.set(resource, lockId);
        resolve(lockId);
        return;
      }

      // Add to waiting queue
      if (!this.waiting.has(resource)) {
        this.waiting.set(resource, []);
      }

      const waiters = this.waiting.get(resource);
      if (waiters.length >= this.config.maxWait) {
        reject(new Error(`Deadlock prevention: too many waiters for ${resource}`));
        return;
      }

      waiters.push({ lockId, resolve, reject });

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.cleanup(resource, lockId);
        reject(new Error(`Lock timeout for ${resource}`));
      }, timeout);

      this.timeouts.set(lockId, timeoutId);
    });
  }

  // Lightning-fast release
  release(lockId) {
    let releasedResource = null;

    // Find resource by lock ID
    for (const [resource, currentLockId] of this.locks.entries()) {
      if (currentLockId === lockId) {
        releasedResource = resource;
        break;
      }
    }

    if (!releasedResource) {
      return false;
    }

    // Clear lock
    this.locks.delete(releasedResource);

    // Clear timeout
    if (this.timeouts.has(lockId)) {
      clearTimeout(this.timeouts.get(lockId));
      this.timeouts.delete(lockId);
    }

    // Process waiting queue
    const waiters = this.waiting.get(releasedResource);
    if (waiters && waiters.length > 0) {
      const next = waiters.shift();
      this.locks.set(releasedResource, next.lockId);

      // Clear timeout for granted lock
      if (this.timeouts.has(next.lockId)) {
        clearTimeout(this.timeouts.get(next.lockId));
        this.timeouts.delete(next.lockId);
      }

      next.resolve(next.lockId);

      if (waiters.length === 0) {
        this.waiting.delete(releasedResource);
      }
    }

    return true;
  }

  // Fast deadlock detection
  detectCycle() {
    const graph = new Map();

    // Build wait-for graph
    for (const [resource, waiters] of this.waiting.entries()) {
      const currentHolder = this.locks.get(resource);
      if (currentHolder && waiters.length > 0) {
        for (const waiter of waiters) {
          if (!graph.has(waiter.lockId)) {
            graph.set(waiter.lockId, []);
          }
          graph.get(waiter.lockId).push(currentHolder);
        }
      }
    }

    // DFS cycle detection
    const visited = new Set();
    const recursionStack = new Set();

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (this.dfsHasCycle(graph, node, visited, recursionStack)) {
          return true;
        }
      }
    }

    return false;
  }

  // DFS helper for cycle detection
  dfsHasCycle(graph, node, visited, recursionStack) {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.dfsHasCycle(graph, neighbor, visited, recursionStack)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  // Cleanup orphaned locks
  cleanup(resource, lockId) {
    if (this.timeouts.has(lockId)) {
      clearTimeout(this.timeouts.get(lockId));
      this.timeouts.delete(lockId);
    }

    const waiters = this.waiting.get(resource);
    if (waiters) {
      const index = waiters.findIndex(w => w.lockId === lockId);
      if (index >= 0) {
        waiters.splice(index, 1);
        if (waiters.length === 0) {
          this.waiting.delete(resource);
        }
      }
    }
  }

  // Start monitoring
  startMonitoring() {
    if (this.active) {
      return;
    }
    this.active = true;

    this.intervalId = setInterval(() => {
      // Quick deadlock check
      if (this.detectCycle()) {
        this.resolveDeadlock();
      }

      // Cleanup expired locks
      this.cleanupExpired();
    }, this.config.checkInterval);

    console.log('[DeadlockProtection] Started');
  }

  // Stop monitoring
  stopMonitoring() {
    this.active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[DeadlockProtection] Stopped');
  }

  // Resolve deadlock by killing oldest lock
  resolveDeadlock() {
    console.warn('[DeadlockProtection] Deadlock detected, resolving...');

    // Find oldest lock
    let oldestTime = Date.now();
    let oldestLock = null;
    let oldestResource = null;

    for (const [resource, lockId] of this.locks.entries()) {
      const lockTime = parseInt(lockId.split('_')[1]);
      if (lockTime < oldestTime) {
        oldestTime = lockTime;
        oldestLock = lockId;
        oldestResource = resource;
      }
    }

    // Force release oldest lock
    if (oldestLock && oldestResource) {
      console.warn(`[DeadlockProtection] Killing lock ${oldestLock} on ${oldestResource}`);
      this.release(oldestLock);
    }
  }

  // Cleanup expired operations
  cleanupExpired() {
    const now = Date.now();

    for (const [lockId, timeoutId] of this.timeouts.entries()) {
      const lockTime = parseInt(lockId.split('_')[1]);
      if (now - lockTime > this.config.timeout) {
        clearTimeout(timeoutId);
        this.timeouts.delete(lockId);

        // Find and clean resource
        for (const [resource, currentLockId] of this.locks.entries()) {
          if (currentLockId === lockId) {
            this.cleanup(resource, lockId);
            break;
          }
        }
      }
    }
  }

  // Get status
  getStatus() {
    return {
      active: this.active,
      locks: this.locks.size,
      waiting: Array.from(this.waiting.values()).reduce((sum, waiters) => sum + waiters.length, 0),
      timeouts: this.timeouts.size,
      hasCycle: this.detectCycle()
    };
  }

  // Reset all locks
  reset() {
    // Clear all timeouts
    for (const timeoutId of this.timeouts.values()) {
      clearTimeout(timeoutId);
    }

    this.locks.clear();
    this.waiting.clear();
    this.timeouts.clear();
  }

  // Atomic operation wrapper
  async withLock(resource, operation, timeout) {
    const lockId = await this.acquire(resource, timeout);
    try {
      return await operation();
    } finally {
      this.release(lockId);
    }
  }

  // Batch lock acquisition
  async acquireMultiple(resources, timeout = this.config.timeout) {
    // Sort resources to prevent deadlock
    const sortedResources = [...resources].sort();
    const lockIds = [];

    try {
      for (const resource of sortedResources) {
        const lockId = await this.acquire(resource, timeout);
        lockIds.push(lockId);
      }
      return lockIds;
    } catch (error) {
      // Release acquired locks on failure
      for (const lockId of lockIds) {
        this.release(lockId);
      }
      throw error;
    }
  }

  // Release multiple locks
  releaseMultiple(lockIds) {
    for (const lockId of lockIds) {
      this.release(lockId);
    }
  }
}

module.exports = new DeadlockProtection();