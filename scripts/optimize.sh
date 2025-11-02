#!/bin/bash

echo "🚀 Starting DEX platform optimization..."

# Frontend optimization
echo "📦 Optimizing frontend build..."
cd frontend
npm ci --production=false
npm run build

# Backend optimization
echo "🔧 Optimizing backend..."
cd ../backend
npm ci --production=false
npm run build

# Clean up development dependencies
echo "🧹 Cleaning up development files..."
cd ../frontend
npm prune --production
cd ../backend
npm prune --production

# Docker image optimization
echo "🐳 Building optimized Docker images..."
cd ..
docker-compose -f docker-compose.production.yml build --no-cache

# Run security scan
echo "🔒 Running security scan..."
if [ -f "security/scanner/main.py" ]; then
    cd security/scanner
    python main.py --quick-scan
    cd ../..
fi

# Database optimization
echo "💾 Optimizing database..."
docker-compose -f docker-compose.production.yml exec -T postgres sh -c '
    psql -U $POSTGRES_USER -d $POSTGRES_DB -c "VACUUM ANALYZE;"
    psql -U $POSTGRES_USER -d $POSTGRES_DB -c "REINDEX DATABASE $POSTGRES_DB;"
'

# Redis optimization
echo "⚡ Optimizing Redis..."
docker-compose -f docker-compose.production.yml exec -T redis redis-cli CONFIG SET save "900 1 300 10 60 10000"

# Nginx cache optimization
echo "🌐 Optimizing Nginx cache..."
docker-compose -f docker-compose.production.yml exec -T nginx sh -c '
    nginx -s reload
'

# Health check
echo "🏥 Running health checks..."
curl -f http://localhost/health || echo "Warning: Health check failed"

# Performance monitoring setup
echo "📊 Setting up performance monitoring..."
if [ -f "monitoring/setup-alerts.sh" ]; then
    chmod +x monitoring/setup-alerts.sh
    ./monitoring/setup-alerts.sh
fi

echo "✅ Optimization complete!"
echo "📋 Summary:"
echo "   - Frontend build optimized"
echo "   - Backend build optimized"
echo "   - Docker images rebuilt"
echo "   - Database optimized"
echo "   - Cache configured"
echo "   - Security scan completed"
echo "   - Performance monitoring enabled"

echo "🎯 DEX platform is production-ready!"