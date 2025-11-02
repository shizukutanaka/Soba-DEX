# Backup service for DEX platform
FROM alpine:3.18

# Install required packages
RUN apk add --no-cache \
    bash \
    curl \
    postgresql-client \
    redis \
    aws-cli \
    python3 \
    py3-pip \
    tzdata \
    gzip \
    tar

# Create non-root user
RUN addgroup -g 1004 -S backup
RUN adduser -S backup -u 1004 -G backup

# Install Python dependencies
RUN pip3 install --no-cache-dir boto3 schedule python-crontab

WORKDIR /app

# Copy backup scripts
COPY scripts/ ./scripts/
COPY config/ ./config/

# Create backup directories
RUN mkdir -p /backups/database /backups/redis /backups/logs
RUN chown -R backup:backup /app /backups

# Set timezone
ENV TZ=UTC

# Switch to non-root user
USER backup

# Environment variables
ENV BACKUP_SCHEDULE="0 2 * * *"
ENV RETENTION_DAYS=30
ENV COMPRESSION_LEVEL=6

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD python3 -c "import os; exit(0 if os.path.exists('/backups/.last_backup') else 1)"

# Start backup service
CMD ["python3", "scripts/backup_manager.py"]