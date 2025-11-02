#!/bin/bash

# DEX Platform Deployment Script
# Production-ready deployment with health checks and rollback capabilities

set -e

# Configuration
PROJECT_NAME="soba"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
NODE_ENV="${NODE_ENV:-production}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Health check function
health_check() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1

    log_info "Checking health of $service_name at $url"

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            log_success "$service_name is healthy"
            return 0
        fi

        log_info "Attempt $attempt/$max_attempts: $service_name not ready, waiting..."
        sleep 2
        ((attempt++))
    done

    log_error "$service_name failed health check after $max_attempts attempts"
    return 1
}

# Deployment functions
deploy_backend() {
    log_info "Deploying backend service..."

    cd backend

    # Install dependencies
    log_info "Installing backend dependencies..."
    npm ci --production

    # Build if needed
    if [ -f "package.json" ] && grep -q "build" package.json; then
        log_info "Building backend..."
        npm run build
    fi

    # Start backend service
    log_info "Starting backend service on port $BACKEND_PORT..."
    NODE_ENV=$NODE_ENV PORT=$BACKEND_PORT npm start &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../backend.pid

    # Health check
    if health_check "http://localhost:$BACKEND_PORT/api/health" "Backend"; then
        log_success "Backend deployed successfully"
    else
        log_error "Backend deployment failed"
        return 1
    fi

    cd ..
}

deploy_frontend() {
    log_info "Deploying frontend service..."

    cd frontend

    # Install dependencies
    log_info "Installing frontend dependencies..."
    npm ci

    # Build frontend
    log_info "Building frontend for production..."
    REACT_APP_API_URL="http://localhost:$BACKEND_PORT" npm run build

    # Serve frontend (using serve package)
    log_info "Starting frontend service on port $FRONTEND_PORT..."
    npx serve -s build -l $FRONTEND_PORT &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../frontend.pid

    # Health check
    if health_check "http://localhost:$FRONTEND_PORT" "Frontend"; then
        log_success "Frontend deployed successfully"
    else
        log_error "Frontend deployment failed"
        return 1
    fi

    cd ..
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."

    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    local node_version=$(node -v | cut -d'v' -f2)
    local min_version="14.0.0"
    if [ "$(printf '%s\n' "$min_version" "$node_version" | sort -V | head -n1)" != "$min_version" ]; then
        log_error "Node.js version $node_version is below minimum required $min_version"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Check ports availability
    if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null; then
        log_warning "Port $BACKEND_PORT is already in use"
    fi

    if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null; then
        log_warning "Port $FRONTEND_PORT is already in use"
    fi

    # Check disk space
    local available_space=$(df . | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 1000000 ]; then # Less than 1GB
        log_warning "Low disk space available: ${available_space}KB"
    fi

    log_success "Pre-deployment checks completed"
}

# Post-deployment verification
post_deployment_verification() {
    log_info "Running post-deployment verification..."

    # Test API endpoints
    local api_base="http://localhost:$BACKEND_PORT/api"

    # Test health endpoint
    if ! curl -s -f "$api_base/health" > /dev/null; then
        log_error "API health endpoint failed"
        return 1
    fi

    # Test trading pairs endpoint
    if ! curl -s -f "$api_base/pairs" > /dev/null; then
        log_error "Trading pairs endpoint failed"
        return 1
    fi

    # Test performance metrics
    if ! curl -s -f "$api_base/metrics/performance" > /dev/null; then
        log_error "Performance metrics endpoint failed"
        return 1
    fi

    # Test frontend
    if ! curl -s -f "http://localhost:$FRONTEND_PORT" > /dev/null; then
        log_error "Frontend accessibility failed"
        return 1
    fi

    log_success "Post-deployment verification completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up deployment artifacts..."

    # Stop services if needed
    if [ -f "backend.pid" ]; then
        local backend_pid=$(cat backend.pid)
        if kill -0 $backend_pid 2>/dev/null; then
            log_info "Stopping backend service (PID: $backend_pid)"
            kill $backend_pid
        fi
        rm -f backend.pid
    fi

    if [ -f "frontend.pid" ]; then
        local frontend_pid=$(cat frontend.pid)
        if kill -0 $frontend_pid 2>/dev/null; then
            log_info "Stopping frontend service (PID: $frontend_pid)"
            kill $frontend_pid
        fi
        rm -f frontend.pid
    fi
}

# Rollback function
rollback() {
    log_warning "Rolling back deployment..."
    cleanup
    log_info "Rollback completed"
    exit 1
}

# Signal handlers
trap rollback ERR
trap cleanup EXIT

# Main deployment process
main() {
    log_info "Starting $PROJECT_NAME deployment..."
    log_info "Environment: $NODE_ENV"
    log_info "Backend Port: $BACKEND_PORT"
    log_info "Frontend Port: $FRONTEND_PORT"

    # Run pre-deployment checks
    pre_deployment_checks

    # Deploy services
    if ! deploy_backend; then
        log_error "Backend deployment failed"
        return 1
    fi

    if ! deploy_frontend; then
        log_error "Frontend deployment failed"
        return 1
    fi

    # Run verification
    if ! post_deployment_verification; then
        log_error "Post-deployment verification failed"
        return 1
    fi

    # Success message
    log_success "🎉 $PROJECT_NAME deployed successfully!"
    log_info "Frontend: http://localhost:$FRONTEND_PORT"
    log_info "Backend API: http://localhost:$BACKEND_PORT/api"
    log_info "API Documentation: http://localhost:$BACKEND_PORT/api-docs"
    log_info "Health Check: http://localhost:$BACKEND_PORT/api/health"

    # Show monitoring info
    log_info "📊 Monitoring endpoints:"
    log_info "  Performance: http://localhost:$BACKEND_PORT/api/metrics/performance"
    log_info "  System Info: http://localhost:$BACKEND_PORT/api/system/info"
    log_info "  Cache Stats: http://localhost:$BACKEND_PORT/api/cache/stats"

    log_info "To stop services, run: ./deploy.sh stop"
}

# Stop function
stop_services() {
    log_info "Stopping all services..."
    cleanup
    log_success "All services stopped"
}

# Status function
show_status() {
    log_info "Service Status:"

    if [ -f "backend.pid" ]; then
        local backend_pid=$(cat backend.pid)
        if kill -0 $backend_pid 2>/dev/null; then
            log_success "Backend: Running (PID: $backend_pid)"
        else
            log_error "Backend: Not running (stale PID file)"
        fi
    else
        log_warning "Backend: Not running"
    fi

    if [ -f "frontend.pid" ]; then
        local frontend_pid=$(cat frontend.pid)
        if kill -0 $frontend_pid 2>/dev/null; then
            log_success "Frontend: Running (PID: $frontend_pid)"
        else
            log_error "Frontend: Not running (stale PID file)"
        fi
    else
        log_warning "Frontend: Not running"
    fi
}

# Script arguments handling
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        stop_services
        ;;
    "status")
        show_status
        ;;
    "restart")
        stop_services
        sleep 2
        main
        ;;
    *)
        echo "Usage: $0 {deploy|stop|status|restart}"
        echo "  deploy   - Deploy the application (default)"
        echo "  stop     - Stop all services"
        echo "  status   - Show service status"
        echo "  restart  - Restart all services"
        exit 1
        ;;
esac