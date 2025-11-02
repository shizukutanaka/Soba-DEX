/**
 * Distributed Tracing and Observability Platform
 * OpenTelemetry-based distributed tracing with advanced observability
 *
 * Features:
 * - Distributed request tracing
 * - Service dependency mapping
 * - Performance bottleneck detection
 * - Error correlation across services
 * - Custom span attributes
 * - Trace sampling
 * - Context propagation
 * - Integration with Jaeger/Zipkin
 */

const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis-4');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const api = require('@opentelemetry/api');
const EventEmitter = require('events');

class DistributedTracing extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      serviceName: options.serviceName || 'dex-security-monitor',
      serviceVersion: options.serviceVersion || '1.0.0',
      environment: options.environment || 'production',
      jaegerEndpoint: options.jaegerEndpoint || 'http://localhost:14268/api/traces',
      zipkinEndpoint: options.zipkinEndpoint || 'http://localhost:9411/api/v2/spans',
      sampleRate: options.sampleRate || 1.0, // 100% sampling by default
      enableConsole: options.enableConsole || false,
      customAttributes: options.customAttributes || {},
      ...options
    };

    this.provider = null;
    this.tracer = null;
    this.activeSpans = new Map();
    this.serviceDependencies = new Map();
    this.performanceMetrics = new Map();

    this.metrics = {
      tracesCreated: 0,
      spansCreated: 0,
      errorsTraced: 0,
      avgSpanDuration: 0,
      slowestSpans: []
    };
  }

  /**
   * Initialize tracing
   */
  async initialize() {
    console.log('🔍 Initializing Distributed Tracing...');

    // Create resource
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.options.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.options.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.options.environment,
      ...this.options.customAttributes
    });

    // Create provider
    this.provider = new NodeTracerProvider({
      resource,
      sampler: this.createSampler()
    });

    // Add exporters
    if (this.options.jaegerEndpoint) {
      const jaegerExporter = new JaegerExporter({
        endpoint: this.options.jaegerEndpoint
      });
      this.provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));
    }

    if (this.options.zipkinEndpoint) {
      const zipkinExporter = new ZipkinExporter({
        url: this.options.zipkinEndpoint,
        serviceName: this.options.serviceName
      });
      this.provider.addSpanProcessor(new BatchSpanProcessor(zipkinExporter));
    }

    if (this.options.enableConsole) {
      this.provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()));
    }

    // Register provider
    this.provider.register();

    // Get tracer
    this.tracer = api.trace.getTracer(
      this.options.serviceName,
      this.options.serviceVersion
    );

    // Register auto-instrumentations
    this.registerInstrumentations();

    console.log('✅ Distributed Tracing initialized');
  }

  /**
   * Create sampler
   */
  createSampler() {
    const { TraceIdRatioBasedSampler, ParentBasedSampler } = require('@opentelemetry/sdk-trace-base');

    // Parent-based sampler with ratio-based root sampler
    return new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(this.options.sampleRate)
    });
  }

  /**
   * Register auto-instrumentations
   */
  registerInstrumentations() {
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          requestHook: (span, request) => {
            this.enrichHttpSpan(span, request);
          }
        }),
        new ExpressInstrumentation(),
        new RedisInstrumentation(),
        new PgInstrumentation()
      ]
    });
  }

  /**
   * Start a new span
   */
  startSpan(name, options = {}) {
    const span = this.tracer.startSpan(name, {
      kind: options.kind || api.SpanKind.INTERNAL,
      attributes: options.attributes || {}
    });

    this.metrics.spansCreated++;

    const spanId = this.generateSpanId();
    this.activeSpans.set(spanId, {
      span,
      startTime: Date.now(),
      name,
      metadata: options.metadata || {}
    });

    return { span, spanId };
  }

  /**
   * End span
   */
  endSpan(spanId, options = {}) {
    const spanData = this.activeSpans.get(spanId);
    if (!spanData) return;

    const { span, startTime, name } = spanData;

    // Add final attributes
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }

    // Record exception if error
    if (options.error) {
      span.recordException(options.error);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: options.error.message });
      this.metrics.errorsTraced++;
    } else {
      span.setStatus({ code: api.SpanStatusCode.OK });
    }

    // End span
    span.end();

    // Calculate duration
    const duration = Date.now() - startTime;

    // Update metrics
    this.updateMetrics(name, duration);

    // Track performance
    this.trackPerformance(name, duration);

    // Remove from active spans
    this.activeSpans.delete(spanId);
  }

  /**
   * Trace async operation
   */
  async traceOperation(name, operation, options = {}) {
    const { span, spanId } = this.startSpan(name, options);

    const context = api.trace.setSpan(api.context.active(), span);

    try {
      const result = await api.context.with(context, operation);
      this.endSpan(spanId, { attributes: options.resultAttributes });
      return result;
    } catch (error) {
      this.endSpan(spanId, { error });
      throw error;
    }
  }

  /**
   * Trace security event
   */
  traceSecurityEvent(event) {
    const { span, spanId } = this.startSpan('security.event', {
      kind: api.SpanKind.SERVER,
      attributes: {
        'event.type': event.type,
        'event.severity': event.severity,
        'event.ip': event.ip,
        'event.id': event.id,
        'security.risk_score': event.riskScore || 0,
        'security.threat_level': event.threatLevel || 'UNKNOWN'
      }
    });

    // Track event processing
    return {
      spanId,
      addAttribute: (key, value) => span.setAttribute(key, value),
      recordException: (error) => span.recordException(error),
      end: (options = {}) => this.endSpan(spanId, options)
    };
  }

  /**
   * Trace HTTP request
   */
  traceHttpRequest(req, res) {
    const { span, spanId } = this.startSpan(`HTTP ${req.method} ${req.path}`, {
      kind: api.SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.hostname,
        'http.scheme': req.protocol,
        'http.user_agent': req.get('user-agent'),
        'http.client_ip': req.ip,
        'http.request_content_length': req.get('content-length')
      }
    });

    // Add response finish handler
    res.on('finish', () => {
      this.endSpan(spanId, {
        attributes: {
          'http.status_code': res.statusCode,
          'http.response_content_length': res.get('content-length')
        }
      });
    });

    return { span, spanId };
  }

  /**
   * Trace database query
   */
  traceDatabaseQuery(query, params = []) {
    return this.startSpan('database.query', {
      kind: api.SpanKind.CLIENT,
      attributes: {
        'db.system': 'postgresql',
        'db.statement': query.substring(0, 500), // Truncate long queries
        'db.operation': this.extractOperation(query),
        'db.params_count': params.length
      }
    });
  }

  /**
   * Trace Redis operation
   */
  traceRedisOperation(command, key) {
    return this.startSpan(`redis.${command}`, {
      kind: api.SpanKind.CLIENT,
      attributes: {
        'db.system': 'redis',
        'db.operation': command,
        'db.redis.key': key
      }
    });
  }

  /**
   * Trace external API call
   */
  traceExternalAPI(url, method = 'GET') {
    return this.startSpan(`external.api`, {
      kind: api.SpanKind.CLIENT,
      attributes: {
        'http.method': method,
        'http.url': url,
        'peer.service': this.extractServiceName(url)
      }
    });
  }

  /**
   * Create service dependency graph
   */
  mapServiceDependencies() {
    const dependencies = {
      service: this.options.serviceName,
      dependencies: [],
      dependents: [],
      graph: {}
    };

    // Analyze spans to build dependency graph
    this.performanceMetrics.forEach((metrics, serviceName) => {
      if (serviceName !== this.options.serviceName) {
        dependencies.dependencies.push({
          service: serviceName,
          callCount: metrics.count,
          avgDuration: metrics.avgDuration,
          errorRate: metrics.errorRate
        });
      }
    });

    return dependencies;
  }

  /**
   * Detect performance bottlenecks
   */
  detectBottlenecks() {
    const bottlenecks = [];

    this.performanceMetrics.forEach((metrics, operation) => {
      // Slow operations (>1 second average)
      if (metrics.avgDuration > 1000) {
        bottlenecks.push({
          type: 'SLOW_OPERATION',
          operation,
          avgDuration: metrics.avgDuration,
          p95Duration: metrics.p95Duration,
          severity: metrics.avgDuration > 5000 ? 'CRITICAL' : 'HIGH',
          recommendation: 'Optimize operation or add caching'
        });
      }

      // High error rate (>5%)
      if (metrics.errorRate > 0.05) {
        bottlenecks.push({
          type: 'HIGH_ERROR_RATE',
          operation,
          errorRate: (metrics.errorRate * 100).toFixed(2) + '%',
          severity: metrics.errorRate > 0.1 ? 'CRITICAL' : 'MEDIUM',
          recommendation: 'Investigate and fix errors'
        });
      }

      // High volume with degraded performance
      if (metrics.count > 1000 && metrics.p95Duration > metrics.avgDuration * 2) {
        bottlenecks.push({
          type: 'DEGRADED_UNDER_LOAD',
          operation,
          volume: metrics.count,
          avgDuration: metrics.avgDuration,
          p95Duration: metrics.p95Duration,
          severity: 'MEDIUM',
          recommendation: 'Scale horizontally or optimize for concurrency'
        });
      }
    });

    return bottlenecks.sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Correlate errors across spans
   */
  correlateErrors(errorSpans) {
    const correlations = new Map();

    errorSpans.forEach(span => {
      const key = `${span.serviceName}:${span.operation}`;
      if (!correlations.has(key)) {
        correlations.set(key, {
          serviceName: span.serviceName,
          operation: span.operation,
          errors: [],
          count: 0,
          commonCauses: new Map()
        });
      }

      const correlation = correlations.get(key);
      correlation.errors.push(span);
      correlation.count++;

      // Track common causes
      if (span.error) {
        const cause = span.error.message || 'Unknown';
        correlation.commonCauses.set(
          cause,
          (correlation.commonCauses.get(cause) || 0) + 1
        );
      }
    });

    return Array.from(correlations.values()).map(corr => ({
      ...corr,
      commonCauses: Array.from(corr.commonCauses.entries())
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count)
    }));
  }

  /**
   * Enrich HTTP span with additional data
   */
  enrichHttpSpan(span, request) {
    // Add custom security attributes
    span.setAttribute('security.monitored', true);

    // Add user context if available
    if (request.user) {
      span.setAttribute('user.id', request.user.id);
      span.setAttribute('user.role', request.user.role);
    }

    // Add request metadata
    span.setAttribute('http.request_id', request.id || 'unknown');
  }

  /**
   * Extract SQL operation type
   */
  extractOperation(query) {
    const match = query.trim().match(/^(\w+)/i);
    return match ? match[1].toUpperCase() : 'UNKNOWN';
  }

  /**
   * Extract service name from URL
   */
  extractServiceName(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(name, duration) {
    if (!this.performanceMetrics.has(name)) {
      this.performanceMetrics.set(name, {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        durations: [],
        errors: 0,
        errorRate: 0
      });
    }

    const metrics = this.performanceMetrics.get(name);
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.avgDuration = metrics.totalDuration / metrics.count;
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.durations.push(duration);

    // Keep only last 1000 durations for P95 calculation
    if (metrics.durations.length > 1000) {
      metrics.durations = metrics.durations.slice(-1000);
    }

    // Calculate P95
    const sorted = [...metrics.durations].sort((a, b) => a - b);
    metrics.p95Duration = sorted[Math.floor(sorted.length * 0.95)];

    // Update global average
    this.metrics.avgSpanDuration =
      (this.metrics.avgSpanDuration * (this.metrics.spansCreated - 1) + duration) /
      this.metrics.spansCreated;
  }

  /**
   * Track performance
   */
  trackPerformance(name, duration) {
    // Track slowest spans
    this.metrics.slowestSpans.push({ name, duration, timestamp: Date.now() });
    this.metrics.slowestSpans.sort((a, b) => b.duration - a.duration);
    this.metrics.slowestSpans = this.metrics.slowestSpans.slice(0, 100); // Keep top 100
  }

  /**
   * Get trace context for propagation
   */
  getTraceContext() {
    const span = api.trace.getActiveSpan();
    if (!span) return null;

    const context = span.spanContext();
    return {
      traceId: context.traceId,
      spanId: context.spanId,
      traceFlags: context.traceFlags
    };
  }

  /**
   * Inject trace context into headers
   */
  injectTraceContext(headers = {}) {
    const context = api.context.active();
    api.propagation.inject(context, headers);
    return headers;
  }

  /**
   * Extract trace context from headers
   */
  extractTraceContext(headers) {
    return api.propagation.extract(api.context.active(), headers);
  }

  /**
   * Generate span ID
   */
  generateSpanId() {
    return `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const operations = [];

    this.performanceMetrics.forEach((metrics, name) => {
      operations.push({
        operation: name,
        ...metrics,
        errorRate: metrics.errors / metrics.count
      });
    });

    // Sort by total time (impact)
    operations.sort((a, b) => b.totalDuration - a.totalDuration);

    return {
      totalTraces: this.metrics.tracesCreated,
      totalSpans: this.metrics.spansCreated,
      avgSpanDuration: this.metrics.avgSpanDuration.toFixed(2),
      slowestSpans: this.metrics.slowestSpans.slice(0, 10),
      operations: operations.slice(0, 20), // Top 20
      bottlenecks: this.detectBottlenecks()
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSpans: this.activeSpans.size,
      trackedOperations: this.performanceMetrics.size
    };
  }

  /**
   * Shutdown
   */
  async shutdown() {
    if (this.provider) {
      await this.provider.shutdown();
    }
  }
}

module.exports = DistributedTracing;
