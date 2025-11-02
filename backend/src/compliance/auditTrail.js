// Enterprise Audit Trail System
// Provides comprehensive audit logging for regulatory compliance

const EventEmitter = require('events');
const crypto = require('crypto');

class AuditTrailSystem extends EventEmitter {
  constructor() {
    super();

    this.auditBuffer = [];
    this.bufferSize = 1000;
    this.flushInterval = 5000; // 5 seconds

    // Audit categories
    this.categories = {
      AUTHENTICATION: 'AUTH',
      TRANSACTION: 'TXN',
      CONFIGURATION: 'CONFIG',
      SECURITY: 'SEC',
      DATA_ACCESS: 'DATA',
      ADMIN_ACTION: 'ADMIN',
      COMPLIANCE: 'COMP',
      SYSTEM: 'SYS'
    };

    // Severity levels
    this.severity = {
      INFO: 1,
      WARNING: 2,
      ERROR: 3,
      CRITICAL: 4
    };

    // Initialize retention policies
    this.retentionPolicies = new Map([
      ['TRANSACTION', 7 * 365], // 7 years for transactions
      ['COMPLIANCE', 7 * 365],  // 7 years for compliance
      ['AUTHENTICATION', 365],   // 1 year for auth
      ['SECURITY', 3 * 365],    // 3 years for security
      ['DEFAULT', 90]           // 90 days default
    ]);

    this.startFlushTimer();
  }

  // Record audit event with immutable hash
  async recordAuditEvent(event) {
    const auditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date().toISOString(),
      category: event.category || this.categories.SYSTEM,
      severity: event.severity || this.severity.INFO,
      userId: event.userId || 'SYSTEM',
      sessionId: event.sessionId || null,
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
      action: event.action,
      resource: event.resource || null,
      oldValue: event.oldValue || null,
      newValue: event.newValue || null,
      result: event.result || 'SUCCESS',
      errorMessage: event.errorMessage || null,
      metadata: event.metadata || {},

      // Compliance fields
      jurisdiction: event.jurisdiction || null,
      regulatoryFramework: event.regulatoryFramework || null,
      dataClassification: event.dataClassification || 'PUBLIC',

      // Security fields
      riskScore: event.riskScore || 0,
      anomalyDetected: event.anomalyDetected || false,

      // Integrity fields
      previousHash: this.lastHash || null,
      hash: null
    };

    // Generate cryptographic hash for integrity
    auditEntry.hash = this.generateHash(auditEntry);
    this.lastHash = auditEntry.hash;

    // Add to buffer
    this.auditBuffer.push(auditEntry);

    // Emit for real-time monitoring
    this.emit('auditRecorded', auditEntry);

    // Check if immediate flush needed
    if (auditEntry.severity >= this.severity.ERROR) {
      await this.flushAuditBuffer();
    } else if (this.auditBuffer.length >= this.bufferSize) {
      await this.flushAuditBuffer();
    }

