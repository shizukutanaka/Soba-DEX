#!/bin/bash

# Production Build Script
# Lightweight and efficient build process for DEX platform

set -e

BUILD_TYPE=${1:-production}
SKIP_TESTS=${2:-false}

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18 or higher is required"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Clean previous builds
clean_builds() {
    log_step "Cleaning previous builds..."

    # Clean frontend build
    if [ -d "frontend/build" ]; then
        rm -rf frontend/build
        log_info "Cleaned frontend build directory"
    fi

    # Clean contract artifacts
    if [ -d "contracts/artifacts" ]; then
        rm -rf contracts/artifacts
        log_info "Cleaned contract artifacts"
    fi

    if [ -d "contracts/cache" ]; then
        rm -rf contracts/cache
        log_info "Cleaned contract cache"
    fi

    # Clean TypeScript build info
    find . -name "*.tsbuildinfo" -delete 2>/dev/null || true

    log_info "Build cleanup completed"
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."

    # Install root dependencies
    npm install --silent

    # Install and audit dependencies in parallel
    (cd backend && npm ci --silent) &
    (cd frontend && npm ci --silent) &
    (cd contracts && npm ci --silent) &

    wait

    log_info "Dependencies installed successfully"
}

# Build contracts
build_contracts() {
    log_step "Building smart contracts..."

    cd contracts

    # Compile contracts
    npm run compile

    # Generate contract size report
    if command -v npx &> /dev/null && npx hardhat help size-contracts &> /dev/null; then
        npm run size > ../build-reports/contract-sizes.txt 2>/dev/null || true
    fi

    cd ..

    log_info "Smart contracts compiled successfully"
}

# Build frontend
build_frontend() {
    log_step "Building frontend..."

    cd frontend

    case $BUILD_TYPE in
        "development")
            npm run build
            ;;
        "production")
            npm run build:production
            ;;
        "optimized")
            npm run build:optimized
            ;;
        *)
            npm run build:production
            ;;
    esac

    # Generate build report
    if [ -d "build" ]; then
        BUILD_SIZE=$(du -sh build 2>/dev/null | cut -f1)
        echo "Frontend build size: $BUILD_SIZE" > ../build-reports/frontend-size.txt
    fi

    cd ..

    log_info "Frontend built successfully"
}

# Run tests
run_tests() {
    if [ "$SKIP_TESTS" = "true" ]; then
        log_warn "Skipping tests"
        return
    fi

    log_step "Running tests..."

    # Create test reports directory
    mkdir -p build-reports/tests

    # Run backend tests
    log_info "Running backend tests..."
    (cd backend && npm run test:ci > ../build-reports/tests/backend-tests.log 2>&1) || {
        log_warn "Backend tests failed, check build-reports/tests/backend-tests.log"
    }

    # Run frontend tests
    log_info "Running frontend tests..."
    (cd frontend && npm run test:ci > ../build-reports/tests/frontend-tests.log 2>&1) || {
        log_warn "Frontend tests failed, check build-reports/tests/frontend-tests.log"
    }

    # Run contract tests
    log_info "Running contract tests..."
    (cd contracts && npm run test > ../build-reports/tests/contract-tests.log 2>&1) || {
        log_warn "Contract tests failed, check build-reports/tests/contract-tests.log"
    }

    log_info "Tests completed"
}

# Type checking
run_type_check() {
    log_step "Running type checks..."

    # Frontend TypeScript check
    (cd frontend && npm run typecheck) || {
        log_warn "Frontend type check failed"
    }

    log_info "Type checking completed"
}

# Security audit
run_security_audit() {
    log_step "Running security audit..."

    mkdir -p build-reports/security

    # Audit dependencies
    npm audit --audit-level=high > build-reports/security/root-audit.txt 2>&1 || true
    (cd backend && npm audit --audit-level=high > ../build-reports/security/backend-audit.txt 2>&1) || true
    (cd frontend && npm audit --audit-level=high > ../build-reports/security/frontend-audit.txt 2>&1) || true
    (cd contracts && npm audit --audit-level=high > ../build-reports/security/contracts-audit.txt 2>&1) || true

    log_info "Security audit completed"
}

