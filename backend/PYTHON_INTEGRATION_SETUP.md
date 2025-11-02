# Python Services Integration Setup Guide

**Version:** 1.0.0
**Date:** November 1, 2025
**Status:** Production Ready

## Overview

This guide explains how to integrate the 5 Python microservices with the Node.js backend. The integration provides:

- **ML Models**: Price prediction, model training
- **NLP Translation**: Multilingual text translation (100+ languages)
- **Fraud Detection**: Risk assessment and anomaly detection
- **Data Processing**: Data validation, ETL pipelines
- **Blockchain Intelligence**: Smart contract analysis, MEV detection

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setup Instructions](#setup-instructions)
3. [API Integration](#api-integration)
4. [Health Monitoring](#health-monitoring)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Node.js Backend (Express)                │
├─────────────────────────────────────────────────────────────┤
│  Routes: /api/python/*                                      │
│  ├─ pythonServices.js (API handlers)                        │
│  ├─ pythonIntegrationService.js (Client + Wrappers)         │
│  └─ pythonServiceHealthMonitor.js (Health tracking)         │
└────────┬─────────────────────────────────────────────────────┘
         │ HTTP/REST Communication
         │
┌────────▼─────────────────────────────────────────────────────┐
│              Python Microservices (FastAPI)                  │
├─────────────────────────────────────────────────────────────┤
│ ├─ ML Models Service (port 8001)                            │
│ ├─ NLP Translation Service (port 8002)                      │
│ ├─ Fraud Detection Service (port 8003)                      │
│ ├─ Data Processing Service (port 8004)                      │
│ └─ Blockchain Intelligence Service (port 8005)              │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

1. **Request**: Node.js route handler receives HTTP request
2. **Processing**: pythonIntegrationService creates request with circuit breaker
3. **Caching**: Redis cache checked for existing results
4. **Service Call**: HTTP request sent to Python service
5. **Response**: Result cached and returned to client

### Fault Tolerance

- **Circuit Breaker**: Prevents cascading failures (threshold: 5 failures)
- **Health Checks**: Periodic service health verification (30-second intervals)
- **Caching**: Results cached with TTL to reduce load
- **Error Transformation**: Consistent error format across services

---

## Setup Instructions

### 1. Prerequisites

**Backend Requirements:**
- Node.js 16+
- Express.js (already installed)
- Redis (for caching)
- Docker (for Python services)

**Files to Have:**
```
backend/src/services/pythonIntegrationService.js
backend/src/routes/pythonServices.js
backend/src/middleware/pythonServiceHealthMonitor.js
backend/tests/integration/pythonServicesIntegration.test.js
python/services/* (all 5 services)
docker-compose.python.yml
```

### 2. Start Python Services

**Option A: Using Docker Compose**

```bash
# From DEX root directory
cd python
docker-compose -f ../docker-compose.python.yml up -d

# Verify services are running
docker ps | grep python
```

**Option B: Manual Python Setup**

```bash
cd python

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start services in separate terminals
python services/ml_models_service.py
python services/nlp_translation_service.py
python services/fraud_detection_service.py
python services/data_processing_service.py
python services/blockchain_intelligence_service.py
```

### 3. Register Routes in Node.js

**In `backend/src/app.js` or main server file:**

```javascript
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Import health monitor and create middleware
const {
  createHealthMonitorMiddleware,
  createServiceAvailabilityMiddleware,
  createHealthCheckRouter
} = require('./middleware/pythonServiceHealthMonitor');

// Apply health monitoring
app.use(createHealthMonitorMiddleware({
  checkInterval: 30000,  // 30 seconds
  healthThreshold: 0.7   // 70% success rate
}));

// Apply service availability check
app.use('/api/python', createServiceAvailabilityMiddleware());

// Register Python services routes
const pythonServices = require('./routes/pythonServices');
app.use('/api/python', pythonServices);

// Register health check routes
const healthCheckRouter = createHealthCheckRouter();
app.use('/api/health', healthCheckRouter);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Python services available at http://localhost:${PORT}/api/python`);
});
```

### 4. Verify Installation

```bash
# Check health of all Python services
curl http://localhost:3000/api/python/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-11-01T...",
  "services": {
    "ML_MODELS": { "status": "healthy", "healthy": true },
    "NLP_TRANSLATION": { "status": "healthy", "healthy": true },
    "FRAUD_DETECTION": { "status": "healthy", "healthy": true },
    "DATA_PROCESSING": { "status": "healthy", "healthy": true },
    "BLOCKCHAIN_INTELLIGENCE": { "status": "healthy", "healthy": true }
  }
}
```

---

## API Integration

### ML Models Service

**Price Prediction:**

```bash
curl -X POST http://localhost:3000/api/python/ml/predict \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenPair": "ETH/USDC",
    "priceHistory": [
      {
        "timestamp": "2025-11-01T00:00:00Z",
        "open": 2000,
        "high": 2050,
        "low": 1950,
        "close": 2030,
        "volume": 1000000
      }
    ],
    "forecastHorizon": 24,
    "confidenceLevel": 0.95
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token_pair": "ETH/USDC",
    "predicted_price": 2045.50,
    "confidence_interval": [2000, 2090],
    "predicted_direction": "up",
    "accuracy_score": 0.82,
    "latency_ms": 45
  },
  "timestamp": "2025-11-01T..."
}
```

**Model Training:**

```bash
curl -X POST http://localhost:3000/api/python/ml/train \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tokenPair": "ETH/USDC"}'
```

### NLP Translation Service

**Translate Text:**

```bash
curl -X POST http://localhost:3000/api/python/nlp/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, how are you?",
    "targetLanguage": "es",
    "sourceLanguage": "en"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "original_text": "Hello, how are you?",
    "translated_text": "¡Hola, cómo estás?",
    "source_language": "en",
    "target_language": "es",
    "confidence": 0.98,
    "latency_ms": 35
  }
}
```

**Batch Translation:**

```bash
curl -X POST http://localhost:3000/api/python/nlp/translate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["Hello", "Good morning", "Thank you"],
    "targetLanguage": "es",
    "sourceLanguage": "en"
  }'
```

**Supported Languages:**

```bash
curl http://localhost:3000/api/python/nlp/supported-languages
```

### Fraud Detection Service

**Assess Risk:**

```bash
curl -X POST http://localhost:3000/api/python/fraud/assess-risk \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "txHash": "0x123...abc",
      "fromAddress": "0x456...def",
      "toAddress": "0x789...ghi",
      "amount": 100000,
      "tokenPair": "ETH/USDC",
      "timestamp": "2025-11-01T12:00:00Z",
      "gasPrice": 50,
      "slippage": 0.005,
      "routeLength": 3,
      "contractInteraction": true
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "risk_score": 0.25,
    "risk_level": "low",
    "alerts": [],
    "is_suspicious": false,
    "latency_ms": 35
  }
}
```

### Data Processing Service

**Validate Blockchain Event:**

```bash
curl -X POST http://localhost:3000/api/python/data/validate-blockchain-event \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "event_id": "evt_001",
      "event_type": "swap",
      "timestamp": "2025-11-01T12:00:00Z",
      "block_number": 18000000,
      "transaction_hash": "0x123...abc",
      "contract_address": "0x456...def",
      "from_address": "0x789...ghi",
      "to_address": "0xabc...jkl",
      "token_in": "USDC",
      "token_out": "ETH",
      "amount_in": 1000,
      "amount_out": 0.5,
      "gas_used": 200000,
      "gas_price": 50
    }
  }'
```

**Aggregate Market Data:**

```bash
curl "http://localhost:3000/api/python/data/aggregate-market-data?tokenPair=ETH/USDC&period=1h" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Blockchain Intelligence Service

**Analyze Smart Contract:**

```bash
curl -X POST http://localhost:3000/api/python/blockchain/analyze-contract \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"address": "0x1234567890123456789012345678901234567890"}'
```

**Detect MEV:**

```bash
curl -X POST http://localhost:3000/api/python/blockchain/detect-mev \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetTx": {
      "amount": 100,
      "gas_price": 100,
      "timestamp": "2025-11-01T12:00:00Z"
    },
    "surroundingTxs": [
      {"amount": 60, "timestamp": "2025-11-01T11:59:55Z"},
      {"amount": 80, "timestamp": "2025-11-01T12:00:05Z"}
    ]
  }'
```

---

## Health Monitoring

### Health Check Endpoints

**Overall Health:**
```bash
curl http://localhost:3000/api/python/health
```

**Detailed Metrics:**
```bash
curl http://localhost:3000/api/health/metrics
```

**Individual Service Status:**
```bash
curl http://localhost:3000/api/health/service/ML_MODELS
```

### Using Health Monitor in Code

```javascript
const { PythonServiceHealthMonitor } = require('./middleware/pythonServiceHealthMonitor');

// Create monitor
const monitor = new PythonServiceHealthMonitor({
  checkInterval: 30000,
  healthThreshold: 0.7
});

// Start monitoring
monitor.start();

// Get status
const status = monitor.getHealthStatus();
console.log(status.overallStatus); // 'healthy', 'degraded', or 'unhealthy'

// Check specific service
const isHealthy = monitor.isServiceHealthy('ML_MODELS');

// Get metrics
const report = monitor.getMetricsReport();

// Stop monitoring
monitor.stop();
```

### Service Discovery

```javascript
const { ServiceDiscovery } = require('./middleware/pythonServiceHealthMonitor');

const discovery = new ServiceDiscovery(monitor);

// Get healthy services
const healthy = discovery.getHealthyServices();
// ['ML_MODELS', 'NLP_TRANSLATION', 'DATA_PROCESSING', ...]

// Get primary service for load balancing
const primary = discovery.getPrimaryService(['ML_MODELS']);

// Check if service group is operational
const operational = discovery.isServiceGroupOperational(['ML_MODELS', 'DATA_PROCESSING']);
```

---

## Testing

### Run Integration Tests

```bash
# Run all integration tests
npm test -- backend/tests/integration/pythonServicesIntegration.test.js

# Run specific test suite
npm test -- backend/tests/integration/pythonServicesIntegration.test.js \
  -t "ML Models Wrapper"

# Run with coverage
npm test -- backend/tests/integration/pythonServicesIntegration.test.js \
  --coverage
```

### Run Python Service Tests

```bash
cd python
pytest tests/test_services.py -v --asyncio-mode=auto

# Run specific test
pytest tests/test_services.py::test_ml_models_service_initialization -v
```

### Load Testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/api/python/health

# Using wrk
wrk -t4 -c100 -d30s http://localhost:3000/api/python/health
```

---

## Production Deployment

### Docker Deployment

**Build and push images:**

```bash
# Build Python services image
docker build -f python/Dockerfile -t myregistry/python-services:1.0.0 python/

# Push to registry
docker push myregistry/python-services:1.0.0
```

**Deploy with Docker Compose:**

```bash
docker-compose -f docker-compose.python.yml up -d
```

### Kubernetes Deployment

Create `k8s-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: python-services
spec:
  replicas: 3
  selector:
    matchLabels:
      app: python-services
  template:
    metadata:
      labels:
        app: python-services
    spec:
      containers:
      - name: ml-models
        image: myregistry/python-services:1.0.0
        ports:
        - containerPort: 8001
        env:
        - name: PORT
          value: "8001"
        livenessProbe:
          httpGet:
            path: /health
            port: 8001
          initialDelaySeconds: 30
          periodSeconds: 10
      - name: nlp-translation
        image: myregistry/python-services:1.0.0
        ports:
        - containerPort: 8002
        env:
        - name: PORT
          value: "8002"
        livenessProbe:
          httpGet:
            path: /health
            port: 8002
          initialDelaySeconds: 30
          periodSeconds: 10
```

Deploy:

```bash
kubectl apply -f k8s-deployment.yaml
```

### Environment Variables

Set in `.env` or production config:

```
ML_MODELS_URL=http://ml-models:8001
NLP_TRANSLATION_URL=http://nlp-translation:8002
FRAUD_DETECTION_URL=http://fraud-detection:8003
DATA_PROCESSING_URL=http://data-processing:8004
BLOCKCHAIN_INTELLIGENCE_URL=http://blockchain-intelligence:8005

REDIS_URL=redis://redis:6379
LOG_LEVEL=info
NODE_ENV=production
```

---

## Troubleshooting

### Service Not Responding

**Symptoms:** `503 Service Unavailable`

**Solution:**
1. Check service health: `curl http://localhost:3000/api/health/service/ML_MODELS`
2. Check Docker logs: `docker logs python_ml_models_1`
3. Verify network connectivity: `docker exec python_ml_models_1 curl http://localhost:8001/health`

### Circuit Breaker Open

**Symptoms:** Request fails immediately with "Circuit breaker open"

**Solution:**
1. The service has failed 5+ times; monitor will auto-reset after 1 minute
2. Check service health logs
3. Restart service: `docker restart python_ml_models_1`
4. Reset circuit breaker in code: `pythonClient.circuitBreakers.get('ML_MODELS').reset()`

### Slow Responses

**Symptoms:** Requests take longer than expected

**Solution:**
1. Check cache hit rate: `curl http://localhost:3000/api/health/metrics`
2. Monitor service latency: Look at `averageLatency` in metrics
3. Scale Python services: Increase replicas in docker-compose
4. Check Redis connectivity: `redis-cli ping`

### Authentication Errors

**Symptoms:** `401 Unauthorized`

**Solution:**
1. Include valid Bearer token: `-H "Authorization: Bearer YOUR_TOKEN"`
2. Verify token in auth middleware
3. Check token expiration

### Out of Memory

**Symptoms:** Service crashes, "Cannot allocate memory"

**Solution:**
1. Check memory usage: `docker stats`
2. Increase memory limit: `docker run -m 4g ...`
3. Optimize model loading in Python services
4. Enable model caching

### DNS Resolution Issues

**Symptoms:** `Cannot resolve service hostname`

**Solution:**
1. Ensure services use correct hostnames:
   - Docker: `http://service-name:port`
   - Kubernetes: `http://service-name.namespace.svc.cluster.local`
2. Check DNS configuration
3. Verify network connectivity

---

## Performance Optimization

### Caching Strategy

```javascript
// Adjust TTLs in pythonIntegrationService.js
const CACHE_DEFAULTS = {
  ML_PREDICTION: 3600,        // 1 hour
  TRANSLATION: 86400,          // 24 hours (stable results)
  RISK_ASSESSMENT: 1800,       // 30 minutes (evolving risks)
  DATA_VALIDATION: 3600,       // 1 hour
  CONTRACT_ANALYSIS: 604800    // 7 days (static contracts)
};
```

### Circuit Breaker Tuning

```javascript
// Adjust thresholds in pythonIntegrationService.js
const breaker = new CircuitBreaker({
  name: 'python-service',
  threshold: 5,           // Reduce for stricter monitoring
  timeout: 30000,         // Increase for slower services
  resetTimeout: 60000     // Increase for longer recovery time
});
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const pythonLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 100,               // 100 requests per minute
  message: 'Too many requests to Python services'
});

app.use('/api/python', pythonLimiter);
```

---

## Support & Documentation

For more information, see:
- [PYTHON_IMPLEMENTATION_GUIDE.md](../python/PYTHON_IMPLEMENTATION_GUIDE.md)
- [Service Documentation](../python/services/README.md)
- Test Examples: [pythonServicesIntegration.test.js](./tests/integration/pythonServicesIntegration.test.js)

---

**Status:** Production Ready
**Last Updated:** November 1, 2025
**Version:** 1.0.0
