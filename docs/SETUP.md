# Setup Instructions

Complete setup guide for production deployment.

## System Requirements

### Minimum
- CPU: 4 cores
- RAM: 8 GB
- Disk: 50 GB SSD
- OS: Linux (Ubuntu 20.04+) or macOS

### Recommended for Production
- CPU: 8+ cores
- RAM: 32 GB
- Disk: 200 GB SSD
- Kubernetes cluster

## Prerequisites Installation

### Ubuntu 20.04

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Python 3.11
sudo apt-get install -y python3.11 python3.11-venv python3-pip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt-get install -y redis-server

# Install Kubernetes CLI
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
```

### macOS

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install docker docker-compose python@3.11 node redis kubernetes-cli

# Start Docker Desktop
open -a Docker
```

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/soba-dex/soba-dex.git
cd soba-dex
```

### 2. Configure Environment Variables

```bash
# Create .env file
cat > .env << EOF
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/soba_dex
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=soba_dex

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Services
ML_MODELS_URL=http://localhost:8001
NLP_TRANSLATION_URL=http://localhost:8002
FRAUD_DETECTION_URL=http://localhost:8003
DATA_PROCESSING_URL=http://localhost:8004
BLOCKCHAIN_INTELLIGENCE_URL=http://localhost:8005

# Environment
NODE_ENV=development
PYTHON_ENV=development
LOG_LEVEL=info

# API
API_PORT=3000
JWT_SECRET=your_jwt_secret

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_URL=http://localhost:3000
EOF
```

### 3. Install Node.js Dependencies

```bash
npm install
npm install --save-dev

# Verify installation
npm list
```

### 4. Setup Python Environment

```bash
# Create virtual environment
python3.11 -m venv venv

# Activate environment
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Install Python dependencies
pip install -r python/requirements.txt

# Verify installation
pip list
```

## Database Setup

### PostgreSQL

```bash
# Create database
createdb soba_dex

# Create user
psql -c "CREATE USER soba_dex WITH PASSWORD 'password';"

# Grant permissions
psql -c "ALTER DATABASE soba_dex OWNER TO soba_dex;"

# Run migrations
npm run db:migrate
```

### Redis

```bash
# Start Redis
redis-server

# Verify
redis-cli ping
# Should return: PONG
```

## Service Startup

### Development Mode

```bash
# Terminal 1: Start Node.js backend
npm run dev

# Terminal 2: Start Python services
python python/services/ml_models_service.py
python python/services/nlp_translation_service.py
python python/services/fraud_detection_service.py
python python/services/data_processing_service.py
python python/services/blockchain_intelligence_service.py

# Terminal 3: Start Redis
redis-server

# Terminal 4: (Optional) Start monitoring
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

### Docker Mode

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Verify
docker-compose ps
```

### Kubernetes

```bash
# Create namespace
kubectl create namespace python-services

# Apply configuration
kubectl apply -f k8s-deployment.yaml

# Verify deployment
kubectl get pods -n python-services

# Get service endpoints
kubectl get svc -n python-services
```

## Verification

### Health Checks

```bash
# API health
curl http://localhost:3000/api/health

# Python service health
curl http://localhost:8001/health
curl http://localhost:8002/health
curl http://localhost:8003/health
curl http://localhost:8004/health
curl http://localhost:8005/health

# Database connection
npm run db:check

# Redis connection
redis-cli ping
```

### Functional Tests

```bash
# Run all tests
npm test

# Python tests
cd python
pytest tests/test_services.py -v

# Integration tests
npm test -- backend/tests/integration/pythonServicesIntegration.test.js
```

## Configuration

### Service Configuration

Edit `python/config.py`:
```python
# ML Models configuration
ML_CONFIG = {
    'model_type': 'lstm',
    'batch_size': 32,
    'epochs': 100,
    'cache_ttl': 3600
}

# NLP configuration
NLP_CONFIG = {
    'model_name': 'Helsinki-NLP/opus-mt',
    'supported_languages': 100,
    'cache_ttl': 86400
}

# Database configuration
DB_CONFIG = {
    'pool_size': 20,
    'max_overflow': 10,
    'pool_recycle': 3600
}
```

### Monitoring Configuration

Edit `prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'python-services'
    static_configs:
      - targets: ['localhost:8001', 'localhost:8002', ...]
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3000
lsof -i :8001

# Kill process
kill -9 <PID>
```

### Database Connection Error

```bash
# Check PostgreSQL status
psql -U postgres -l

# Create database if missing
createdb soba_dex

# Run migrations
npm run db:migrate
```

### Python Dependencies Error

```bash
# Upgrade pip
pip install --upgrade pip

# Reinstall requirements
pip install -r python/requirements.txt --force-reinstall
```

### Memory Issues

```bash
# Check memory usage
free -h
top

# Increase Docker memory limit
# Edit docker-compose.yml, add:
# memory: 4g
# memswap_limit: 4g
```

## Next Steps

1. [Configure monitoring](./MONITORING.md)
2. [Deploy to production](./PRODUCTION.md)
3. [Read API documentation](./API_INTEGRATION.md)
4. [Review operational runbooks](./RUNBOOKS.md)

---

**Setup Time:** 30-45 minutes
**Complexity:** Medium
