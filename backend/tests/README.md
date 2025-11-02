# DEX Security Monitor - Test Suite

Comprehensive testing suite for the DEX Security Monitoring System, including unit tests, integration tests, end-to-end tests, performance benchmarks, chaos engineering, and security penetration tests.

## Table of Contents

- [Overview](#overview)
- [Test Suites](#test-suites)
- [Quick Start](#quick-start)
- [Running Tests](#running-tests)
- [Chaos Engineering](#chaos-engineering)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)
- [CI/CD Integration](#cicd-integration)

## Overview

The test suite is designed to validate:

- **Functionality**: All features work as expected
- **Performance**: System meets performance requirements
- **Security**: System is protected against known attack vectors
- **Resilience**: System handles failures gracefully
- **Reliability**: System operates consistently under various conditions

### Test Statistics

- **Total Test Files**: 6+ test suites
- **Test Coverage**: Unit, Integration, E2E, Performance, Chaos, Security
- **Estimated Runtime**: 15-30 minutes (all tests)
- **Automation**: Fully automated via CI/CD

## Test Suites

### 1. End-to-End Tests (`e2e/securityE2E.test.js`)

Complete security workflow testing covering:
- Attack detection flow
- Incident creation and management
- IP blocking mechanisms
- Threat intelligence integration
- ML prediction capabilities
- Compliance reporting
- SOAR automation
- Performance under load (100 concurrent requests)
- Data integrity validation

**Run Command:**
```bash
npm run test:e2e
# or
node backend/tests/e2e/securityE2E.test.js
```

### 2. Chaos Engineering Tests (`chaos/chaosTests.js`)

System resilience testing under failure conditions:
- Database connection failures
- Redis connection failures
- Network latency simulation
- High memory pressure
- Cascading failure prevention
- Partial service failures
- Automatic recovery mechanisms

**Run Command:**
```bash
RUN_CHAOS_TESTS=true node backend/tests/chaos/chaosTests.js
```

**Prerequisites:**
- System must be running
- Database and Redis accessible
- Sufficient permissions to terminate connections

### 3. Performance Benchmark Tests (`performance/performanceTests.js`)

Comprehensive performance testing:
- **Throughput**: Requests per second
- **Latency Percentiles**: P50, P95, P99
- **Concurrent Requests**: 1, 10, 50, 100, 200 concurrent users
- **Memory Usage**: Memory consumption under load
- **Cache Efficiency**: Cache hit rates and speedup
- **Endpoint Performance**: Individual endpoint benchmarks
- **Database Performance**: Query performance

**Run Command:**
```bash
RUN_PERFORMANCE_TESTS=true node backend/tests/performance/performanceTests.js
```

**Performance Targets:**
- Throughput: >100 req/s
- P95 Latency: <200ms
- P99 Latency: <500ms
- Cache Hit Rate: >70%
- Memory Growth: <100MB during load test

### 4. Security Penetration Tests (`security/penetrationTests.js`)

Automated penetration testing for 14 attack types:
- SQL Injection (17 payloads)
- XSS - Cross-Site Scripting (15 payloads)
- Command Injection (10 payloads)
- Path Traversal (9 payloads)
- XXE - XML External Entity (3 payloads)
- SSRF - Server-Side Request Forgery (7 payloads)
- LDAP Injection (5 payloads)
- NoSQL Injection (6 payloads)
- Template Injection (9 payloads)
- Deserialization Attacks (3 payloads)
- Authentication Bypass
- CSRF - Cross-Site Request Forgery
- Input Validation
- Rate Limiting

**Run Command:**
```bash
RUN_SECURITY_TESTS=true node backend/tests/security/penetrationTests.js
```

**WARNING**: Only run against systems you own or have explicit permission to test.

### 5. Kubernetes Chaos Experiments (`../k8s/chaos-experiments/`)

Kubernetes-native chaos engineering using Chaos Mesh:

#### Pod Failure Experiments (`pod-failure.yaml`)
- Random pod kills
- Pod failure states
- Container kills
- Database pod failures
- Redis pod failures
- Graceful shutdown testing

**Deploy:**
```bash
kubectl apply -f k8s/chaos-experiments/pod-failure.yaml
```

#### Network Chaos Experiments (`network-chaos.yaml`)
- Network delay (latency)
- Packet loss
- Network partition (split-brain)
- Packet corruption
- Bandwidth limitation
- DNS failures
- Database connection delays

**Deploy:**
```bash
kubectl apply -f k8s/chaos-experiments/network-chaos.yaml
```

#### Resource Stress Experiments (`resource-stress.yaml`)
- CPU stress
- Memory stress
- Disk I/O stress
- OOM (Out of Memory) simulation
- Memory leak simulation
- CPU spike patterns
- Disk space exhaustion

**Deploy:**
```bash
kubectl apply -f k8s/chaos-experiments/resource-stress.yaml
```

## Quick Start

### Prerequisites

1. **System Running**: Start the DEX Security Monitor
   ```bash
   docker-compose up -d
   # or
   npm start
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   ```bash
   export TEST_BASE_URL=http://localhost:3000
   export RUN_PERFORMANCE_TESTS=false  # Optional
   export RUN_CHAOS_TESTS=false        # Optional
   export RUN_SECURITY_TESTS=false     # Optional
   ```

### Run All Tests

```bash
node backend/tests/run-all-tests.js
```

### Run Specific Suite

```bash
node backend/tests/run-all-tests.js e2e
node backend/tests/run-all-tests.js performance
node backend/tests/run-all-tests.js chaos
node backend/tests/run-all-tests.js security
```

## Running Tests

### Local Development

**Quick Test (E2E only):**
```bash
npm run test:e2e
```

**Full Test Suite:**
```bash
RUN_PERFORMANCE_TESTS=true \
RUN_CHAOS_TESTS=true \
RUN_SECURITY_TESTS=true \
node backend/tests/run-all-tests.js
```

### Docker

```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Kubernetes

```bash
# Deploy test job
kubectl apply -f k8s/test-job.yaml

# Watch logs
kubectl logs -f job/security-monitor-tests -n security-monitor

# Cleanup
kubectl delete job/security-monitor-tests -n security-monitor
```

## Chaos Engineering

### Installing Chaos Mesh

```bash
# Install CRDs
kubectl apply -f https://mirrors.chaos-mesh.org/latest/crd.yaml

# Install Chaos Mesh
kubectl apply -f https://mirrors.chaos-mesh.org/latest/chaos-mesh.yaml

# Verify installation
kubectl get pods -n chaos-mesh
```

### Running Chaos Experiments

**Pod Failures:**
```bash
# Apply pod failure experiments
kubectl apply -f k8s/chaos-experiments/pod-failure.yaml

# Monitor effects
kubectl get pods -n security-monitor -w

# Check experiment status
kubectl get podchaos -n security-monitor

# Delete experiments
kubectl delete -f k8s/chaos-experiments/pod-failure.yaml
```

**Network Chaos:**
```bash
kubectl apply -f k8s/chaos-experiments/network-chaos.yaml
kubectl get networkchaos -n security-monitor
```

**Resource Stress:**
```bash
kubectl apply -f k8s/chaos-experiments/resource-stress.yaml
kubectl get stresschaos -n security-monitor
```

### Monitoring During Chaos

```bash
# Watch system health
watch -n 2 'curl -s http://localhost:3000/health | jq'

# Monitor pod status
kubectl get pods -n security-monitor -w

# Check resource usage
kubectl top pods -n security-monitor

# View logs
kubectl logs -f deployment/security-monitor -n security-monitor
```

## Performance Testing

### Running Performance Tests

```bash
# Default 60-second test
RUN_PERFORMANCE_TESTS=true node backend/tests/performance/performanceTests.js

# Custom duration (5 minutes)
TEST_DURATION=300000 RUN_PERFORMANCE_TESTS=true node backend/tests/performance/performanceTests.js
```

### Performance Metrics

**Throughput Benchmark:**
- Measures maximum requests per second
- 10 concurrent workers
- 60-second duration
- Reports success rate

**Latency Percentiles:**
- 1000 sample requests
- Reports P50, P95, P99, avg, min, max
- Identifies tail latency issues

**Concurrent Load Testing:**
- Tests 1, 10, 50, 100, 200 concurrent users
- Validates system stability under load
- Identifies bottlenecks

**Memory Usage:**
- 30-second load test
- Tracks heap growth
- Identifies memory leaks

**Cache Efficiency:**
- Measures cache hit vs miss times
- Calculates speedup factor
- Tests 100 cached requests

## Security Testing

### Running Security Tests

```bash
RUN_SECURITY_TESTS=true node backend/tests/security/penetrationTests.js
```

### Security Test Coverage

**Attack Detection:**
- All 14 attack types tested
- 100+ malicious payloads
- Validates input sanitization
- Tests rate limiting

**Vulnerabilities Detected:**
- Reports CRITICAL, HIGH, MEDIUM severity
- Provides payload examples
- Suggests remediation

**Security Metrics:**
- Detection rate
- False positive rate
- Response time to attacks
- Blocking effectiveness

### Interpreting Results

**No Vulnerabilities:**
```
 NO VULNERABILITIES DETECTED
```

**Vulnerabilities Found:**
```
=4 VULNERABILITIES DETECTED:

CRITICAL (2):
  - SQL Injection: Payload not detected
  - Authentication Bypass: Invalid token accepted
```

## CI/CD Integration

### GitHub Actions

The test suite is integrated into CI/CD pipeline (`.github/workflows/ci.yml`):

**On Pull Request:**
- Runs E2E tests
- Runs unit and integration tests
- Validates code quality

**On Push to Main:**
- Full test suite (including performance)
- Generates test reports
- Updates badges

**Scheduled (Daily):**
- Chaos engineering tests
- Security penetration tests
- Performance regression tests

### Test Reports

Reports are generated in `docs/reports/`:

**JSON Report:**
```json
{
  "timestamp": "2025-01-16T10:30:00Z",
  "summary": {
    "total": 6,
    "passed": 6,
    "failed": 0
  },
  "suites": [...]
}
```

**Viewing Reports:**
```bash
cat docs/reports/test-report-latest.json | jq
```

## Troubleshooting

### Common Issues

**System Not Ready:**
```
 System not ready. Please start the application first.
```
**Solution:** Start the application with `docker-compose up -d` or `npm start`

**Tests Timeout:**
```
Command timed out after 60000ms
```
**Solution:** Increase timeout in `run-all-tests.js` or check system performance

**Chaos Tests Fail:**
```
Database connection failure test failed
```
**Solution:** Ensure you have permissions to terminate database connections

**Port Already in Use:**
```
EADDRINUSE: address already in use :::3000
```
**Solution:** Stop conflicting processes or change TEST_BASE_URL

### Debug Mode

Enable verbose logging:
```bash
DEBUG=* node backend/tests/run-all-tests.js
```

### Test Isolation

Run tests in isolated environment:
```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Best Practices

1. **Always run E2E tests** before deploying
2. **Run performance tests** weekly to detect regressions
3. **Run chaos tests** in staging environment regularly
4. **Run security tests** after any security-related changes
5. **Monitor test reports** for trends and patterns
6. **Keep test data isolated** from production
7. **Clean up test artifacts** after runs
8. **Document test failures** with screenshots/logs

## Contributing

When adding new tests:

1. Place in appropriate directory (`e2e/`, `performance/`, etc.)
2. Follow existing naming conventions
3. Add to `run-all-tests.js` configuration
4. Update this README
5. Ensure tests are idempotent and isolated
6. Add appropriate timeouts
7. Include cleanup logic

## Resources

- [Mocha Documentation](https://mochajs.org/)
- [Chai Assertion Library](https://www.chaijs.com/)
- [Chaos Mesh Documentation](https://chaos-mesh.org/docs/)
- [Performance Testing Best Practices](https://martinfowler.com/articles/performance-testing.html)

## License

Same as main project license.
