# Multi-stage Dockerfile for Python ML Services

# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Build wheels
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas0 \
    liblapack3 \
    libgomp1 \
    libffi7 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels from builder
COPY --from=builder /build/wheels /wheels
COPY --from=builder /build/requirements.txt .

# Install wheels
RUN pip install --no-cache /wheels/* && rm -rf /wheels

# Copy application
COPY services/ ./services/
COPY config/ ./config/
COPY utils/ ./utils/
COPY .env* ./

# Create non-root user
RUN useradd -m -u 1000 mlapp && chown -R mlapp:mlapp /app
USER mlapp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Expose ports (one per service)
EXPOSE 8001 8002 8003 8004 8005

# Run with uvicorn
CMD ["python", "-m", "uvicorn", "services.ml_models_service:app", "--host", "0.0.0.0", "--port", "8001"]
