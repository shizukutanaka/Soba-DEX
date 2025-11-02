// Enterprise Data Governance and Privacy Framework
// Comprehensive data management, retention, and privacy controls

const EventEmitter = require('events');
const crypto = require('crypto');
const auditTrail = require('./auditTrail');

class DataGovernanceFramework extends EventEmitter {
  constructor() {
    super();

    // Data classification levels
    this.dataClassifications = {
      PUBLIC: { level: 1, encryption: false, retention: 90 },
      INTERNAL: { level: 2, encryption: false, retention: 365 },
      CONFIDENTIAL: { level: 3, encryption: true, retention: 3 * 365 },
      RESTRICTED: { level: 4, encryption: true, retention: 7 * 365 },
      SECRET: { level: 5, encryption: true, retention: 10 * 365 }
    };

    // Privacy regulations compliance
    this.privacyFrameworks = {
      GDPR: {
        name: 'General Data Protection Regulation',
        jurisdiction: 'EU',
        requirements: ['consent', 'right_to_erasure', 'data_portability', 'breach_notification']
      },
      CCPA: {
        name: 'California Consumer Privacy Act',
        jurisdiction: 'US-CA',
        requirements: ['opt_out', 'data_disclosure', 'deletion_rights']
      },
      PIPEDA: {
        name: 'Personal Information Protection and Electronic Documents Act',
        jurisdiction: 'CA',
        requirements: ['consent', 'access_rights', 'challenge_compliance']
      },
      LGPD: {
        name: 'Lei Geral de Proteção de Dados',
        jurisdiction: 'BR',
        requirements: ['consent', 'data_portability', 'deletion_rights']
      }
    };

    // Data lifecycle states
    this.dataLifecycle = {
      CREATED: 'created',
      ACTIVE: 'active',
      ARCHIVED: 'archived',
      RETENTION_HOLD: 'retention_hold',
      MARKED_FOR_DELETION: 'marked_for_deletion',
      DELETED: 'deleted'
    };

    // Data retention policies by type
    this.retentionPolicies = new Map([
      ['transaction_data', { days: 7 * 365, classification: 'CONFIDENTIAL' }],
      ['user_profile', { days: 365, classification: 'CONFIDENTIAL' }],
      ['audit_logs', { days: 7 * 365, classification: 'RESTRICTED' }],
      ['system_logs', { days: 90, classification: 'INTERNAL' }],
      ['marketing_data', { days: 365, classification: 'INTERNAL' }],
      ['compliance_reports', { days: 10 * 365, classification: 'RESTRICTED' }],
      ['financial_records', { days: 7 * 365, classification: 'CONFIDENTIAL' }],
      ['kyc_documents', { days: 5 * 365, classification: 'RESTRICTED' }]
    ]);

    // Data access controls
    this.accessControls = new Map();

    // Data lineage tracking
    this.dataLineage = new Map();

    // Consent management
    this.consentRecords = new Map();

    // Initialize governance processes
    this.initializeGovernance();
  }

  initializeGovernance() {
    // Start retention policy enforcement
    setInterval(() => {
      this.enforceRetentionPolicies();
    }, 24 * 60 * 60 * 1000); // Daily

    // Start data quality checks
    setInterval(() => {
      this.performDataQualityChecks();
    }, 60 * 60 * 1000); // Hourly
  }

  // Classify data based on content and type
  classifyData(data, metadata = {}) {
    let classification = 'PUBLIC';

    // Check for PII (Personally Identifiable Information)
    if (this.containsPII(data)) {
      classification = 'CONFIDENTIAL';
    }

    // Check for financial data
    if (this.containsFinancialData(data)) {
      classification = 'CONFIDENTIAL';
    }

    // Check for authentication/security data
    if (this.containsSecurityData(data)) {
      classification = 'SECRET';
    }

    // Check metadata for explicit classification
    if (metadata.classification && this.dataClassifications[metadata.classification]) {
      classification = metadata.classification;
    }

    // Check data type specific rules
    if (metadata.dataType) {
      const policy = this.retentionPolicies.get(metadata.dataType);
      if (policy && policy.classification) {
        classification = policy.classification;
      }
    }

    return {
      classification,
      level: this.dataClassifications[classification].level,
      requiresEncryption: this.dataClassifications[classification].encryption,
      retentionDays: this.dataClassifications[classification].retention
    };
  }

