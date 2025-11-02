# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- Docker & Docker Compose
- Node.js 16+
- Redis

## 1. Start Services

```bash
# From DEX root directory
docker-compose -f docker-compose.python.yml up -d

# Verify
docker ps | grep python
```

## 2. Check Health

```bash
# Wait for services to start (~30 seconds)
sleep 30

# Health check
curl http://localhost:3000/api/python/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-01T...",
  "services": {
    "ML_MODELS": { "healthy": true },
    "NLP_TRANSLATION": { "healthy": true },
    ...
  }
}
```

## 3. Test Endpoints

### Translation
```bash
curl -X POST http://localhost:3000/api/python/nlp/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","targetLanguage":"es"}'
```

### Language Detection
```bash
curl -X POST http://localhost:3000/api/python/nlp/detect-language \
  -H "Content-Type: application/json" \
  -d '{"text":"Bonjour"}'
```

### Fraud Risk Assessment
```bash
curl -X POST http://localhost:3000/api/python/fraud/assess-risk \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": {
      "txHash": "0x123...abc",
      "fromAddress": "0x456...def",
      "toAddress": "0x789...ghi",
      "amount": 100000
    }
  }'
```

## 4. Run Tests

```bash
# Python tests
cd python
pytest tests/test_services.py -v

# Node.js tests
cd ..
npm test -- backend/tests/integration/pythonServicesIntegration.test.js
```

## 5. Monitor

```bash
# View metrics
curl http://localhost:3000/api/health/metrics

# Service-specific
curl http://localhost:3000/api/health/service/ML_MODELS
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Services not starting | Check Docker logs: `docker logs python_ml_models_1` |
| Health check fails | Wait 30 seconds for services to fully start |
| Port already in use | Change port: `docker-compose up -d -e ML_MODELS_PORT=8011` |

## Next Steps

- Read [Setup Instructions](./SETUP.md) for detailed configuration
- Check [API Integration](./API_INTEGRATION.md) for all endpoints
- See [Health Monitoring](./HEALTH_MONITORING.md) for advanced monitoring

---

**Duration:** 5 minutes
**Status:** Ready to use! ✅