# Generate build info
generate_build_info() {
    log_step "Generating build information..."

    mkdir -p build-reports

    # Create build info
    cat > build-reports/build-info.json << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "buildType": "$BUILD_TYPE",
  "nodeVersion": "$(node --version)",
  "npmVersion": "$(npm --version)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "buildNumber": "${BUILD_NUMBER:-$(date +%s)}",
  "skipTests": $SKIP_TESTS
}
EOF

    # Generate file checksums
    find frontend/build -type f -name "*.js" -o -name "*.css" -o -name "*.html" 2>/dev/null | \
        xargs sha256sum > build-reports/frontend-checksums.txt 2>/dev/null || true

    log_info "Build information generated"
}

# Optimize build artifacts
optimize_artifacts() {
    log_step "Optimizing build artifacts..."

    if [ -d "frontend/build" ]; then
        # Remove source maps in production
        if [ "$BUILD_TYPE" = "production" ] || [ "$BUILD_TYPE" = "optimized" ]; then
            find frontend/build -name "*.map" -delete 2>/dev/null || true
            log_info "Removed source maps"
        fi

        # Compress static assets
        if command -v gzip &> /dev/null; then
            find frontend/build/static -name "*.js" -o -name "*.css" | while read file; do
                gzip -k "$file" 2>/dev/null || true
            done
            log_info "Compressed static assets"
        fi
    fi

    log_info "Build optimization completed"
}

# Create deployment package
create_deployment_package() {
    if [ "$BUILD_TYPE" != "production" ] && [ "$BUILD_TYPE" != "optimized" ]; then
        return
    fi

    log_step "Creating deployment package..."

    PACKAGE_NAME="dex-platform-$(date +%Y%m%d-%H%M%S).tar.gz"

    # Create deployment directory structure
    mkdir -p deployment/app
    mkdir -p deployment/configs
    mkdir -p deployment/scripts

    # Copy application files
    cp -r backend deployment/app/
    cp -r frontend/build deployment/app/frontend/
    cp -r contracts/artifacts deployment/app/contracts/ 2>/dev/null || true

    # Copy configuration files
    cp docker-compose.production.yml deployment/configs/
    cp env.production.example deployment/configs/
    cp -r nginx deployment/configs/ 2>/dev/null || true

    # Copy scripts
    cp scripts/deploy.sh deployment/scripts/ 2>/dev/null || true

    # Clean up node_modules in deployment package
    find deployment/app -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

    # Create package
    tar -czf "dist/$PACKAGE_NAME" -C deployment . 2>/dev/null || {
        mkdir -p dist
        tar -czf "dist/$PACKAGE_NAME" -C deployment .
    }

    # Cleanup deployment directory
    rm -rf deployment

    log_info "Deployment package created: dist/$PACKAGE_NAME"
}

# Display build summary
display_summary() {
    log_step "Build Summary"

    echo "=================================="
    echo "Build Type: $BUILD_TYPE"
    echo "Build Time: $(date)"
    echo "Tests Skipped: $SKIP_TESTS"

    if [ -f "build-reports/build-info.json" ]; then
        echo "Build Info: build-reports/build-info.json"
    fi

    if [ -d "frontend/build" ]; then
        FRONTEND_SIZE=$(du -sh frontend/build 2>/dev/null | cut -f1 || echo "unknown")
        echo "Frontend Size: $FRONTEND_SIZE"
    fi

    if [ -d "contracts/artifacts" ]; then
        CONTRACT_COUNT=$(find contracts/artifacts -name "*.json" 2>/dev/null | wc -l || echo "0")
        echo "Contracts Compiled: $CONTRACT_COUNT"
    fi

    if [ -d "dist" ]; then
        PACKAGES=$(ls dist/*.tar.gz 2>/dev/null | wc -l || echo "0")
        echo "Deployment Packages: $PACKAGES"
    fi

    echo "=================================="
}

# Main build process
main() {
    log_info "Starting DEX Platform build process..."
    log_info "Build type: $BUILD_TYPE"

    # Create build reports directory
    mkdir -p build-reports

    # Execute build steps
    check_prerequisites
    clean_builds
    install_dependencies

    # Build in optimal order
    build_contracts
    build_frontend

    # Quality checks
    run_type_check
    run_tests
    run_security_audit

    # Finalization
    generate_build_info
    optimize_artifacts
    create_deployment_package

    display_summary

    log_info "Build process completed successfully!"
}

# Handle interruption
trap 'echo -e "\n${RED}Build interrupted${NC}"; exit 1' INT TERM

# Run main build process
main

# Exit with success
exit 0