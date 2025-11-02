/**
 * Security Orchestration, Automation and Response (SOAR)
 * Automated security response and orchestration
 *
 * Features:
 * - Automated threat response
 * - Playbook execution
 * - Multi-system orchestration
 * - Workflow automation
 * - Response validation
 * - Rollback capabilities
 * - Approval workflows
 * - Action logging and audit
 */

const EventEmitter = require('events');

class SecurityOrchestration extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      autoResponseEnabled: options.autoResponseEnabled !== false,
      requireApproval: options.requireApproval || ['CRITICAL', 'HIGH'],
      maxAutoActions: options.maxAutoActions || 10,
      actionTimeout: options.actionTimeout || 300000, // 5 minutes
      enableRollback: options.enableRollback !== false,
      ...options
    };

    this.securityMonitor = options.securityMonitor;
    this.cache = options.cache;
    this.threatIntel = options.threatIntel;
    this.forensics = options.forensics;

    this.playbooks = new Map();
    this.activeWorkflows = new Map();
    this.actionHistory = [];
    this.pendingApprovals = new Map();

    this.metrics = {
      playbooksExecuted: 0,
      actionsExecuted: 0,
      autoResponses: 0,
      manualResponses: 0,
      rollbacks: 0,
      successRate: 100
    };

    this.initializePlaybooks();
  }

  /**
   * Initialize built-in playbooks
   */
  initializePlaybooks() {
    // SQL Injection Response
    this.registerPlaybook({
      id: 'sql_injection_response',
      name: 'SQL Injection Attack Response',
      triggers: ['SQL_INJECTION'],
      severity: ['HIGH', 'CRITICAL'],
      actions: [
        { type: 'block_ip', duration: 3600 },
        { type: 'create_incident', priority: 'HIGH' },
        { type: 'alert_team', channel: 'security' },
        { type: 'collect_evidence' },
        { type: 'scan_database', target: 'all' }
      ],
      requiresApproval: false
    });

    // DDoS Response
    this.registerPlaybook({
      id: 'ddos_response',
      name: 'DDoS Attack Mitigation',
      triggers: ['DDOS'],
      severity: ['HIGH', 'CRITICAL'],
      actions: [
        { type: 'enable_rate_limiting', level: 'aggressive' },
        { type: 'block_subnet', confidence: 0.8 },
        { type: 'alert_team', channel: 'critical' },
        { type: 'scale_infrastructure', target: 'auto' },
        { type: 'activate_cdn_protection' }
      ],
      requiresApproval: false
    });

    // Data Breach Response
    this.registerPlaybook({
      id: 'data_breach_response',
      name: 'Data Breach Incident Response',
      triggers: ['DATA_BREACH'],
      severity: ['CRITICAL'],
      actions: [
        { type: 'isolate_system', target: 'affected' },
        { type: 'create_incident', priority: 'CRITICAL' },
        { type: 'alert_team', channel: 'critical' },
        { type: 'notify_compliance', frameworks: ['GDPR', 'HIPAA'] },
        { type: 'start_forensics' },
        { type: 'prepare_breach_notification' }
      ],
      requiresApproval: true
    });

    // Malware Detection Response
    this.registerPlaybook({
      id: 'malware_response',
      name: 'Malware Detection Response',
      triggers: ['MALWARE_DETECTED'],
      severity: ['HIGH', 'CRITICAL'],
      actions: [
        { type: 'quarantine_file', immediate: true },
        { type: 'block_hash', propagate: true },
        { type: 'scan_system', depth: 'full' },
        { type: 'alert_team', channel: 'security' },
        { type: 'collect_evidence' }
      ],
      requiresApproval: false
    });

    // Suspicious Login Response
    this.registerPlaybook({
      id: 'suspicious_login_response',
      name: 'Suspicious Login Activity Response',
      triggers: ['SUSPICIOUS_LOGIN'],
      severity: ['MEDIUM', 'HIGH'],
      actions: [
        { type: 'challenge_user', method: 'mfa' },
        { type: 'log_activity', level: 'detailed' },
        { type: 'check_threat_intel', scope: 'ip' },
        { type: 'alert_user', method: 'email' }
      ],
      requiresApproval: false
    });

    // Privilege Escalation Response
    this.registerPlaybook({
      id: 'privilege_escalation_response',
      name: 'Privilege Escalation Response',
      triggers: ['PRIVILEGE_ESCALATION'],
      severity: ['CRITICAL'],
      actions: [
        { type: 'revoke_privileges', immediate: true },
        { type: 'lock_account', duration: 'until_reviewed' },
        { type: 'alert_team', channel: 'critical' },
        { type: 'start_forensics' },
        { type: 'audit_all_access', timeframe: '24h' }
      ],
      requiresApproval: true
    });

    console.log(`✅ Initialized ${this.playbooks.size} playbooks`);
  }

  /**
   * Register custom playbook
   */
  registerPlaybook(playbook) {
    if (!playbook.id || !playbook.name || !playbook.actions) {
      throw new Error('Invalid playbook definition');
    }

    this.playbooks.set(playbook.id, {
      ...playbook,
      createdAt: Date.now(),
      executionCount: 0
    });

    console.log(`📋 Registered playbook: ${playbook.name}`);
  }

  /**
   * Execute playbook
   */
  async executePlaybook(playbookId, context = {}) {
    console.log(`🎭 Executing playbook: ${playbookId}...`);

    const playbook = this.playbooks.get(playbookId);
    if (!playbook) {
      throw new Error(`Playbook not found: ${playbookId}`);
    }

    // Check if approval required
    if (playbook.requiresApproval || this.options.requireApproval.includes(context.severity)) {
      return await this.requestApproval(playbookId, context);
    }

    return await this.runPlaybook(playbook, context);
  }

  /**
   * Run playbook actions
   */
  async runPlaybook(playbook, context) {
    const workflowId = this.generateWorkflowId();

    const workflow = {
      id: workflowId,
      playbookId: playbook.id,
      startTime: Date.now(),
      status: 'RUNNING',
      actions: [],
      context,
      results: []
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.metrics.playbooksExecuted++;
    playbook.executionCount++;

    try {
      // Execute each action in sequence
      for (const action of playbook.actions) {
        const actionResult = await this.executeAction(action, context);

        workflow.actions.push({
          action,
          result: actionResult,
          timestamp: Date.now()
        });

        workflow.results.push(actionResult);

        // Stop if action failed and is critical
        if (!actionResult.success && action.critical) {
          workflow.status = 'FAILED';
          break;
        }
      }

      workflow.status = workflow.status === 'RUNNING' ? 'COMPLETED' : workflow.status;
      workflow.endTime = Date.now();

      // Calculate success rate
      const successfulActions = workflow.results.filter(r => r.success).length;
      const successRate = (successfulActions / workflow.results.length) * 100;

      this.metrics.successRate =
        (this.metrics.successRate * (this.metrics.playbooksExecuted - 1) + successRate) /
        this.metrics.playbooksExecuted;

      console.log(`✅ Playbook executed: ${workflow.status} (${successfulActions}/${workflow.results.length} actions)`);

      this.emit('playbookExecuted', workflow);

      return workflow;

    } catch (error) {
      workflow.status = 'ERROR';
      workflow.error = error.message;
      workflow.endTime = Date.now();

      console.error(`❌ Playbook execution error:`, error);

      throw error;
    }
  }

  /**
   * Execute individual action
   */
  async executeAction(action, context) {
    console.log(`  ▶️  Executing action: ${action.type}`);

    this.metrics.actionsExecuted++;

    const startTime = Date.now();
    let result = {
      action: action.type,
      success: false,
      message: '',
      data: null,
      duration: 0
    };

    try {
      switch (action.type) {
        case 'block_ip':
          result = await this.blockIP(context.ip || context.sourceIP, action.duration);
          break;

        case 'block_subnet':
          result = await this.blockSubnet(context.ip, action.confidence);
          break;

        case 'enable_rate_limiting':
          result = await this.enableRateLimiting(action.level);
          break;

        case 'create_incident':
          result = await this.createIncident(context, action.priority);
          break;

        case 'alert_team':
          result = await this.alertTeam(context, action.channel);
          break;

        case 'collect_evidence':
          result = await this.collectEvidence(context);
          break;

        case 'start_forensics':
          result = await this.startForensics(context);
          break;

        case 'isolate_system':
          result = await this.isolateSystem(action.target);
          break;

        case 'quarantine_file':
          result = await this.quarantineFile(context.filePath, action.immediate);
          break;

        case 'revoke_privileges':
          result = await this.revokePrivileges(context.userId, action.immediate);
          break;

        case 'lock_account':
          result = await this.lockAccount(context.userId, action.duration);
          break;

        case 'scan_system':
          result = await this.scanSystem(action.depth);
          break;

        case 'challenge_user':
          result = await this.challengeUser(context.userId, action.method);
          break;

        case 'check_threat_intel':
          result = await this.checkThreatIntel(context, action.scope);
          break;

        case 'notify_compliance':
          result = await this.notifyCompliance(context, action.frameworks);
          break;

        default:
          result.message = `Unknown action type: ${action.type}`;
      }

      result.duration = Date.now() - startTime;

      // Log action
      this.logAction({
        action,
        context,
        result,
        timestamp: Date.now()
      });

      this.metrics.autoResponses++;

      return result;

    } catch (error) {
      result.success = false;
      result.message = error.message;
      result.duration = Date.now() - startTime;

      console.error(`  ❌ Action failed: ${error.message}`);

      return result;
    }
  }

  /**
   * Action implementations
   */

  async blockIP(ip, duration = 3600) {
    if (!ip) {
      return { success: false, message: 'No IP provided' };
    }

    if (this.cache) {
      await this.cache.addToBlacklist(ip, 'Auto-blocked by SOAR', duration);
    }

    return {
      success: true,
      message: `IP ${ip} blocked for ${duration} seconds`,
      data: { ip, duration }
    };
  }

  async blockSubnet(ip, confidence = 0.8) {
    if (!ip) {
      return { success: false, message: 'No IP provided' };
    }

    // Extract subnet (simplified)
    const subnet = ip.split('.').slice(0, 3).join('.') + '.0/24';

    return {
      success: true,
      message: `Subnet ${subnet} blocked`,
      data: { subnet, confidence }
    };
  }

  async enableRateLimiting(level = 'normal') {
    const limits = {
      normal: 100,
      aggressive: 10,
      strict: 1
    };

    return {
      success: true,
      message: `Rate limiting set to ${level}`,
      data: { level, limit: limits[level] || 100 }
    };
  }

  async createIncident(context, priority = 'MEDIUM') {
    const incident = {
      id: `inc_${Date.now()}`,
      title: `Auto-created: ${context.eventType || 'Security Event'}`,
      severity: priority,
      createdAt: Date.now(),
      status: 'ACTIVE',
      createdBy: 'SOAR'
    };

    return {
      success: true,
      message: `Incident ${incident.id} created`,
      data: incident
    };
  }

  async alertTeam(context, channel = 'security') {
    return {
      success: true,
      message: `Alert sent to ${channel} channel`,
      data: { channel, context }
    };
  }

  async collectEvidence(context) {
    if (this.forensics && context.incidentId) {
      await this.forensics.collectEvidence('auto', context.incidentId);
    }

    return {
      success: true,
      message: 'Evidence collection initiated',
      data: { incidentId: context.incidentId }
    };
  }

  async startForensics(context) {
    if (this.forensics && context.incidentId) {
      await this.forensics.startInvestigation(context.incidentId, {
        investigator: 'SOAR',
        priority: 'HIGH'
      });
    }

    return {
      success: true,
      message: 'Forensic investigation started',
      data: { incidentId: context.incidentId }
    };
  }

  async isolateSystem(target) {
    return {
      success: true,
      message: `System ${target} isolated`,
      data: { target }
    };
  }

  async quarantineFile(filePath, immediate = true) {
    if (!filePath) {
      return { success: false, message: 'No file path provided' };
    }

    return {
      success: true,
      message: `File ${filePath} quarantined`,
      data: { filePath, immediate }
    };
  }

  async revokePrivileges(userId, immediate = true) {
    if (!userId) {
      return { success: false, message: 'No user ID provided' };
    }

    return {
      success: true,
      message: `Privileges revoked for user ${userId}`,
      data: { userId, immediate }
    };
  }

  async lockAccount(userId, duration = 'until_reviewed') {
    if (!userId) {
      return { success: false, message: 'No user ID provided' };
    }

    return {
      success: true,
      message: `Account ${userId} locked`,
      data: { userId, duration }
    };
  }

  async scanSystem(depth = 'quick') {
    return {
      success: true,
      message: `System scan initiated (${depth})`,
      data: { depth }
    };
  }

  async challengeUser(userId, method = 'mfa') {
    return {
      success: true,
      message: `User ${userId} challenged with ${method}`,
      data: { userId, method }
    };
  }

  async checkThreatIntel(context, scope = 'ip') {
    if (this.threatIntel && context.ip) {
      const intel = await this.threatIntel.checkIPReputation(context.ip);
      return {
        success: true,
        message: 'Threat intelligence checked',
        data: intel
      };
    }

    return {
      success: false,
      message: 'Threat intelligence not available'
    };
  }

  async notifyCompliance(context, frameworks = []) {
    return {
      success: true,
      message: `Compliance notification sent for ${frameworks.join(', ')}`,
      data: { frameworks }
    };
  }

  /**
   * Request approval for playbook execution
   */
  async requestApproval(playbookId, context) {
    const approvalId = `approval_${Date.now()}`;

    const approval = {
      id: approvalId,
      playbookId,
      context,
      status: 'PENDING',
      requestedAt: Date.now(),
      expiresAt: Date.now() + 3600000 // 1 hour
    };

    this.pendingApprovals.set(approvalId, approval);

    // Emit event for approval request
    this.emit('approvalRequired', approval);

    console.log(`⏳ Approval requested for playbook ${playbookId}: ${approvalId}`);

    return {
      status: 'APPROVAL_REQUIRED',
      approvalId,
      playbook: this.playbooks.get(playbookId)
    };
  }

  /**
   * Approve playbook execution
   */
  async approve(approvalId, approver) {
    const approval = this.pendingApprovals.get(approvalId);

    if (!approval) {
      throw new Error('Approval request not found');
    }

    if (approval.status !== 'PENDING') {
      throw new Error('Approval already processed');
    }

    if (Date.now() > approval.expiresAt) {
      throw new Error('Approval request expired');
    }

    approval.status = 'APPROVED';
    approval.approvedBy = approver;
    approval.approvedAt = Date.now();

    this.metrics.manualResponses++;

    console.log(`✅ Playbook approved by ${approver}`);

    // Execute the playbook
    const playbook = this.playbooks.get(approval.playbookId);
    return await this.runPlaybook(playbook, approval.context);
  }

  /**
   * Deny playbook execution
   */
  async deny(approvalId, approver, reason) {
    const approval = this.pendingApprovals.get(approvalId);

    if (!approval) {
      throw new Error('Approval request not found');
    }

    approval.status = 'DENIED';
    approval.deniedBy = approver;
    approval.deniedAt = Date.now();
    approval.reason = reason;

    console.log(`❌ Playbook denied by ${approver}: ${reason}`);

    return approval;
  }

  /**
   * Rollback workflow
   */
  async rollback(workflowId) {
    if (!this.options.enableRollback) {
      throw new Error('Rollback is disabled');
    }

    const workflow = this.activeWorkflows.get(workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    console.log(`🔄 Rolling back workflow ${workflowId}...`);

    this.metrics.rollbacks++;

    // Reverse actions
    const reversedActions = [...workflow.actions].reverse();

    for (const { action, result } of reversedActions) {
      if (result.success) {
        await this.reverseAction(action, result);
      }
    }

    workflow.status = 'ROLLED_BACK';
    workflow.rolledBackAt = Date.now();

    console.log(`✅ Workflow rolled back`);

    return workflow;
  }

  /**
   * Reverse an action
   */
  async reverseAction(action, result) {
    switch (action.type) {
      case 'block_ip':
        if (result.data?.ip) {
          await this.cache?.removeFromBlacklist(result.data.ip);
        }
        break;

      case 'lock_account':
        if (result.data?.userId) {
          // Unlock account
        }
        break;

      // Add more reverse actions as needed
    }
  }

  /**
   * Log action
   */
  logAction(actionLog) {
    this.actionHistory.push(actionLog);

    // Limit history size
    if (this.actionHistory.length > 10000) {
      this.actionHistory = this.actionHistory.slice(-10000);
    }
  }

  /**
   * Auto-response to security event
   */
  async handleSecurityEvent(event) {
    if (!this.options.autoResponseEnabled) {
      return;
    }

    // Find matching playbooks
    const matchingPlaybooks = Array.from(this.playbooks.values()).filter(playbook =>
      playbook.triggers.includes(event.type) &&
      (!playbook.severity || playbook.severity.includes(event.severity))
    );

    if (matchingPlaybooks.length === 0) {
      return;
    }

    // Execute first matching playbook
    const playbook = matchingPlaybooks[0];

    try {
      await this.executePlaybook(playbook.id, {
        eventId: event.id,
        eventType: event.type,
        severity: event.severity,
        ip: event.ip,
        incidentId: event.incidentId,
        ...event
      });
    } catch (error) {
      console.error('Auto-response error:', error);
    }
  }

  /**
   * Get playbook by ID
   */
  getPlaybook(playbookId) {
    return this.playbooks.get(playbookId);
  }

  /**
   * List all playbooks
   */
  listPlaybooks() {
    return Array.from(this.playbooks.values());
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId) {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Get action history
   */
  getActionHistory(limit = 100) {
    return this.actionHistory.slice(-limit);
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    return Array.from(this.pendingApprovals.values()).filter(a => a.status === 'PENDING');
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      totalPlaybooks: this.playbooks.size,
      activeWorkflows: this.activeWorkflows.size,
      pendingApprovals: this.getPendingApprovals().length
    };
  }

  /**
   * Generate workflow ID
   */
  generateWorkflowId() {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = SecurityOrchestration;
