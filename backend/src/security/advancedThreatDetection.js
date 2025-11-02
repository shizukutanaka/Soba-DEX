/**
 * Advanced Threat Detection Module
 * Implements sophisticated attack pattern detection
 *
 * Features:
 * - LDAP Injection Detection
 * - XXE Attack Detection
 * - Header Injection (CRLF) Detection
 * - Prototype Pollution Detection
 * - Session Fixation Detection
 * - SSRF Detection
 * - Template Injection Detection
 * - Deserialization Attack Detection
 */

const { logger } = require('../utils/productionLogger');
const { SecurityErrorCodes } = require('./securityUtils');

/**
 * LDAP Injection Detection
 */
class LDAPInjectionDetector {
  constructor() {
    this.patterns = [
      /[*()\\|&]/,                          // LDAP special characters
      /\(\|/,                                // OR filter
      /\(&/,                                 // AND filter
      /\(!/,                                 // NOT filter
      /admin\)/i,                            // Admin injection
      /\*\)/,                                // Wildcard injection
      /uid=\*/i,                             // UID wildcard
      /cn=\*/i,                              // CN wildcard
    ];
  }

  detect(input) {
    if (!input || typeof input !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          type: 'LDAP_INJECTION',
          pattern: pattern.source,
          confidence: 'HIGH'
        };
      }
    }

    return { detected: false };
  }
}

/**
 * XXE (XML External Entity) Attack Detection
 */
class XXEDetector {
  constructor() {
    this.patterns = [
      /<!DOCTYPE[^>]*\[/i,                   // DOCTYPE with internal subset
      /<!ENTITY/i,                           // Entity declaration
      /SYSTEM\s+["']/i,                      // SYSTEM keyword
      /PUBLIC\s+["']/i,                      // PUBLIC keyword
      /<\?xml[^>]*encoding/i,                // XML with encoding
      /file:\/\//i,                          // File protocol
      /expect:\/\//i,                        // Expect protocol
      /php:\/\//i,                           // PHP protocol
      /data:\/\//i,                          // Data protocol
    ];
  }

  detect(input) {
    if (!input || typeof input !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          type: 'XXE_ATTACK',
          pattern: pattern.source,
          confidence: 'HIGH'
        };
      }
    }

    return { detected: false };
  }
}

/**
 * Header Injection (CRLF) Detection
 */
class HeaderInjectionDetector {
  constructor() {
    this.patterns = [
      /\r\n/,                                // CRLF
      /\r/,                                  // CR
      /\n/,                                  // LF
      /%0d%0a/i,                             // URL encoded CRLF
      /%0d/i,                                // URL encoded CR
      /%0a/i,                                // URL encoded LF
      /\u000d\u000a/,                        // Unicode CRLF
    ];
  }

  detect(headerName, headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(headerValue)) {
        return {
          detected: true,
          type: 'HEADER_INJECTION',
          header: headerName,
          pattern: pattern.source,
          confidence: 'HIGH'
        };
      }
    }

    return { detected: false };
  }

  detectAll(headers) {
    const threats = [];

    for (const [name, value] of Object.entries(headers)) {
      const result = this.detect(name, value);
      if (result.detected) {
        threats.push(result);
      }
    }

    return threats;
  }
}

/**
 * Prototype Pollution Detection
 */
class PrototypePollutionDetector {
  constructor() {
    this.dangerousKeys = [
      '__proto__',
      'constructor',
      'prototype',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ];
  }

  detect(obj, path = '') {
    if (!obj || typeof obj !== 'object') {
      return { detected: false };
    }

    const threats = [];

    for (const key of Object.keys(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check for dangerous keys
      if (this.dangerousKeys.includes(key)) {
        threats.push({
          detected: true,
          type: 'PROTOTYPE_POLLUTION',
          key,
          path: currentPath,
          confidence: 'CRITICAL'
        });
      }

      // Recursive check
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const nestedThreats = this.detect(obj[key], currentPath);
        if (nestedThreats.detected) {
          threats.push(...(Array.isArray(nestedThreats) ? nestedThreats : [nestedThreats]));
        }
      }
    }

    return threats.length > 0 ? threats : { detected: false };
  }
}

/**
 * Server-Side Request Forgery (SSRF) Detection
 */
