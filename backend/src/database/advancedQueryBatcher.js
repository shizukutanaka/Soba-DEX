/**
 * Advanced Database Query Batching System
 * Enterprise-grade query optimization with intelligent batching strategies
 */

const { logger } = require('../utils/productionLogger');

class AdvancedQueryBatcher {
  constructor(connectionPool) {
    this.connectionPool = connectionPool;
    this.batches = new Map();
    this.operationQueues = new Map();
    this.queryTemplates = new Map();

    // Advanced configuration
    this.config = {
      maxBatchSize: 1000,
      flushInterval: 500, // 500ms for high-frequency trading
      maxWaitTime: 2000, // 2 seconds max wait
      retryAttempts: 3,
      retryDelay: 500,
      enableCompression: true,
      enableDeduplication: true,
      enableParallelExecution: true,
      enableQueryOptimization: true,
      enablePrefetching: true,
      priorityQueues: {
        'CRITICAL': { maxSize: 100, flushInterval: 100 },
        'HIGH': { maxSize: 500, flushInterval: 250 },
        'NORMAL': { maxSize: 1000, flushInterval: 500 },
        'LOW': { maxSize: 2000, flushInterval: 1000 }
      }
    };

    // Performance metrics
    this.metrics = {
      totalOperations: 0,
      batchedOperations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      averageBatchSize: 0,
      compressionRatio: 0,
      cacheHits: 0,
      cacheMisses: 0,
      queryOptimizationTime: 0,
      prefetchHits: 0,
      prefetchMisses: 0,
      priorityDistribution: {
        CRITICAL: 0,
        HIGH: 0,
        NORMAL: 0,
        LOW: 0
      }
    };

    this.flushIntervals = new Map();
    this.isProcessing = false;
    this.queryCache = new Map();
    this.prefetchCache = new Map();

    // Start monitoring
    this.startAdvancedMonitoring();
  }

  /**
   * Add operation to priority queue
   */
  async addOperation(type, operation, priority = 'NORMAL') {
    return new Promise((resolve, reject) => {
      const operationId = this.generateOperationId(type);
      const timestamp = Date.now();

      // Create operation object
      const op = {
        id: operationId,
        type,
        operation,
        priority,
        timestamp,
        resolve,
        reject,
        retryCount: 0
      };

      this.metrics.totalOperations++;
      this.metrics.priorityDistribution[priority]++;

      // Initialize priority queue if not exists
      if (!this.operationQueues.has(priority)) {
        this.operationQueues.set(priority, []);
      }

      const queue = this.operationQueues.get(priority);
      queue.push(op);

      // Sort queue by timestamp (FIFO within priority)
      queue.sort((a, b) => a.timestamp - b.timestamp);

      // Check if should flush immediately based on priority settings
      const priorityConfig = this.config.priorityQueues[priority];
      if (queue.length >= priorityConfig.maxSize) {
        this.flushPriorityQueue(priority);
      }

      // Set up flush interval for priority if not exists
      if (!this.flushIntervals.has(priority)) {
        this.flushIntervals.set(priority, setInterval(() => {
          this.flushPriorityQueue(priority);
        }, priorityConfig.flushInterval));
      }
    });
  }

  /**
   * Process all pending batches with advanced strategies
   */
  async processAllBatches() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process priority queues in order (CRITICAL -> HIGH -> NORMAL -> LOW)
      const priorities = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

      for (const priority of priorities) {
        if (this.operationQueues.has(priority)) {
          await this.flushPriorityQueue(priority);
        }
      }

      // Process legacy batch system for compatibility
      await this.processLegacyBatches();

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Flush specific priority queue
   */
  async flushPriorityQueue(priority) {
    const queue = this.operationQueues.get(priority);
    if (!queue || queue.length === 0) {
      return;
    }

    const operations = [...queue];
    this.operationQueues.set(priority, []);

    try {
      await this.executePriorityBatch(operations, priority);
    } catch (error) {
      logger.error(`Failed to execute ${priority} priority batch`, {
        error: error.message,
        operationCount: operations.length
      });

      // Re-queue failed operations
      this.requeueOperations(operations, error);
    }
  }

