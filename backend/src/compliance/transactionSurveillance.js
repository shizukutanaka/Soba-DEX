// Enterprise Transaction Surveillance System
// Real-time transaction monitoring for suspicious activity, market manipulation, and regulatory compliance

const EventEmitter = require('events');
const auditTrail = require('./auditTrail');
const complianceMonitoring = require('./complianceMonitoring');

class TransactionSurveillanceSystem extends EventEmitter {
  constructor() {
    super();

    // Surveillance rules and patterns
    this.surveillanceRules = new Map();
    this.initializeSurveillanceRules();

    // Real-time transaction tracking
    this.transactionBuffer = [];
    this.userPatterns = new Map();
    this.marketPatterns = new Map();

    // Alert thresholds
    this.alertThresholds = {
      largeTransaction: 100000, // USD
      highFrequency: 100, // transactions per minute
      abnormalVolume: 5, // times normal volume
      priceManipulation: 0.1, // 10% price impact
      washTrading: 0.95, // similarity threshold
      layering: 5, // number of layers
      spoofing: 3, // cancel ratio threshold
      frontRunning: 1000, // milliseconds time window
      crossBorder: true // flag all cross-border transactions
    };

    // Machine learning models for pattern detection
    this.models = {
      washTradingDetector: new WashTradingDetector(),
      layeringDetector: new LayeringDetector(),
      spoofingDetector: new SpoofingDetector(),
      frontRunningDetector: new FrontRunningDetector(),
      anomalyDetector: new AnomalyDetector()
    };

    // Surveillance statistics
    this.stats = {
      transactionsMonitored: 0,
      alertsGenerated: 0,
      suspiciousActivities: 0,
      falsePositives: 0,
      confirmedViolations: 0
    };

    // Start surveillance
    this.startSurveillance();
  }

  initializeSurveillanceRules() {
    // Large transaction reporting (CTR equivalent)
    this.surveillanceRules.set('LARGE_TRANSACTION', {
      name: 'Large Transaction Reporting',
      threshold: this.alertThresholds.largeTransaction,
      severity: 'MEDIUM',
      action: 'REPORT',
      description: 'Monitor transactions exceeding regulatory thresholds'
    });

    // Wash trading detection
    this.surveillanceRules.set('WASH_TRADING', {
      name: 'Wash Trading Detection',
      pattern: 'repetitive_self_trading',
      severity: 'HIGH',
      action: 'ALERT',
      description: 'Detect artificial volume creation through self-trading'
    });

    // Layering detection
    this.surveillanceRules.set('LAYERING', {
      name: 'Layering Detection',
      pattern: 'multiple_orders_same_side',
      severity: 'HIGH',
      action: 'ALERT',
      description: 'Detect market manipulation through order layering'
    });

    // Spoofing detection
    this.surveillanceRules.set('SPOOFING', {
      name: 'Spoofing Detection',
      pattern: 'large_order_quick_cancel',
      severity: 'HIGH',
      action: 'ALERT',
      description: 'Detect market manipulation through fake orders'
    });

    // Front-running detection
    this.surveillanceRules.set('FRONT_RUNNING', {
      name: 'Front-Running Detection',
      pattern: 'order_anticipation',
      severity: 'HIGH',
      action: 'ALERT',
      description: 'Detect unauthorized advance trading on material information'
    });

    // High frequency trading monitoring
    this.surveillanceRules.set('HIGH_FREQUENCY', {
      name: 'High Frequency Trading Monitor',
      threshold: this.alertThresholds.highFrequency,
      severity: 'MEDIUM',
      action: 'MONITOR',
      description: 'Monitor high-frequency trading patterns'
    });

    // Cross-border transaction monitoring
    this.surveillanceRules.set('CROSS_BORDER', {
      name: 'Cross-Border Transaction Monitor',
      severity: 'MEDIUM',
      action: 'REPORT',
      description: 'Monitor transactions crossing jurisdictional boundaries'
    });

    // Unusual volume patterns
    this.surveillanceRules.set('UNUSUAL_VOLUME', {
      name: 'Unusual Volume Detection',
      threshold: this.alertThresholds.abnormalVolume,
      severity: 'MEDIUM',
      action: 'ALERT',
      description: 'Detect abnormal trading volume patterns'
    });
  }

