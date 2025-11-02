/**
 * Security Event Repository
 * Handles persistence of security events and incidents to database
 *
 * Supports:
 * - PostgreSQL (primary)
 * - MongoDB (alternative)
 * - SQLite (development/testing)
 */

const { logger } = require('../utils/productionLogger');

/**
 * Base Repository Interface
 */
class SecurityEventRepository {
  constructor(dbClient) {
    this.db = dbClient;
    this.tableName = 'security_events';
    this.incidentsTable = 'security_incidents';
    this.metricsTable = 'security_metrics';
  }

  /**
   * Initialize database schema
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Save security event
   */
  async saveEvent(event) {
    throw new Error('saveEvent() must be implemented by subclass');
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId) {
    throw new Error('getEvent() must be implemented by subclass');
  }

  /**
   * Query events with filters
   */
  async queryEvents(filters, options = {}) {
    throw new Error('queryEvents() must be implemented by subclass');
  }

  /**
   * Save incident
   */
  async saveIncident(incident) {
    throw new Error('saveIncident() must be implemented by subclass');
  }

  /**
   * Get incident by ID
   */
  async getIncident(incidentId) {
    throw new Error('getIncident() must be implemented by subclass');
  }

  /**
   * Update incident
   */
  async updateIncident(incidentId, updates) {
    throw new Error('updateIncident() must be implemented by subclass');
  }

  /**
   * Query incidents
   */
  async queryIncidents(filters, options = {}) {
    throw new Error('queryIncidents() must be implemented by subclass');
  }

  /**
   * Save metrics snapshot
   */
  async saveMetrics(metrics) {
    throw new Error('saveMetrics() must be implemented by subclass');
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(startTime, endTime) {
    throw new Error('getMetricsHistory() must be implemented by subclass');
  }

  /**
   * Delete old events (cleanup)
   */
  async deleteOldEvents(cutoffTimestamp) {
    throw new Error('deleteOldEvents() must be implemented by subclass');
  }

  /**
   * Get statistics
   */
  async getStatistics(timeRange) {
    throw new Error('getStatistics() must be implemented by subclass');
  }
}

/**
 * PostgreSQL Implementation
 */
class PostgresSecurityRepository extends SecurityEventRepository {
  constructor(pgClient) {
    super(pgClient);
  }

