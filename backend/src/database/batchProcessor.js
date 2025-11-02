class DatabaseBatchProcessor {
  constructor(connectionPool) {
    this.connectionPool = connectionPool;
    this.batches = new Map();
    this.config = {
      maxBatchSize: 1000,
      flushInterval: 1000, // 1 second
      maxWaitTime: 5000, // 5 seconds
      retryAttempts: 3,
      retryDelay: 1000,
      enableCompression: true,
      enableDeduplication: true
    };

    this.stats = {
      totalOperations: 0,
      batchedOperations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      averageBatchSize: 0,
      compressionRatio: 0
    };

    this.flushInterval = null;
    this.isProcessing = false;
  }

  // Initialize batch processor
  initialize() {
    this.startBatchProcessor();
    console.log('Database batch processor initialized');
  }

  // Add operation to batch
  async addOperation(type, operation) {
    return new Promise((resolve, reject) => {
      const operationId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (!this.batches.has(type)) {
        this.batches.set(type, {
          operations: [],
          promises: new Map(),
          createdAt: Date.now(),
          lastModified: Date.now()
        });
      }

      const batch = this.batches.get(type);
      batch.operations.push({ id: operationId, ...operation });
      batch.promises.set(operationId, { resolve, reject });
      batch.lastModified = Date.now();

      this.stats.totalOperations++;

      // Check if batch should be flushed immediately
      if (batch.operations.length >= this.config.maxBatchSize) {
        this.processBatch(type);
      }
    });
  }

  // Process all pending batches
  async processAllBatches() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const batchTypes = Array.from(this.batches.keys());

      for (const type of batchTypes) {
        await this.processBatch(type);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Process specific batch type
  async processBatch(type) {
    const batch = this.batches.get(type);
    if (!batch || batch.operations.length === 0) {
      return;
    }

    const operations = [...batch.operations];
    const promises = new Map(batch.promises);

    // Clear the batch
    this.batches.delete(type);

    try {
      // Apply compression if enabled
      const processedOperations = this.config.enableCompression
        ? this.compressOperations(operations)
        : operations;

      // Apply deduplication if enabled
      const finalOperations = this.config.enableDeduplication
        ? this.deduplicateOperations(processedOperations)
        : processedOperations;

      // Execute batch based on type
      const results = await this.executeBatch(type, finalOperations);

      // Resolve all promises
      this.resolveBatchPromises(promises, results, finalOperations);

      // Update statistics
      this.updateBatchStats(operations.length, finalOperations.length, true);

      console.log(`Processed batch ${type}: ${operations.length} operations`);
    } catch (error) {
      console.error(`Batch processing failed for ${type}:`, error);

      // Reject all promises
      for (const { reject } of promises.values()) {
        reject(error);
      }

      this.updateBatchStats(operations.length, 0, false);
    }
  }

  // Execute batch operations
  async executeBatch(type, operations) {
    switch (type) {
    case 'INSERT':
      return await this.executeInsertBatch(operations);
    case 'UPDATE':
      return await this.executeUpdateBatch(operations);
    case 'DELETE':
      return await this.executeDeleteBatch(operations);
    case 'SELECT':
      return await this.executeSelectBatch(operations);
    default:
      throw new Error(`Unknown batch type: ${type}`);
    }
  }

  // Execute INSERT batch
  async executeInsertBatch(operations) {
    const tableGroups = this.groupByTable(operations);
    const results = [];

    for (const [table, ops] of tableGroups) {
      const values = ops.map(op => op.values);
      const columns = ops[0].columns || Object.keys(values[0]);

      // Build batch INSERT query
      const placeholders = values
        .map((_, index) => {
          const start = index * columns.length;
          return `(${columns.map((_, colIndex) => `$${start + colIndex + 1}`).join(', ')})`;
        })
        .join(', ');

      const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES ${placeholders}
        RETURNING id
      `;

      const params = values.flat();

      try {
        const result = await this.executeWithRetry(sql, params);
        results.push(...result.rows);
      } catch (error) {
        console.error(`INSERT batch failed for table ${table}:`, error);
        throw error;
      }
    }

    return results;
  }

  // Execute UPDATE batch
  async executeUpdateBatch(operations) {
    const results = [];

    // Group by table and update fields
    const updateGroups = this.groupUpdateOperations(operations);

    for (const group of updateGroups) {
      const { table, setClause, whereClause, operations: groupOps } = group;

      // Build batch UPDATE using CASE statements
      const sql = this.buildBatchUpdateSQL(
        table,
        setClause,
        whereClause,
        groupOps
      );
      const params = this.extractUpdateParams(groupOps);

      try {
        const result = await this.executeWithRetry(sql, params);
        results.push(result);
      } catch (error) {
        console.error(`UPDATE batch failed for table ${table}:`, error);
        throw error;
      }
    }

    return results;
  }

  // Execute DELETE batch
  async executeDeleteBatch(operations) {
    const tableGroups = this.groupByTable(operations);
    const results = [];

    for (const [table, ops] of tableGroups) {
      const ids = ops.map(op => op.id || op.where.id);

      const sql = `DELETE FROM ${table} WHERE id = ANY($1)`;
      const params = [ids];

      try {
        const result = await this.executeWithRetry(sql, params);
        results.push(result);
      } catch (error) {
        console.error(`DELETE batch failed for table ${table}:`, error);
        throw error;
      }
    }

    return results;
  }

  // Execute SELECT batch
  async executeSelectBatch(operations) {
    // For SELECT operations, execute individually or optimize similar queries
    const results = [];

    for (const operation of operations) {
      try {
        const result = await this.executeWithRetry(
          operation.sql,
          operation.params
        );
        results.push(result);
      } catch (error) {
        console.error('SELECT operation failed:', error);
        results.push({ error: error.message });
      }
    }

    return results;
  }

  // Group operations by table
  groupByTable(operations) {
    const groups = new Map();

    for (const operation of operations) {
      const {table} = operation;
      if (!groups.has(table)) {
        groups.set(table, []);
      }
      groups.get(table).push(operation);
    }

    return groups;
  }

  // Group UPDATE operations by similar structure
  groupUpdateOperations(operations) {
    const groups = [];
    const processed = new Set();

    for (let i = 0; i < operations.length; i++) {
      if (processed.has(i)) {
        continue;
      }

      const baseOp = operations[i];
      const group = {
        table: baseOp.table,
        setClause: baseOp.setClause,
        whereClause: baseOp.whereClause,
        operations: [baseOp]
      };

      // Find similar operations
      for (let j = i + 1; j < operations.length; j++) {
        if (processed.has(j)) {
          continue;
        }

        const op = operations[j];
        if (
          op.table === baseOp.table &&
          op.setClause === baseOp.setClause &&
          op.whereClause === baseOp.whereClause
        ) {
          group.operations.push(op);
          processed.add(j);
        }
      }

      groups.push(group);
      processed.add(i);
    }

    return groups;
  }

  // Build batch UPDATE SQL with CASE statements
  buildBatchUpdateSQL(table, setClause, whereClause, operations) {
    const setClauses = setClause.split(', ').map(clause => {
      const [column, _] = clause.split(' = ');
      const cases = operations
        .map((op, index) => {
          return `WHEN id = $${index * 2 + 1} THEN $${index * 2 + 2}`;
        })
        .join(' ');

      return `${column} = CASE ${cases} ELSE ${column} END`;
    });

    const ids = operations.map((_, index) => `$${index * 2 + 1}`).join(', ');

    return `
      UPDATE ${table}
      SET ${setClauses.join(', ')}
      WHERE id IN (${ids})
    `;
  }

  // Extract parameters for UPDATE operations
  extractUpdateParams(operations) {
    const params = [];

    for (const operation of operations) {
      params.push(operation.id);
      params.push(...operation.values);
    }

    return params;
  }

  // Compress operations by removing duplicates and optimizing
  compressOperations(operations) {
    if (operations.length <= 1) {
      return operations;
    }

    // Simple compression: remove exact duplicates
    const seen = new Set();
    const compressed = [];

    for (const operation of operations) {
      const key = JSON.stringify(operation);
      if (!seen.has(key)) {
        seen.add(key);
        compressed.push(operation);
      }
    }

    return compressed;
  }

  // Remove duplicate operations
  deduplicateOperations(operations) {
    if (operations.length <= 1) {
      return operations;
    }

    const deduplicated = [];
    const keys = new Set();

    for (const operation of operations) {
      const key = this.generateOperationKey(operation);
      if (!keys.has(key)) {
        keys.add(key);
        deduplicated.push(operation);
      }
    }

    return deduplicated;
  }

  // Generate unique key for operation
  generateOperationKey(operation) {
    if (operation.table && operation.values) {
      // For INSERT/UPDATE operations
      const keyFields = operation.keyFields || ['id'];
      const keyValues = keyFields
        .map(field => operation.values[field])
        .join('|');
      return `${operation.table}:${keyValues}`;
    }

    // For other operations
    return JSON.stringify(operation);
  }

  // Execute SQL with retry logic
  async executeWithRetry(sql, params, attempts = this.config.retryAttempts) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const connection = await this.connectionPool.acquire();
        try {
          return await connection.query(sql, params);
        } finally {
          connection.release();
        }
      } catch (error) {
        if (attempt === attempts) {
          throw error;
        }

        console.warn(
          `Batch execution attempt ${attempt} failed, retrying:`,
          error.message
        );
        await new Promise(resolve =>
          setTimeout(resolve, this.config.retryDelay * attempt)
        );
      }
    }
  }

  // Resolve batch promises with results
  resolveBatchPromises(promises, results, operations) {
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const promise = promises.get(operation.id);

      if (promise) {
        const result = results[i] || results[0]; // Handle batch results
        promise.resolve(result);
      }
    }
  }

  // Update batch statistics
  updateBatchStats(originalSize, processedSize, success) {
    this.stats.batchedOperations += processedSize;

    if (success) {
      this.stats.successfulBatches++;
    } else {
      this.stats.failedBatches++;
    }

    // Update average batch size
    const totalBatches =
      this.stats.successfulBatches + this.stats.failedBatches;
    this.stats.averageBatchSize = Math.round(
      this.stats.batchedOperations / Math.max(1, totalBatches)
    );

    // Update compression ratio
    if (originalSize > 0) {
      this.stats.compressionRatio =
        ((originalSize - processedSize) / originalSize) * 100;
    }
  }

  // Start batch processing interval
  startBatchProcessor() {
    this.flushInterval = setInterval(() => {
      this.processAllBatches();
    }, this.config.flushInterval);

    // Also check for old batches
    setInterval(() => {
      this.flushOldBatches();
    }, this.config.maxWaitTime);
  }

  // Flush old batches that have been waiting too long
  flushOldBatches() {
    const now = Date.now();

    for (const [type, batch] of this.batches) {
      if (now - batch.createdAt > this.config.maxWaitTime) {
        this.processBatch(type);
      }
    }
  }

  // Stop batch processor
  stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Process remaining batches
    this.processAllBatches();
  }

  // Get batch statistics
  getStats() {
    return {
      ...this.stats,
      pendingBatches: this.batches.size,
      pendingOperations: Array.from(this.batches.values()).reduce(
        (sum, batch) => sum + batch.operations.length,
        0
      ),
      config: this.config
    };
  }

  // Get detailed batch information
  getBatchInfo() {
    const batches = [];

    for (const [type, batch] of this.batches) {
      batches.push({
        type,
        operationCount: batch.operations.length,
        createdAt: batch.createdAt,
        lastModified: batch.lastModified,
        age: Date.now() - batch.createdAt
      });
    }

    return batches;
  }

  // Manual flush of all batches
  async flush() {
    await this.processAllBatches();
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  // Reset processor (for testing)
  reset() {
    this.stop();
    this.batches.clear();
    this.stats = {
      totalOperations: 0,
      batchedOperations: 0,
      successfulBatches: 0,
      failedBatches: 0,
      averageBatchSize: 0,
      compressionRatio: 0
    };
  }
}

// Create singleton instance
const batchProcessor = new DatabaseBatchProcessor();

module.exports = batchProcessor;