  // Start real-time surveillance
  startSurveillance() {
    console.log('🔍 Starting transaction surveillance system...');

    // Process transaction buffer every second
    setInterval(() => {
      this.processTransactionBuffer();
    }, 1000);

    // Analyze patterns every minute
    setInterval(() => {
      this.analyzePatterns();
    }, 60000);

    // Generate surveillance report every hour
    setInterval(() => {
      this.generateSurveillanceReport();
    }, 3600000);

    console.log('✅ Transaction surveillance system active');
  }

  // Monitor transaction in real-time
  async monitorTransaction(transaction) {
    try {
      this.stats.transactionsMonitored++;

      // Add to processing buffer
      this.transactionBuffer.push({
        ...transaction,
        receivedAt: Date.now(),
        processed: false
      });

      // Immediate high-priority checks
      await this.performImmediateChecks(transaction);

      return {
        monitored: true,
        timestamp: new Date().toISOString(),
        riskScore: transaction.riskScore || 0
      };

    } catch (error) {
      console.error('Transaction monitoring failed:', error);
      return {
        monitored: false,
        error: error.message
      };
    }
  }

  // Perform immediate checks for high-priority patterns
  async performImmediateChecks(transaction) {
    const alerts = [];

    // Large transaction check
    if (transaction.amount >= this.alertThresholds.largeTransaction) {
      alerts.push(await this.generateAlert('LARGE_TRANSACTION', transaction, {
        amount: transaction.amount,
        threshold: this.alertThresholds.largeTransaction
      }));
    }

    // Cross-border transaction check
    if (this.isCrossBorderTransaction(transaction)) {
      alerts.push(await this.generateAlert('CROSS_BORDER', transaction, {
        fromJurisdiction: transaction.fromJurisdiction,
        toJurisdiction: transaction.toJurisdiction
      }));
    }

    // High-risk user check
    if (transaction.userRiskScore && transaction.userRiskScore > 80) {
      alerts.push(await this.generateAlert('HIGH_RISK_USER', transaction, {
        userRiskScore: transaction.userRiskScore
      }));
    }

    // Process alerts
    for (const alert of alerts.filter(Boolean)) {
      await this.processAlert(alert);
    }

    return alerts;
  }

  // Process transaction buffer
  async processTransactionBuffer() {
    if (this.transactionBuffer.length === 0) {
      return;
    }

    const unprocessed = this.transactionBuffer.filter(tx => !tx.processed);

    for (const transaction of unprocessed) {
      await this.analyzeTransaction(transaction);
      transaction.processed = true;
    }

    // Clean buffer (keep last 1000 transactions)
    if (this.transactionBuffer.length > 1000) {
      this.transactionBuffer = this.transactionBuffer.slice(-1000);
    }
  }

  // Analyze individual transaction
  async analyzeTransaction(transaction) {
    const analysis = {
      transactionId: transaction.id,
      timestamp: new Date().toISOString(),
      patterns: [],
      riskScore: 0,
      alerts: []
    };

    // Update user patterns
    this.updateUserPatterns(transaction);

    // Update market patterns
    this.updateMarketPatterns(transaction);

    // Run ML models
    const mlResults = await this.runMLModels(transaction);
    analysis.patterns = mlResults.patterns;
    analysis.riskScore = mlResults.riskScore;

    // Check surveillance rules
    for (const [ruleId, rule] of this.surveillanceRules) {
      const violation = await this.checkRule(ruleId, rule, transaction, analysis);
      if (violation) {
        analysis.alerts.push(violation);
      }
    }

    // Process any alerts
    for (const alert of analysis.alerts) {
      await this.processAlert(alert);
    }

    return analysis;
  }