  /**
   * Initialize PostgreSQL schema
   */
  async initialize() {
    try {
      // Create security_events table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(100) NOT NULL,
          ip VARCHAR(45),
          method VARCHAR(10),
          path VARCHAR(2000),
          user_agent TEXT,
          timestamp BIGINT NOT NULL,
          headers JSONB,
          body_size INTEGER,
          request_id VARCHAR(255),
          response_time INTEGER,
          status_code INTEGER,
          response_size INTEGER,
          risk_score INTEGER DEFAULT 0,
          threat_level VARCHAR(20) DEFAULT 'LOW',
          indicators JSONB DEFAULT '[]',
          processed BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create indexes
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON ${this.tableName}(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_ip ON ${this.tableName}(ip);
        CREATE INDEX IF NOT EXISTS idx_events_type ON ${this.tableName}(type);
        CREATE INDEX IF NOT EXISTS idx_events_threat_level ON ${this.tableName}(threat_level);
        CREATE INDEX IF NOT EXISTS idx_events_processed ON ${this.tableName}(processed);
      `);

      // Create security_incidents table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.incidentsTable} (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          threat JSONB,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          assigned_to VARCHAR(255),
          actions JSONB DEFAULT '[]',
          notes JSONB DEFAULT '[]',
          resolved_at BIGINT,
          resolution_notes TEXT
        );
      `);

      // Create indexes for incidents
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_incidents_severity ON ${this.incidentsTable}(severity);
        CREATE INDEX IF NOT EXISTS idx_incidents_status ON ${this.incidentsTable}(status);
        CREATE INDEX IF NOT EXISTS idx_incidents_type ON ${this.incidentsTable}(type);
        CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON ${this.incidentsTable}(created_at);
      `);

      // Create security_metrics table (time-series data)
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.metricsTable} (
          id SERIAL PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          metric_type VARCHAR(100) NOT NULL,
          metric_value NUMERIC,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create hypertable for time-series (if TimescaleDB is available)
      try {
        await this.db.query(`
          SELECT create_hypertable('${this.metricsTable}', 'timestamp',
            chunk_time_interval => 86400000, -- 1 day chunks
            if_not_exists => TRUE
          );
        `);
        logger.info('TimescaleDB hypertable created for metrics');
      } catch (error) {
        // TimescaleDB not available, continue without it
        logger.info('TimescaleDB not available, using regular table');
      }

      // Create index for metrics
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON ${this.metricsTable}(timestamp);
        CREATE INDEX IF NOT EXISTS idx_metrics_type ON ${this.metricsTable}(metric_type);
      `);

      logger.info('PostgreSQL security repository initialized');
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL repository', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Save security event to PostgreSQL
   */
  async saveEvent(event) {
    try {
      const query = `
        INSERT INTO ${this.tableName} (
          id, type, ip, method, path, user_agent, timestamp,
          headers, body_size, request_id, response_time, status_code,
          response_size, risk_score, threat_level, indicators, processed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE SET
          response_time = EXCLUDED.response_time,
          status_code = EXCLUDED.status_code,
          response_size = EXCLUDED.response_size,
          risk_score = EXCLUDED.risk_score,
          threat_level = EXCLUDED.threat_level,
          processed = EXCLUDED.processed
      `;

      const values = [
        event.id,
        event.type,
        event.ip,
        event.method,
        event.path,
        event.userAgent,
        event.timestamp,
        JSON.stringify(event.headers || {}),
        event.bodySize || 0,
        event.requestId,
        event.responseTime,
        event.statusCode,
        event.responseSize,
        event.riskScore || 0,
        event.threatLevel || 'LOW',
        JSON.stringify(event.indicators || []),
        event.processed || false
      ];

      await this.db.query(query, values);
      return event.id;
    } catch (error) {
      logger.error('Failed to save event', {
        error: error.message,
        eventId: event.id
      });
      throw error;
    }
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId) {
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
      const result = await this.db.query(query, [eventId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.parseEvent(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get event', {
        error: error.message,
        eventId
      });
      throw error;
    }
  }

  /**
   * Query events with filters
   */
  async queryEvents(filters = {}, options = {}) {
    try {
      const { limit = 100, offset = 0, orderBy = 'timestamp', orderDir = 'DESC' } = options;

      let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
      const values = [];
      let paramCount = 1;

      // Apply filters
      if (filters.startTime) {
        query += ` AND timestamp >= $${paramCount}`;
        values.push(filters.startTime);
        paramCount++;
      }

      if (filters.endTime) {
        query += ` AND timestamp <= $${paramCount}`;
        values.push(filters.endTime);
        paramCount++;
      }

      if (filters.ip) {
        query += ` AND ip = $${paramCount}`;
        values.push(filters.ip);
        paramCount++;
      }

      if (filters.type) {
        query += ` AND type = $${paramCount}`;
        values.push(filters.type);
        paramCount++;
      }

      if (filters.threatLevel) {
        query += ` AND threat_level = $${paramCount}`;
        values.push(filters.threatLevel);
        paramCount++;
      }

      if (filters.minRiskScore) {
        query += ` AND risk_score >= $${paramCount}`;
        values.push(filters.minRiskScore);
        paramCount++;
      }

      // Add ordering and pagination
      query += ` ORDER BY ${orderBy} ${orderDir} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, offset);

      const result = await this.db.query(query, values);

      return result.rows.map(row => this.parseEvent(row));
    } catch (error) {
      logger.error('Failed to query events', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Save incident to PostgreSQL
   */
  async saveIncident(incident) {
    try {
      const query = `
        INSERT INTO ${this.incidentsTable} (
          id, type, severity, status, threat, created_at, updated_at,
          assigned_to, actions, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          assigned_to = EXCLUDED.assigned_to,
          actions = EXCLUDED.actions,
          notes = EXCLUDED.notes
      `;

      const values = [
        incident.id,
        incident.type,
        incident.severity,
        incident.status,
        JSON.stringify(incident.threat || {}),
        incident.createdAt,
        incident.updatedAt,
        incident.assignedTo,
        JSON.stringify(incident.actions || []),
        JSON.stringify(incident.notes || [])
      ];

      await this.db.query(query, values);
      return incident.id;
    } catch (error) {
      logger.error('Failed to save incident', {
        error: error.message,
        incidentId: incident.id
      });
      throw error;
    }
  }

  /**
   * Get incident by ID
   */
  async getIncident(incidentId) {
    try {
      const query = `SELECT * FROM ${this.incidentsTable} WHERE id = $1`;
      const result = await this.db.query(query, [incidentId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.parseIncident(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get incident', {
        error: error.message,
        incidentId
      });
      throw error;
    }
  }

  /**
   * Update incident
   */
  async updateIncident(incidentId, updates) {
    try {
      const setClauses = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        // Convert camelCase to snake_case
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

        if (typeof value === 'object') {
          setClauses.push(`${dbKey} = $${paramCount}::jsonb`);
          values.push(JSON.stringify(value));
        } else {
          setClauses.push(`${dbKey} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      });

      // Always update updated_at
      setClauses.push(`updated_at = $${paramCount}`);
      values.push(Date.now());
      paramCount++;

      // Add incident ID as last parameter
      values.push(incidentId);

      const query = `
        UPDATE ${this.incidentsTable}
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return this.parseIncident(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update incident', {
        error: error.message,
        incidentId,
        updates
      });
      throw error;
    }
  }

  /**
   * Query incidents
   */
  async queryIncidents(filters = {}, options = {}) {
    try {
      const { limit = 100, offset = 0, orderBy = 'created_at', orderDir = 'DESC' } = options;

      let query = `SELECT * FROM ${this.incidentsTable} WHERE 1=1`;
      const values = [];
      let paramCount = 1;

      // Apply filters
      if (filters.severity) {
        query += ` AND severity = $${paramCount}`;
        values.push(filters.severity);
        paramCount++;
      }

      if (filters.status) {
        query += ` AND status = $${paramCount}`;
        values.push(filters.status);
        paramCount++;
      }

      if (filters.type) {
        query += ` AND type = $${paramCount}`;
        values.push(filters.type);
        paramCount++;
      }

      if (filters.assignedTo) {
        query += ` AND assigned_to = $${paramCount}`;
        values.push(filters.assignedTo);
        paramCount++;
      }

      if (filters.startTime) {
        query += ` AND created_at >= $${paramCount}`;
        values.push(filters.startTime);
        paramCount++;
      }

      if (filters.endTime) {
        query += ` AND created_at <= $${paramCount}`;
        values.push(filters.endTime);
        paramCount++;
      }

      // Add ordering and pagination
      query += ` ORDER BY ${orderBy} ${orderDir} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, offset);

      const result = await this.db.query(query, values);

      return result.rows.map(row => this.parseIncident(row));
    } catch (error) {
      logger.error('Failed to query incidents', {
        error: error.message,
        filters
      });
      throw error;
    }
  }