class SSRFDetector {
  constructor() {
    this.internalIPPatterns = [
      /^127\./,                              // Loopback
      /^10\./,                               // Private Class A
      /^172\.(1[6-9]|2\d|3[01])\./,         // Private Class B
      /^192\.168\./,                         // Private Class C
      /^169\.254\./,                         // Link-local
      /^localhost$/i,                        // Localhost
      /^0\.0\.0\.0$/,                        // All interfaces
      /^\[::1\]$/,                           // IPv6 loopback
      /^\[fe80:/i,                           // IPv6 link-local
      /^\[fc00:/i,                           // IPv6 unique local
    ];

    this.dangerousProtocols = [
      'file://',
      'gopher://',
      'dict://',
      'php://',
      'expect://',
      'data://',
      'jar://',
    ];
  }

  detect(url) {
    if (!url || typeof url !== 'string') {
      return { detected: false };
    }

    // Check for dangerous protocols
    for (const protocol of this.dangerousProtocols) {
      if (url.toLowerCase().startsWith(protocol)) {
        return {
          detected: true,
          type: 'SSRF_ATTACK',
          protocol,
          confidence: 'HIGH'
        };
      }
    }

    // Extract hostname/IP
    let hostname;
    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
    } catch (e) {
      // If URL parsing fails, check raw string
      hostname = url;
    }

    // Check for internal IP addresses
    for (const pattern of this.internalIPPatterns) {
      if (pattern.test(hostname)) {
        return {
          detected: true,
          type: 'SSRF_ATTACK',
          target: hostname,
          confidence: 'MEDIUM'
        };
      }
    }

    return { detected: false };
  }
}

/**
 * Template Injection Detection
 */
class TemplateInjectionDetector {
  constructor() {
    this.patterns = [
      /\{\{.*\}\}/,                          // Handlebars/Mustache
      /\$\{.*\}/,                            // JavaScript template literals
      /<%.*%>/,                              // EJS/ERB
      /\{%.*%\}/,                            // Jinja2/Twig
      /\[\[.*\]\]/,                          // AngularJS
      /#\{.*\}/,                             // Ruby interpolation
      /\{#.*#\}/,                            // Velocity
      /@\(.*\)/,                             // Razor
    ];
  }

  detect(input) {
    if (!input || typeof input !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          type: 'TEMPLATE_INJECTION',
          pattern: pattern.source,
          confidence: 'HIGH'
        };
      }
    }

    return { detected: false };
  }
}

/**
 * Insecure Deserialization Detection
 */
class DeserializationDetector {
  constructor() {
    this.patterns = [
      /rO0AB/,                               // Java serialized object (base64)
      /__reduce__/,                          // Python pickle
      /ObjectInputStream/,                   // Java deserialization
      /unserialize\(/i,                      // PHP unserialize
      /pickle\.loads/i,                      // Python pickle
      /\$GLOBALS/,                           // PHP globals
      /eval\s*\(/i,                          // Eval function
      /Function\s*\(/i,                      // Function constructor
    ];
  }

  detect(input) {
    if (!input || typeof input !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          type: 'INSECURE_DESERIALIZATION',
          pattern: pattern.source,
          confidence: 'HIGH'
        };
      }
    }

    return { detected: false };
  }
}

/**
 * NoSQL Injection Detection
 */
class NoSQLInjectionDetector {
  constructor() {
    this.patterns = [
      /\$ne/i,                               // Not equal
      /\$gt/i,                               // Greater than
      /\$gte/i,                              // Greater than or equal
      /\$lt/i,                               // Less than
      /\$lte/i,                              // Less than or equal
      /\$where/i,                            // Where clause
      /\$regex/i,                            // Regular expression
      /\$nin/i,                              // Not in
      /\$or/i,                               // OR operator
      /\$and/i,                              // AND operator
      /sleep\s*\(/i,                         // Sleep function (timing attack)
      /this\./,                              // JavaScript 'this' reference
    ];
  }

  detect(input) {
    if (!input) {
      return { detected: false };
    }

    // Check string input
    if (typeof input === 'string') {
      for (const pattern of this.patterns) {
        if (pattern.test(input)) {
          return {
            detected: true,
            type: 'NOSQL_INJECTION',
            pattern: pattern.source,
            confidence: 'HIGH'
          };
        }
      }
    }

    // Check object input (JSON payloads)
    if (typeof input === 'object') {
      const jsonStr = JSON.stringify(input);
      for (const pattern of this.patterns) {
        if (pattern.test(jsonStr)) {
          return {
            detected: true,
            type: 'NOSQL_INJECTION',
            pattern: pattern.source,
            confidence: 'HIGH'
          };
        }
      }
    }

    return { detected: false };
  }
}

/**
 * Advanced Threat Detection Manager
 */
class AdvancedThreatDetection {
  constructor() {
    this.detectors = {
      ldap: new LDAPInjectionDetector(),
      xxe: new XXEDetector(),
      headerInjection: new HeaderInjectionDetector(),
      prototypePollution: new PrototypePollutionDetector(),
      ssrf: new SSRFDetector(),
      templateInjection: new TemplateInjectionDetector(),
      deserialization: new DeserializationDetector(),
      nosql: new NoSQLInjectionDetector(),
    };

    this.stats = {
      ldapDetected: 0,
      xxeDetected: 0,
      headerInjectionDetected: 0,
      prototypePollutionDetected: 0,
      ssrfDetected: 0,
      templateInjectionDetected: 0,
      deserializationDetected: 0,
      nosqlDetected: 0,
      totalThreats: 0,
    };
  }

  /**
   * Perform comprehensive threat analysis
   */
  analyzeRequest(req) {
    const threats = [];

    try {
      // Check query parameters
      if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          this.checkAllDetectors(value, `query.${key}`, threats);
        }
      }

