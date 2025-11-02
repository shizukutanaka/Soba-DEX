// ============================================================================
// Incident Response Orchestrator
// Automated incident detection, classification, and response coordination
// ============================================================================

const EventEmitter = require('events');

/**
 * IncidentOrchestrator - Automated incident response system
 *
 * Features:
 * - Automatic incident creation from security events
 * - Intelligent incident classification (MITRE ATT&CK)
 * - Severity scoring and prioritization
 * - Automated response workflows
 * - Incident timeline reconstruction
 * - Evidence collection and preservation
 * - Automated containment actions
 * - Stakeholder notifications
 * - Post-incident analysis
 * - Incident metrics and KPIs
 */
class IncidentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      autoContainment: options.autoContainment !== false,
      severityThreshold: options.severityThreshold || 70,
      correlationWindow: options.correlationWindow || 5 * 60 * 1000, // 5 minutes
      autoCloseAfter: options.autoCloseAfter || 24 * 60 * 60 * 1000, // 24 hours
      ...options
    };

    // Incident storage
    this.activeIncidents = new Map();
    this.closedIncidents = [];

    // Event correlation
    this.recentEvents = [];
    this.correlationRules = this.loadCorrelationRules();

    // Response playbooks
    this.playbooks = this.loadPlaybooks();

    // Metrics
    this.metrics = {
      totalIncidents: 0,
      autoCreated: 0,
      autoContained: 0,
      autoResolved: 0,
      escalated: 0,
      avgTimeToDetect: 0,
      avgTimeToContain: 0,
      avgTimeToResolve: 0
    };

    // MITRE ATT&CK mapping
    this.mitreMapping = this.loadMitreMapping();
  }

  /**
   * Initialize incident orchestrator
   */
  async initialize() {
    console.log('[IncidentOrchestrator] Initializing incident response orchestration...');

    // Start auto-close timer
    this.autoCloseTimer = setInterval(() => {
      this.autoCloseIncidents();
    }, 60 * 60 * 1000); // Every hour

    console.log('[IncidentOrchestrator] Incident orchestrator initialized');
    this.emit('initialized');
  }

  /**
   * Process security event and potentially create incident
   */
  async processSecurityEvent(event) {
    try {
      // Add to recent events for correlation
      this.recentEvents.push(event);
      this.cleanupOldEvents();

      // Calculate severity score
      const severityScore = this.calculateSeverityScore(event);

      // Check if event should create incident
      if (severityScore >= this.options.severityThreshold) {
        await this.createIncident(event, severityScore);
      }

      // Check for event correlation
      await this.correlateEvents(event);

      // Update existing incidents
      await this.updateRelatedIncidents(event);

    } catch (error) {
      console.error('[IncidentOrchestrator] Error processing event:', error);
      this.emit('error', { event, error: error.message });
    }
  }

  /**
   * Create new incident
   */
  async createIncident(triggerEvent, severityScore) {
    this.metrics.totalIncidents++;
    this.metrics.autoCreated++;

    const incident = {
      id: this.generateIncidentId(),
      title: this.generateIncidentTitle(triggerEvent),
      description: triggerEvent.message || 'Security incident detected',
      severity: this.getSeverityLevel(severityScore),
      severityScore,
      status: 'OPEN',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      triggerEvent,
      relatedEvents: [triggerEvent],
      timeline: [{
        timestamp: Date.now(),
        action: 'INCIDENT_CREATED',
        description: 'Incident automatically created',
        actor: 'system'
      }],
      evidence: [],
      containmentActions: [],
      assignedTo: null,
      tags: this.generateTags(triggerEvent),
      mitreAttack: this.mapToMitreAttack(triggerEvent),
      metadata: {
        autoCreated: true,
        detectionSource: triggerEvent.source,
        attackVector: triggerEvent.type
      }
    };

    this.activeIncidents.set(incident.id, incident);

    console.log(`[IncidentOrchestrator] Incident created: ${incident.id} (${incident.severity})`);
    this.emit('incident-created', incident);

    // Trigger automated response
    await this.triggerAutomatedResponse(incident);

    // Collect evidence
    await this.collectEvidence(incident);

    // Notify stakeholders
    await this.notifyStakeholders(incident);

    return incident;
  }

  /**
   * Trigger automated response
   */
  async triggerAutomatedResponse(incident) {
    try {
      // Find appropriate playbook
      const playbook = this.findPlaybook(incident);

      if (!playbook) {
        console.log(`[IncidentOrchestrator] No playbook found for incident ${incident.id}`);
        return;
      }

      console.log(`[IncidentOrchestrator] Executing playbook: ${playbook.name} for incident ${incident.id}`);

      // Execute playbook actions
      for (const action of playbook.actions) {
        try {
          await this.executeAction(incident, action);

          incident.timeline.push({
            timestamp: Date.now(),
            action: action.type,
            description: action.description,
            actor: 'system',
            status: 'success'
          });
        } catch (error) {
          console.error(`[IncidentOrchestrator] Action failed:`, error);

          incident.timeline.push({
            timestamp: Date.now(),
            action: action.type,
            description: action.description,
            actor: 'system',
            status: 'failed',
            error: error.message
          });
        }
      }

      incident.playbook = playbook.name;
      incident.updatedAt = Date.now();

      this.emit('playbook-executed', { incident, playbook });

    } catch (error) {
      console.error('[IncidentOrchestrator] Automated response failed:', error);
      this.emit('response-error', { incident, error: error.message });
    }
  }

  /**
   * Execute incident response action
   */
  async executeAction(incident, action) {
    switch (action.type) {
      case 'BLOCK_IP':
        await this.blockIP(incident, action.params);
        this.metrics.autoContained++;
        break;

      case 'ISOLATE_HOST':
        await this.isolateHost(incident, action.params);
        this.metrics.autoContained++;
        break;

      case 'COLLECT_EVIDENCE':
        await this.collectEvidence(incident);
        break;

      case 'NOTIFY':
        await this.sendNotification(incident, action.params);
        break;

      case 'CREATE_TICKET':
        await this.createTicket(incident, action.params);
        break;

      case 'ESCALATE':
        await this.escalateIncident(incident);
        break;

      case 'RUN_SCAN':
        await this.runSecurityScan(incident, action.params);
        break;

      default:
        console.warn(`[IncidentOrchestrator] Unknown action type: ${action.type}`);
    }
  }

  /**
   * Block IP address
   */
  async blockIP(incident, params) {
    const ip = params.ip || incident.triggerEvent.ip;

    if (!ip) {
      throw new Error('No IP address to block');
    }

    console.log(`[IncidentOrchestrator] Blocking IP: ${ip}`);

    incident.containmentActions.push({
      type: 'IP_BLOCK',
      target: ip,
      timestamp: Date.now(),
      status: 'active'
    });

    this.emit('ip-blocked', { incident, ip });

    // TODO: Integrate with firewall/WAF
  }

  /**
   * Isolate compromised host
   */
  async isolateHost(incident, params) {
    const host = params.host || incident.triggerEvent.host;

    console.log(`[IncidentOrchestrator] Isolating host: ${host}`);

    incident.containmentActions.push({
      type: 'HOST_ISOLATION',
      target: host,
      timestamp: Date.now(),
      status: 'active'
    });

    this.emit('host-isolated', { incident, host });

    // TODO: Integrate with network infrastructure
  }

  /**
   * Collect evidence
   */
  async collectEvidence(incident) {
    console.log(`[IncidentOrchestrator] Collecting evidence for incident ${incident.id}`);

    const evidence = {
      timestamp: Date.now(),
      type: 'AUTOMATED_COLLECTION',
      items: []
    };

    // Collect related logs
    evidence.items.push({
      type: 'LOGS',
      description: 'Security event logs',
      data: incident.relatedEvents
    });

    // Collect network data
    if (incident.triggerEvent.ip) {
      evidence.items.push({
        type: 'NETWORK',
        description: `Network activity for ${incident.triggerEvent.ip}`,
        data: await this.collectNetworkData(incident.triggerEvent.ip)
      });
    }

    // Collect system state
    evidence.items.push({
      type: 'SYSTEM_STATE',
      description: 'System state at time of incident',
      data: {
        timestamp: Date.now(),
        activeIncidents: this.activeIncidents.size,
        recentEvents: this.recentEvents.length
      }
    });

    incident.evidence.push(evidence);
    this.emit('evidence-collected', { incident, evidence });
  }

  /**
   * Collect network data for IP
   */
  async collectNetworkData(ip) {
    // TODO: Integrate with network monitoring tools
    return {
      ip,
      timestamp: Date.now(),
      connections: [],
      trafficVolume: 0
    };
  }

  /**
   * Escalate incident
   */
  async escalateIncident(incident) {
    this.metrics.escalated++;

    incident.status = 'ESCALATED';
    incident.escalatedAt = Date.now();
    incident.updatedAt = Date.now();

    incident.timeline.push({
      timestamp: Date.now(),
      action: 'ESCALATED',
      description: 'Incident escalated for manual review',
      actor: 'system'
    });

    console.log(`[IncidentOrchestrator] Incident escalated: ${incident.id}`);
    this.emit('incident-escalated', incident);
  }

  /**
   * Correlate events to detect attack patterns
   */
  async correlateEvents(newEvent) {
    const window = Date.now() - this.options.correlationWindow;
    const recentEvents = this.recentEvents.filter(e => e.timestamp > window);

    for (const rule of this.correlationRules) {
      if (this.matchesCorrelationRule(recentEvents, newEvent, rule)) {
        console.log(`[IncidentOrchestrator] Correlation detected: ${rule.name}`);

        // Create or update incident based on correlation
        await this.handleCorrelation(recentEvents, newEvent, rule);
      }
    }
  }

  /**
   * Check if events match correlation rule
   */
  matchesCorrelationRule(recentEvents, newEvent, rule) {
    // Simple correlation based on event types and sources
    const requiredTypes = rule.eventTypes || [];
    const foundTypes = new Set();

    for (const event of [...recentEvents, newEvent]) {
      if (requiredTypes.includes(event.type)) {
        foundTypes.add(event.type);
      }
    }

    return foundTypes.size >= rule.minMatches;
  }

  /**
   * Handle correlated events
   */
  async handleCorrelation(events, newEvent, rule) {
    // Check if there's an existing incident for this correlation
    let incident = null;

    for (const [id, inc] of this.activeIncidents) {
      if (inc.tags.includes(rule.name)) {
        incident = inc;
        break;
      }
    }

    if (incident) {
      // Update existing incident
      incident.relatedEvents.push(newEvent);
      incident.updatedAt = Date.now();
      incident.timeline.push({
        timestamp: Date.now(),
        action: 'EVENT_CORRELATED',
        description: `Correlated event: ${newEvent.type}`,
        actor: 'system'
      });
    } else {
      // Create new incident
      const severityScore = rule.severity || 80;
      incident = await this.createIncident(newEvent, severityScore);
      incident.tags.push(rule.name);
      incident.description = rule.description;
    }

    this.emit('events-correlated', { incident, rule, events });
  }

  /**
   * Update incidents related to new event
   */
  async updateRelatedIncidents(event) {
    for (const [id, incident] of this.activeIncidents) {
      if (this.isEventRelated(incident, event)) {
        incident.relatedEvents.push(event);
        incident.updatedAt = Date.now();

        incident.timeline.push({
          timestamp: Date.now(),
          action: 'EVENT_ADDED',
          description: `Related event detected: ${event.type}`,
          actor: 'system'
        });

        this.emit('incident-updated', incident);
      }
    }
  }

  /**
   * Check if event is related to incident
   */
  isEventRelated(incident, event) {
    // Same IP address
    if (incident.triggerEvent.ip && incident.triggerEvent.ip === event.ip) {
      return true;
    }

    // Same attack type
    if (incident.triggerEvent.type === event.type) {
      return true;
    }

    // Same source
    if (incident.triggerEvent.source === event.source) {
      return true;
    }

    return false;
  }

  /**
   * Calculate severity score for event
   */
  calculateSeverityScore(event) {
    let score = 0;

    // Base score from event severity
    switch (event.severity) {
      case 'CRITICAL': score = 90; break;
      case 'HIGH': score = 70; break;
      case 'MEDIUM': score = 50; break;
      case 'LOW': score = 30; break;
      default: score = 40;
    }

    // Adjust based on threat level
    if (event.threatLevel === 'CRITICAL') score += 10;
    if (event.threatLevel === 'HIGH') score += 5;

    // Adjust based on blocked status
    if (!event.blocked) score += 10;

    // Adjust based on attack type
    const criticalTypes = ['COMMAND_INJECTION', 'SQL_INJECTION', 'DESERIALIZATION'];
    if (criticalTypes.includes(event.type)) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Get severity level from score
   */
  getSeverityLevel(score) {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate incident title
   */
  generateIncidentTitle(event) {
    return `${event.type} attack detected from ${event.ip || 'unknown source'}`;
  }

  /**
   * Generate tags for incident
   */
  generateTags(event) {
    const tags = [event.type, event.severity];

    if (event.source) tags.push(event.source);
    if (event.threatLevel) tags.push(`threat:${event.threatLevel}`);

    return tags;
  }

  /**
   * Map event to MITRE ATT&CK framework
   */
  mapToMitreAttack(event) {
    const mapping = this.mitreMapping[event.type] || null;

    if (mapping) {
      return {
        technique: mapping.technique,
        tactic: mapping.tactic,
        id: mapping.id
      };
    }

    return null;
  }

  /**
   * Find appropriate playbook for incident
   */
  findPlaybook(incident) {
    for (const playbook of this.playbooks) {
      if (this.matchesPlaybookCriteria(incident, playbook.criteria)) {
        return playbook;
      }
    }

    return null;
  }

  /**
   * Check if incident matches playbook criteria
   */
  matchesPlaybookCriteria(incident, criteria) {
    if (criteria.severity && incident.severity !== criteria.severity) {
      return false;
    }

    if (criteria.attackType && incident.triggerEvent.type !== criteria.attackType) {
      return false;
    }

    if (criteria.tags && !criteria.tags.every(tag => incident.tags.includes(tag))) {
      return false;
    }

    return true;
  }

  /**
   * Send notification
   */
  async sendNotification(incident, params) {
    console.log(`[IncidentOrchestrator] Sending notification for incident ${incident.id}`);
    this.emit('notification-sent', { incident, params });
  }

  /**
   * Create ticket in ticketing system
   */
  async createTicket(incident, params) {
    console.log(`[IncidentOrchestrator] Creating ticket for incident ${incident.id}`);
    this.emit('ticket-created', { incident, params });
  }

  /**
   * Run security scan
   */
  async runSecurityScan(incident, params) {
    console.log(`[IncidentOrchestrator] Running security scan for incident ${incident.id}`);
    this.emit('scan-started', { incident, params });
  }

  /**
   * Notify stakeholders
   */
  async notifyStakeholders(incident) {
    // High/Critical incidents notify immediately
    if (incident.severity === 'HIGH' || incident.severity === 'CRITICAL') {
      this.emit('stakeholder-notification', {
        incident,
        urgency: 'immediate',
        channels: ['email', 'slack', 'pagerduty']
      });
    }
  }

  /**
   * Auto-close old incidents
   */
  autoCloseIncidents() {
    const cutoff = Date.now() - this.options.autoCloseAfter;

    for (const [id, incident] of this.activeIncidents) {
      if (incident.updatedAt < cutoff && incident.status === 'OPEN') {
        this.closeIncident(id, 'Auto-closed after 24 hours of inactivity');
        this.metrics.autoResolved++;
      }
    }
  }

  /**
   * Close incident
   */
  closeIncident(incidentId, resolution) {
    const incident = this.activeIncidents.get(incidentId);

    if (!incident) {
      return { success: false, reason: 'incident-not-found' };
    }

    incident.status = 'CLOSED';
    incident.closedAt = Date.now();
    incident.resolution = resolution;
    incident.updatedAt = Date.now();

    incident.timeline.push({
      timestamp: Date.now(),
      action: 'CLOSED',
      description: resolution,
      actor: 'system'
    });

    // Move to closed incidents
    this.activeIncidents.delete(incidentId);
    this.closedIncidents.push(incident);

    // Calculate metrics
    const timeToDetect = incident.createdAt - incident.triggerEvent.timestamp;
    const timeToResolve = incident.closedAt - incident.createdAt;

    this.updateMetrics({ timeToDetect, timeToResolve });

    this.emit('incident-closed', incident);

    return { success: true, incident };
  }

  /**
   * Clean up old events
   */
  cleanupOldEvents() {
    const window = Date.now() - this.options.correlationWindow;
    this.recentEvents = this.recentEvents.filter(e => e.timestamp > window);
  }

  /**
   * Update metrics
   */
  updateMetrics(data) {
    if (data.timeToDetect) {
      this.metrics.avgTimeToDetect =
        (this.metrics.avgTimeToDetect * (this.metrics.totalIncidents - 1) + data.timeToDetect) /
        this.metrics.totalIncidents;
    }

    if (data.timeToResolve) {
      const closedCount = this.closedIncidents.length;
      this.metrics.avgTimeToResolve =
        (this.metrics.avgTimeToResolve * (closedCount - 1) + data.timeToResolve) /
        closedCount;
    }
  }

  /**
   * Load correlation rules
   */
  loadCorrelationRules() {
    return [
      {
        name: 'brute-force-attack',
        description: 'Multiple failed login attempts followed by successful login',
        eventTypes: ['BRUTE_FORCE', 'AUTHENTICATION_FAILURE', 'AUTHENTICATION_SUCCESS'],
        minMatches: 2,
        severity: 85
      },
      {
        name: 'lateral-movement',
        description: 'Multiple systems accessed from same IP',
        eventTypes: ['UNAUTHORIZED_ACCESS', 'PRIVILEGE_ESCALATION'],
        minMatches: 2,
        severity: 90
      },
      {
        name: 'data-exfiltration',
        description: 'Large data transfer after suspicious activity',
        eventTypes: ['SUSPICIOUS_ACTIVITY', 'LARGE_TRANSFER'],
        minMatches: 2,
        severity: 95
      }
    ];
  }

  /**
   * Load response playbooks
   */
  loadPlaybooks() {
    return [
      {
        name: 'Critical Attack Response',
        criteria: { severity: 'CRITICAL' },
        actions: [
          { type: 'BLOCK_IP', description: 'Block attacking IP address' },
          { type: 'COLLECT_EVIDENCE', description: 'Collect forensic evidence' },
          { type: 'NOTIFY', params: { channel: 'pagerduty' }, description: 'Notify on-call team' },
          { type: 'ESCALATE', description: 'Escalate to security team' }
        ]
      },
      {
        name: 'SQL Injection Response',
        criteria: { attackType: 'SQL_INJECTION' },
        actions: [
          { type: 'BLOCK_IP', description: 'Block attacker IP' },
          { type: 'COLLECT_EVIDENCE', description: 'Collect query logs' },
          { type: 'RUN_SCAN', params: { type: 'vulnerability' }, description: 'Scan for SQL vulnerabilities' }
        ]
      }
    ];
  }

  /**
   * Load MITRE ATT&CK mapping
   */
  loadMitreMapping() {
    return {
      'SQL_INJECTION': {
        technique: 'Exploit Public-Facing Application',
        tactic: 'Initial Access',
        id: 'T1190'
      },
      'COMMAND_INJECTION': {
        technique: 'Command and Scripting Interpreter',
        tactic: 'Execution',
        id: 'T1059'
      },
      'BRUTE_FORCE': {
        technique: 'Brute Force',
        tactic: 'Credential Access',
        id: 'T1110'
      }
    };
  }

  /**
   * Generate incident ID
   */
  generateIncidentId() {
    const crypto = require('crypto');
    return `INC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Get incident statistics
   */
  getStatistics() {
    return {
      metrics: this.metrics,
      active: this.activeIncidents.size,
      closed: this.closedIncidents.length,
      bySeverity: this.getIncidentsBySeverity()
    };
  }

  /**
   * Get incidents grouped by severity
   */
  getIncidentsBySeverity() {
    const bySeverity = {};
    for (const incident of this.activeIncidents.values()) {
      bySeverity[incident.severity] = (bySeverity[incident.severity] || 0) + 1;
    }
    return bySeverity;
  }

  /**
   * Shutdown incident orchestrator
   */
  async shutdown() {
    console.log('[IncidentOrchestrator] Shutting down incident orchestrator...');

    if (this.autoCloseTimer) {
      clearInterval(this.autoCloseTimer);
    }

    this.emit('shutdown');
    console.log('[IncidentOrchestrator] Incident orchestrator shut down');
  }
}

module.exports = IncidentOrchestrator;
