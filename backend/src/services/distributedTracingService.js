/**
 * OpenTelemetry Distributed Tracing Service
 *
 * Implements distributed tracing for microservices architecture with:
 * - Jaeger exporter for trace collection
 * - W3C Trace Context propagation
 * - Automatic instrumentation of HTTP requests
 * - Custom span creation and event logging
 * - Performance metrics collection
 * - Trace sampling configuration
 *
 * Integration with:
 * - Express.js middleware
 * - Redis calls
 * - HTTP client (axios) calls
 * - Database queries
 *
 * @version 1.0.0
 * @author Claude AI
 */

const { trace, context, propagation } = require('@opentelemetry/api');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-node');
const { logger } = require('../utils/productionLogger');

class DistributedTracingService {
  constructor() {
    this.tracer = null;
    this.sdk = null;
    this.config = {
      serviceName: process.env.SERVICE_NAME || 'soba-backend',
      jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      samplingRate: parseFloat(process.env.TRACE_SAMPLING_RATE || '0.1'),
      maxAttributeValueLength: 1024,
      maxAttributeCount: 128,
      maxSpanEventCount: 256,
      maxLinkCount: 128
    };

    this.spans = new Map();
    this.metrics = {
      tracesCreated: 0,
      spansCreated: 0,
      eventsLogged: 0,
      samplingDecisions: { sampled: 0, notSampled: 0 },
      exportErrors: 0
    };

    this._initializeTracer();

    logger.info('[DistributedTracingService] Initialized', {
      serviceName: this.config.serviceName,
      jaegerEndpoint: this.config.jaegerEndpoint,
      samplingRate: this.config.samplingRate
    });
  }

