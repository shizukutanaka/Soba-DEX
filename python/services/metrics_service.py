"""
Metrics Service for Python Microservices
Real-time metrics collection, aggregation, and Prometheus export

Features:
- Histogram metrics for latency tracking
- Counter metrics for request/error tracking
- Gauge metrics for resource utilization
- Custom application metrics
- Prometheus endpoint integration
"""

import time
import logging
from datetime import datetime, timedelta
from collections import defaultdict, deque
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum

import asyncpg
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry
from fastapi import APIRouter
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class MetricPoint:
    """Single metric data point"""
    timestamp: datetime
    value: float
    service: str
    metric_name: str
    labels: Dict[str, str] = field(default_factory=dict)


class MetricType(str, Enum):
    """Metric type enum"""
    COUNTER = "counter"
    HISTOGRAM = "histogram"
    GAUGE = "gauge"


class MetricsCollector:
    """Collects and aggregates metrics"""

    def __init__(self, window_size: int = 3600):
        """
        Initialize metrics collector

        Args:
            window_size: Time window in seconds for metric retention
        """
        self.window_size = window_size
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
        self.service_stats: Dict[str, Dict[str, Any]] = {}
        self._initialize_service_stats()

    def _initialize_service_stats(self):
        """Initialize stats for all services"""
        services = [
            'ML_MODELS',
            'NLP_TRANSLATION',
            'FRAUD_DETECTION',
            'DATA_PROCESSING',
            'BLOCKCHAIN_INTELLIGENCE'
        ]

        for service in services:
            self.service_stats[service] = {
                'total_requests': 0,
                'successful_requests': 0,
                'failed_requests': 0,
                'total_latency': 0,
                'latencies': deque(maxlen=1000),
                'errors': defaultdict(int),
                'cache_hits': 0,
                'cache_misses': 0,
                'last_error': None,
                'last_error_time': None
            }

    def record_request(self, service: str, latency: float, success: bool = True,
                      error: Optional[str] = None):
        """Record a request metric"""
        if service not in self.service_stats:
            self.service_stats[service] = {
                'total_requests': 0,
                'successful_requests': 0,
                'failed_requests': 0,
                'total_latency': 0,
                'latencies': deque(maxlen=1000),
                'errors': defaultdict(int),
                'cache_hits': 0,
                'cache_misses': 0,
                'last_error': None,
                'last_error_time': None
            }

        stats = self.service_stats[service]
        stats['total_requests'] += 1
        stats['latencies'].append(latency)
        stats['total_latency'] += latency

        if success:
            stats['successful_requests'] += 1
        else:
            stats['failed_requests'] += 1
            if error:
                stats['errors'][error] += 1
                stats['last_error'] = error
                stats['last_error_time'] = datetime.now()

    def record_cache_hit(self, service: str):
        """Record cache hit"""
        if service in self.service_stats:
            self.service_stats[service]['cache_hits'] += 1

    def record_cache_miss(self, service: str):
        """Record cache miss"""
        if service in self.service_stats:
            self.service_stats[service]['cache_misses'] += 1

    def get_service_metrics(self, service: str) -> Dict[str, Any]:
        """Get metrics for specific service"""
        if service not in self.service_stats:
            return {}

        stats = self.service_stats[service]
        latencies = list(stats['latencies'])

        total = stats['total_requests']
        if total == 0:
            return {
                'service': service,
                'total_requests': 0,
                'success_rate': '0%',
                'error_rate': '0%',
                'cache_hit_rate': '0%'
            }

        return {
            'service': service,
            'total_requests': total,
            'successful_requests': stats['successful_requests'],
            'failed_requests': stats['failed_requests'],
            'success_rate': f"{(stats['successful_requests'] / total) * 100:.2f}%",
            'error_rate': f"{(stats['failed_requests'] / total) * 100:.2f}%",
            'avg_latency_ms': f"{stats['total_latency'] / total:.2f}",
            'p50_latency_ms': f"{np.percentile(latencies, 50):.2f}",
            'p95_latency_ms': f"{np.percentile(latencies, 95):.2f}",
            'p99_latency_ms': f"{np.percentile(latencies, 99):.2f}",
            'min_latency_ms': f"{min(latencies):.2f}" if latencies else '0',
            'max_latency_ms': f"{max(latencies):.2f}" if latencies else '0',
            'cache_hits': stats['cache_hits'],
            'cache_misses': stats['cache_misses'],
            'cache_hit_rate': f"{(stats['cache_hits'] / (stats['cache_hits'] + stats['cache_misses']) * 100):.2f}%"
                             if (stats['cache_hits'] + stats['cache_misses']) > 0 else '0%',
            'top_errors': dict(sorted(stats['errors'].items(),
                                     key=lambda x: x[1], reverse=True)[:5]),
            'last_error': stats['last_error'],
            'last_error_time': stats['last_error_time'].isoformat() if stats['last_error_time'] else None
        }

    def get_all_metrics(self) -> Dict[str, Any]:
        """Get metrics for all services"""
        return {
            service: self.get_service_metrics(service)
            for service in self.service_stats.keys()
        }

    def reset_metrics(self, service: Optional[str] = None):
        """Reset metrics"""
        if service:
            if service in self.service_stats:
                self._initialize_service_stats()
                self.service_stats[service] = {
                    'total_requests': 0,
                    'successful_requests': 0,
                    'failed_requests': 0,
                    'total_latency': 0,
                    'latencies': deque(maxlen=1000),
                    'errors': defaultdict(int),
                    'cache_hits': 0,
                    'cache_misses': 0,
                    'last_error': None,
                    'last_error_time': None
                }
        else:
            self._initialize_service_stats()


