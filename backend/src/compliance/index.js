// Enterprise Compliance Framework Integration
// Central module that integrates all compliance components for government-grade deployment

const auditTrail = require('./auditTrail');
const regulatoryReporting = require('./regulatoryReporting');
const dataGovernance = require('./dataGovernance');
const complianceMonitoring = require('./complianceMonitoring');
const transactionSurveillance = require('./transactionSurveillance');

class ComplianceFramework {
  constructor() {
    this.components = {
      auditTrail,
      regulatoryReporting,
      dataGovernance,
      complianceMonitoring,
      transactionSurveillance
    };

    this.isInitialized = false;
    this.initializeFramework();
  }

  async initializeFramework() {
    try {
      console.log('🏛️ Initializing Enterprise Compliance Framework...');

      // Set up cross-component event handling
      this.setupEventHandling();

      // Initialize compliance middleware
      this.initializeMiddleware();

      // Start compliance monitoring
      await this.startMonitoring();

      this.isInitialized = true;
      console.log('✅ Enterprise Compliance Framework initialized');

    } catch (error) {
      console.error('❌ Compliance framework initialization failed:', error);
      throw error;
    }
  }

  setupEventHandling() {
    // Connect transaction surveillance to audit trail
    transactionSurveillance.on('surveillanceAlert', async (alert) => {
      await auditTrail.auditSecurityEvent({
        action: 'SURVEILLANCE_ALERT',
        threatType: alert.type,
        userId: alert.userId,
        severity: alert.severity,
        blocked: false,
        riskScore: alert.details.riskScore || 0
      });
    });

    // Connect data governance to audit trail
    dataGovernance.on('dataSubjectRequest', async (request) => {
      await auditTrail.auditDataAccess({
        action: `DATA_SUBJECT_REQUEST_${request.type}`,
        userId: request.subject,
        resource: 'personal_data',
        purpose: 'privacy_compliance',
        classification: 'CONFIDENTIAL'
      });
    });

    // Connect regulatory reporting to audit trail
    regulatoryReporting.on('reportGenerated', async (report) => {
      await auditTrail.auditComplianceEvent({
        action: 'REGULATORY_REPORT_GENERATED',
        reportType: report.reportType,
        framework: report.framework,
        jurisdiction: report.jurisdiction,
        userId: 'SYSTEM',
        filingId: report.reportId
      });
    });

    // Connect compliance monitoring to regulatory reporting
    complianceMonitoring.on('complianceViolation', async (violation) => {
      if (violation.severity === 'CRITICAL') {
        await regulatoryReporting.monitorReportableEvents({
          type: 'COMPLIANCE_VIOLATION',
          severity: violation.severity,
          details: violation
        });
      }
    });
  }

  initializeMiddleware() {
    // Transaction monitoring middleware
    this.transactionMiddleware = async (req, res, next) => {
      if (req.body && req.body.transaction) {
        try {
          const monitoring = await transactionSurveillance.monitorTransaction(req.body.transaction);
          req.surveillanceResult = monitoring;
        } catch (error) {
          console.error('Transaction surveillance failed:', error);
        }
      }
      next();
    };

    // Data governance middleware
    this.dataGovernanceMiddleware = async (req, res, next) => {
      if (req.body && typeof req.body === 'object') {
        try {
          const governance = await dataGovernance.applyGovernancePolicies(req.body, {
            userId: req.user?.id,
            ipAddress: req.ip,
            dataType: req.route?.path?.includes('transaction') ? 'transaction_data' : 'user_data',
            source: 'API_REQUEST'
          });
          req.dataGovernance = governance;
        } catch (error) {
          console.error('Data governance application failed:', error);
        }
      }
      next();
    };

    // Audit middleware
    this.auditMiddleware = async (req, res, next) => {
      const originalSend = res.send;
      res.send = function(data) {
        // Audit the API request/response
        auditTrail.recordAuditEvent({
          category: 'API_ACCESS',
          action: `${req.method}_${req.route?.path || req.path}`,
          userId: req.user?.id || 'ANONYMOUS',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          result: res.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
          metadata: {
            statusCode: res.statusCode,
            requestSize: JSON.stringify(req.body || {}).length,
            responseSize: JSON.stringify(data || {}).length
          }
        }).catch(error => {
          console.error('Audit logging failed:', error);
        });

        return originalSend.call(this, data);
      };
      next();
    };
  }

