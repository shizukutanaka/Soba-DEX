#!/bin/bash

###############################################################################
# DEX Security Monitoring System - Automated Setup Script
# Version: 6.0
# Description: Complete automated installation and configuration
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="DEX Security Monitoring"
VERSION="6.0"
REQUIRED_DOCKER_VERSION="20.10"
REQUIRED_NODE_VERSION="18"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════"
    echo "   $PROJECT_NAME v$VERSION"
    echo "   Automated Setup Script"
    echo "═══════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

###############################################################################
# Pre-flight Checks
###############################################################################

check_prerequisites() {
    print_step "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        print_info "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_success "Docker found: $(docker --version)"

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        print_info "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_success "Docker Compose found: $(docker-compose --version)"

    # Check Node.js (optional for development)
    if command -v node &> /dev/null; then
        print_success "Node.js found: $(node --version)"
    else
        print_warning "Node.js not found (optional for development)"
    fi

    # Check npm (optional for development)
    if command -v npm &> /dev/null; then
        print_success "npm found: $(npm --version)"
    fi

    # Check disk space (require at least 10GB)
    available_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$available_space" -lt 10 ]; then
        print_warning "Low disk space: ${available_space}GB available (10GB+ recommended)"
    else
        print_success "Disk space: ${available_space}GB available"
    fi

    # Check RAM (require at least 4GB)
    total_ram=$(free -g | awk 'NR==2 {print $2}')
    if [ "$total_ram" -lt 4 ]; then
        print_warning "Low RAM: ${total_ram}GB available (4GB+ recommended)"
    else
        print_success "RAM: ${total_ram}GB available"
    fi

    echo ""
}

###############################################################################
# Environment Setup
###############################################################################

create_env_file() {
    print_step "Creating .env file..."

    if [ -f .env ]; then
        print_warning ".env file already exists"
        read -p "Overwrite existing .env? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env file"
            return
        fi
    fi

    # Generate random passwords
    DB_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    REDIS_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    GRAFANA_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

    cat > .env << EOF
# DEX Security Monitoring System Configuration
# Generated: $(date)

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=security_monitor
DB_USER=postgres
DB_PASSWORD=$DB_PASS
DB_POOL_SIZE=20

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASS
REDIS_DB=0

# Security
MAX_SECURITY_EVENTS=10000
MAX_INCIDENTS=1000
RATE_LIMIT_PER_IP=100

# Threat Intelligence API Keys (Add your keys here)
ABUSEIPDB_API_KEY=
VIRUSTOTAL_API_KEY=
SHODAN_API_KEY=

# Notifications (Add your webhook URLs)
SLACK_WEBHOOK_URL=
SLACK_WEBHOOK_SECRET=
TEAMS_WEBHOOK_URL=

# Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_PASSWORD=$GRAFANA_PASS

# Tracing
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
EOF

    print_success ".env file created"
    print_info "Generated passwords (save these securely):"
    echo "  Database: $DB_PASS"
    echo "  Redis: $REDIS_PASS"
    echo "  Grafana: $GRAFANA_PASS"
    echo ""
}

###############################################################################
# Directory Setup
###############################################################################

create_directories() {
    print_step "Creating required directories..."

    mkdir -p models/threat-prediction
    mkdir -p models/attack-prediction
    mkdir -p reports/compliance
    mkdir -p reports/forensics
    mkdir -p evidence
    mkdir -p logs
    mkdir -p data/postgres
    mkdir -p data/prometheus
    mkdir -p data/grafana

    print_success "Directories created"
}

###############################################################################
# Docker Setup
###############################################################################

setup_docker() {
    print_step "Setting up Docker environment..."

    # Pull required images
    print_info "Pulling Docker images (this may take a few minutes)..."
    docker-compose -f docker-compose.security.yml pull

    print_success "Docker images pulled"
}

###############################################################################
# Database Initialization
###############################################################################

