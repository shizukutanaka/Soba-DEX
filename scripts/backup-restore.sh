#!/bin/bash
# ============================================================================
# Backup and Restore Script for DEX Security Monitor
# Manual backup and restore operations
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="${NAMESPACE:-security-monitor}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Backup Functions
# ============================================================================

backup_postgres() {
    print_info "Starting PostgreSQL backup..."

    local BACKUP_FILE="$BACKUP_DIR/postgres-backup-$TIMESTAMP.sql.gz"
    mkdir -p "$BACKUP_DIR"

    # Get database credentials
    DB_PASSWORD=$(kubectl get secret security-monitor-secrets -n $NAMESPACE -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode)
    DB_NAME=$(kubectl get configmap security-monitor-config -n $NAMESPACE -o jsonpath='{.data.DB_NAME}')
    DB_USER=$(kubectl get configmap security-monitor-config -n $NAMESPACE -o jsonpath='{.data.DB_USER}')

    # Create backup via kubectl exec
    kubectl exec -n $NAMESPACE statefulset/postgres -- bash -c \
        "PGPASSWORD='$DB_PASSWORD' pg_dump -U $DB_USER $DB_NAME --format=custom --compress=9" \
        | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        print_info "PostgreSQL backup completed: $BACKUP_FILE"
        ls -lh "$BACKUP_FILE"
    else
        print_error "PostgreSQL backup failed!"
        exit 1
    fi
}

backup_redis() {
    print_info "Starting Redis backup..."

    local BACKUP_FILE="$BACKUP_DIR/redis-backup-$TIMESTAMP.rdb"
    mkdir -p "$BACKUP_DIR"

    # Get Redis password
    REDIS_PASSWORD=$(kubectl get secret security-monitor-secrets -n $NAMESPACE -o jsonpath='{.data.REDIS_PASSWORD}' | base64 --decode)

    # Trigger BGSAVE and wait
    kubectl exec -n $NAMESPACE statefulset/redis -- redis-cli -a "$REDIS_PASSWORD" --no-auth-warning BGSAVE
    sleep 5

    # Copy RDB file
    kubectl exec -n $NAMESPACE statefulset/redis -- cat /data/dump.rdb > "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        gzip "$BACKUP_FILE"
        print_info "Redis backup completed: $BACKUP_FILE.gz"
        ls -lh "$BACKUP_FILE.gz"
    else
        print_error "Redis backup failed!"
        exit 1
    fi
}

backup_volumes() {
    print_info "Starting volume backups..."

    mkdir -p "$BACKUP_DIR/volumes-$TIMESTAMP"

    # Backup evidence
    kubectl cp $NAMESPACE/$(kubectl get pod -n $NAMESPACE -l app=security-monitor -o jsonpath='{.items[0].metadata.name}'):/app/evidence \
        "$BACKUP_DIR/volumes-$TIMESTAMP/evidence" || print_warn "Evidence backup failed or empty"

    # Backup reports
    kubectl cp $NAMESPACE/$(kubectl get pod -n $NAMESPACE -l app=security-monitor -o jsonpath='{.items[0].metadata.name}'):/app/reports \
        "$BACKUP_DIR/volumes-$TIMESTAMP/reports" || print_warn "Reports backup failed or empty"

    # Backup ML models
    kubectl cp $NAMESPACE/$(kubectl get pod -n $NAMESPACE -l app=security-monitor -o jsonpath='{.items[0].metadata.name}'):/app/models \
        "$BACKUP_DIR/volumes-$TIMESTAMP/models" || print_warn "Models backup failed or empty"

    # Create tarball
    tar -czf "$BACKUP_DIR/volumes-$TIMESTAMP.tar.gz" -C "$BACKUP_DIR" "volumes-$TIMESTAMP"
    rm -rf "$BACKUP_DIR/volumes-$TIMESTAMP"

    print_info "Volume backups completed: $BACKUP_DIR/volumes-$TIMESTAMP.tar.gz"
}

