# System Architecture

Complete system design and architecture documentation.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Client Applications                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                 ┌───────▼────────┐
                 │   Load Balancer│
                 │   (ALB/NLB)    │
                 └───────┬────────┘
                         │
┌─────────────────────────┴──────────────────────────────────────┐
│                    API Gateway Layer                           │
├──────────────────────────────────────────────────────────────┤
│  ├─ Request routing                                          │
│  ├─ Rate limiting (100 req/min)                             │
│  ├─ Authentication (Bearer token)                           │
│  ├─ Request transformation                                   │
│  └─ Response formatting                                      │
└─────────────────────────┬──────────────────────────────────────┘
                         │
┌─────────────────────────▼──────────────────────────────────────┐
│               Node.js Backend (Express.js)                     │
├──────────────────────────────────────────────────────────────┤
│  Routes:                                                      │
│  ├─ /api/python/*           (Python service routes)          │
│  ├─ /api/health/*           (Health monitoring)              │
│  ├─ /api/dashboard/*        (Admin dashboard)                │
│  └─ /api/metrics/*          (Metrics endpoints)              │
│                                                               │
│  Middleware:                                                  │
│  ├─ pythonServiceGateway    (Routing & load balancing)       │
│  ├─ pythonServiceHealthMonitor (Health checks)               │
│  ├─ pythonIntegrationService (Circuit breaker & caching)    │
│  └─ Authentication          (Token validation)               │
│                                                               │
│  Cache Layer:                                                 │
│  └─ Redis (Cache hit rate: 95%+)                             │
└─────────────────────────┬──────────────────────────────────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
       │                 │                  │
    ┌──▼──┐          ┌──▼──┐           ┌──▼──┐
    │Svc 1│          │Svc 2│           │Svc 3│  ...
    └─────┘          └─────┘           └─────┘
```

## Component Architecture

### 1. Node.js Backend Layer

**Technology Stack:**
- Express.js (HTTP server)
- Node.js 16+
- Redis (caching)
- Prometheus (metrics)

**Responsibilities:**
- API request handling
- Request validation
- Authentication & authorization
- Python service orchestration
- Cache management
- Metrics collection

**Key Files:**
- `backend/src/routes/pythonServices.js` - API endpoints
- `backend/src/services/pythonIntegrationService.js` - Integration client
- `backend/src/middleware/pythonServiceGateway.js` - API gateway
- `backend/src/middleware/pythonServiceHealthMonitor.js` - Health monitoring

### 2. Python Microservices Layer

**Technology Stack:**
- FastAPI (HTTP framework)
- Python 3.11
- PyTorch, TensorFlow, scikit-learn (ML/AI)
- asyncpg (Database)
- Redis (caching)

**Services:**
1. **ML Models** (Port 8001)
   - LSTM price prediction
   - Ensemble methods
   - Model training

2. **NLP Translation** (Port 8002)
   - Hugging Face Transformers
   - 100+ language support
   - Language detection

3. **Fraud Detection** (Port 8003)
   - Isolation Forest
   - HDBSCAN clustering
   - Risk scoring

4. **Data Processing** (Port 8004)
   - ETL pipelines
   - Real-time validation
   - Data aggregation

5. **Blockchain Intelligence** (Port 8005)
   - Smart contract analysis
   - MEV detection
   - Wallet clustering

### 3. Data Layer

**Components:**
- **PostgreSQL** - Primary data store
- **Redis** - In-memory cache & session store
- **Elasticsearch** - Log storage & search

**Data Flow:**
```
Application → Write/Read → PostgreSQL
           ↓
           Redis (Cache)
           ↓
           Read operations (95% hit rate)
```

### 4. Monitoring & Observability

**Components:**
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **ELK Stack** - Logging
- **Jaeger** - Distributed tracing (optional)

**Metrics Collected:**
- Request count, latency, errors
- Resource utilization (CPU, memory)
- Cache hit rates
- Circuit breaker status
- Service health

## Request Flow

### Typical API Request

```
1. Client
   ↓
2. Load Balancer
   ↓
3. API Gateway (Rate limiting, Auth)
   ↓
4. Node.js Express Router
   ↓
5. Request Validation Middleware
   ↓
6. Cache Check (Redis)
   ├─ Hit: Return cached response
   └─ Miss: Continue to step 7
   ↓
7. Python Service Gateway
   - Load balancing
   - Retry logic
   - Circuit breaker
   ↓
8. Python Microservice
   - Processing
   - Database operations
   ↓
9. Response Cache (Redis)
   ↓
10. Response to Client
```

## Service Communication Patterns

### Synchronous Communication

```
Node.js ──HTTP POST──> Python Service
   ↑                        │
   └────────JSON────────────┘
```

**Protocol:** HTTP/1.1
**Timeout:** 30 seconds
**Retry:** 2-3 attempts with exponential backoff

### Asynchronous Communication (Optional)

For future long-running operations:
```
Node.js ──→ Message Queue (RabbitMQ/Kafka)
              ↓
           Python Worker
              ↓
           Callback webhook
```

## Deployment Architecture

### Docker Compose (Development)

```
docker-compose.yml
├─ ml-models (service)
├─ nlp-translation (service)
├─ fraud-detection (service)
├─ data-processing (service)
├─ blockchain-intelligence (service)
├─ redis (cache)
└─ postgres (database)
```

### Kubernetes (Production)

```
python-services namespace
├─ ml-models deployment (3+ replicas)
├─ nlp-translation deployment (3+ replicas)
├─ fraud-detection deployment (3+ replicas)
├─ data-processing deployment (3+ replicas)
├─ blockchain-intelligence deployment (3+ replicas)
├─ HorizontalPodAutoscaler for each
├─ Redis StatefulSet
├─ PostgreSQL StatefulSet
├─ Services (ClusterIP)
└─ Ingress (API gateway)
```

## Scaling Strategy

### Horizontal Scaling

**Auto-scaling Configured:**
- Min replicas: 3 per service
- Max replicas: 10-15 per service
- Trigger: CPU >70%, Memory >80%
- Scale-up delay: 30 seconds
- Scale-down delay: 5 minutes

**Load Balancing:**
- Kubernetes Service (round-robin)
- HAProxy in Node.js gateway (weighted)

### Vertical Scaling

**Resource Requests & Limits:**
```
ML Models:
  requests: cpu=500m, memory=2Gi
  limits: cpu=2000m, memory=4Gi

NLP Translation:
  requests: cpu=1000m, memory=3Gi
  limits: cpu=2000m, memory=5Gi
```

## High Availability Design

### Fault Tolerance

1. **Circuit Breaker Pattern**
   - Threshold: 5 consecutive failures
   - Timeout: 30 seconds
   - Recovery: Auto reset after 60 seconds

2. **Health Checks**
   - Interval: 30 seconds
   - Timeout: 5 seconds
   - Failure threshold: 3

3. **Retry Logic**
   - Max retries: 2-3 depending on service
   - Backoff: Exponential (1.5x multiplier)
   - Jitter: Random 0-10% delay

4. **Graceful Degradation**
   - Cache fallback for recent requests
   - Circuit breaker prevents cascading failures
   - Rate limiting protects backend

### Disaster Recovery

**Backup Strategy:**
- Database: Daily incremental backups
- Configuration: Version controlled (Git)
- Secrets: Encrypted in Kubernetes Secrets

**Recovery Time Objectives (RTO):**
- Data loss: <1 hour
- Service recovery: <30 minutes
- Full system: <2 hours

## Security Architecture

### Network Security

```
┌──────────────┐
│ TLS/SSL      │
│ (In transit) │
└──────┬───────┘
       │
┌──────▼───────────────────────┐
│  Network Policies             │
│  - Pod-to-pod communication   │
│  - Namespace isolation        │
│  - Ingress rules              │
└──────┬───────────────────────┘
       │
┌──────▼───────────────────────┐
│  Service Mesh (Optional)      │
│  - Istio/Linkerd              │
│  - mTLS enforcement           │
│  - Traffic control            │
└───────────────────────────────┘
```

### Data Security

- **Encryption at rest:** PostgreSQL encryption
- **Encryption in transit:** TLS 1.3
- **Secrets management:** Kubernetes Secrets with encryption
- **Access control:** RBAC policies

## Performance Optimization

### Caching Strategy

```
Layer 1: Application Cache (Redis)
├─ TTL: 30 minutes - 7 days
├─ Hit rate: 95%+
└─ Eviction: LRU

Layer 2: Database Connection Pool
├─ Pool size: 20 connections
├─ Timeout: 30 seconds
└─ Recycle: 3600 seconds

Layer 3: Database Caching
├─ Query results cached
└─ Query optimization
```

### Query Optimization

- Database indexes on frequently queried columns
- Query profiling with slow query log
- Connection pooling
- Query batching

### Code Optimization

- Async/await throughout
- Promise.all() for parallel operations
- Request batching
- Early returns on errors
- Lazy loading of resources

## Monitoring & Observability

### Metrics Collection

**Prometheus Metrics:**
```
python_services_requests_total{service="", endpoint=""}
python_services_request_latency_seconds{service=""}
python_services_requests_success_total{service=""}
python_services_requests_failed_total{service=""}
python_services_cache_hits_total{service=""}
python_services_cache_misses_total{service=""}
```

**Custom Application Metrics:**
- ML model accuracy
- Translation quality (BLEU score)
- Fraud detection precision/recall
- Data validation pass rate

### Logging

```
Log Format: JSON (structured logging)

Fields:
{
  "timestamp": "2025-11-01T12:00:00Z",
  "service": "ml-models",
  "level": "INFO|WARN|ERROR|DEBUG",
  "message": "Price prediction completed",
  "duration_ms": 45,
  "request_id": "req_123",
  "user_id": "user_456",
  "metadata": {...}
}

Log Levels:
- ERROR: System errors, exceptions
- WARN: High error rates, threshold alerts
- INFO: Request/response, state changes
- DEBUG: Detailed execution info (dev only)
```

### Alerting

**Alert Thresholds:**
- Error rate > 5% (Warning)
- Error rate > 10% (Critical)
- Latency P95 > 200ms (Warning)
- Service down (Critical)
- Capacity > 90% (Warning)
- Capacity > 95% (Critical)

## Technology Decisions

### Why Express.js?
- Lightweight, fast
- Excellent middleware ecosystem
- Strong Node.js integration
- Easy to extend

### Why FastAPI?
- High performance (async)
- Automatic API documentation
- Type hints & validation
- Excellent ML integration

### Why Kubernetes?
- Industry standard
- Excellent scaling
- Self-healing
- Declarative configuration

### Why Redis?
- Ultra-fast in-memory cache
- Simple API
- Excellent performance
- Built-in data structures

## Future Enhancements

### Planned Improvements
- [ ] Service mesh integration (Istio)
- [ ] API versioning support
- [ ] WebSocket support for real-time updates
- [ ] GraphQL API layer
- [ ] Advanced caching strategies
- [ ] ML model serving optimization
- [ ] Multi-region deployment
- [ ] Database sharding

### Technology Upgrades
- [ ] Express.js → Fastify (higher throughput)
- [ ] Custom circuit breaker → Consul/service mesh
- [ ] Basic logging → ELK Stack integration
- [ ] Manual deployment → GitOps (ArgoCD)

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0