  /**
   * Save metrics snapshot
   */
  async saveMetrics(metrics) {
    try {
      const queries = [];

      for (const [metricType, metricValue] of Object.entries(metrics)) {
        if (typeof metricValue === 'number') {
          queries.push({
            text: `
              INSERT INTO ${this.metricsTable} (timestamp, metric_type, metric_value, metadata)
              VALUES ($1, $2, $3, $4)
            `,
            values: [Date.now(), metricType, metricValue, JSON.stringify({})]
          });
        }
      }

      // Execute all queries in a transaction
      await this.db.query('BEGIN');
      for (const query of queries) {
        await this.db.query(query.text, query.values);
      }
      await this.db.query('COMMIT');

      return queries.length;
    } catch (error) {
      await this.db.query('ROLLBACK');
      logger.error('Failed to save metrics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(startTime, endTime, metricTypes = []) {
    try {
      let query = `
        SELECT timestamp, metric_type, metric_value, metadata
        FROM ${this.metricsTable}
        WHERE timestamp >= $1 AND timestamp <= $2
      `;
      const values = [startTime, endTime];

      if (metricTypes.length > 0) {
        query += ` AND metric_type = ANY($3)`;
        values.push(metricTypes);
      }

      query += ` ORDER BY timestamp ASC`;

      const result = await this.db.query(query, values);

      return result.rows.map(row => ({
        timestamp: parseInt(row.timestamp),
        metricType: row.metric_type,
        metricValue: parseFloat(row.metric_value),
        metadata: row.metadata
      }));
    } catch (error) {
      logger.error('Failed to get metrics history', {
        error: error.message,
        startTime,
        endTime
      });
      throw error;
    }
  }

  /**
   * Delete old events
   */
  async deleteOldEvents(cutoffTimestamp) {
    try {
      const query = `DELETE FROM ${this.tableName} WHERE timestamp < $1`;
      const result = await this.db.query(query, [cutoffTimestamp]);

      logger.info('Deleted old events', { count: result.rowCount });
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to delete old events', {
        error: error.message,
        cutoffTimestamp
      });
      throw error;
    }
  }

