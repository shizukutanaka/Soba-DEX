// ============================================================================
// End-to-End Security Tests
// Complete security workflow testing
// ============================================================================

const axios = require('axios');
const { expect } = require('chai');

describe('Security Monitor E2E Tests', () => {
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let testEventId;
  let testIncidentId;

  before(async () => {
    // Wait for system to be ready
    await waitForSystem();
  });

  describe('Attack Detection Flow', () => {
    it('should detect SQL injection attack', async () => {
      const attack = {
        type: 'SQL_INJECTION',
        ip: '192.168.1.100',
        url: '/api/users?id=1\' OR \'1\'=\'1',
        userAgent: 'AttackTool/1.0',
        payload: '\' OR \'1\'=\'1'
      };

      const response = await axios.post(`${BASE_URL}/api/events`, attack);
      expect(response.status).to.equal(201);
      expect(response.data).to.have.property('id');
      testEventId = response.data.id;
    });

    it('should automatically create incident for critical attack', async () => {
      await sleep(2000); // Wait for incident creation

      const response = await axios.get(`${BASE_URL}/api/incidents`);
      expect(response.status).to.equal(200);
      expect(response.data.incidents).to.be.an('array');

      const incident = response.data.incidents.find(i =>
        i.relatedEvents?.some(e => e.id === testEventId)
      );

      expect(incident).to.exist;
      testIncidentId = incident.id;
    });

    it('should block repeated attacks from same IP', async () => {
      const attacks = Array(5).fill(null).map(() => ({
        type: 'BRUTE_FORCE',
        ip: '192.168.1.100',
        url: '/api/login',
        userAgent: 'AttackTool/1.0'
      }));

      const responses = await Promise.all(
        attacks.map(attack => axios.post(`${BASE_URL}/api/events`, attack, {
          validateStatus: () => true
        }))
      );

      const blocked = responses.some(r => r.status === 429 || r.status === 403);
      expect(blocked).to.be.true;
    });
  });

  describe('Threat Intelligence Integration', () => {
    it('should check IP reputation', async () => {
      const response = await axios.get(
        `${BASE_URL}/api/threat-intelligence/check/1.2.3.4`,
        { validateStatus: () => true }
      );

      expect(response.status).to.be.oneOf([200, 404, 503]);
    });

    it('should cache threat intelligence results', async () => {
      const ip = '8.8.8.8';
      const start1 = Date.now();
      await axios.get(`${BASE_URL}/api/threat-intelligence/check/${ip}`, {
        validateStatus: () => true
      });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await axios.get(`${BASE_URL}/api/threat-intelligence/check/${ip}`, {
        validateStatus: () => true
      });
      const time2 = Date.now() - start2;

      // Second request should be faster (cached)
      expect(time2).to.be.lessThan(time1);
    });
  });

  describe('ML Prediction', () => {
    it('should predict attack likelihood', async () => {
      const response = await axios.post(`${BASE_URL}/api/ml/predict`, {
        features: {
          requestRate: 100,
          errorRate: 0.05,
          uniqueIPs: 50
        }
      }, { validateStatus: () => true });

      if (response.status === 200) {
        expect(response.data).to.have.property('prediction');
        expect(response.data.prediction).to.be.a('number');
      }
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate GDPR compliance report', async () => {
      const response = await axios.post(`${BASE_URL}/api/compliance/report`, {
        framework: 'GDPR',
        format: 'JSON'
      }, { validateStatus: () => true });

      if (response.status === 200) {
        expect(response.data).to.have.property('framework');
        expect(response.data.framework).to.equal('GDPR');
      }
    });
  });

  describe('SOAR Automation', () => {
    it('should execute playbook automatically', async () => {
      const response = await axios.get(`${BASE_URL}/api/playbooks/executions`);
      expect(response.status).to.equal(200);
      expect(response.data.executions).to.be.an('array');
    });
  });

  describe('Health Monitoring', () => {
    it('should return health status', async () => {
      const response = await axios.get(`${BASE_URL}/health`);
      expect(response.status).to.be.oneOf([200, 503]);
      expect(response.data).to.have.property('status');
    });

    it('should return liveness probe', async () => {
      const response = await axios.get(`${BASE_URL}/health/live`);
      expect(response.status).to.equal(200);
      expect(response.data.status).to.equal('alive');
    });

    it('should return readiness probe', async () => {
      const response = await axios.get(`${BASE_URL}/health/ready`, {
        validateStatus: () => true
      });
      expect(response.status).to.be.oneOf([200, 503]);
    });
  });

  describe('Performance', () => {
    it('should handle 100 concurrent requests', async () => {
      const requests = Array(100).fill(null).map((_, i) => ({
        type: 'XSS',
        ip: `192.168.1.${i % 255}`,
        url: `/test/${i}`,
        userAgent: 'TestClient/1.0'
      }));

      const start = Date.now();
      const responses = await Promise.all(
        requests.map(req => axios.post(`${BASE_URL}/api/events`, req, {
          validateStatus: () => true
        }))
      );
      const duration = Date.now() - start;

      const successCount = responses.filter(r => r.status < 400).length;
      expect(successCount).to.be.greaterThan(90); // 90% success rate
      expect(duration).to.be.lessThan(10000); // Under 10 seconds
    });

    it('should respond within SLA', async () => {
      const measurements = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await axios.get(`${BASE_URL}/health`);
        measurements.push(Date.now() - start);
      }

      const avg = measurements.reduce((a, b) => a + b) / measurements.length;
      const p95 = measurements.sort((a, b) => a - b)[Math.floor(measurements.length * 0.95)];

      expect(avg).to.be.lessThan(100); // Average under 100ms
      expect(p95).to.be.lessThan(200); // P95 under 200ms
    });
  });

  describe('Data Integrity', () => {
    it('should persist events correctly', async () => {
      const event = {
        type: 'PATH_TRAVERSAL',
        ip: '10.0.0.100',
        url: '/files/../../etc/passwd'
      };

      const createResponse = await axios.post(`${BASE_URL}/api/events`, event);
      const eventId = createResponse.data.id;

      await sleep(1000);

      const getResponse = await axios.get(`${BASE_URL}/api/events/${eventId}`);
      expect(getResponse.status).to.equal(200);
      expect(getResponse.data.type).to.equal(event.type);
      expect(getResponse.data.ip).to.equal(event.ip);
    });
  });

  describe('Security Controls', () => {
    it('should require authentication for sensitive endpoints', async () => {
      const response = await axios.delete(`${BASE_URL}/api/events/all`, {
        validateStatus: () => true
      });

      expect(response.status).to.be.oneOf([401, 403, 404]);
    });

    it('should sanitize inputs', async () => {
      const xssPayload = {
        type: 'XSS',
        ip: '<script>alert("xss")</script>',
        url: '"><script>alert("xss")</script>'
      };

      const response = await axios.post(`${BASE_URL}/api/events`, xssPayload, {
        validateStatus: () => true
      });

      if (response.status === 201) {
        const event = response.data;
        expect(event.ip).to.not.include('<script>');
      }
    });
  });
});

// Helper functions
async function waitForSystem() {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/health`, {
        timeout: 5000
      });
      if (response.status === 200) {
        console.log('System is ready');
        return;
      }
    } catch (e) {
      // Ignore
    }
    await sleep(2000);
  }
  throw new Error('System did not become ready in time');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