  // Update user trading patterns
  updateUserPatterns(transaction) {
    const userId = transaction.userId;
    const now = Date.now();

    if (!this.userPatterns.has(userId)) {
      this.userPatterns.set(userId, {
        userId,
        firstSeen: now,
        lastSeen: now,
        transactionCount: 0,
        totalVolume: 0,
        averageSize: 0,
        instruments: new Set(),
        timePatterns: [],
        velocityMetrics: {
          transactionsPerMinute: 0,
          volumePerHour: 0
        }
      });
    }

    const pattern = this.userPatterns.get(userId);
    pattern.lastSeen = now;
    pattern.transactionCount++;
    pattern.totalVolume += transaction.amount;
    pattern.averageSize = pattern.totalVolume / pattern.transactionCount;
    pattern.instruments.add(transaction.instrument);

    // Calculate velocity metrics
    const timeWindow = now - pattern.firstSeen;
    pattern.velocityMetrics.transactionsPerMinute =
      (pattern.transactionCount / (timeWindow / 60000));

    // Add to time patterns (last 100 transactions)
    pattern.timePatterns.push({
      timestamp: now,
      amount: transaction.amount,
      instrument: transaction.instrument
    });

    if (pattern.timePatterns.length > 100) {
      pattern.timePatterns = pattern.timePatterns.slice(-100);
    }
  }

  // Update market patterns
  updateMarketPatterns(transaction) {
    const instrument = transaction.instrument;
    const now = Date.now();

    if (!this.marketPatterns.has(instrument)) {
      this.marketPatterns.set(instrument, {
        instrument,
        volume: 0,
        transactionCount: 0,
        priceHistory: [],
        volumeHistory: [],
        anomalies: []
      });
    }

    const pattern = this.marketPatterns.get(instrument);
    pattern.volume += transaction.amount;
    pattern.transactionCount++;

    // Track price movements
    if (transaction.price) {
      pattern.priceHistory.push({
        timestamp: now,
        price: transaction.price,
        volume: transaction.amount
      });

      // Keep last 1000 price points
      if (pattern.priceHistory.length > 1000) {
        pattern.priceHistory = pattern.priceHistory.slice(-1000);
      }
    }

    // Track volume patterns
    pattern.volumeHistory.push({
      timestamp: now,
      volume: transaction.amount
    });

    if (pattern.volumeHistory.length > 1000) {
      pattern.volumeHistory = pattern.volumeHistory.slice(-1000);
    }
  }

  // Run machine learning models
  async runMLModels(transaction) {
    const results = {
      patterns: [],
      riskScore: 0,
      confidence: 0
    };

    try {
      // Wash trading detection
      const washTradingResult = await this.models.washTradingDetector.analyze(
        transaction,
        this.userPatterns.get(transaction.userId)
      );
      if (washTradingResult.detected) {
        results.patterns.push('WASH_TRADING');
        results.riskScore += 30;
      }

      // Layering detection
      const layeringResult = await this.models.layeringDetector.analyze(
        transaction,
        this.marketPatterns.get(transaction.instrument)
      );
      if (layeringResult.detected) {
        results.patterns.push('LAYERING');
        results.riskScore += 25;
      }

      // Spoofing detection
      const spoofingResult = await this.models.spoofingDetector.analyze(transaction);
      if (spoofingResult.detected) {
        results.patterns.push('SPOOFING');
        results.riskScore += 35;
      }

      // Anomaly detection
      const anomalyResult = await this.models.anomalyDetector.analyze(
        transaction,
        this.userPatterns.get(transaction.userId)
      );
      if (anomalyResult.isAnomalous) {
        results.patterns.push('ANOMALOUS_BEHAVIOR');
        results.riskScore += anomalyResult.score;
      }

      // Normalize risk score (0-100)
      results.riskScore = Math.min(100, results.riskScore);
      results.confidence = results.patterns.length > 0 ? 0.8 : 0.3;

    } catch (error) {
      console.error('ML model analysis failed:', error);
    }

    return results;
  }

  // Check specific surveillance rule
  async checkRule(ruleId, rule, transaction, analysis) {
    switch (ruleId) {
    case 'WASH_TRADING':
      return this.checkWashTrading(transaction, analysis);

    case 'LAYERING':
      return this.checkLayering(transaction, analysis);

    case 'SPOOFING':
      return this.checkSpoofing(transaction, analysis);

    case 'HIGH_FREQUENCY':
      return this.checkHighFrequency(transaction);

    case 'UNUSUAL_VOLUME':
      return this.checkUnusualVolume(transaction);

    default:
      return null;
    }
  }

  // Check for wash trading patterns
  checkWashTrading(transaction, analysis) {
    if (analysis.patterns.includes('WASH_TRADING')) {
      return {
        ruleId: 'WASH_TRADING',
        severity: 'HIGH',
        confidence: 0.85,
        description: 'Potential wash trading pattern detected',
        evidence: {
          pattern: 'WASH_TRADING',
          riskScore: analysis.riskScore
        }
      };
    }
    return null;
  }