init_database() {
    print_step "Initializing database..."

    # Start only database first
    print_info "Starting PostgreSQL..."
    docker-compose -f docker-compose.security.yml up -d postgres

    # Wait for database to be ready
    print_info "Waiting for database to be ready..."
    sleep 10

    # Run initialization script
    print_info "Creating database schema..."
    docker-compose -f docker-compose.security.yml exec -T postgres psql -U postgres -d security_monitor << 'EOF'
CREATE TABLE IF NOT EXISTS security_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MEDIUM',
    ip VARCHAR(45),
    url TEXT,
    user_agent TEXT,
    timestamp BIGINT NOT NULL,
    risk_score INTEGER DEFAULT 0,
    threat_level VARCHAR(20) DEFAULT 'LOW',
    blocked BOOLEAN DEFAULT FALSE,
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON security_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_ip ON security_events(ip);
CREATE INDEX IF NOT EXISTS idx_events_type ON security_events(type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON security_events(severity);

CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(255) PRIMARY KEY,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    title VARCHAR(500),
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    resolved_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create hypertable for time-series data
SELECT create_hypertable('security_events', 'timestamp',
    chunk_time_interval => 86400000,
    if_not_exists => TRUE);

EOF

    print_success "Database initialized"
}

###############################################################################
# Start Services
###############################################################################

start_services() {
    print_step "Starting all services..."

    docker-compose -f docker-compose.security.yml up -d

    print_info "Waiting for services to start..."
    sleep 30

    print_success "All services started"
}

###############################################################################
# Verify Installation
###############################################################################

verify_installation() {
    print_step "Verifying installation..."

    # Check if services are running
    services=(postgres redis prometheus grafana jaeger security-monitor)

    for service in "${services[@]}"; do
        if docker-compose -f docker-compose.security.yml ps | grep -q "$service.*Up"; then
            print_success "$service is running"
        else
            print_error "$service is NOT running"
        fi
    done

    echo ""
    print_info "Testing endpoints..."

    # Test health endpoint
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        print_success "Health endpoint: OK"
    else
        print_warning "Health endpoint: Not responding (may need more time to start)"
    fi

    # Test metrics endpoint
    if curl -sf http://localhost:3000/metrics > /dev/null 2>&1; then
        print_success "Metrics endpoint: OK"
    else
        print_warning "Metrics endpoint: Not responding"
    fi

    echo ""
}

###############################################################################
# Display Access Information
###############################################################################

display_access_info() {
    echo ""
    print_header

    echo -e "${GREEN}✅ Installation Complete!${NC}"
    echo ""
    echo "Access your DEX Security Monitoring System:"
    echo ""
    echo -e "  ${BLUE}Dashboard:${NC}     http://localhost:3000/dashboard"
    echo -e "  ${BLUE}API:${NC}           http://localhost:3000/api"
    echo -e "  ${BLUE}Metrics:${NC}       http://localhost:3000/metrics"
    echo -e "  ${BLUE}Grafana:${NC}       http://localhost:3001"
    echo -e "  ${BLUE}Prometheus:${NC}    http://localhost:9090"
    echo -e "  ${BLUE}Jaeger:${NC}        http://localhost:16686"
    echo ""
    echo "Grafana Credentials:"
    echo "  Username: admin"
    echo "  Password: (check your .env file)"
    echo ""
    echo "Next steps:"
    echo "  1. Configure threat intelligence API keys in .env"
    echo "  2. Set up webhook URLs for notifications"
    echo "  3. Review QUICK_START.md for detailed usage"
    echo "  4. Access the dashboard to start monitoring"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose -f docker-compose.security.yml logs -f"
    echo "  Stop system:  docker-compose -f docker-compose.security.yml down"
    echo "  Restart:      docker-compose -f docker-compose.security.yml restart"
    echo ""
}

###############################################################################
# Main Installation Flow
###############################################################################

main() {
    print_header

    # Pre-flight checks
    check_prerequisites

    # Prompt for installation type
    echo "Select installation type:"
    echo "  1) Full installation (Docker Compose)"
    echo "  2) Development setup (Node.js)"
    echo "  3) Custom installation"
    read -p "Choice (1-3): " -n 1 -r
    echo ""

    case $REPLY in
        1)
            print_info "Starting full Docker Compose installation..."
            create_env_file
            create_directories
            setup_docker
            init_database
            start_services
            verify_installation
            display_access_info
            ;;
        2)
            print_info "Development setup not yet implemented"
            print_info "Please use Docker Compose installation for now"
            exit 1
            ;;
        3)
            print_info "Custom installation not yet implemented"
            exit 1
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

###############################################################################
# Execute Main
###############################################################################

main "$@"