  /**
   * Initialize OpenTelemetry SDK and Jaeger exporter
   * @private
   */
  _initializeTracer() {
    try {
      // Create Jaeger exporter
      const jaegerExporter = new JaegerExporter({
        endpoint: this.config.jaegerEndpoint,
        maxPacketSize: 65000,
        serviceName: this.config.serviceName
      });

      // Create resource for service identification
      const resource = Resource.default().merge(
        new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
          [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          hostname: require('os').hostname(),
          pid: process.pid
        })
      );

      // Initialize SDK with auto-instrumentation
      this.sdk = new NodeSDK({
        resource,
        traceExporter: jaegerExporter,
        instrumentations: [getNodeAutoInstrumentations()],
        sampler: {
          shouldSample: () => Math.random() < this.config.samplingRate,
          shutdown: () => Promise.resolve(),
          forceFlush: () => Promise.resolve()
        }
      });

      // Start SDK
      this.sdk.start();

      // Get tracer instance
      this.tracer = trace.getTracer(this.config.serviceName, '1.0.0');

      logger.info('[DistributedTracingService] Tracer initialized successfully');
    } catch (error) {
      logger.error('[DistributedTracingService] Failed to initialize tracer', {
        error: error.message
      });
      this.tracer = null;
    }
  }

  /**
   * Create Express middleware for automatic request tracing
   *
   * @returns {Function} Express middleware
   */
  expressMiddleware() {
    return (req, res, next) => {
      if (!this.tracer) {
        return next();
      }

      const spanName = `${req.method} ${req.path}`;
      const span = this.tracer.startSpan(spanName, {
        attributes: {
          'http.method': req.method,
          'http.url': req.originalUrl,
          'http.target': req.path,
          'http.scheme': req.protocol,
          'http.host': req.hostname,
          'http.client_ip': req.ip,
          'http.user_agent': req.get('user-agent'),
          'http.route': req.route?.path || req.path,
          'span.kind': 'SERVER'
        }
      });

      // Store span in request context
      req.span = span;
      req.traceId = span.spanContext().traceId;

      // Store original response methods
      const originalJson = res.json;
      const originalSend = res.send;

      // Wrap response methods to capture status and body size
      res.json = function(body) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_content_length': JSON.stringify(body).length
        });
        return originalJson.call(this, body);
      };

      res.send = function(body) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_content_length': body ? body.length : 0
        });
        return originalSend.call(this, body);
      };

      // Record response time
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        span.addEvent('request_completed', {
          'duration_ms': duration,
          'http.status_code': res.statusCode
        });
        span.end();
      });

      // Use context to propagate span
      context.with(trace.setSpan(context.active(), span), next);
    };
  }

  /**
   * Create a named span for custom operations
   *
   * @param {string} operationName - Name of the operation
   * @param {Object} attributes - Span attributes
   * @returns {Object} Active span
   */
  startSpan(operationName, attributes = {}) {
    if (!this.tracer) {
      return null;
    }

    const span = this.tracer.startSpan(operationName, {
      attributes: {
        'span.kind': 'INTERNAL',
        'component': 'application',
        ...attributes
      }
    });

    this.spans.set(operationName, span);
    this.metrics.spansCreated++;

    return span;
  }

  /**
   * End a span and record metrics
   *
   * @param {Object} span - Span to end
   * @param {Object} attributes - Final attributes to add
   */
  endSpan(span, attributes = {}) {
    if (!span) {
      return;
    }

    if (attributes && Object.keys(attributes).length > 0) {
      span.setAttributes(attributes);
    }

    span.end();
  }

  /**
   * Add event to current span
   *
   * @param {string} eventName - Event name
   * @param {Object} attributes - Event attributes
   */
  addEvent(eventName, attributes = {}) {
    const currentSpan = trace.getActiveSpan();

    if (!currentSpan) {
      return;
    }

    currentSpan.addEvent(eventName, attributes);
    this.metrics.eventsLogged++;

    logger.debug('[DistributedTracingService] Event logged', {
      eventName,
      traceId: currentSpan.spanContext().traceId
    });
  }

  /**
   * Trace Python service call
   *
   * @param {string} serviceName - Name of Python service
   * @param {string} endpoint - Service endpoint
   * @param {Function} callFn - Async function to execute
   * @param {Object} options - Additional options
   * @returns {Promise<any>} Result of callFn
   */
  async tracePythonServiceCall(serviceName, endpoint, callFn, options = {}) {
    if (!this.tracer) {
      return callFn();
    }

    const span = this.tracer.startSpan(`python.${serviceName}.${endpoint}`, {
      attributes: {
        'span.kind': 'CLIENT',
        'service.name': serviceName,
        'service.endpoint': endpoint,
        'rpc.system': 'http',
        'rpc.service': serviceName,
        'rpc.method': endpoint,
        ...options.attributes
      }
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      const startTime = Date.now();

      try {
        const result = await callFn();

        span.setAttributes({
          'rpc.status': 'OK',
          'duration_ms': Date.now() - startTime
        });

        return result;
      } catch (error) {
        span.recordException(error);
        span.setAttributes({
          'rpc.status': 'ERROR',
          'error.type': error.name,
          'error.message': error.message,
          'duration_ms': Date.now() - startTime
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace Redis operation
   *
   * @param {string} command - Redis command
   * @param {Array} args - Command arguments
   * @param {Function} operationFn - Async function to execute
   * @returns {Promise<any>} Result of operationFn
   */
  async traceRedisOperation(command, args, operationFn) {
    if (!this.tracer) {
      return operationFn();
    }

    const span = this.tracer.startSpan(`redis.${command.toLowerCase()}`, {
      attributes: {
        'span.kind': 'CLIENT',
        'db.system': 'redis',
        'db.operation': command,
        'db.redis.args_count': args.length,
        'db.redis.command': command
      }
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      const startTime = Date.now();

      try {
        const result = await operationFn();

        span.setAttributes({
          'db.status': 'OK',
          'duration_ms': Date.now() - startTime
        });

        return result;
      } catch (error) {
        span.recordException(error);
        span.setAttributes({
          'db.status': 'ERROR',
          'error.type': error.name,
          'duration_ms': Date.now() - startTime
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace database query
   *
   * @param {string} query - SQL query
   * @param {Function} queryFn - Async function to execute
   * @returns {Promise<any>} Result of queryFn
   */
  async traceDatabase(query, queryFn) {
    if (!this.tracer) {
      return queryFn();
    }

    // Extract operation type (SELECT, INSERT, UPDATE, DELETE)
    const operation = query.split(/\s+/)[0].toUpperCase();

    const span = this.tracer.startSpan(`db.${operation.toLowerCase()}`, {
      attributes: {
        'span.kind': 'CLIENT',
        'db.system': 'postgresql',
        'db.operation': operation,
        'db.statement': query.substring(0, 256), // Limit statement length for privacy
        'db.statement.length': query.length
      }
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      const startTime = Date.now();

      try {
        const result = await queryFn();

        span.setAttributes({
          'db.rows_affected': result?.rowCount || 0,
          'duration_ms': Date.now() - startTime
        });

        return result;
      } catch (error) {
        span.recordException(error);
        span.setAttributes({
          'error.type': error.name,
          'duration_ms': Date.now() - startTime
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Inject trace context into outgoing HTTP headers
   *
   * @param {Object} headers - HTTP headers object to inject into
   * @returns {Object} Headers with trace context
   */
  injectTraceContext(headers = {}) {
    if (!this.tracer) {
      return headers;
    }

    propagation.inject(context.active(), headers);
    return headers;
  }

  /**
   * Extract trace context from incoming HTTP headers
   *
   * @param {Object} headers - HTTP headers object
   * @returns {Object} Extracted context
   */
  extractTraceContext(headers = {}) {
    if (!this.tracer) {
      return context.active();
    }

    return propagation.extract(context.active(), headers);
  }

  /**
   * Get current trace ID from active span
   *
   * @returns {string|null} Current trace ID
   */
  getCurrentTraceId() {
    const activeSpan = trace.getActiveSpan();

    if (!activeSpan) {
      return null;
    }

    return activeSpan.spanContext().traceId;
  }

  /**
   * Get tracing metrics
   *
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSpans: this.spans.size,
      timestamp: new Date()
    };
  }

  /**
   * Create structured log entry with trace context
   *
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Structured log entry
   */
  createStructuredLog(message, metadata = {}) {
    const activeSpan = trace.getActiveSpan();
    const spanContext = activeSpan?.spanContext();

    return {
      message,
      timestamp: new Date().toISOString(),
      traceId: spanContext?.traceId || null,
      spanId: spanContext?.spanId || null,
      traceFlags: spanContext?.traceFlags || null,
      ...metadata
    };
  }

  /**
   * Shutdown tracing service gracefully
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this.sdk) {
      return;
    }

    try {
      await this.sdk.shutdown();
      logger.info('[DistributedTracingService] Gracefully shutdown');
    } catch (error) {
      logger.error('[DistributedTracingService] Error during shutdown', {
        error: error.message
      });
    }
  }

  /**
   * Reset metrics (typically for testing)
   *
   * @returns {Object} Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      tracesCreated: 0,
      spansCreated: 0,
      eventsLogged: 0,
      samplingDecisions: { sampled: 0, notSampled: 0 },
      exportErrors: 0
    };

    return this.metrics;
  }
}

// Export singleton instance
module.exports = new DistributedTracingService();