  // Check for layering patterns
  checkLayering(transaction, analysis) {
    if (analysis.patterns.includes('LAYERING')) {
      return {
        ruleId: 'LAYERING',
        severity: 'HIGH',
        confidence: 0.80,
        description: 'Potential layering/order stacking detected',
        evidence: {
          pattern: 'LAYERING',
          riskScore: analysis.riskScore
        }
      };
    }
    return null;
  }

  // Check for spoofing patterns
  checkSpoofing(transaction, analysis) {
    if (analysis.patterns.includes('SPOOFING')) {
      return {
        ruleId: 'SPOOFING',
        severity: 'HIGH',
        confidence: 0.90,
        description: 'Potential spoofing activity detected',
        evidence: {
          pattern: 'SPOOFING',
          riskScore: analysis.riskScore
        }
      };
    }
    return null;
  }

  // Check high frequency trading
  checkHighFrequency(transaction) {
    const userPattern = this.userPatterns.get(transaction.userId);

    if (userPattern && userPattern.velocityMetrics.transactionsPerMinute > this.alertThresholds.highFrequency) {
      return {
        ruleId: 'HIGH_FREQUENCY',
        severity: 'MEDIUM',
        confidence: 0.95,
        description: 'High frequency trading activity detected',
        evidence: {
          transactionsPerMinute: userPattern.velocityMetrics.transactionsPerMinute,
          threshold: this.alertThresholds.highFrequency
        }
      };
    }
    return null;
  }

  // Check unusual volume
  checkUnusualVolume(transaction) {
    const marketPattern = this.marketPatterns.get(transaction.instrument);

    if (marketPattern && marketPattern.volumeHistory.length > 10) {
      const recentVolume = marketPattern.volumeHistory
        .slice(-10)
        .reduce((sum, v) => sum + v.volume, 0) / 10;

      if (transaction.amount > recentVolume * this.alertThresholds.abnormalVolume) {
        return {
          ruleId: 'UNUSUAL_VOLUME',
          severity: 'MEDIUM',
          confidence: 0.75,
          description: 'Unusual transaction volume detected',
          evidence: {
            transactionAmount: transaction.amount,
            averageVolume: recentVolume,
            multiplier: transaction.amount / recentVolume
          }
        };
      }
    }
    return null;
  }

  // Check if transaction is cross-border
  isCrossBorderTransaction(transaction) {
    return transaction.fromJurisdiction &&
           transaction.toJurisdiction &&
           transaction.fromJurisdiction !== transaction.toJurisdiction;
  }

  // Generate surveillance alert
  async generateAlert(type, transaction, details = {}) {
    const alert = {
      id: this.generateAlertId(),
      type,
      severity: this.getSeverityForType(type),
      timestamp: new Date().toISOString(),
      transactionId: transaction.id,
      userId: transaction.userId,
      instrument: transaction.instrument,
      amount: transaction.amount,
      description: this.getAlertDescription(type, details),
      details,
      status: 'ACTIVE',
      investigationRequired: this.requiresInvestigation(type),
      regulatoryReporting: this.requiresRegulatoryReporting(type)
    };

    this.stats.alertsGenerated++;

    return alert;
  }

  // Process generated alert
  async processAlert(alert) {
    try {
      // Emit alert event
      this.emit('surveillanceAlert', alert);

      // Send to compliance monitoring
      complianceMonitoring.emit('complianceAlert', {
        ...alert,
        category: 'TRANSACTION_SURVEILLANCE'
      });

      // Audit the alert
      await auditTrail.recordAuditEvent({
        category: 'COMPLIANCE',
        action: 'SURVEILLANCE_ALERT_GENERATED',
        userId: alert.userId,
        metadata: {
          alertId: alert.id,
          alertType: alert.type,
          transactionId: alert.transactionId,
          severity: alert.severity
        }
      });

      // Auto-escalate critical alerts
      if (alert.severity === 'CRITICAL') {
        await this.escalateAlert(alert);
      }

      console.log(`🚨 Surveillance alert generated: ${alert.type} for transaction ${alert.transactionId}`);

    } catch (error) {
      console.error('Alert processing failed:', error);
    }
  }