  /**
   * Get statistics for a time range
   */
  async getStatistics(timeRange = {}) {
    try {
      const { startTime = Date.now() - 86400000, endTime = Date.now() } = timeRange;

      const query = `
        SELECT
          COUNT(*) as total_events,
          COUNT(DISTINCT ip) as unique_ips,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count,
          COUNT(CASE WHEN threat_level = 'CRITICAL' THEN 1 END) as critical_threats,
          COUNT(CASE WHEN threat_level = 'HIGH' THEN 1 END) as high_threats,
          AVG(risk_score) as avg_risk_score
        FROM ${this.tableName}
        WHERE timestamp >= $1 AND timestamp <= $2
      `;

      const result = await this.db.query(query, [startTime, endTime]);
      const row = result.rows[0];

      return {
        totalEvents: parseInt(row.total_events),
        uniqueIPs: parseInt(row.unique_ips),
        avgResponseTime: parseFloat(row.avg_response_time) || 0,
        errorCount: parseInt(row.error_count),
        criticalThreats: parseInt(row.critical_threats),
        highThreats: parseInt(row.high_threats),
        avgRiskScore: parseFloat(row.avg_risk_score) || 0,
        timeRange: { startTime, endTime }
      };
    } catch (error) {
      logger.error('Failed to get statistics', {
        error: error.message,
        timeRange
      });
      throw error;
    }
  }

  /**
   * Parse database row to event object
   */
  parseEvent(row) {
    return {
      id: row.id,
      type: row.type,
      ip: row.ip,
      method: row.method,
      path: row.path,
      userAgent: row.user_agent,
      timestamp: parseInt(row.timestamp),
      headers: row.headers,
      bodySize: row.body_size,
      requestId: row.request_id,
      responseTime: row.response_time,
      statusCode: row.status_code,
      responseSize: row.response_size,
      riskScore: row.risk_score,
      threatLevel: row.threat_level,
      indicators: row.indicators,
      processed: row.processed
    };
  }

  /**
   * Parse database row to incident object
   */
  parseIncident(row) {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      threat: row.threat,
      createdAt: parseInt(row.created_at),
      updatedAt: parseInt(row.updated_at),
      assignedTo: row.assigned_to,
      actions: row.actions,
      notes: row.notes,
      resolvedAt: row.resolved_at ? parseInt(row.resolved_at) : null,
      resolutionNotes: row.resolution_notes
    };
  }
}

module.exports = {
  SecurityEventRepository,
  PostgresSecurityRepository
};