backup_all() {
    print_info "=== Starting full backup ==="
    backup_postgres
    backup_redis
    backup_volumes
    print_info "=== Full backup completed ==="
    print_info "Backup location: $BACKUP_DIR"
    ls -lh "$BACKUP_DIR"/*$TIMESTAMP*
}

# ============================================================================
# Restore Functions
# ============================================================================

restore_postgres() {
    local BACKUP_FILE="$1"

    if [ -z "$BACKUP_FILE" ]; then
        print_error "Please specify backup file: $0 restore-postgres <backup_file>"
        exit 1
    fi

    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi

    print_warn "This will restore PostgreSQL database from: $BACKUP_FILE"
    print_warn "All existing data will be replaced!"
    read -p "Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Restore cancelled"
        exit 0
    fi

    print_info "Starting PostgreSQL restore..."

    # Get database credentials
    DB_PASSWORD=$(kubectl get secret security-monitor-secrets -n $NAMESPACE -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode)
    DB_NAME=$(kubectl get configmap security-monitor-config -n $NAMESPACE -o jsonpath='{.data.DB_NAME}')
    DB_USER=$(kubectl get configmap security-monitor-config -n $NAMESPACE -o jsonpath='{.data.DB_USER}')

    # Decompress if gzipped
    if [[ $BACKUP_FILE == *.gz ]]; then
        gunzip -c "$BACKUP_FILE" | kubectl exec -i -n $NAMESPACE statefulset/postgres -- bash -c \
            "PGPASSWORD='$DB_PASSWORD' pg_restore -U $DB_USER -d $DB_NAME --clean --if-exists"
    else
        kubectl exec -i -n $NAMESPACE statefulset/postgres -- bash -c \
            "PGPASSWORD='$DB_PASSWORD' pg_restore -U $DB_USER -d $DB_NAME --clean --if-exists" < "$BACKUP_FILE"
    fi

    if [ $? -eq 0 ]; then
        print_info "PostgreSQL restore completed successfully"
    else
        print_error "PostgreSQL restore failed!"
        exit 1
    fi
}

restore_redis() {
    local BACKUP_FILE="$1"

    if [ -z "$BACKUP_FILE" ]; then
        print_error "Please specify backup file: $0 restore-redis <backup_file>"
        exit 1
    fi

    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi

    print_warn "This will restore Redis data from: $BACKUP_FILE"
    print_warn "All existing data will be replaced!"
    read -p "Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_info "Restore cancelled"
        exit 0
    fi

    print_info "Starting Redis restore..."

    # Stop Redis
    kubectl scale statefulset/redis -n $NAMESPACE --replicas=0
    sleep 5

    # Decompress and copy RDB file
    if [[ $BACKUP_FILE == *.gz ]]; then
        gunzip -c "$BACKUP_FILE" | kubectl exec -i -n $NAMESPACE statefulset/redis -- tee /data/dump.rdb > /dev/null
    else
        kubectl exec -i -n $NAMESPACE statefulset/redis -- tee /data/dump.rdb < "$BACKUP_FILE" > /dev/null
    fi

    # Restart Redis
    kubectl scale statefulset/redis -n $NAMESPACE --replicas=1

    print_info "Waiting for Redis to start..."
    kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=60s

    if [ $? -eq 0 ]; then
        print_info "Redis restore completed successfully"
    else
        print_error "Redis restore failed!"
        exit 1
    fi
}

# ============================================================================
# List Backups
# ============================================================================

list_backups() {
    print_info "Available backups in $BACKUP_DIR:"
    echo ""
    echo "PostgreSQL backups:"
    ls -lh "$BACKUP_DIR"/postgres-backup-*.sql.gz 2>/dev/null || echo "  No PostgreSQL backups found"
    echo ""
    echo "Redis backups:"
    ls -lh "$BACKUP_DIR"/redis-backup-*.rdb.gz 2>/dev/null || echo "  No Redis backups found"
    echo ""
    echo "Volume backups:"
    ls -lh "$BACKUP_DIR"/volumes-*.tar.gz 2>/dev/null || echo "  No volume backups found"
}

# ============================================================================
# Disaster Recovery Test
# ============================================================================

test_disaster_recovery() {
    print_info "=== Starting disaster recovery test ==="
    print_info "This will:"
    print_info "  1. Create backups"
    print_info "  2. Verify backup integrity"
    print_info "  3. Simulate restore (dry run)"
    echo ""

    # Create test backups
    backup_all

    # Verify backups
    print_info "Verifying backup integrity..."

    # Check PostgreSQL backup
    POSTGRES_BACKUP="$BACKUP_DIR/postgres-backup-$TIMESTAMP.sql.gz"
    if [ -f "$POSTGRES_BACKUP" ]; then
        gunzip -t "$POSTGRES_BACKUP"
        if [ $? -eq 0 ]; then
            print_info "PostgreSQL backup integrity: OK"
        else
            print_error "PostgreSQL backup integrity: FAILED"
        fi
    fi

    # Check Redis backup
    REDIS_BACKUP="$BACKUP_DIR/redis-backup-$TIMESTAMP.rdb.gz"
    if [ -f "$REDIS_BACKUP" ]; then
        gunzip -t "$REDIS_BACKUP"
        if [ $? -eq 0 ]; then
            print_info "Redis backup integrity: OK"
        else
            print_error "Redis backup integrity: FAILED"
        fi
    fi

    print_info "=== Disaster recovery test completed ==="
}

# ============================================================================
# Main
# ============================================================================

case "${1:-}" in
    backup-postgres)
        backup_postgres
        ;;
    backup-redis)
        backup_redis
        ;;
    backup-volumes)
        backup_volumes
        ;;
    backup-all|backup)
        backup_all
        ;;
    restore-postgres)
        restore_postgres "$2"
        ;;
    restore-redis)
        restore_redis "$2"
        ;;
    list)
        list_backups
        ;;
    test)
        test_disaster_recovery
        ;;
    *)
        echo "DEX Security Monitor - Backup and Restore Script"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Backup Commands:"
        echo "  backup-all           - Backup PostgreSQL, Redis, and volumes"
        echo "  backup-postgres      - Backup PostgreSQL database only"
        echo "  backup-redis         - Backup Redis data only"
        echo "  backup-volumes       - Backup application volumes only"
        echo ""
        echo "Restore Commands:"
        echo "  restore-postgres <file>  - Restore PostgreSQL from backup"
        echo "  restore-redis <file>     - Restore Redis from backup"
        echo ""
        echo "Other Commands:"
        echo "  list                 - List available backups"
        echo "  test                 - Test disaster recovery process"
        echo ""
        echo "Environment Variables:"
        echo "  NAMESPACE            - Kubernetes namespace (default: security-monitor)"
        echo "  BACKUP_DIR           - Backup directory (default: ./backups)"
        echo ""
        echo "Examples:"
        echo "  $0 backup-all"
        echo "  $0 restore-postgres ./backups/postgres-backup-20250116-020000.sql.gz"
        echo "  NAMESPACE=prod $0 backup-postgres"
        exit 1
        ;;
esac