  async startMonitoring() {
    // Start compliance score monitoring
    setInterval(() => {
      complianceMonitoring.calculateComplianceScore().catch(error => {
        console.error('Compliance score calculation failed:', error);
      });
    }, 300000); // Every 5 minutes

    // Start data retention enforcement
    setInterval(() => {
      dataGovernance.enforceRetentionPolicies().catch(error => {
        console.error('Retention policy enforcement failed:', error);
      });
    }, 86400000); // Daily

    // Start audit trail integrity checks
    setInterval(() => {
      auditTrail.verifyIntegrity().catch(error => {
        console.error('Audit integrity verification failed:', error);
      });
    }, 3600000); // Hourly
  }

  // Process transaction with full compliance
  async processTransactionCompliance(transaction, context = {}) {
    const result = {
      transactionId: transaction.id,
      complianceStatus: 'COMPLIANT',
      checks: {},
      alerts: [],
      actions: []
    };

    try {
      // 1. Apply data governance
      const governance = await dataGovernance.applyGovernancePolicies(transaction, {
        dataType: 'transaction_data',
        userId: transaction.userId,
        ...context
      });
      result.checks.dataGovernance = governance;

      // 2. Monitor for surveillance patterns
      const surveillance = await transactionSurveillance.monitorTransaction(transaction);
      result.checks.surveillance = surveillance;

      // 3. Check for reportable events
      const reportableEvents = await regulatoryReporting.monitorReportableEvents(transaction);
      result.checks.reportableEvents = reportableEvents;

      // 4. Audit the transaction
      const auditId = await auditTrail.auditTransaction(transaction);
      result.checks.audit = { auditId };

      // 5. Assess overall compliance
      if (surveillance.riskScore > 80) {
        result.complianceStatus = 'HIGH_RISK';
        result.actions.push('ENHANCED_MONITORING');
      }

      if (reportableEvents.length > 0) {
        result.alerts = result.alerts.concat(reportableEvents);
        result.actions.push('REGULATORY_REPORTING');
      }

      return result;

    } catch (error) {
      console.error('Transaction compliance processing failed:', error);
      result.complianceStatus = 'PROCESSING_ERROR';
      result.error = error.message;
      return result;
    }
  }

  // Handle data subject privacy request
  async handlePrivacyRequest(request) {
    try {
      // Process through data governance
      const response = await dataGovernance.processDataSubjectRequest(request);

      // Generate compliance report if needed
      if (request.type === 'ACCESS' || request.type === 'PORTABILITY') {
        const report = await this.generatePrivacyComplianceReport(request.subjectId);
        response.complianceReport = report;
      }

      return response;

    } catch (error) {
      console.error('Privacy request handling failed:', error);
      throw error;
    }
  }

  // Generate regulatory compliance report
  async generateRegulatoryReport(framework, reportType, options = {}) {
    try {
      const report = await regulatoryReporting.generateReport(framework, reportType, options);

      // Add compliance context
      const complianceScore = await complianceMonitoring.calculateComplianceScore();
      report.complianceContext = {
        overallScore: complianceScore.score,
        status: complianceScore.status,
        generatedAt: new Date().toISOString()
      };

      return report;

    } catch (error) {
      console.error('Regulatory report generation failed:', error);
      throw error;
    }
  }