class PrometheusExporter:
    """Prometheus metrics exporter"""

    def __init__(self):
        """Initialize Prometheus exporter"""
        self.registry = CollectorRegistry()

        # Request counters
        self.requests_total = Counter(
            'python_services_requests_total',
            'Total number of requests',
            ['service', 'endpoint'],
            registry=self.registry
        )

        self.requests_success = Counter(
            'python_services_requests_success_total',
            'Total successful requests',
            ['service'],
            registry=self.registry
        )

        self.requests_failed = Counter(
            'python_services_requests_failed_total',
            'Total failed requests',
            ['service'],
            registry=self.registry
        )

        # Latency histograms
        self.request_latency = Histogram(
            'python_services_request_latency_seconds',
            'Request latency in seconds',
            ['service'],
            buckets=(0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0),
            registry=self.registry
        )

        # Cache metrics
        self.cache_hits = Counter(
            'python_services_cache_hits_total',
            'Total cache hits',
            ['service'],
            registry=self.registry
        )

        self.cache_misses = Counter(
            'python_services_cache_misses_total',
            'Total cache misses',
            ['service'],
            registry=self.registry
        )

        # Resource gauges
        self.active_connections = Gauge(
            'python_services_active_connections',
            'Active database connections',
            ['service'],
            registry=self.registry
        )

        self.queue_length = Gauge(
            'python_services_queue_length',
            'Request queue length',
            ['service'],
            registry=self.registry
        )

    def record_request(self, service: str, endpoint: str, latency: float, success: bool = True):
        """Record request to Prometheus"""
        self.requests_total.labels(service=service, endpoint=endpoint).inc()
        self.request_latency.labels(service=service).observe(latency / 1000)  # Convert to seconds

        if success:
            self.requests_success.labels(service=service).inc()
        else:
            self.requests_failed.labels(service=service).inc()

    def record_cache_hit(self, service: str):
        """Record cache hit"""
        self.cache_hits.labels(service=service).inc()

    def record_cache_miss(self, service: str):
        """Record cache miss"""
        self.cache_misses.labels(service=service).inc()

    def set_active_connections(self, service: str, count: int):
        """Set active connection count"""
        self.active_connections.labels(service=service).set(count)

    def set_queue_length(self, service: str, length: int):
        """Set queue length"""
        self.queue_length.labels(service=service).set(length)

    def get_metrics(self):
        """Get all metrics in Prometheus format"""
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        return generate_latest(self.registry)


class AlertingSystem:
    """Alert management system"""

    def __init__(self, metrics_collector: MetricsCollector):
        """Initialize alerting system"""
        self.metrics = metrics_collector
        self.alerts: List[Dict[str, Any]] = []
        self.thresholds = {
            'error_rate': 0.05,  # 5%
            'p95_latency': 200,  # 200ms
            'success_rate': 0.95  # 95%
        }

    def check_alerts(self) -> List[Dict[str, Any]]:
        """Check for alert conditions"""
        alerts = []

        for service, stats in self.metrics.service_stats.items():
            total = stats['total_requests']
            if total == 0:
                continue

            error_rate = stats['failed_requests'] / total
            if error_rate > self.thresholds['error_rate']:
                alerts.append({
                    'severity': 'warning',
                    'service': service,
                    'type': 'error_rate',
                    'message': f"Error rate high: {error_rate*100:.2f}%",
                    'value': error_rate,
                    'threshold': self.thresholds['error_rate'],
                    'timestamp': datetime.now()
                })

            if stats['latencies']:
                p95_latency = np.percentile(list(stats['latencies']), 95)
                if p95_latency > self.thresholds['p95_latency']:
                    alerts.append({
                        'severity': 'warning',
                        'service': service,
                        'type': 'latency',
                        'message': f"P95 latency high: {p95_latency:.2f}ms",
                        'value': p95_latency,
                        'threshold': self.thresholds['p95_latency'],
                        'timestamp': datetime.now()
                    })

        self.alerts = alerts
        return alerts

    def set_threshold(self, metric: str, value: float):
        """Set alert threshold"""
        if metric in self.thresholds:
            self.thresholds[metric] = value

    def get_alerts(self, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get active alerts"""
        if severity:
            return [a for a in self.alerts if a['severity'] == severity]
        return self.alerts


# Global instances
metrics_collector = MetricsCollector()
prometheus_exporter = PrometheusExporter()
alerting_system = AlertingSystem(metrics_collector)

# Router for metrics endpoints
router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/")
async def get_all_metrics():
    """Get all service metrics"""
    return {
        'timestamp': datetime.now(),
        'metrics': metrics_collector.get_all_metrics()
    }


@router.get("/service/{service}")
async def get_service_metrics(service: str):
    """Get metrics for specific service"""
    metrics = metrics_collector.get_service_metrics(service)
    if not metrics:
        return {'error': f'Service {service} not found'}
    return metrics


@router.get("/prometheus")
async def get_prometheus_metrics():
    """Get Prometheus format metrics"""
    return prometheus_exporter.get_metrics()


@router.get("/alerts")
async def get_alerts(severity: Optional[str] = None):
    """Get active alerts"""
    return {
        'timestamp': datetime.now(),
        'alerts': alerting_system.check_alerts()
    }


@router.post("/reset")
async def reset_metrics(service: Optional[str] = None):
    """Reset metrics"""
    metrics_collector.reset_metrics(service)
    return {'message': 'Metrics reset successfully'}
