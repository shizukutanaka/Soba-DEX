class IndexOptimizer {
  constructor(db) {
    this.db = db;
    this.indexStats = new Map();
    this.queryPatterns = new Map();
  }

  // Create optimized indexes for common queries
  async createIndexes() {
    const indexes = [
      // User indexes
      { table: 'users', columns: ['email'], unique: true },
      { table: 'users', columns: ['username'], unique: true },
      { table: 'users', columns: ['created_at'] },
      { table: 'users', columns: ['status', 'created_at'] },

      // Orders indexes
      { table: 'orders', columns: ['user_id', 'status', 'created_at'] },
      { table: 'orders', columns: ['symbol', 'status'] },
      { table: 'orders', columns: ['status', 'created_at'] },
      { table: 'orders', columns: ['type', 'side', 'symbol'] },

      // Transactions indexes
      { table: 'transactions', columns: ['user_id', 'created_at'] },
      { table: 'transactions', columns: ['type', 'status'] },
      { table: 'transactions', columns: ['currency', 'created_at'] },

      // Trade history indexes
      { table: 'trades', columns: ['symbol', 'created_at'] },
      { table: 'trades', columns: ['user_id', 'symbol', 'created_at'] },
      { table: 'trades', columns: ['order_id'] },

      // Balance indexes
      { table: 'balances', columns: ['user_id', 'currency'], unique: true },
      { table: 'balances', columns: ['currency', 'updated_at'] }
    ]; 
      { table: 'ab_experiment_events', columns: ['user_id', 'event_type'] },
      { table: 'ab_variants', columns: ['experiment_id', 'is_control'] },

    const results = [];
    for (const index of indexes) {
      try {
        const result = await this.createIndex(index);
        results.push(result);
      } catch (error) {
        console.error(`Failed to create index on ${index.table}:`, error.message);
        results.push({ success: false, index, error: error.message });
      }
    }

    return results;
  }

  async createIndex({ table, columns, unique = false }) {
    const indexName = `idx_${table}_${columns.join('_')}`;
    const uniqueClause = unique ? 'UNIQUE' : '';
    const columnList = columns.join(', ');

    const query = `
      CREATE ${uniqueClause} INDEX IF NOT EXISTS ${indexName}
      ON ${table} (${columnList})
    `;

    try {
      await this.db.query(query);
      return { success: true, indexName, table, columns };
    } catch (error) {
      console.error(`Failed to create index ${indexName}:`, error);
      return { success: false, indexName, table, columns, error: error.message };
    }
  }

  // Analyze query performance
  async analyzeQuery(query, params = []) {
    const explainQuery = `EXPLAIN ANALYZE ${query}`;

    try {
      const result = await this.db.query(explainQuery, params);
      const analysis = this.parseExplainResult(result.rows);

      // Track query pattern
      this.trackQueryPattern(query, analysis);

      return analysis;
    } catch (error) {
      console.error('Query analysis failed:', error);
      return null;
    }
  }

  parseExplainResult(rows) {
    const analysis = {
      totalTime: 0,
      scanType: null,
      rowsScanned: 0,
      indexUsed: false,
      suggestions: []
    };

    rows.forEach(row => {
      const plan = row['QUERY PLAN'];

      // Extract execution time
      const timeMatch = plan.match(/actual time=(\d+\.\d+)\.\.(\d+\.\d+)/);
      if (timeMatch) {
        analysis.totalTime = parseFloat(timeMatch[2]);
      }

      // Check scan type
      if (plan.includes('Seq Scan')) {
        analysis.scanType = 'sequential';
        analysis.suggestions.push('Consider adding an index to avoid sequential scan');
      } else if (plan.includes('Index Scan')) {
        analysis.scanType = 'index';
        analysis.indexUsed = true;
      } else if (plan.includes('Bitmap')) {
        analysis.scanType = 'bitmap';
        analysis.indexUsed = true;
      }

      // Extract rows
      const rowsMatch = plan.match(/rows=(\d+)/);
      if (rowsMatch) {
        analysis.rowsScanned += parseInt(rowsMatch[1]);
      }
    });

    // Add suggestions based on performance
    if (analysis.totalTime > 100) {
      analysis.suggestions.push('Query is slow (>100ms), consider optimization');
    }

    if (analysis.rowsScanned > 10000) {
      analysis.suggestions.push('Large number of rows scanned, consider filtering or indexing');
    }

    return analysis;
  }

  trackQueryPattern(query, analysis) {
    const pattern = this.extractPattern(query);

    if (!this.queryPatterns.has(pattern)) {
      this.queryPatterns.set(pattern, {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0
      });
    }

    const stats = this.queryPatterns.get(pattern);
    stats.count++;
    stats.totalTime += analysis.totalTime;
    stats.avgTime = stats.totalTime / stats.count;
    stats.maxTime = Math.max(stats.maxTime, analysis.totalTime);
  }

  extractPattern(query) {
    // Remove values to create a pattern
    return query
      .replace(/=\s*'[^']*'/g, '= ?')
      .replace(/=\s*\d+/g, '= ?')
      .replace(/IN\s*\([^)]+\)/g, 'IN (?)')
      .trim();
  }

  // Get index usage statistics
  async getIndexStats() {
    const query = `
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
    `;

    try {
      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      console.error('Failed to get index stats:', error);
      return [];
    }
  }

  // Find missing indexes
  async findMissingIndexes() {
    const query = `
      SELECT
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats
      WHERE schemaname = 'public'
        AND n_distinct > 100
        AND correlation < 0.1
      ORDER BY n_distinct DESC
    `;

    try {
      const result = await this.db.query(query);
      return result.rows.map(row => ({
        table: row.tablename,
        column: row.attname,
        distinctValues: row.n_distinct,
        suggestion: `Consider indexing ${row.tablename}.${row.attname}`
      }));
    } catch (error) {
      console.error('Failed to find missing indexes:', error);
      return [];
    }
  }

  // Remove unused indexes
  async removeUnusedIndexes(threshold = 100) {
    const stats = await this.getIndexStats();
    const unusedIndexes = stats.filter(stat => stat.index_scans < threshold);

    const results = [];
    for (const index of unusedIndexes) {
      if (index.indexname.startsWith('idx_')) { // Only remove our custom indexes
        try {
          await this.db.query(`DROP INDEX IF EXISTS ${index.indexname}`);
          results.push({ dropped: index.indexname });
        } catch (error) {
          results.push({ failed: index.indexname, error: error.message });
        }
      }
    }

    return results;
  }

  // Rebuild fragmented indexes
  async rebuildIndexes() {
    const query = `
      SELECT
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;

    try {
      const result = await this.db.query(query);
      const results = [];

      for (const row of result.rows) {
        try {
          await this.db.query(`REINDEX INDEX ${row.indexname}`);
          results.push({ reindexed: row.indexname });
        } catch (error) {
          results.push({ failed: row.indexname, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to rebuild indexes:', error);
      return [];
    }
  }

  // Get recommendations
  async getRecommendations() {
    const recommendations = [];

    // Get slow queries
    const slowQueries = Array.from(this.queryPatterns.entries())
      .filter(([_, stats]) => stats.avgTime > 50)
      .sort((a, b) => b[1].avgTime - a[1].avgTime)
      .slice(0, 10);

    slowQueries.forEach(([pattern, stats]) => {
      recommendations.push({
        type: 'slow_query',
        pattern,
        avgTime: stats.avgTime,
        count: stats.count,
        suggestion: 'Optimize this query or add appropriate indexes'
      });
    });

    // Get missing indexes
    const missingIndexes = await this.findMissingIndexes();
    recommendations.push(...missingIndexes.map(idx => ({
      type: 'missing_index',
      ...idx
    })));

    // Get unused indexes
    const indexStats = await this.getIndexStats();
    const unusedIndexes = indexStats
      .filter(stat => stat.index_scans < 10)
      .map(stat => ({
        type: 'unused_index',
        index: stat.indexname,
        suggestion: `Consider removing unused index ${stat.indexname}`
      }));

    recommendations.push(...unusedIndexes);

    return recommendations;
  }
}

module.exports = IndexOptimizer;