  // Check for PII in data
  containsPII(data) {
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
      /\b\d{10,15}\b/, // Phone number
      /\b(passport|license|ssn|tax\s?id)\b/i // Identity document references
    ];

    const dataStr = JSON.stringify(data).toLowerCase();
    return piiPatterns.some(pattern => pattern.test(dataStr));
  }

  // Check for financial data
  containsFinancialData(data) {
    const financialKeywords = [
      'account_number', 'balance', 'transaction', 'payment',
      'wallet', 'private_key', 'seed_phrase', 'bank'
    ];

    const dataStr = JSON.stringify(data).toLowerCase();
    return financialKeywords.some(keyword => dataStr.includes(keyword));
  }

  // Check for security data
  containsSecurityData(data) {
    const securityKeywords = [
      'password', 'secret', 'key', 'token', 'credential',
      'auth', 'certificate', 'signature'
    ];

    const dataStr = JSON.stringify(data).toLowerCase();
    return securityKeywords.some(keyword => dataStr.includes(keyword));
  }

  // Apply data governance policies
  async applyGovernancePolicies(data, context = {}) {
    const governance = {
      dataId: this.generateDataId(),
      timestamp: new Date().toISOString(),
      classification: this.classifyData(data, context),
      lifecycle: this.dataLifecycle.CREATED,
      retention: null,
      access: null,
      lineage: null
    };

    // Determine retention policy
    governance.retention = this.determineRetentionPolicy(data, context);

    // Set access controls
    governance.access = this.setAccessControls(governance.classification, context);

    // Initialize data lineage
    governance.lineage = this.initializeDataLineage(governance.dataId, context);

    // Apply encryption if required
    if (governance.classification.requiresEncryption) {
      data = await this.encryptSensitiveData(data);
    }

    // Record in audit trail
    await auditTrail.recordAuditEvent({
      category: 'DATA_ACCESS',
      action: 'DATA_GOVERNANCE_APPLIED',
      resource: governance.dataId,
      metadata: {
        classification: governance.classification.classification,
        retention: governance.retention,
        encrypted: governance.classification.requiresEncryption
      }
    });

    return governance;
  }

  // Determine retention policy
  determineRetentionPolicy(data, context) {
    let retentionDays = 90; // Default

    // Check for specific data type
    if (context.dataType) {
      const policy = this.retentionPolicies.get(context.dataType);
      if (policy) {
        retentionDays = policy.days;
      }
    }

    // Check for regulatory requirements
    if (context.jurisdiction) {
      const regulatoryRetention = this.getRegulatoryRetentionRequirement(context.jurisdiction, context.dataType);
      if (regulatoryRetention > retentionDays) {
        retentionDays = regulatoryRetention;
      }
    }

    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + retentionDays);

    return {
      days: retentionDays,
      expirationDate: retentionDate.toISOString(),
      legalHold: context.legalHold || false,
      reason: context.retentionReason || 'Standard policy'
    };
  }

  // Get regulatory retention requirement
  getRegulatoryRetentionRequirement(jurisdiction, dataType) {
    const requirements = {
      'US': {
        'transaction_data': 7 * 365,
        'audit_logs': 7 * 365,
        'financial_records': 7 * 365
      },
      'EU': {
        'transaction_data': 5 * 365,
        'user_profile': 3 * 365,
        'audit_logs': 5 * 365
      }
    };

    if (requirements[jurisdiction] && requirements[jurisdiction][dataType]) {
      return requirements[jurisdiction][dataType];
    }

    return 365; // Default 1 year
  }

  // Set access controls based on classification
  setAccessControls(classification, context) {
    const controls = {
      classification: classification.classification,
      level: classification.level,
      allowedRoles: [],
      deniedRoles: [],
      requiresMFA: false,
      requiresApproval: false,
      accessLog: true
    };

    // Set role-based access based on classification
    switch (classification.classification) {
    case 'PUBLIC':
      controls.allowedRoles = ['*'];
      controls.accessLog = false;
      break;

    case 'INTERNAL':
      controls.allowedRoles = ['employee', 'admin', 'auditor'];
      break;

    case 'CONFIDENTIAL':
      controls.allowedRoles = ['admin', 'compliance', 'auditor'];
      controls.requiresMFA = true;
      break;

    case 'RESTRICTED':
      controls.allowedRoles = ['admin', 'compliance'];
      controls.requiresMFA = true;
      controls.requiresApproval = true;
      break;

    case 'SECRET':
      controls.allowedRoles = ['security_admin'];
      controls.requiresMFA = true;
      controls.requiresApproval = true;
      break;
    }

    // Apply context-specific overrides
    if (context.allowedRoles) {
      controls.allowedRoles = context.allowedRoles;
    }

    if (context.requiresMFA !== undefined) {
      controls.requiresMFA = context.requiresMFA;
    }

    return controls;
  }

  // Initialize data lineage tracking
  initializeDataLineage(dataId, context) {
    const lineage = {
      dataId,
      created: new Date().toISOString(),
      source: context.source || 'SYSTEM',
      transformations: [],
      accesses: [],
      derivatives: []
    };

    this.dataLineage.set(dataId, lineage);

    return lineage;
  }

  // Track data transformation
  async trackDataTransformation(dataId, transformation) {
    const lineage = this.dataLineage.get(dataId);

    if (lineage) {
      lineage.transformations.push({
        timestamp: new Date().toISOString(),
        operation: transformation.operation,
        actor: transformation.actor,
        purpose: transformation.purpose,
        resultDataId: transformation.resultDataId || null
      });

      // If new data was created, initialize its lineage
      if (transformation.resultDataId) {
        const newLineage = {
          ...lineage,
          dataId: transformation.resultDataId,
          parent: dataId,
          created: new Date().toISOString()
        };
        this.dataLineage.set(transformation.resultDataId, newLineage);
      }
    }

    // Audit the transformation
    await auditTrail.recordAuditEvent({
      category: 'DATA_ACCESS',
      action: 'DATA_TRANSFORMATION',
      resource: dataId,
      metadata: transformation
    });
  }

  // Process data subject request (GDPR/CCPA)
  async processDataSubjectRequest(request) {
    const response = {
      requestId: this.generateRequestId(),
      type: request.type,
      subject: request.subjectId,
      status: 'PROCESSING',
      processedAt: new Date().toISOString(),
      result: null
    };

    try {
      switch (request.type) {
      case 'ACCESS':
        response.result = await this.handleAccessRequest(request);
        break;

      case 'PORTABILITY':
        response.result = await this.handlePortabilityRequest(request);
        break;

      case 'ERASURE':
        response.result = await this.handleErasureRequest(request);
        break;

      case 'RECTIFICATION':
        response.result = await this.handleRectificationRequest(request);
        break;

      case 'RESTRICTION':
        response.result = await this.handleRestrictionRequest(request);
        break;

      default:
        throw new Error(`Unsupported request type: ${request.type}`);
      }

      response.status = 'COMPLETED';

      // Audit the request
      await auditTrail.recordAuditEvent({
        category: 'COMPLIANCE',
        action: `DATA_SUBJECT_REQUEST_${request.type}`,
        userId: request.subjectId,
        metadata: {
          requestId: response.requestId,
          type: request.type,
          status: response.status
        }
      });

    } catch (error) {
      response.status = 'FAILED';
      response.error = error.message;

      console.error('Data subject request failed:', error);
    }

    this.emit('dataSubjectRequest', response);

    return response;
  }

  // Handle data access request
  async handleAccessRequest(_request) {
    // In production, this would query all data related to the subject
    return {
      dataCategories: ['profile', 'transactions', 'preferences'],
      processingPurposes: ['service_provision', 'compliance', 'analytics'],
      retention: '7 years for transactions, 1 year for logs',
      recipients: ['internal_systems', 'regulatory_bodies'],
      dataCollected: {
        profile: {
          name: 'REDACTED',
          email: 'REDACTED',
          created: '2024-01-01'
        },
        transactions: 'Summary available upon request',
        preferences: {
          notifications: true,
          marketing: false
        }
      }
    };
  }

  // Handle data portability request
  async handlePortabilityRequest(request) {
    const data = await this.handleAccessRequest(request);

    return {
      format: request.format || 'JSON',
      data: data.dataCollected,
      downloadUrl: `/api/privacy/download/${request.subjectId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }

  // Handle erasure request (right to be forgotten)
  async handleErasureRequest(request) {
    // Check for legal holds or regulatory requirements
    const canErase = await this.checkErasureEligibility(request.subjectId);

    if (!canErase.eligible) {
      return {
        erased: false,
        reason: canErase.reason,
        alternativeAction: 'Data anonymized instead of deleted'
      };
    }

    // In production, this would delete or anonymize data
    return {
      erased: true,
      dataCategories: ['profile', 'preferences'],
      retainedData: ['transactions (anonymized)', 'audit_logs (legal requirement)'],
      completionDate: new Date().toISOString()
    };
  }

  // Check erasure eligibility
  async checkErasureEligibility(_subjectId) {
    // Check for legal holds
    // Check for regulatory retention requirements
    // Check for legitimate interests

    return {
      eligible: true,
      reason: null
    };
  }

  // Handle rectification request
  async handleRectificationRequest(request) {
    return {
      rectified: true,
      fields: request.corrections,
      previousValues: 'Stored in audit log',
      verificationRequired: request.verificationRequired || false
    };
  }

  // Handle restriction request
  async handleRestrictionRequest(request) {
    return {
      restricted: true,
      categories: request.categories,
      duration: request.duration || 'Until further notice',
      allowedPurposes: ['legal_compliance']
    };
  }

  // Manage consent records
  async recordConsent(consent) {
    const consentRecord = {
      id: this.generateConsentId(),
      subjectId: consent.subjectId,
      timestamp: new Date().toISOString(),
      purposes: consent.purposes,
      granted: consent.granted,
      version: consent.version || '1.0',
      expiresAt: consent.expiresAt || null,
      withdrawable: true,
      source: consent.source || 'WEB',
      ipAddress: consent.ipAddress,
      metadata: consent.metadata || {}
    };

    this.consentRecords.set(consentRecord.id, consentRecord);

    // Audit consent
    await auditTrail.recordAuditEvent({
      category: 'COMPLIANCE',
      action: 'CONSENT_RECORDED',
      userId: consent.subjectId,
      metadata: {
        consentId: consentRecord.id,
        purposes: consent.purposes,
        granted: consent.granted
      }
    });

    return consentRecord;
  }

  // Withdraw consent
  async withdrawConsent(subjectId, purposes = []) {
    const withdrawals = [];

    for (const [_id, record] of this.consentRecords) {
      if (record.subjectId === subjectId) {
        if (purposes.length === 0 || purposes.some(p => record.purposes.includes(p))) {
          record.granted = false;
          record.withdrawnAt = new Date().toISOString();
          withdrawals.push(record);
        }
      }
    }

    // Audit withdrawal
    await auditTrail.recordAuditEvent({
      category: 'COMPLIANCE',
      action: 'CONSENT_WITHDRAWN',
      userId: subjectId,
      metadata: {
        purposes,
        withdrawnCount: withdrawals.length
      }
    });

    return withdrawals;
  }

  // Data quality checks
  async performDataQualityChecks() {
    const issues = [];

    // Check for incomplete data
    // Check for inconsistent data
    // Check for outdated data
    // Check for duplicate data

    if (issues.length > 0) {
      this.emit('dataQualityIssues', issues);

      await auditTrail.recordAuditEvent({
        category: 'SYSTEM',
        action: 'DATA_QUALITY_CHECK',
        metadata: {
          issuesFound: issues.length,
          categories: [...new Set(issues.map(i => i.category))]
        }
      });
    }

    return issues;
  }

  // Enforce retention policies
  async enforceRetentionPolicies() {
    const now = new Date();
    let deletedCount = 0;

    // In production, this would query and delete from database
    for (const [dataId, metadata] of this.dataLineage) {
      if (metadata.retention && new Date(metadata.retention.expirationDate) <= now) {
        if (!metadata.retention.legalHold) {
          // Delete or anonymize data
          this.dataLineage.delete(dataId);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      await auditTrail.recordAuditEvent({
        category: 'SYSTEM',
        action: 'RETENTION_POLICY_ENFORCED',
        metadata: {
          deletedCount,
          timestamp: now.toISOString()
        }
      });
    }

    return deletedCount;
  }

  // Encrypt sensitive data
  async encryptSensitiveData(data) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-for-development-only', 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted: true,
      algorithm,
      data: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  // Generate unique IDs
  generateDataId() {
    return `DATA-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  generateRequestId() {
    return `DSR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  generateConsentId() {
    return `CONSENT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // Get governance statistics
  getStatistics() {
    return {
      dataClassifications: Object.keys(this.dataClassifications),
      retentionPolicies: Array.from(this.retentionPolicies.keys()),
      dataLineageCount: this.dataLineage.size,
      consentRecords: this.consentRecords.size,
      privacyFrameworks: Object.keys(this.privacyFrameworks)
    };
  }
}

// Create singleton instance
const dataGovernance = new DataGovernanceFramework();

module.exports = dataGovernance;