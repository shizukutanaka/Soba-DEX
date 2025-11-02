# Security scanner service
FROM python:3.11-alpine

# Install security tools
RUN apk add --no-cache \
    git \
    curl \
    nmap \
    openssl \
    ca-certificates

# Create non-root user
RUN addgroup -g 1003 -S security
RUN adduser -S scanner -u 1003 -G security

WORKDIR /app

# Copy requirements
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy security scanner scripts
COPY scanner/ ./scanner/
COPY config/ ./config/

# Set permissions
RUN chown -R scanner:security /app

# Switch to non-root user
USER scanner

# Environment variables
ENV PYTHONPATH=/app
ENV SCAN_INTERVAL=3600

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/health', timeout=5)"

# Expose metrics port
EXPOSE 8080

# Start security scanner
CMD ["python", "scanner/main.py"]