    return auditEntry.id;
  }

  // Generate unique audit ID
  generateAuditId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `AUDIT-${timestamp}-${random}`.toUpperCase();
  }

  // Generate cryptographic hash for integrity verification
  generateHash(entry) {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      category: entry.category,
      action: entry.action,
      userId: entry.userId,
      result: entry.result,
      previousHash: entry.previousHash
    });

    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  // Verify audit trail integrity
  async verifyIntegrity(startId, endId) {
    try {
      const entries = await this.getAuditEntries({
        startId,
        endId,
        includeHash: true
      });

      let previousHash = null;
      const results = [];

      for (const entry of entries) {
        const expectedHash = this.generateHash({
          ...entry,
          hash: null,
          previousHash
        });

        const isValid = entry.hash === expectedHash;

        results.push({
          id: entry.id,
          timestamp: entry.timestamp,
          isValid,
          expectedHash,
          actualHash: entry.hash
        });

        if (!isValid) {
          this.emit('integrityViolation', {
            entryId: entry.id,
            message: 'Hash mismatch detected'
          });
        }

        previousHash = entry.hash;
      }

      return {
        verified: results.every(r => r.isValid),
        totalEntries: results.length,
        validEntries: results.filter(r => r.isValid).length,
        results
      };

    } catch (error) {
      console.error('Integrity verification failed:', error);
      throw error;
    }
  }

  // Transaction audit helper
  async auditTransaction(transaction) {
    return this.recordAuditEvent({
      category: this.categories.TRANSACTION,
      action: `TRANSACTION_${transaction.type.toUpperCase()}`,
      userId: transaction.userId,
      resource: `${transaction.fromAsset}/${transaction.toAsset}`,
      metadata: {
        transactionId: transaction.id,
        amount: transaction.amount,
        price: transaction.price,
        fee: transaction.fee,
        slippage: transaction.slippage,
        executionTime: transaction.executionTime
      },
      result: transaction.status,
      jurisdiction: transaction.jurisdiction,
      dataClassification: 'CONFIDENTIAL'
    });
  }

  // Authentication audit helper
  async auditAuthentication(authEvent) {
    return this.recordAuditEvent({
      category: this.categories.AUTHENTICATION,
      severity: authEvent.success ? this.severity.INFO : this.severity.WARNING,
      action: authEvent.action,
      userId: authEvent.userId || authEvent.email,
      ipAddress: authEvent.ipAddress,
      userAgent: authEvent.userAgent,
      result: authEvent.success ? 'SUCCESS' : 'FAILURE',
      metadata: {
        authMethod: authEvent.method,
        mfaUsed: authEvent.mfaUsed,
        deviceTrusted: authEvent.deviceTrusted,
        loginAttempt: authEvent.attemptNumber
      },
      riskScore: authEvent.riskScore || 0,
      anomalyDetected: authEvent.anomalyDetected || false
    });
  }

  // Security event audit helper
  async auditSecurityEvent(securityEvent) {
    return this.recordAuditEvent({
      category: this.categories.SECURITY,
      severity: securityEvent.severity || this.severity.WARNING,
      action: securityEvent.action,
      userId: securityEvent.userId,
      resource: securityEvent.resource,
      metadata: {
        threatType: securityEvent.threatType,
        attackVector: securityEvent.attackVector,
        blocked: securityEvent.blocked,
        countermeasures: securityEvent.countermeasures
      },
      riskScore: securityEvent.riskScore,
      anomalyDetected: true
    });
  }

  // Data access audit helper
  async auditDataAccess(accessEvent) {
    return this.recordAuditEvent({
      category: this.categories.DATA_ACCESS,
      action: accessEvent.action,
      userId: accessEvent.userId,
      resource: accessEvent.resource,
      metadata: {
        recordsAccessed: accessEvent.recordCount,
        fields: accessEvent.fields,
        purpose: accessEvent.purpose,
        exportFormat: accessEvent.exportFormat
      },
      dataClassification: accessEvent.classification,
      jurisdiction: accessEvent.jurisdiction
    });
  }

  // Configuration change audit helper
  async auditConfigChange(configEvent) {
    return this.recordAuditEvent({
      category: this.categories.CONFIGURATION,
      severity: this.severity.WARNING,
      action: 'CONFIG_CHANGE',
      userId: configEvent.userId,
      resource: configEvent.setting,
      oldValue: configEvent.oldValue,
      newValue: configEvent.newValue,
      metadata: {
        reason: configEvent.reason,
        approvedBy: configEvent.approvedBy,
        changeTicket: configEvent.ticketId
      }
    });
  }

  // Compliance audit helper
  async auditComplianceEvent(complianceEvent) {
    return this.recordAuditEvent({
      category: this.categories.COMPLIANCE,
      action: complianceEvent.action,
      userId: complianceEvent.userId,
      metadata: {
        reportType: complianceEvent.reportType,
        regulatoryBody: complianceEvent.regulatoryBody,
        filingId: complianceEvent.filingId,
        deadline: complianceEvent.deadline
      },
      jurisdiction: complianceEvent.jurisdiction,
      regulatoryFramework: complianceEvent.framework,
      result: complianceEvent.status
    });
  }

  // Query audit entries
  async getAuditEntries(filters = {}) {
    // This would query from database in production
    // Placeholder for demonstration
    const entries = this.auditBuffer.filter(entry => {
      if (filters.category && entry.category !== filters.category) {
        return false;
      }
      if (filters.userId && entry.userId !== filters.userId) {
        return false;
      }
      if (filters.startDate && new Date(entry.timestamp) < new Date(filters.startDate)) {
        return false;
      }
      if (filters.endDate && new Date(entry.timestamp) > new Date(filters.endDate)) {
        return false;
      }
      if (filters.severity && entry.severity < filters.severity) {
        return false;
      }
      return true;
    });

    return entries;
  }

  // Generate audit report
  async generateAuditReport(options = {}) {
    const entries = await this.getAuditEntries(options.filters || {});

    const report = {
      generatedAt: new Date().toISOString(),
      reportId: this.generateAuditId().replace('AUDIT', 'REPORT'),
      period: {
        start: options.startDate,
        end: options.endDate
      },
      summary: {
        totalEntries: entries.length,
        byCategory: {},
        bySeverity: {},
        byUser: {},
        byResult: {}
      },
      entries: options.includeDetails ? entries : [],
      compliance: {
        jurisdiction: options.jurisdiction,
        framework: options.regulatoryFramework,
        attestation: options.attestation || null
      }
    };

    // Calculate summary statistics
    entries.forEach(entry => {
      // By category
      report.summary.byCategory[entry.category] =
        (report.summary.byCategory[entry.category] || 0) + 1;

      // By severity
      const severityName = Object.keys(this.severity).find(
        key => this.severity[key] === entry.severity
      );
      report.summary.bySeverity[severityName] =
        (report.summary.bySeverity[severityName] || 0) + 1;

      // By user
      if (entry.userId !== 'SYSTEM') {
        report.summary.byUser[entry.userId] =
          (report.summary.byUser[entry.userId] || 0) + 1;
      }

      // By result
      report.summary.byResult[entry.result] =
        (report.summary.byResult[entry.result] || 0) + 1;
    });

    // Sign report for integrity
    report.signature = this.generateHash(report);

    // Record report generation
    await this.recordAuditEvent({
      category: this.categories.COMPLIANCE,
      action: 'AUDIT_REPORT_GENERATED',
      userId: options.requestedBy || 'SYSTEM',
      metadata: {
        reportId: report.reportId,
        entriesIncluded: report.summary.totalEntries,
        jurisdiction: options.jurisdiction
      }
    });

    return report;
  }

  // Data retention management
  async enforceRetentionPolicies() {
    const now = new Date();
    const policiesEnforced = [];

    for (const [category, retentionDays] of this.retentionPolicies) {
      const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

      // In production, this would delete from database
      const beforeCount = this.auditBuffer.length;
      this.auditBuffer = this.auditBuffer.filter(entry => {
        if (entry.category === category || (category === 'DEFAULT' && !this.retentionPolicies.has(entry.category))) {
          return new Date(entry.timestamp) > cutoffDate;
        }
        return true;
      });

      const deletedCount = beforeCount - this.auditBuffer.length;

      if (deletedCount > 0) {
        policiesEnforced.push({
          category,
          retentionDays,
          cutoffDate,
          entriesDeleted: deletedCount
        });
      }
    }

    // Audit the retention enforcement
    if (policiesEnforced.length > 0) {
      await this.recordAuditEvent({
        category: this.categories.SYSTEM,
        action: 'RETENTION_POLICY_ENFORCED',
        metadata: {
          policiesEnforced,
          totalDeleted: policiesEnforced.reduce((sum, p) => sum + p.entriesDeleted, 0)
        }
      });
    }

    return policiesEnforced;
  }

  // Export audit data for regulatory filing
  async exportForRegulatory(options) {
    const entries = await this.getAuditEntries(options.filters || {});

    const exportData = {
      exportId: this.generateAuditId().replace('AUDIT', 'EXPORT'),
      exportDate: new Date().toISOString(),
      jurisdiction: options.jurisdiction,
      regulatoryBody: options.regulatoryBody,
      framework: options.framework,
      period: {
        start: options.startDate,
        end: options.endDate
      },
      dataClassification: 'REGULATORY_FILING',
      entries: entries.map(entry => {
        // Redact sensitive information if needed
        const exportEntry = { ...entry };

        if (options.redactSensitive) {
          delete exportEntry.ipAddress;
          delete exportEntry.userAgent;
          if (exportEntry.metadata) {
            delete exportEntry.metadata.internalIds;
          }
        }

        return exportEntry;
      }),
      attestation: {
        preparedBy: options.preparedBy,
        reviewedBy: options.reviewedBy,
        approvedBy: options.approvedBy,
        certificationStatement: options.certificationStatement
      },
      integrityHash: null
    };

    // Generate integrity hash
    exportData.integrityHash = this.generateHash(exportData);

    // Record the export
    await this.recordAuditEvent({
      category: this.categories.COMPLIANCE,
      action: 'REGULATORY_EXPORT',
      userId: options.preparedBy,
      metadata: {
        exportId: exportData.exportId,
        jurisdiction: options.jurisdiction,
        regulatoryBody: options.regulatoryBody,
        entriesExported: exportData.entries.length
      }
    });

    return exportData;
  }

  // Flush audit buffer to persistent storage
  async flushAuditBuffer() {
    if (this.auditBuffer.length === 0) {
      return;
    }

    // Move entriesToFlush to outer scope
    const entriesToFlush = [...this.auditBuffer];
    this.auditBuffer = [];

    try {
      // In production, this would write to database
      // Simulate database write
      console.log(`Flushing ${entriesToFlush.length} audit entries to storage`);

      this.emit('bufferFlushed', {
        count: entriesToFlush.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to flush audit buffer:', error);
      // Re-add entries to buffer on failure
      this.auditBuffer.unshift(...entriesToFlush);
      throw error;
    }
  }

  // Start flush timer
  startFlushTimer() {
    setInterval(() => {
      this.flushAuditBuffer().catch(error => {
        console.error('Scheduled flush failed:', error);
      });
    }, this.flushInterval);

    // Also flush on process exit
    process.on('beforeExit', () => {
      this.flushAuditBuffer();
    });
  }

  // Get audit statistics
  getStatistics() {
    const stats = {
      bufferSize: this.auditBuffer.length,
      categories: {},
      severities: {},
      recentEvents: []
    };

    this.auditBuffer.forEach(entry => {
      stats.categories[entry.category] = (stats.categories[entry.category] || 0) + 1;

      const severityName = Object.keys(this.severity).find(
        key => this.severity[key] === entry.severity
      );
      stats.severities[severityName] = (stats.severities[severityName] || 0) + 1;
    });

    // Get last 10 events
    stats.recentEvents = this.auditBuffer.slice(-10).map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      category: entry.category,
      action: entry.action,
      userId: entry.userId,
      result: entry.result
    }));

    return stats;
  }
}

// Create singleton instance
const auditTrail = new AuditTrailSystem();

module.exports = auditTrail;