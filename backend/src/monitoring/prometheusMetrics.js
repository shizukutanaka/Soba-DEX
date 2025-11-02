/**
 * Prometheus Metrics Exporter for Security Monitoring
 *
 * Exports comprehensive security and performance metrics
 * Compatible with Prometheus, Grafana, and other monitoring tools
 */

const promClient = require('prom-client');
const { logger } = require('../utils/productionLogger');

class PrometheusMetrics {
  constructor() {
    // Create a Registry
    this.register = new promClient.Registry();

    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'security_monitor_'
    });

    this.initializeMetrics();
  }

  initializeMetrics() {
    // === Security Event Metrics ===

    // Total security events counter
    this.securityEventsTotal = new promClient.Counter({
      name: 'security_events_total',
      help: 'Total number of security events processed',
      labelNames: ['type', 'severity'],
      registers: [this.register]
    });

    // Active security events gauge
    this.activeSecurityEvents = new promClient.Gauge({
      name: 'security_events_active',
      help: 'Current number of active security events',
      registers: [this.register]
    });

    // === Threat Detection Metrics ===

    // Threats detected counter
    this.threatsDetected = new promClient.Counter({
      name: 'security_threats_detected_total',
      help: 'Total number of threats detected',
      labelNames: ['type', 'severity'],
      registers: [this.register]
    });

    // Threat detection rate gauge
    this.threatDetectionRate = new promClient.Gauge({
      name: 'security_threat_detection_rate',
      help: 'Current threat detection rate (threats per minute)',
      registers: [this.register]
    });

    // === Attack Type Metrics ===

    // SQL Injection attacks
    this.sqlInjectionAttacks = new promClient.Counter({
      name: 'security_sql_injection_total',
      help: 'Total SQL injection attempts detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // XSS attacks
    this.xssAttacks = new promClient.Counter({
      name: 'security_xss_attacks_total',
      help: 'Total XSS attacks detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // CSRF attacks
    this.csrfAttacks = new promClient.Counter({
      name: 'security_csrf_attacks_total',
      help: 'Total CSRF attacks detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // DDoS attacks
    this.ddosAttacks = new promClient.Counter({
      name: 'security_ddos_attacks_total',
      help: 'Total DDoS attacks detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // Brute force attacks
    this.bruteForceAttacks = new promClient.Counter({
      name: 'security_brute_force_total',
      help: 'Total brute force attacks detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // Path traversal attempts
    this.pathTraversalAttempts = new promClient.Counter({
      name: 'security_path_traversal_total',
      help: 'Total path traversal attempts detected',
      labelNames: ['blocked'],
      registers: [this.register]
    });

    // === Advanced Threat Metrics ===

    // LDAP injection
    this.ldapInjection = new promClient.Counter({
      name: 'security_ldap_injection_total',
      help: 'Total LDAP injection attempts detected',
      registers: [this.register]
    });

    // XXE attacks
    this.xxeAttacks = new promClient.Counter({
      name: 'security_xxe_attacks_total',
      help: 'Total XXE attacks detected',
      registers: [this.register]
    });

    // SSRF attacks
    this.ssrfAttacks = new promClient.Counter({
      name: 'security_ssrf_attacks_total',
      help: 'Total SSRF attacks detected',
      registers: [this.register]
    });

    // Prototype pollution
    this.prototypePollution = new promClient.Counter({
      name: 'security_prototype_pollution_total',
      help: 'Total prototype pollution attempts detected',
      registers: [this.register]
    });

    // NoSQL injection
    this.nosqlInjection = new promClient.Counter({
      name: 'security_nosql_injection_total',
      help: 'Total NoSQL injection attempts detected',
      registers: [this.register]
    });

    // === Incident Metrics ===

    // Total incidents
    this.incidentsTotal = new promClient.Counter({
      name: 'security_incidents_total',
      help: 'Total security incidents created',
      labelNames: ['type', 'severity', 'status'],
      registers: [this.register]
    });

    // Active incidents
    this.activeIncidents = new promClient.Gauge({
      name: 'security_incidents_active',
      help: 'Current number of active incidents',
      labelNames: ['severity'],
      registers: [this.register]
    });

    // Incident resolution time
    this.incidentResolutionTime = new promClient.Histogram({
      name: 'security_incident_resolution_seconds',
      help: 'Time taken to resolve security incidents',
      labelNames: ['type', 'severity'],
      buckets: [10, 30, 60, 300, 600, 1800, 3600, 7200], // 10s to 2h
      registers: [this.register]
    });

    // === Anomaly Detection Metrics ===

    // Anomalies detected
    this.anomaliesDetected = new promClient.Counter({
      name: 'security_anomalies_detected_total',
      help: 'Total anomalies detected',
      labelNames: ['type'],
      registers: [this.register]
    });

    // Anomaly score
    this.anomalyScore = new promClient.Gauge({
      name: 'security_anomaly_score',
      help: 'Current anomaly score',
      labelNames: ['metric'],
      registers: [this.register]
    });

    // === Performance Metrics ===

    // Request processing time
    this.requestProcessingTime = new promClient.Histogram({
      name: 'security_request_processing_seconds',
      help: 'Time taken to process security checks',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // Response time by threat level
    this.responseTimeByThreat = new promClient.Histogram({
      name: 'security_response_time_by_threat_seconds',
      help: 'Response time categorized by threat level',
      labelNames: ['threat_level'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register]
    });

    // === Rate Limiting Metrics ===

    // Rate limit violations
    this.rateLimitViolations = new promClient.Counter({
      name: 'security_rate_limit_violations_total',
      help: 'Total rate limit violations',
      labelNames: ['ip'],
      registers: [this.register]
    });

    // Blocked requests
    this.blockedRequests = new promClient.Counter({
      name: 'security_blocked_requests_total',
      help: 'Total requests blocked by security monitor',
      labelNames: ['reason'],
      registers: [this.register]
    });

    // === Memory Metrics ===

    // Memory usage
    this.memoryUsage = new promClient.Gauge({
      name: 'security_memory_usage_bytes',
      help: 'Memory usage of security monitor components',
      labelNames: ['component'],
      registers: [this.register]
    });

    // Event map size
    this.eventMapSize = new promClient.Gauge({
      name: 'security_event_map_size',
      help: 'Size of security event map',
      registers: [this.register]
    });

    // Incident history size
    this.incidentHistorySize = new promClient.Gauge({
      name: 'security_incident_history_size',
      help: 'Size of incident history',
      registers: [this.register]
    });

    // === Alert Metrics ===

    // Alerts sent
    this.alertsSent = new promClient.Counter({
      name: 'security_alerts_sent_total',
      help: 'Total security alerts sent',
      labelNames: ['type', 'severity', 'channel'],
      registers: [this.register]
    });

    // Alert latency
    this.alertLatency = new promClient.Histogram({
      name: 'security_alert_latency_seconds',
      help: 'Time from threat detection to alert sent',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register]
    });

    // === Traffic Metrics ===

    // Request rate
    this.requestRate = new promClient.Gauge({
      name: 'security_request_rate',
      help: 'Current request rate (requests per second)',
      registers: [this.register]
    });

    // Error rate
    this.errorRate = new promClient.Gauge({
      name: 'security_error_rate',
      help: 'Current error rate (percentage)',
      registers: [this.register]
    });

    // Unique IPs
    this.uniqueIPs = new promClient.Gauge({
      name: 'security_unique_ips',
      help: 'Number of unique IP addresses',
      registers: [this.register]
    });

    // === False Positive Metrics ===

    // False positives
    this.falsePositives = new promClient.Counter({
      name: 'security_false_positives_total',
      help: 'Total false positive detections',
      labelNames: ['type'],
      registers: [this.register]
    });

    // False positive rate
    this.falsePositiveRate = new promClient.Gauge({
      name: 'security_false_positive_rate',
      help: 'Current false positive rate (percentage)',
      registers: [this.register]
    });

    // === Health Metrics ===

    // System health
    this.systemHealth = new promClient.Gauge({
      name: 'security_system_health',
      help: 'Overall system health score (0-100)',
      registers: [this.register]
    });

    // Component status
    this.componentStatus = new promClient.Gauge({
      name: 'security_component_status',
      help: 'Status of security components (1=healthy, 0=unhealthy)',
      labelNames: ['component'],
      registers: [this.register]
    });
  }

  /**
   * Update metrics from security monitor statistics
   */
  updateFromStats(stats) {
    try {
      // Active events
      this.activeSecurityEvents.set(stats.activeEvents || 0);
      this.eventMapSize.set(stats.activeEvents || 0);

      // Incidents
      this.incidentHistorySize.set(stats.incidentHistory?.length || 0);

      // Threat score
      this.anomalyScore.set({ metric: 'threat_score' }, stats.threatScore || 0);

      // Request rate
      this.requestRate.set(stats.requestRate || 0);

      // Error rate
      this.errorRate.set(stats.errorRate || 0);

      // Unique IPs
      this.uniqueIPs.set(stats.uniqueIPs || 0);

      // False positive rate
      if (stats.falsePositiveRate !== undefined) {
        this.falsePositiveRate.set(stats.falsePositiveRate);
      }

      // Performance metrics
      if (stats.performanceMetrics) {
        const perfMetrics = stats.performanceMetrics;
        if (perfMetrics.avgProcessingTime !== undefined) {
          this.requestProcessingTime.observe(perfMetrics.avgProcessingTime / 1000);
        }
      }

      // Component health
      this.updateComponentHealth(stats);

    } catch (error) {
      logger.error('Error updating Prometheus metrics', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Update component health metrics
   */
  updateComponentHealth(stats) {
    // Calculate overall health score
    let healthScore = 100;

    // Penalize for high threat count
    if (stats.threatsDetected > 100) {
      healthScore -= 20;
    } else if (stats.threatsDetected > 50) {
      healthScore -= 10;
    }

    // Penalize for high error rate
    if (stats.errorRate > 10) {
      healthScore -= 30;
    } else if (stats.errorRate > 5) {
      healthScore -= 15;
    }

    // Penalize for high memory usage
    const memoryUsagePercent = (stats.activeEvents / stats.limits?.maxEvents || 1) * 100;
    if (memoryUsagePercent > 90) {
      healthScore -= 25;
    } else if (memoryUsagePercent > 75) {
      healthScore -= 10;
    }

    this.systemHealth.set(Math.max(0, healthScore));

    // Individual component status
    this.componentStatus.set({ component: 'threat_detection' },
      stats.config?.threatDetectionEnabled ? 1 : 0);
    this.componentStatus.set({ component: 'anomaly_detection' },
      stats.config?.anomalyDetectionEnabled ? 1 : 0);
    this.componentStatus.set({ component: 'behavioral_analysis' },
      stats.config?.behavioralAnalysisEnabled ? 1 : 0);
    this.componentStatus.set({ component: 'incident_response' },
      stats.config?.incidentResponseEnabled ? 1 : 0);
  }

  /**
   * Record a security event
   */
  recordEvent(type, severity) {
    this.securityEventsTotal.inc({ type, severity });
  }

  /**
   * Record a detected threat
   */
  recordThreat(type, severity, blocked = false) {
    this.threatsDetected.inc({ type, severity });

    // Increment specific threat counter
    switch (type) {
      case 'SQL_INJECTION':
        this.sqlInjectionAttacks.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'XSS_ATTACK':
        this.xssAttacks.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'CSRF_ATTACK':
        this.csrfAttacks.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'DDOS_ATTACK':
        this.ddosAttacks.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'BRUTE_FORCE':
        this.bruteForceAttacks.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'PATH_TRAVERSAL':
        this.pathTraversalAttempts.inc({ blocked: blocked ? 'true' : 'false' });
        break;
      case 'LDAP_INJECTION':
        this.ldapInjection.inc();
        break;
      case 'XXE_ATTACK':
        this.xxeAttacks.inc();
        break;
      case 'SSRF_ATTACK':
        this.ssrfAttacks.inc();
        break;
      case 'PROTOTYPE_POLLUTION':
        this.prototypePollution.inc();
        break;
      case 'NOSQL_INJECTION':
        this.nosqlInjection.inc();
        break;
    }
  }

  /**
   * Record an incident
   */
  recordIncident(type, severity, status) {
    this.incidentsTotal.inc({ type, severity, status });
  }

  /**
   * Record incident resolution
   */
  recordIncidentResolution(type, severity, durationSeconds) {
    this.incidentResolutionTime.observe({ type, severity }, durationSeconds);
  }

  /**
   * Record an anomaly
   */
  recordAnomaly(type) {
    this.anomaliesDetected.inc({ type });
  }

  /**
   * Record request processing time
   */
  recordProcessingTime(seconds) {
    this.requestProcessingTime.observe(seconds);
  }

  /**
   * Record rate limit violation
   */
  recordRateLimitViolation(ip) {
    this.rateLimitViolations.inc({ ip });
  }

  /**
   * Record blocked request
   */
  recordBlockedRequest(reason) {
    this.blockedRequests.inc({ reason });
  }

  /**
   * Record alert sent
   */
  recordAlert(type, severity, channel) {
    this.alertsSent.inc({ type, severity, channel });
  }

  /**
   * Record alert latency
   */
  recordAlertLatency(seconds) {
    this.alertLatency.observe(seconds);
  }

  /**
   * Record false positive
   */
  recordFalsePositive(type) {
    this.falsePositives.inc({ type });
  }

  /**
   * Get metrics in Prometheus format
   */
  getMetrics() {
    return this.register.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON() {
    return await this.register.getMetricsAsJSON();
  }

  /**
   * Express middleware to expose metrics endpoint
   */
  metricsEndpoint() {
    return async (req, res) => {
      try {
        res.set('Content-Type', this.register.contentType);
        res.end(await this.getMetrics());
      } catch (error) {
        res.status(500).end(error.message);
      }
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.register.clear();
    this.initializeMetrics();
  }
}

// Export singleton
const prometheusMetrics = new PrometheusMetrics();

module.exports = prometheusMetrics;
module.exports.PrometheusMetrics = PrometheusMetrics;
