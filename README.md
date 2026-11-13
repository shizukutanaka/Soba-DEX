# Soba DEX - Python ML Microservices Integration

[![Status](https://img.shields.io/badge/status-in%20development-yellow)]() [![License](https://img.shields.io/badge/license-MIT-green)]()

> **Project status: experimental / under development — not production ready.**
>
> This repository is a work-in-progress software project. In particular:
>
> - The smart contracts have **not** undergone a third-party security audit.
> - This software is **not distributed** as a finished product and is **not** intended to be deployed with real user funds.
> - Earlier versions of this README described the project as "Production Ready" and quoted performance, coverage, and business figures. Those figures were self-reported and are not backed by measurements or records in this repository, so they have been removed.
>
> This README covers the **Python ML microservices layer** (`python/`) and its integration with the Node.js backend (`backend/`). The DEX contracts (`contracts/`) and frontend (`frontend/`) are separate components.

Python ML microservices integrated with the Node.js backend. Provides price prediction, multilingual translation, fraud detection, data processing, and blockchain intelligence.

## 🎯 Features

### 5 Microservices
- **ML Models** - LSTM-based price prediction with ensemble methods
- **NLP Translation** - Hugging Face Transformers (100+ languages)
- **Fraud Detection** - Isolation Forest + HDBSCAN anomaly detection
- **Data Processing** - ETL pipelines & real-time validation
- **Blockchain Intelligence** - Smart contract analysis & MEV detection

### Platform pieces included in this repository
- ✅ Circuit breaker pattern for fault tolerance (`backend/src/patterns/circuitBreaker.js`)
- ✅ Health endpoints for the Python services (`GET /api/python/health`)
- ✅ Redis-based caching
- ✅ Docker Compose and Kubernetes manifests for local/development deployment
- ✅ Logging & monitoring hooks

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Python 3.11+
- Docker & Docker Compose
- Redis
- Kubernetes 1.24+ (optional, for trying the bundled manifests)

### 1. Start Services (Docker)

```bash
docker-compose -f docker-compose.python.yml up -d
```

### 2. Integrate with Node.js

The Python services router is mounted by the backend itself in
`backend/src/app-core.js`:

```javascript
// backend/src/app-core.js
const pythonServices = require('./routes/pythonServices');
this.app.use('/api/python', pythonServices);
```

There is no separate health-monitor middleware to install; health status is
exposed through the router's `GET /api/python/health` endpoint.

### 3. Test

```bash
# Health check
curl http://localhost:3000/api/python/health

# Translate
curl -X POST http://localhost:3000/api/python/nlp/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","targetLanguage":"es"}'
```

## 📊 API Endpoints

### Health & Monitoring (3)
```
GET  /api/python/health                    # Overall status
GET  /api/health/metrics                   # Detailed metrics
GET  /api/health/service/:name             # Service status
```

### ML Models (2)
```
POST /api/python/ml/predict                # Price prediction
POST /api/python/ml/train                  # Model training
```

### NLP Translation (4)
```
POST /api/python/nlp/translate             # Single translation
POST /api/python/nlp/detect-language       # Language detection
POST /api/python/nlp/translate-batch       # Batch translate
GET  /api/python/nlp/supported-languages   # List languages
```

### Fraud Detection (1)
```
POST /api/python/fraud/assess-risk         # Risk assessment
```

### Data Processing (4)
```
POST /api/python/data/validate-blockchain-event
POST /api/python/data/validate-market-data
POST /api/python/data/process-event-stream
GET  /api/python/data/aggregate-market-data
```

### Blockchain Intelligence (4)
```
POST /api/python/blockchain/analyze-contract
POST /api/python/blockchain/detect-mev
POST /api/python/blockchain/analyze-wallet-cluster
GET  /api/python/blockchain/transaction-graph
```

**Total:** 18 endpoints + health monitoring

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│     Node.js Backend (Express)           │
├─────────────────────────────────────────┤
│ Routes: /api/python/*                   │
│ ├─ Integration Client                   │
│ ├─ Service Wrappers (5)                 │
│ ├─ Health Monitor                       │
│ └─ API Gateway                          │
└────────────┬────────────────────────────┘
             │ HTTP/REST
┌────────────▼────────────────────────────┐
│   Python Microservices (FastAPI)        │
├─────────────────────────────────────────┤
│ ├─ ML Models (port 8001)                │
│ ├─ NLP Translation (port 8002)          │
│ ├─ Fraud Detection (port 8003)          │
│ ├─ Data Processing (port 8004)          │
│ └─ Blockchain Intelligence (port 8005)  │
└─────────────────────────────────────────┘
```

## 📦 Technology Stack

### Backend
- Express.js, Node.js
- Circuit Breaker Pattern
- Redis (caching)
- Prometheus (metrics)

### Python Services
- FastAPI, uvicorn
- PyTorch, TensorFlow
- scikit-learn, XGBoost
- Transformers (Hugging Face)
- asyncpg, SQLAlchemy

### Infrastructure
- Docker, Docker Compose
- Kubernetes (1.24+)
- Horizontal Pod Autoscaling
- Network Policies

## 🧪 Testing

### Run All Tests

```bash
# Python tests
cd python
pytest tests/test_services.py -v --asyncio-mode=auto

# Node.js integration tests
npm test -- backend/tests/integration/pythonServicesIntegration.test.js

# Test coverage
npm test -- --coverage
```

### What exists today
- Python side: `python/tests/test_services.py` (a single test module covering the service layer)
- Node.js side: integration tests under `backend/tests/`, including `backend/tests/integration/pythonServicesIntegration.test.js`

No coverage figure is published here: this repository does not currently
contain coverage reports that would back a specific percentage.

## 🚀 Deployment

The manifests in this repository are provided for development and evaluation.
They do not make the system production-ready (see the status note at the top):
the contracts are unaudited and this project is not distributed for live use.

### Docker Compose
```bash
docker-compose -f docker-compose.python.yml up -d
```

### Kubernetes
```bash
kubectl apply -f k8s-deployment.yaml
kubectl get pods -n python-services
```

### Configuration
Set environment variables:
```
ML_MODELS_URL=http://ml-models:8001
NLP_TRANSLATION_URL=http://nlp-translation:8002
FRAUD_DETECTION_URL=http://fraud-detection:8003
DATA_PROCESSING_URL=http://data-processing:8004
BLOCKCHAIN_INTELLIGENCE_URL=http://blockchain-intelligence:8005
REDIS_URL=redis://redis:6379
```

## 📊 Monitoring

### Health Checks
```bash
curl http://localhost:3000/api/python/health
```

### Metrics
```bash
curl http://localhost:3000/api/health/metrics
```

### Service Status
```bash
curl http://localhost:3000/api/health/service/ML_MODELS
```

## 🔧 Configuration

### Circuit Breaker
```javascript
{
  threshold: 5,           // Fail after 5 failures
  timeout: 30000,         // 30s request timeout
  resetTimeout: 60000     // 1 minute recovery
}
```

### Cache TTLs
```
ML_PREDICTION: 1 hour
TRANSLATION: 24 hours
RISK_ASSESSMENT: 30 minutes
DATA_VALIDATION: 1 hour
CONTRACT_ANALYSIS: 7 days
```

## 📚 Documentation

### Getting Started
- [Quick Start Guide](./docs/QUICK_START.md)
- [Setup Instructions](./docs/SETUP.md)

### Integration
- [API Integration](./docs/API_INTEGRATION.md)

### Operations
- [Operational Runbooks](./docs/RUNBOOKS.md)

### Architecture
- [System Design](./docs/ARCHITECTURE.md)
- [Documentation index](./docs/README.md)

## 🔍 Monitoring & Alerting

The codebase exposes Prometheus-style metrics and health endpoints that can be
wired into a monitoring stack:

- Service health status
- Request latency (P50, P95, P99)
- Error rates by service
- Resource utilization (CPU, Memory)
- Cache hit rates
- Circuit breaker status

Example alert conditions used during development:

- Service unavailable (critical)
- High error rate >5% (warning)
- High latency >200ms (warning)
- Capacity >90% (critical)

## 🔐 Security

### Practices reflected in the code
- Non-root container users (e.g. `USER mlapp` in `python/Dockerfile`)
- Request validation on the API routes

### What is **not** in place
- **No third-party security audit** of the smart contracts or the services has been performed.
- No compliance certification (GDPR, SOC 2, PCI-DSS, or otherwise) has been obtained for this project.
- Do not deploy this software where it can custody or move real user funds.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes & test
4. Submit pull request

## 📝 License

MIT License - See LICENSE file for details

## 💬 Support

### Documentation
- Setup: [./docs/SETUP.md](./docs/SETUP.md)
- API: [./docs/API_INTEGRATION.md](./docs/API_INTEGRATION.md)
- Operations: [./docs/RUNBOOKS.md](./docs/RUNBOOKS.md)

### Quick Links
- **Health Dashboard:** http://localhost:3000/api/python/health
- **Metrics:** http://localhost:3000/api/health/metrics

### Contact
- **Issues:** https://github.com/shizukutanaka/Soba-DEX/issues
- **Discussions:** GitHub Discussions

## 📊 Project Statistics

| Metric | Value |
|--------|-------|
| **Python Services** | 5 |
| **API Endpoints** | 18+ |
| **Docker Images** | Multi-stage builds |
| **Kubernetes Manifests** | Included (development/evaluation use) |
| **Production Ready** | ❌ No — see the status note at the top |

Note: there is no single version number for this README's subject. The
repository's components are versioned separately (root `package.json`: 3.9.0,
`backend`: 3.9.0, `frontend`: 2.1.0, `contracts`: 1.0.0).

## 🐛 Known Issues & Limitations

- The smart contracts are unaudited; the whole project is under development and is not distributed for production use.
- Test coverage is thin on the Python side (one test module) and no coverage report is published.
- See [Issues](https://github.com/shizukutanaka/Soba-DEX/issues) for bug reports

---

**Status:** 🚧 In development — not production ready, not audited, not distributed for live use
**Last Updated:** November 13, 2025

For detailed information, see the [documentation](./docs) directory.