  /**
   * Execute batch with priority-specific optimization
   */
  async executePriorityBatch(operations, priority) {
    if (operations.length === 0) return;

    const startTime = Date.now();

    try {
      // Apply query optimization if enabled
      if (this.config.enableQueryOptimization) {
        operations = await this.optimizeQueries(operations);
      }

      // Group operations by type for better execution efficiency
      const groupedOperations = this.groupOperationsByType(operations);

      // Apply deduplication if enabled
      if (this.config.enableDeduplication) {
        groupedOperations = this.deduplicateOperations(groupedOperations);
      }

      // Apply compression if enabled
      if (this.config.enableCompression) {
        groupedOperations = this.compressOperations(groupedOperations);
      }

      // Execute operations with parallel processing for high priority
      const results = await this.executeOperationsParallel(groupedOperations, priority);

      // Update metrics
      this.updateBatchMetrics(operations.length, Date.now() - startTime, true);

      // Resolve promises
      this.resolveOperationPromises(operations, results);

    } catch (error) {
      this.updateBatchMetrics(operations.length, Date.now() - startTime, false);
      throw error;
    }
  }

  /**
   * Optimize queries using intelligent strategies
   */
  async optimizeQueries(operations) {
    const startTime = Date.now();
    const optimized = [];

    for (const op of operations) {
      let optimizedOp = { ...op };

      // Apply query-specific optimizations
      switch (op.type) {
        case 'SELECT':
          optimizedOp = await this.optimizeSelectQuery(op);
          break;
        case 'INSERT':
          optimizedOp = await this.optimizeInsertQuery(op);
          break;
        case 'UPDATE':
          optimizedOp = await this.optimizeUpdateQuery(op);
          break;
        case 'DELETE':
          optimizedOp = await this.optimizeDeleteQuery(op);
          break;
      }

      optimized.push(optimizedOp);
    }

    this.metrics.queryOptimizationTime += Date.now() - startTime;
    return optimized;
  }

  /**
   * Optimize SELECT queries
   */
  async optimizeSelectQuery(operation) {
    const { query, params } = operation.operation;

    // Check query cache first
    const cacheKey = this.generateCacheKey(query, params);
    if (this.queryCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      return { ...operation, cached: true, result: this.queryCache.get(cacheKey) };
    }
    this.metrics.cacheMisses++;

    // Apply query template optimization
    const optimizedQuery = await this.applyQueryTemplates(query);

    return {
      ...operation,
      operation: { query: optimizedQuery, params },
      optimized: true
    };
  }

  /**
   * Optimize INSERT queries with batching
   */
  async optimizeInsertQuery(operation) {
    const { table, data } = operation.operation;

    // For bulk inserts, use PostgreSQL's ON CONFLICT for upserts
    if (Array.isArray(data) && data.length > 1) {
      const optimizedQuery = this.generateBulkInsertQuery(table, data);
      return {
        ...operation,
        operation: { query: optimizedQuery, params: data },
        bulk: true
      };
    }

    return operation;
  }

  /**
   * Optimize UPDATE queries
   */
  async optimizeUpdateQuery(operation) {
    const { query, params } = operation.operation;

    // Apply conditional updates optimization
    const optimizedQuery = query.replace(
      /UPDATE (\w+) SET (.+?) WHERE (.+)/gi,
      (match, table, setClause, whereClause) => {
        // Add RETURNING clause for better performance tracking
        return `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`;
      }
    );

    return {
      ...operation,
      operation: { query: optimizedQuery, params },
      optimized: true
    };
  }

  /**
   * Optimize DELETE queries
   */
  async optimizeDeleteQuery(operation) {
    const { query, params } = operation.operation;

    // Add LIMIT for safety in bulk deletes
    if (!query.includes('LIMIT') && !query.includes('WHERE')) {
      logger.warn('Potentially dangerous DELETE query without WHERE clause', { query });
    }

    return {
      ...operation,
      operation: { query: query + ' RETURNING *', params },
      optimized: true
    };
  }

  /**
   * Group operations by type for efficient execution
   */
  groupOperationsByType(operations) {
    const groups = new Map();

    for (const op of operations) {
      const type = op.type;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type).push(op);
    }