  // Escalate critical alerts
  async escalateAlert(alert) {
    // In production, this would notify compliance team
    console.log(`⚠️ CRITICAL ALERT ESCALATED: ${alert.type}`);

    this.emit('criticalAlertEscalated', alert);
  }

  // Analyze patterns across all transactions
  async analyzePatterns() {
    const analysis = {
      timestamp: new Date().toISOString(),
      userAnomalies: [],
      marketAnomalies: [],
      crossPatterns: []
    };

    // Analyze user patterns for anomalies
    for (const [userId, pattern] of this.userPatterns) {
      const anomalies = await this.analyzeUserAnomalies(userId, pattern);
      if (anomalies.length > 0) {
        analysis.userAnomalies.push({ userId, anomalies });
      }
    }

    // Analyze market patterns
    for (const [instrument, pattern] of this.marketPatterns) {
      const anomalies = await this.analyzeMarketAnomalies(instrument, pattern);
      if (anomalies.length > 0) {
        analysis.marketAnomalies.push({ instrument, anomalies });
      }
    }

    // Look for cross-user patterns
    analysis.crossPatterns = await this.analyzeCrossPatterns();

    if (analysis.userAnomalies.length > 0 ||
        analysis.marketAnomalies.length > 0 ||
        analysis.crossPatterns.length > 0) {
      this.emit('patternAnalysis', analysis);
    }

    return analysis;
  }

  // Analyze user anomalies
  async analyzeUserAnomalies(userId, pattern) {
    const anomalies = [];

    // Check for unusual trading velocity
    if (pattern.velocityMetrics.transactionsPerMinute > this.alertThresholds.highFrequency * 0.8) {
      anomalies.push({
        type: 'HIGH_VELOCITY',
        metric: pattern.velocityMetrics.transactionsPerMinute,
        threshold: this.alertThresholds.highFrequency
      });
    }

    // Check for unusual diversification
    if (pattern.instruments.size > 20) {
      anomalies.push({
        type: 'HIGH_DIVERSIFICATION',
        instrumentCount: pattern.instruments.size
      });
    }

    return anomalies;
  }

  // Analyze market anomalies
  async analyzeMarketAnomalies(instrument, pattern) {
    const anomalies = [];

    // Check for unusual volume spikes
    if (pattern.volumeHistory.length > 20) {
      const recentVolume = pattern.volumeHistory.slice(-5).reduce((sum, v) => sum + v.volume, 0);
      const historicalVolume = pattern.volumeHistory.slice(-20, -5).reduce((sum, v) => sum + v.volume, 0) / 15;

      if (recentVolume > historicalVolume * this.alertThresholds.abnormalVolume) {
        anomalies.push({
          type: 'VOLUME_SPIKE',
          recentVolume,
          historicalVolume,
          ratio: recentVolume / historicalVolume
        });
      }
    }

    return anomalies;
  }

  // Analyze cross-user patterns
  async analyzeCrossPatterns() {
    const patterns = [];

    // Look for coordinated trading
    // Look for circular trading
    // Look for pump and dump schemes

    return patterns;
  }

  // Generate surveillance report
  async generateSurveillanceReport() {
    const report = {
      reportId: this.generateReportId(),
      timestamp: new Date().toISOString(),
      period: '1_hour',
      statistics: { ...this.stats },
      alertsSummary: this.getAlertsSummary(),
      topRisks: await this.getTopRisks(),
      recommendations: await this.generateRecommendations()
    };

    this.emit('surveillanceReport', report);

    return report;
  }

  // Get alerts summary
  getAlertsSummary() {
    return {
      total: this.stats.alertsGenerated,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      byType: {},
      falsePositiveRate: this.stats.falsePositives / Math.max(1, this.stats.alertsGenerated)
    };
  }

  // Get top risks
  async getTopRisks() {
    const risks = [];

    // Top risky users
    const riskyUsers = Array.from(this.userPatterns.entries())
      .filter(([_, pattern]) => pattern.velocityMetrics.transactionsPerMinute > 50)
      .slice(0, 10);

    risks.push({
      category: 'HIGH_VELOCITY_USERS',
      count: riskyUsers.length,
      items: riskyUsers.map(([userId, pattern]) => ({
        userId,
        transactionsPerMinute: pattern.velocityMetrics.transactionsPerMinute
      }))
    });

    return risks;
  }

