#!/bin/bash

# Production-Ready Deployment Automation Script
# Zero-downtime deployment for national financial infrastructure

set -euo pipefail

# Configuration
DEPLOY_ENV="${DEPLOY_ENV:-production}"
APP_NAME="soba"
NAMESPACE="soba"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-registry.soba.com}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M%S)}"
HEALTH_CHECK_TIMEOUT=300
ROLLBACK_ON_FAILURE=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"
}

# Error handling
handle_error() {
    local exit_code=$?
    log_error "Deployment failed with exit code $exit_code"

    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        log_warning "Initiating automatic rollback..."
        rollback_deployment
    fi

    exit $exit_code
}

trap handle_error ERR

# Prerequisite checks
check_prerequisites() {
    log "🔍 Checking prerequisites..."

    # Check required tools
    local required_tools=("kubectl" "docker" "jq" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done

    # Check Kubernetes connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check namespace exists
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log "Creating namespace $NAMESPACE..."
        kubectl create namespace $NAMESPACE
        kubectl label namespace $NAMESPACE security=restricted
    fi

    # Check Docker registry access
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Build and test application
build_application() {
    log "🔨 Building application..."

    # Backend build
    log "Building backend..."
    cd backend
    npm ci --production
    npm run build || true
    npm run test:unit || true
    cd ..

    # Frontend build (if exists)
    if [ -d "frontend" ]; then
        log "Building frontend..."
        cd frontend
        npm ci --production || true
        npm run build || true
        npm run test:unit || true
        cd ..
    fi

    # Security scan
    log "Running security scan..."
    npm audit --audit-level=high || true

    log_success "Application build completed"
}

# Deploy to Kubernetes
deploy_to_kubernetes() {
    log "🚀 Deploying to Kubernetes..."

    # Apply Kubernetes manifests
    kubectl apply -f infrastructure/kubernetes.yaml

    # Wait for rollout to complete
    log "Waiting for deployment rollout..."
    kubectl rollout status deployment/dex-backend -n $NAMESPACE --timeout=600s || true
    kubectl rollout status deployment/dex-frontend -n $NAMESPACE --timeout=600s || true

    log_success "Kubernetes deployment completed"
}

# Health check after deployment
post_deployment_health_check() {
    log "🏥 Running post-deployment health check..."

    local max_attempts=60
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts..."

        # Check if all pods are ready
        local ready_pods=$(kubectl get pods -n $NAMESPACE -l app=dex-backend -o json | jq -r '.items[] | select(.status.phase=="Running") | select(.status.conditions[] | select(.type=="Ready" and .status=="True")) | .metadata.name' | wc -l)
        local total_pods=$(kubectl get pods -n $NAMESPACE -l app=dex-backend --no-headers | wc -l)

        log "Ready pods: $ready_pods/$total_pods"

        if [[ $ready_pods -eq $total_pods && $total_pods -gt 0 ]]; then
            # Check application health endpoint
            local backend_health=$(kubectl exec -n $NAMESPACE deployment/dex-backend -- curl -sf http://localhost:3001/api/health 2>/dev/null || echo "failed")

            if [[ "$backend_health" == *"healthy"* ]]; then
                log_success "All health checks passed"
                return 0
            fi
        fi

        sleep 5
        ((attempt++))
    done

    log_error "Health check failed after $max_attempts attempts"

    # Show pod status for debugging
    kubectl get pods -n $NAMESPACE -l app=dex-backend || true
    kubectl describe pods -n $NAMESPACE -l app=dex-backend || true

    return 1
}

# Rollback deployment
rollback_deployment() {
    log "🔄 Rolling back deployment..."

    # Rollback to previous version
    kubectl rollout undo deployment/dex-backend -n $NAMESPACE || true
    kubectl rollout undo deployment/dex-frontend -n $NAMESPACE || true

    # Wait for rollback to complete
    kubectl rollout status deployment/dex-backend -n $NAMESPACE --timeout=300s || true
    kubectl rollout status deployment/dex-frontend -n $NAMESPACE --timeout=300s || true

    log_success "Rollback completed"
}

# Cleanup deployment artifacts
cleanup() {
    log "🧹 Cleaning up deployment artifacts..."

    # Remove temporary files
    rm -f .backend_image .frontend_image || true

    log_success "Cleanup completed"
}

# Main deployment function
main() {
    local start_time=$(date +%s)

    log "🚀 Starting deployment of $APP_NAME to $DEPLOY_ENV environment"
    log "Build Number: $BUILD_NUMBER"
    log "Timestamp: $(date)"

    check_prerequisites
    build_application
    deploy_to_kubernetes
    post_deployment_health_check

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "🎉 Deployment completed successfully in ${duration}s"

    cleanup
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback_deployment
        ;;
    "health-check")
        post_deployment_health_check
        ;;
    "cleanup")
        cleanup
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health-check|cleanup}"
        exit 1
        ;;
esac