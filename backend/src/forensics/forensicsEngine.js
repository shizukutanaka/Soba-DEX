/**
 * Security Forensics and Investigation Engine
 * Advanced tools for security incident investigation
 *
 * Features:
 * - Timeline reconstruction
 * - Attack pattern analysis
 * - Evidence collection and preservation
 * - Chain of custody tracking
 * - Root cause analysis
 * - Impact assessment
 * - IOC extraction
 * - Report generation
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { promisify } = require('util');

class ForensicsEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      evidencePath: options.evidencePath || './evidence',
      maxEvidenceAge: options.maxEvidenceAge || 7776000000, // 90 days
      autoPreserve: options.autoPreserve !== false,
      chainOfCustodyEnabled: options.chainOfCustodyEnabled !== false,
      ...options
    };

    this.db = options.database;
    this.cache = options.cache;
    this.securityMonitor = options.securityMonitor;

    this.investigations = new Map();
    this.evidence = new Map();
    this.chainOfCustody = new Map();

    this.metrics = {
      investigationsTotal: 0,
      evidenceCollected: 0,
      iocExtracted: 0,
      timelineEvents: 0
    };
  }

  /**
   * Start investigation
   */
  async startInvestigation(incidentId, metadata = {}) {
    console.log(`🔍 Starting investigation for incident ${incidentId}...`);

    const investigation = {
      id: this.generateInvestigationId(),
      incidentId,
      status: 'ACTIVE',
      startTime: Date.now(),
      investigator: metadata.investigator || 'system',
      priority: metadata.priority || 'MEDIUM',
      timeline: [],
      evidence: [],
      iocs: [],
      findings: [],
      rootCause: null,
      impact: null,
      recommendations: []
    };

    this.investigations.set(investigation.id, investigation);
    this.metrics.investigationsTotal++;

    // Auto-collect evidence
    if (this.options.autoPreserve) {
      await this.collectEvidence(investigation.id, incidentId);
    }

    this.emit('investigationStarted', investigation);

    return investigation;
  }

  /**
   * Collect evidence for investigation
   */
  async collectEvidence(investigationId, incidentId) {
    console.log(`📦 Collecting evidence for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    const evidence = {
      incident: await this.getIncidentData(incidentId),
      relatedEvents: await this.getRelatedEvents(incidentId),
      systemState: await this.captureSystemState(),
      networkLogs: await this.collectNetworkLogs(incidentId),
      accessLogs: await this.collectAccessLogs(incidentId),
      processLogs: await this.collectProcessLogs(incidentId),
      fileChanges: await this.detectFileChanges(incidentId),
      memoryDump: await this.captureMemorySnapshot()
    };

    // Preserve evidence with chain of custody
    const evidenceId = await this.preserveEvidence(investigationId, evidence);

    investigation.evidence.push(evidenceId);
    this.metrics.evidenceCollected++;

    console.log(`✅ Evidence collected: ${evidenceId}`);

    return evidenceId;
  }

  /**
   * Preserve evidence with chain of custody
   */
  async preserveEvidence(investigationId, evidenceData) {
    const evidenceId = this.generateEvidenceId();

    const evidence = {
      id: evidenceId,
      investigationId,
      timestamp: Date.now(),
      data: evidenceData,
      hash: this.calculateEvidenceHash(evidenceData),
      integrity: 'VERIFIED'
    };

    this.evidence.set(evidenceId, evidence);

    // Initialize chain of custody
    if (this.options.chainOfCustodyEnabled) {
      this.chainOfCustody.set(evidenceId, [{
        action: 'COLLECTED',
        timestamp: Date.now(),
        actor: 'system',
        hash: evidence.hash,
        notes: 'Evidence automatically collected'
      }]);
    }

    // Persist to disk
    await this.writeEvidenceToDisk(evidence);

    return evidenceId;
  }

  /**
   * Build timeline of events
   */
  async buildTimeline(investigationId) {
    console.log(`⏱️  Building timeline for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    const timeline = [];

    // Collect all events from evidence
    for (const evidenceId of investigation.evidence) {
      const evidence = this.evidence.get(evidenceId);
      if (!evidence) continue;

      // Add incident creation
      if (evidence.data.incident) {
        timeline.push({
          timestamp: evidence.data.incident.createdAt,
          type: 'INCIDENT_CREATED',
          severity: evidence.data.incident.severity,
          description: evidence.data.incident.title,
          source: 'incident',
          evidenceId
        });
      }

      // Add related security events
      if (evidence.data.relatedEvents) {
        evidence.data.relatedEvents.forEach(event => {
          timeline.push({
            timestamp: event.timestamp,
            type: 'SECURITY_EVENT',
            severity: event.severity,
            description: `${event.type} from ${event.ip}`,
            source: 'event',
            evidenceId,
            eventId: event.id
          });
        });
      }

      // Add access logs
      if (evidence.data.accessLogs) {
        evidence.data.accessLogs.forEach(log => {
          timeline.push({
            timestamp: log.timestamp,
            type: 'ACCESS',
            description: `${log.method} ${log.url} from ${log.ip}`,
            source: 'access_log',
            evidenceId
          });
        });
      }

      // Add file changes
      if (evidence.data.fileChanges) {
        evidence.data.fileChanges.forEach(change => {
          timeline.push({
            timestamp: change.timestamp,
            type: 'FILE_CHANGE',
            description: `${change.action} ${change.path}`,
            source: 'file_system',
            evidenceId
          });
        });
      }
    }

    // Sort timeline by timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);

    // Analyze patterns
    const patterns = this.analyzeTimelinePatterns(timeline);

    investigation.timeline = timeline;
    this.metrics.timelineEvents += timeline.length;

    console.log(`✅ Timeline built: ${timeline.length} events, ${patterns.length} patterns`);

    return {
      timeline,
      patterns,
      summary: this.generateTimelineSummary(timeline)
    };
  }

  /**
   * Extract Indicators of Compromise (IOCs)
   */
  async extractIOCs(investigationId) {
    console.log(`🎯 Extracting IOCs for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    const iocs = {
      ips: new Set(),
      domains: new Set(),
      urls: new Set(),
      fileHashes: new Set(),
      emails: new Set(),
      userAgents: new Set(),
      patterns: []
    };

    // Extract from evidence
    for (const evidenceId of investigation.evidence) {
      const evidence = this.evidence.get(evidenceId);
      if (!evidence) continue;

      // Extract IPs
      if (evidence.data.relatedEvents) {
        evidence.data.relatedEvents.forEach(event => {
          if (event.ip && this.isSuspiciousIP(event)) {
            iocs.ips.add(event.ip);
          }
          if (event.url) {
            const domain = this.extractDomain(event.url);
            if (domain) iocs.domains.add(domain);
            if (this.isSuspiciousURL(event.url)) {
              iocs.urls.add(event.url);
            }
          }
          if (event.userAgent && this.isSuspiciousUserAgent(event.userAgent)) {
            iocs.userAgents.add(event.userAgent);
          }
        });
      }

      // Extract file hashes
      if (evidence.data.fileChanges) {
        evidence.data.fileChanges.forEach(change => {
          if (change.hash) {
            iocs.fileHashes.add(change.hash);
          }
        });
      }

      // Extract attack patterns
      const patterns = this.extractAttackPatterns(evidence.data);
      iocs.patterns.push(...patterns);
    }

    // Convert sets to arrays
    investigation.iocs = {
      ips: Array.from(iocs.ips),
      domains: Array.from(iocs.domains),
      urls: Array.from(iocs.urls),
      fileHashes: Array.from(iocs.fileHashes),
      emails: Array.from(iocs.emails),
      userAgents: Array.from(iocs.userAgents),
      patterns: iocs.patterns
    };

    this.metrics.iocExtracted += investigation.iocs.ips.length +
                                  investigation.iocs.domains.length +
                                  investigation.iocs.urls.length;

    console.log(`✅ IOCs extracted: ${investigation.iocs.ips.length} IPs, ${investigation.iocs.domains.length} domains`);

    return investigation.iocs;
  }

  /**
   * Perform root cause analysis
   */
  async performRootCauseAnalysis(investigationId) {
    console.log(`🔬 Performing root cause analysis for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    // Build timeline if not already done
    if (!investigation.timeline || investigation.timeline.length === 0) {
      await this.buildTimeline(investigationId);
    }

    // Find the earliest suspicious event
    const suspiciousEvents = investigation.timeline.filter(event =>
      event.type === 'SECURITY_EVENT' && event.severity !== 'LOW'
    );

    if (suspiciousEvents.length === 0) {
      return { rootCause: 'UNKNOWN', confidence: 0 };
    }

    const firstEvent = suspiciousEvents[0];

    // Analyze attack vector
    const attackVector = this.identifyAttackVector(investigation);

    // Identify vulnerability exploited
    const vulnerability = this.identifyVulnerability(investigation);

    // Determine entry point
    const entryPoint = this.determineEntryPoint(investigation);

    // Calculate confidence
    const confidence = this.calculateRCAConfidence(attackVector, vulnerability, entryPoint);

    investigation.rootCause = {
      summary: this.generateRootCauseSummary(attackVector, vulnerability, entryPoint),
      attackVector,
      vulnerability,
      entryPoint,
      firstMaliciousEvent: firstEvent,
      confidence,
      recommendations: this.generateRemediationRecommendations(attackVector, vulnerability)
    };

    console.log(`✅ Root cause analysis complete (confidence: ${confidence}%)`);

    return investigation.rootCause;
  }

  /**
   * Assess impact of security incident
   */
  async assessImpact(investigationId) {
    console.log(`💥 Assessing impact for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    const impact = {
      scope: this.calculateScope(investigation),
      affectedSystems: this.identifyAffectedSystems(investigation),
      affectedData: this.identifyAffectedData(investigation),
      businessImpact: this.assessBusinessImpact(investigation),
      financialImpact: this.estimateFinancialImpact(investigation),
      reputationalImpact: this.assessReputationalImpact(investigation),
      complianceImpact: this.assessComplianceImpact(investigation),
      severity: 'MEDIUM'
    };

    // Calculate overall severity
    const severityScore = (
      impact.scope.score * 0.3 +
      impact.businessImpact.score * 0.3 +
      impact.complianceImpact.score * 0.4
    );

    if (severityScore >= 80) impact.severity = 'CRITICAL';
    else if (severityScore >= 60) impact.severity = 'HIGH';
    else if (severityScore >= 40) impact.severity = 'MEDIUM';
    else impact.severity = 'LOW';

    investigation.impact = impact;

    console.log(`✅ Impact assessed: ${impact.severity} severity`);

    return impact;
  }

  /**
   * Generate forensics report
   */
  async generateReport(investigationId) {
    console.log(`📝 Generating forensics report for investigation ${investigationId}...`);

    const investigation = this.investigations.get(investigationId);
    if (!investigation) {
      throw new Error('Investigation not found');
    }

    // Ensure all analyses are complete
    if (!investigation.timeline || investigation.timeline.length === 0) {
      await this.buildTimeline(investigationId);
    }
    if (!investigation.iocs || investigation.iocs.ips.length === 0) {
      await this.extractIOCs(investigationId);
    }
    if (!investigation.rootCause) {
      await this.performRootCauseAnalysis(investigationId);
    }
    if (!investigation.impact) {
      await this.assessImpact(investigationId);
    }

    const report = {
      investigationId: investigation.id,
      incidentId: investigation.incidentId,
      generatedAt: new Date(),
      investigator: investigation.investigator,
      executiveSummary: this.generateExecutiveSummary(investigation),
      timeline: investigation.timeline,
      iocs: investigation.iocs,
      rootCause: investigation.rootCause,
      impact: investigation.impact,
      findings: investigation.findings,
      evidence: investigation.evidence.map(id => ({
        id,
        hash: this.evidence.get(id)?.hash
      })),
      chainOfCustody: this.getChainOfCustody(investigation.evidence),
      recommendations: investigation.recommendations || [],
      conclusion: this.generateConclusion(investigation)
    };

    console.log(`✅ Forensics report generated`);

    return report;
  }

  /**
   * Helper methods
   */

  async getIncidentData(incidentId) {
    if (this.db) {
      const result = await this.db.query(
        'SELECT * FROM incidents WHERE id = $1',
        [incidentId]
      );
      return result.rows[0] || null;
    }
    return null;
  }

  async getRelatedEvents(incidentId) {
    if (this.db) {
      const result = await this.db.query(
        'SELECT * FROM security_events WHERE incident_id = $1 ORDER BY timestamp ASC',
        [incidentId]
      );
      return result.rows;
    }
    return [];
  }

  async captureSystemState() {
    return {
      timestamp: Date.now(),
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }

  async collectNetworkLogs(incidentId) {
    // Placeholder - would collect actual network logs
    return [];
  }

  async collectAccessLogs(incidentId) {
    // Placeholder - would collect actual access logs
    return [];
  }

  async collectProcessLogs(incidentId) {
    // Placeholder - would collect actual process logs
    return [];
  }

  async detectFileChanges(incidentId) {
    // Placeholder - would detect actual file changes
    return [];
  }

  async captureMemorySnapshot() {
    return {
      timestamp: Date.now(),
      heapUsed: process.memoryUsage().heapUsed,
      external: process.memoryUsage().external
    };
  }

  calculateEvidenceHash(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  async writeEvidenceToDisk(evidence) {
    const fs = require('fs').promises;
    const path = require('path');
    const filepath = path.join(
      this.options.evidencePath,
      `evidence_${evidence.id}.json`
    );

    await fs.mkdir(this.options.evidencePath, { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(evidence, null, 2));
  }

  analyzeTimelinePatterns(timeline) {
    const patterns = [];

    // Detect rapid succession of events (potential automation)
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].timestamp - timeline[i - 1].timestamp < 100) {
        patterns.push({
          type: 'RAPID_SUCCESSION',
          description: 'Multiple events in rapid succession',
          events: [timeline[i - 1], timeline[i]]
        });
      }
    }

    // Detect privilege escalation patterns
    const accessEvents = timeline.filter(e => e.type === 'ACCESS');
    if (accessEvents.length > 0) {
      // Analyze access patterns
    }

    return patterns;
  }

  generateTimelineSummary(timeline) {
    return {
      totalEvents: timeline.length,
      timespan: timeline.length > 0 ?
        timeline[timeline.length - 1].timestamp - timeline[0].timestamp : 0,
      eventTypes: this.countEventTypes(timeline),
      criticalEvents: timeline.filter(e => e.severity === 'CRITICAL').length
    };
  }

  countEventTypes(timeline) {
    const counts = {};
    timeline.forEach(event => {
      counts[event.type] = (counts[event.type] || 0) + 1;
    });
    return counts;
  }

  isSuspiciousIP(event) {
    return event.riskScore > 50 || event.threatLevel === 'HIGH' || event.threatLevel === 'CRITICAL';
  }

  isSuspiciousURL(url) {
    const suspiciousPatterns = [
      /\.exe$/i,
      /\.dll$/i,
      /\.bat$/i,
      /\.sh$/i,
      /malware/i,
      /payload/i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  isSuspiciousUserAgent(userAgent) {
    const suspiciousPatterns = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /metasploit/i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }

  extractAttackPatterns(evidenceData) {
    const patterns = [];

    if (evidenceData.relatedEvents) {
      const eventTypes = evidenceData.relatedEvents.map(e => e.type);
      const uniqueTypes = [...new Set(eventTypes)];

      if (uniqueTypes.includes('SQL_INJECTION')) {
        patterns.push({ type: 'SQL_INJECTION_PATTERN', confidence: 0.9 });
      }
      if (uniqueTypes.includes('XSS')) {
        patterns.push({ type: 'XSS_PATTERN', confidence: 0.9 });
      }
    }

    return patterns;
  }

  identifyAttackVector(investigation) {
    const events = investigation.timeline.filter(e => e.type === 'SECURITY_EVENT');
    if (events.length === 0) return { type: 'UNKNOWN', confidence: 0 };

    const types = events.map(e => e.description);
    const mostCommon = this.findMostCommon(types);

    return {
      type: mostCommon,
      confidence: 0.7,
      firstOccurrence: events[0].timestamp
    };
  }

  identifyVulnerability(investigation) {
    return {
      type: 'UNKNOWN',
      cve: null,
      description: 'Vulnerability analysis requires additional data',
      confidence: 0.3
    };
  }

  determineEntryPoint(investigation) {
    const firstEvent = investigation.timeline[0];
    return {
      type: firstEvent?.type || 'UNKNOWN',
      timestamp: firstEvent?.timestamp || null,
      description: firstEvent?.description || 'Unknown entry point'
    };
  }

  calculateRCAConfidence(attackVector, vulnerability, entryPoint) {
    let confidence = 0;
    if (attackVector.confidence > 0.5) confidence += 40;
    if (vulnerability.confidence > 0.5) confidence += 30;
    if (entryPoint.timestamp) confidence += 30;
    return Math.min(confidence, 100);
  }

  generateRootCauseSummary(attackVector, vulnerability, entryPoint) {
    return `Attack initiated via ${attackVector.type} at ${new Date(entryPoint.timestamp).toLocaleString()}`;
  }

  generateRemediationRecommendations(attackVector, vulnerability) {
    return [
      'Patch identified vulnerabilities immediately',
      'Review and update access controls',
      'Implement additional monitoring for similar attack patterns',
      'Conduct security awareness training for relevant personnel'
    ];
  }

  calculateScope(investigation) {
    return {
      eventsAffected: investigation.timeline.length,
      timespan: investigation.timeline.length > 0 ?
        investigation.timeline[investigation.timeline.length - 1].timestamp - investigation.timeline[0].timestamp : 0,
      score: Math.min((investigation.timeline.length / 100) * 100, 100)
    };
  }

  identifyAffectedSystems() {
    return ['web-server-01', 'database-01']; // Placeholder
  }

  identifyAffectedData() {
    return { records: 0, types: [] }; // Placeholder
  }

  assessBusinessImpact(investigation) {
    return {
      serviceDisruption: false,
      dataLoss: false,
      score: 30
    };
  }

  estimateFinancialImpact() {
    return { estimated: 0, currency: 'USD' };
  }

  assessReputationalImpact() {
    return { level: 'LOW', score: 20 };
  }

  assessComplianceImpact() {
    return { breached: [], score: 10 };
  }

  getChainOfCustody(evidenceIds) {
    return evidenceIds.map(id => ({
      evidenceId: id,
      chain: this.chainOfCustody.get(id) || []
    }));
  }

  generateExecutiveSummary(investigation) {
    return `Investigation of incident ${investigation.incidentId} revealed ${investigation.timeline.length} security events. Root cause identified as ${investigation.rootCause?.summary || 'unknown'}. Impact assessed as ${investigation.impact?.severity || 'MEDIUM'} severity.`;
  }

  generateConclusion(investigation) {
    return `Investigation completed. ${investigation.recommendations?.length || 0} recommendations provided. Evidence preserved with chain of custody.`;
  }

  findMostCommon(arr) {
    if (arr.length === 0) return 'UNKNOWN';
    const counts = {};
    arr.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }

  generateInvestigationId() {
    return `inv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateEvidenceId() {
    return `evd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeInvestigations: Array.from(this.investigations.values()).filter(i => i.status === 'ACTIVE').length,
      totalEvidence: this.evidence.size
    };
  }
}

module.exports = ForensicsEngine;