      // Check body
      if (req.body) {
        // Check for prototype pollution
        const pollutionResult = this.detectors.prototypePollution.detect(req.body);
        if (pollutionResult.detected) {
          const pollutionThreats = Array.isArray(pollutionResult) ? pollutionResult : [pollutionResult];
          threats.push(...pollutionThreats.map(t => ({
            ...t,
            location: 'body',
            severity: 'CRITICAL'
          })));
          this.stats.prototypePollutionDetected += pollutionThreats.length;
        }

        // Check body values
        this.checkObjectRecursively(req.body, 'body', threats);
      }

      // Check headers
      if (req.headers) {
        const headerThreats = this.detectors.headerInjection.detectAll(req.headers);
        if (headerThreats.length > 0) {
          threats.push(...headerThreats.map(t => ({
            ...t,
            severity: 'HIGH'
          })));
          this.stats.headerInjectionDetected += headerThreats.length;
        }
      }

      // Check URL/path
      if (req.url) {
        this.checkAllDetectors(req.url, 'url', threats);
      }

      // Check for SSRF in URL parameters
      if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
            const ssrfResult = this.detectors.ssrf.detect(value);
            if (ssrfResult.detected) {
              threats.push({
                ...ssrfResult,
                location: `query.${key}`,
                severity: 'HIGH'
              });
              this.stats.ssrfDetected++;
            }
          }
        }
      }

      this.stats.totalThreats += threats.length;

    } catch (error) {
      logger.error('Advanced threat detection error', {
        error: error.message,
        stack: error.stack
      });
    }

    return threats;
  }

  /**
   * Check value against all detectors
   */
  checkAllDetectors(value, location, threats) {
    if (!value || (typeof value !== 'string' && typeof value !== 'object')) {
      return;
    }

    // LDAP Injection
    const ldapResult = this.detectors.ldap.detect(value);
    if (ldapResult.detected) {
      threats.push({ ...ldapResult, location, severity: 'HIGH' });
      this.stats.ldapDetected++;
    }

    // XXE
    const xxeResult = this.detectors.xxe.detect(value);
    if (xxeResult.detected) {
      threats.push({ ...xxeResult, location, severity: 'CRITICAL' });
      this.stats.xxeDetected++;
    }

    // Template Injection
    const templateResult = this.detectors.templateInjection.detect(value);
    if (templateResult.detected) {
      threats.push({ ...templateResult, location, severity: 'HIGH' });
      this.stats.templateInjectionDetected++;
    }

    // Deserialization
    const deserResult = this.detectors.deserialization.detect(value);
    if (deserResult.detected) {
      threats.push({ ...deserResult, location, severity: 'CRITICAL' });
      this.stats.deserializationDetected++;
    }

    // NoSQL Injection
    const nosqlResult = this.detectors.nosql.detect(value);
    if (nosqlResult.detected) {
      threats.push({ ...nosqlResult, location, severity: 'HIGH' });
      this.stats.nosqlDetected++;
    }
  }

  /**
   * Recursively check object properties
   */
  checkObjectRecursively(obj, path, threats, depth = 0) {
    if (depth > 10 || !obj || typeof obj !== 'object') {
      return; // Prevent infinite recursion
    }

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = `${path}.${key}`;

      if (typeof value === 'string') {
        this.checkAllDetectors(value, currentPath, threats);
      } else if (typeof value === 'object' && value !== null) {
        this.checkObjectRecursively(value, currentPath, threats, depth + 1);
      }
    }
  }

  /**
   * Get detection statistics
   */
  getStatistics() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    for (const key in this.stats) {
      this.stats[key] = 0;
    }
  }

  /**
   * Middleware for Express
   */
  middleware() {
    return (req, res, next) => {
      const threats = this.analyzeRequest(req);

      if (threats.length > 0) {
        // Attach threats to request for further processing
        req.advancedThreats = threats;

        // Log critical threats
        const criticalThreats = threats.filter(t => t.severity === 'CRITICAL');
        if (criticalThreats.length > 0) {
          logger.error('Critical threats detected', {
            ip: req.ip,
            path: req.path,
            threats: criticalThreats
          });
        }

        // Log high severity threats
        const highThreats = threats.filter(t => t.severity === 'HIGH');
        if (highThreats.length > 0) {
          logger.warn('High severity threats detected', {
            ip: req.ip,
            path: req.path,
            threats: highThreats
          });
        }
      }

      next();
    };
  }
}

// Export singleton
const advancedThreatDetection = new AdvancedThreatDetection();

module.exports = advancedThreatDetection;
module.exports.AdvancedThreatDetection = AdvancedThreatDetection;
module.exports.LDAPInjectionDetector = LDAPInjectionDetector;
module.exports.XXEDetector = XXEDetector;
module.exports.HeaderInjectionDetector = HeaderInjectionDetector;
module.exports.PrototypePollutionDetector = PrototypePollutionDetector;
module.exports.SSRFDetector = SSRFDetector;
module.exports.TemplateInjectionDetector = TemplateInjectionDetector;
module.exports.DeserializationDetector = DeserializationDetector;
module.exports.NoSQLInjectionDetector = NoSQLInjectionDetector;