  // Generate privacy compliance report
  async generatePrivacyComplianceReport(subjectId, options = {}) {
    const report = {
      reportId: this.generateReportId(),
      subjectId,
      generatedAt: new Date().toISOString(),
      dataCategories: [],
      processingActivities: [],
      retentionPolicies: [],
      thirdPartySharing: [],
      userRights: {
        access: true,
        rectification: true,
        erasure: true,
        portability: true,
        restriction: true,
        objection: true
      }
    };

    // Get audit trail for user
    const auditEntries = await auditTrail.getAuditEntries({
      userId: subjectId,
      startDate: options.startDate,
      endDate: options.endDate
    });

    // Analyze data processing activities
    report.processingActivities = this.analyzeProcessingActivities(auditEntries);

    // Get retention policies
    report.retentionPolicies = Array.from(dataGovernance.retentionPolicies.entries());

    return report;
  }

  // Analyze processing activities from audit trail
  analyzeProcessingActivities(auditEntries) {
    const activities = new Map();

    auditEntries.forEach(entry => {
      const purpose = this.inferProcessingPurpose(entry.action);
      if (!activities.has(purpose)) {
        activities.set(purpose, {
          purpose,
          legalBasis: this.getLegalBasis(purpose),
          dataCategories: new Set(),
          frequency: 0,
          lastActivity: null
        });
      }

      const activity = activities.get(purpose);
      activity.frequency++;
      activity.lastActivity = entry.timestamp;

      if (entry.resource) {
        activity.dataCategories.add(entry.resource);
      }
    });

    return Array.from(activities.values()).map(activity => ({
      ...activity,
      dataCategories: Array.from(activity.dataCategories)
    }));
  }

  // Infer processing purpose from audit action
  inferProcessingPurpose(action) {
    if (action.includes('TRANSACTION')) {
      return 'Service Provision';
    }
    if (action.includes('AUTH')) {
      return 'Authentication';
    }
    if (action.includes('COMPLIANCE')) {
      return 'Legal Compliance';
    }
    if (action.includes('SECURITY')) {
      return 'Security';
    }
    return 'Other';
  }

  // Get legal basis for processing
  getLegalBasis(purpose) {
    const legalBases = {
      'Service Provision': 'Contract',
      'Authentication': 'Contract',
      'Legal Compliance': 'Legal Obligation',
      'Security': 'Legitimate Interest'
    };
    return legalBases[purpose] || 'Legitimate Interest';
  }

  // Get compliance dashboard data
  getComplianceDashboard() {
    return {
      framework: {
        version: '1.0',
        components: Object.keys(this.components),
        initialized: this.isInitialized
      },
      monitoring: complianceMonitoring.getComplianceSummary(),
      surveillance: transactionSurveillance.getStatistics(),
      audit: auditTrail.getStatistics(),
      dataGovernance: dataGovernance.getStatistics(),
      reporting: regulatoryReporting.getReportingStatus()
    };
  }

  // Get middleware functions
  getMiddleware() {
    return {
      transaction: this.transactionMiddleware,
      dataGovernance: this.dataGovernanceMiddleware,
      audit: this.auditMiddleware
    };
  }

  // Health check for compliance framework
  async performHealthCheck() {
    const health = {
      status: 'healthy',
      components: {},
      timestamp: new Date().toISOString()
    };

    try {
      // Check each component
      for (const [name, component] of Object.entries(this.components)) {
        if (component.getStatistics) {
          health.components[name] = {
            status: 'healthy',
            stats: component.getStatistics()
          };
        } else {
          health.components[name] = { status: 'healthy' };
        }
      }

      // Check compliance score
      const complianceScore = await complianceMonitoring.calculateComplianceScore();
      if (complianceScore.score < 85) {
        health.status = 'degraded';
        health.warnings = [`Low compliance score: ${complianceScore.score}`];
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    }

    return health;
  }

  // Generate report ID
  generateReportId() {
    return `COMP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
}

// Create singleton instance
const complianceFramework = new ComplianceFramework();

module.exports = {
  complianceFramework,

  // Export individual components
  auditTrail,
  regulatoryReporting,
  dataGovernance,
  complianceMonitoring,
  transactionSurveillance,

  // Export middleware
  middleware: complianceFramework.getMiddleware()
};