  // Generate recommendations
  async generateRecommendations() {
    const recommendations = [];

    if (this.stats.falsePositives / Math.max(1, this.stats.alertsGenerated) > 0.3) {
      recommendations.push({
        category: 'MODEL_TUNING',
        priority: 'HIGH',
        description: 'High false positive rate detected - consider tuning ML models'
      });
    }

    return recommendations;
  }

  // Get helper methods
  getSeverityForType(type) {
    const severityMap = {
      'LARGE_TRANSACTION': 'MEDIUM',
      'CROSS_BORDER': 'MEDIUM',
      'HIGH_RISK_USER': 'HIGH',
      'WASH_TRADING': 'HIGH',
      'LAYERING': 'HIGH',
      'SPOOFING': 'CRITICAL',
      'FRONT_RUNNING': 'CRITICAL'
    };
    return severityMap[type] || 'MEDIUM';
  }

  getAlertDescription(type, details) {
    const descriptions = {
      'LARGE_TRANSACTION': `Large transaction of $${details.amount?.toLocaleString()}`,
      'CROSS_BORDER': `Cross-border transaction: ${details.fromJurisdiction} → ${details.toJurisdiction}`,
      'HIGH_RISK_USER': `High-risk user activity (score: ${details.userRiskScore})`,
      'WASH_TRADING': 'Potential wash trading pattern detected',
      'LAYERING': 'Potential market manipulation through layering',
      'SPOOFING': 'Potential spoofing activity detected'
    };
    return descriptions[type] || `Surveillance alert: ${type}`;
  }

  requiresInvestigation(type) {
    return ['WASH_TRADING', 'LAYERING', 'SPOOFING', 'FRONT_RUNNING'].includes(type);
  }

  requiresRegulatoryReporting(type) {
    return ['LARGE_TRANSACTION', 'CROSS_BORDER', 'WASH_TRADING', 'SPOOFING'].includes(type);
  }

  // Generate IDs
  generateAlertId() {
    return `SURV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  generateReportId() {
    return `SURVR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  // Get surveillance statistics
  getStatistics() {
    return {
      ...this.stats,
      activeRules: this.surveillanceRules.size,
      monitoredUsers: this.userPatterns.size,
      monitoredInstruments: this.marketPatterns.size,
      bufferSize: this.transactionBuffer.length
    };
  }
}

// Machine Learning Model Classes (simplified implementations)

class WashTradingDetector {
  async analyze(transaction, userPattern) {
    // Simplified wash trading detection
    if (!userPattern) {
      return { detected: false };
    }

    const recentTransactions = userPattern.timePatterns.slice(-10);
    const buyCount = recentTransactions.filter(t => t.type === 'buy').length;
    const sellCount = recentTransactions.filter(t => t.type === 'sell').length;

    const ratio = Math.min(buyCount, sellCount) / Math.max(buyCount, sellCount);

    return {
      detected: ratio > 0.95 && recentTransactions.length >= 10,
      confidence: ratio,
      evidence: { buyCount, sellCount, ratio }
    };
  }
}

class LayeringDetector {
  async analyze() {
    // Simplified layering detection
    return {
      detected: false,
      confidence: 0
    };
  }
}

class SpoofingDetector {
  async analyze() {
    // Simplified spoofing detection
    return {
      detected: false,
      confidence: 0
    };
  }
}

class FrontRunningDetector {
  async analyze() {
    // Simplified front-running detection
    return {
      detected: false,
      confidence: 0
    };
  }
}

class AnomalyDetector {
  async analyze(transaction, userPattern) {
    // Simplified anomaly detection
    if (!userPattern) {
      return { isAnomalous: false, score: 0 };
    }

    let anomalyScore = 0;

    // Check transaction size anomaly
    if (transaction.amount > userPattern.averageSize * 10) {
      anomalyScore += 20;
    }

    // Check time pattern anomaly
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      anomalyScore += 10;
    }

    return {
      isAnomalous: anomalyScore > 15,
      score: anomalyScore,
      confidence: anomalyScore / 30
    };
  }
}

// Create singleton instance
const transactionSurveillance = new TransactionSurveillanceSystem();

module.exports = transactionSurveillance;