    return groups;
  }

  /**
   * Deduplicate operations within the same batch
   */
  deduplicateOperations(groupedOperations) {
    const deduplicated = new Map();

    for (const [type, operations] of groupedOperations) {
      const unique = new Map();

      for (const op of operations) {
        const key = this.generateOperationKey(op);
        if (!unique.has(key)) {
          unique.set(key, op);
        }
      }

      deduplicated.set(type, Array.from(unique.values()));
    }

    return deduplicated;
  }

  /**
   * Compress operations for network efficiency
   */
  compressOperations(groupedOperations) {
    // Simple compression by removing redundant metadata
    for (const [type, operations] of groupedOperations) {
      for (const op of operations) {
        // Remove unnecessary fields for transmission
        if (op.timestamp) delete op.timestamp;
        if (op.retryCount) delete op.retryCount;
      }
    }

    return groupedOperations;
  }

  /**
   * Execute operations in parallel for better performance
   */
  async executeOperationsParallel(groupedOperations, priority) {
    const results = new Map();

    // For CRITICAL and HIGH priority, use parallel execution
    if (priority === 'CRITICAL' || priority === 'HIGH') {
      const promises = [];

      for (const [type, operations] of groupedOperations) {
        promises.push(this.executeOperationGroup(type, operations));
      }

      const parallelResults = await Promise.all(promises);

      for (let i = 0; i < parallelResults.length; i++) {
        const type = Array.from(groupedOperations.keys())[i];
        results.set(type, parallelResults[i]);
      }
    } else {
      // For NORMAL and LOW priority, use sequential execution
      for (const [type, operations] of groupedOperations) {
        results.set(type, await this.executeOperationGroup(type, operations));
      }
    }

    return results;
  }

  /**
   * Execute a group of operations of the same type
   */
  async executeOperationGroup(type, operations) {
    if (operations.length === 0) return [];

    const client = await this.connectionPool.getPool().connect();

    try {
      const results = [];

      for (const op of operations) {
        if (op.cached) {
          results.push(op.result);
          continue;
        }

        const startTime = Date.now();
        const result = await client.query(op.operation.query, op.operation.params);
        const duration = Date.now() - startTime;

        // Log slow queries
        if (duration > 1000) {
          logger.warn('Slow batch query', {
            type,
            duration,
            operationId: op.id
          });
        }

        results.push(result);

        // Cache successful SELECT queries
        if (type === 'SELECT' && !op.optimized) {
          const cacheKey = this.generateCacheKey(op.operation.query, op.operation.params);
          this.queryCache.set(cacheKey, result);
        }
      }

      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Prefetch related data for better performance
   */
  async prefetchData(operation) {
    // Simple prefetching based on operation patterns
    const prefetchKey = `${operation.type}_${operation.operation.table || 'unknown'}`;

    if (this.prefetchCache.has(prefetchKey)) {
      this.metrics.prefetchHits++;
      return this.prefetchCache.get(prefetchKey);
    }

    this.metrics.prefetchMisses++;

    // Generate prefetch queries based on operation type
    const prefetchQueries = this.generatePrefetchQueries(operation);

    if (prefetchQueries.length > 0) {
      const client = await this.connectionPool.getPool().connect();

      try {
        const results = await Promise.all(
          prefetchQueries.map(query => client.query(query))
        );

        this.prefetchCache.set(prefetchKey, results);
        return results;
      } finally {
        client.release();
      }
    }

    return [];
  }

  /**
   * Generate prefetch queries based on operation patterns
   */
  generatePrefetchQueries(operation) {
    const queries = [];

    switch (operation.type) {
      case 'SELECT':
        // Prefetch related data for trading operations
        if (operation.operation.table === 'trades') {
          queries.push('SELECT * FROM price_history ORDER BY timestamp DESC LIMIT 100');
        }
        break;
    }

    return queries;
  }

  /**
   * Generate bulk insert query for better performance
   */
  generateBulkInsertQuery(table, data) {
    if (!Array.isArray(data) || data.length === 0) return '';

    const columns = Object.keys(data[0]);
    const values = data.map((_, index) =>
      `(${columns.map((_, colIndex) => `$${index * columns.length + colIndex + 1}`).join(', ')})`
    ).join(', ');

    const params = data.flatMap(row => columns.map(col => row[col]));

    return {
      query: `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    };
  }

  /**
   * Apply query templates for optimization
   */
  async applyQueryTemplates(query) {
    // Simple template application for common patterns
    const templates = {
      'SELECT * FROM users WHERE': 'SELECT id, username, email FROM users WHERE',
      'SELECT COUNT(*) FROM': 'SELECT COUNT(1) FROM'
    };

    for (const [pattern, replacement] of Object.entries(templates)) {
      if (query.includes(pattern)) {
        return query.replace(pattern, replacement);
      }
    }

    return query;
  }

  /**
   * Utility methods
   */
  generateOperationId(type) {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateOperationKey(operation) {
    return `${operation.type}_${JSON.stringify(operation.operation)}`;
  }

  generateCacheKey(query, params) {
    return `${query}:${JSON.stringify(params)}`;
  }

  resolveOperationPromises(operations, results) {
    for (const op of operations) {
      if (op.resolve) {
        op.resolve(op.cached ? op.result : results.get(op.type));
      }
    }
  }

  requeueOperations(operations, error) {
    for (const op of operations) {
      if (op.retryCount < this.config.retryAttempts) {
        op.retryCount++;
        op.timestamp = Date.now() + this.config.retryDelay * op.retryCount;

        const queue = this.operationQueues.get(op.priority);
        if (queue) {
          queue.push(op);
        }
      } else {
        if (op.reject) {
          op.reject(error);
        }
      }
    }
  }

  updateBatchMetrics(size, duration, success) {
    this.metrics.batchedOperations += size;
    this.metrics.averageBatchSize = this.metrics.batchedOperations / Math.max(this.metrics.successfulBatches + this.metrics.failedBatches, 1);

    if (success) {
      this.metrics.successfulBatches++;
    } else {
      this.metrics.failedBatches++;
    }
  }

  /**
   * Process legacy batch system for compatibility
   */
  async processLegacyBatches() {
    // Handle legacy batch format for backward compatibility
    for (const [type, batch] of this.batches) {
      if (batch.operations.length > 0) {
        await this.processBatch(type);
      }
    }
  }

  /**
   * Start advanced monitoring
   */
  startAdvancedMonitoring() {
    // Monitor cache efficiency
    setInterval(() => {
      this.cleanupCaches();
    }, 300000); // Every 5 minutes

    // Monitor queue sizes
    setInterval(() => {
      this.logQueueSizes();
    }, 60000); // Every minute
  }

  cleanupCaches() {
    const now = Date.now();

    // Clean old cache entries (older than 10 minutes)
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > 600000) {
        this.queryCache.delete(key);
      }
    }

    // Clean prefetch cache
    for (const [key, value] of this.prefetchCache.entries()) {
      if (now - value.timestamp > 300000) {
        this.prefetchCache.delete(key);
      }
    }
  }

  logQueueSizes() {
    const sizes = {};
    for (const [priority, queue] of this.operationQueues) {
      sizes[priority] = queue.length;
    }

    logger.debug('Query batcher queue sizes', sizes);
  }

  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      queueSizes: Object.fromEntries(
        Array.from(this.operationQueues.entries()).map(([priority, queue]) => [priority, queue.length])
      ),
      cacheSize: this.queryCache.size,
      prefetchCacheSize: this.prefetchCache.size,
      config: this.config
    };
  }

  /**
   * Legacy compatibility methods
   */
  async addOperationLegacy(type, operation) {
    return this.addOperation(type, operation, 'NORMAL');
  }

  async processBatch(type) {
    if (this.operationQueues.has(type)) {
      await this.flushPriorityQueue(type);
    }
  }

  async processAllBatchesLegacy() {
    return this.processAllBatches();
  }

  initialize() {
    this.startAdvancedMonitoring();
    logger.info('Advanced query batcher initialized');
  }
}

// Export both new and legacy interfaces for compatibility
module.exports = {
  AdvancedQueryBatcher,
  DatabaseBatchProcessor: AdvancedQueryBatcher // Legacy compatibility
};
