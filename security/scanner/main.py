#!/usr/bin/env python3
"""
DEX Security Scanner
Continuous security monitoring and threat detection
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import redis
import requests
import schedule
from prometheus_client import Counter, Gauge, Histogram, start_http_server
from web3 import Web3
import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Prometheus metrics
security_threats_total = Counter('security_threats_total', 'Total security threats detected', ['threat_type'])
security_scan_duration = Histogram('security_scan_duration_seconds', 'Security scan duration')
active_threats_gauge = Gauge('active_threats', 'Number of active threats')
wallet_risk_score = Gauge('wallet_risk_score', 'Wallet risk score', ['address'])
contract_calls_total = Counter('contract_calls_total', 'Total contract calls', ['contract', 'method'])

class SecurityScanner:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'redis'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            password=os.getenv('REDIS_PASSWORD'),
            decode_responses=True
        )

        self.db_connection = self._get_db_connection()
        self.web3 = Web3(Web3.HTTPProvider(os.getenv('ETH_RPC_URL')))

        # Security thresholds
        self.threat_thresholds = {
            'large_transaction': 10000,  # ETH
            'rapid_transactions': 10,    # transactions per hour
            'failed_logins': 5,          # failed attempts per hour
            'gas_anomaly': 1000000,      # gas limit
            'contract_creation': True,   # flag contract creation
        }

        # Known malicious patterns
        self.malicious_patterns = [
            '0x0000000000000000000000000000000000000000',  # Null address
            # Add more known malicious addresses
        ]

    def _get_db_connection(self):
        """Establish database connection"""
        try:
            return psycopg2.connect(
                host=os.getenv('DB_HOST', 'postgres'),
                port=int(os.getenv('DB_PORT', 5432)),
                database=os.getenv('DB_NAME', 'dex_production'),
                user=os.getenv('DB_USER', 'dex_user'),
                password=os.getenv('DB_PASSWORD')
            )
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return None

    @security_scan_duration.time()
    def run_security_scan(self):
        """Main security scan execution"""
        logger.info("Starting security scan...")

        try:
            # Scan for various threats
            threats = []
            threats.extend(self.scan_suspicious_transactions())
            threats.extend(self.scan_failed_logins())
            threats.extend(self.scan_contract_anomalies())
            threats.extend(self.scan_wallet_patterns())
            threats.extend(self.scan_network_anomalies())

            # Process detected threats
            for threat in threats:
                self.process_threat(threat)

            # Update metrics
            active_threats_gauge.set(len([t for t in threats if not t.get('resolved', False)]))

            logger.info(f"Security scan completed. Found {len(threats)} threats.")

        except Exception as e:
            logger.error(f"Security scan failed: {e}")

    def scan_suspicious_transactions(self) -> List[Dict]:
        """Scan for suspicious transaction patterns"""
        threats = []

        if not self.db_connection:
            return threats

        try:
            with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                # Large transactions
                cursor.execute("""
                    SELECT user_address, amount, timestamp, transaction_hash
                    FROM transactions
                    WHERE amount > %s
                    AND timestamp > %s
                """, (self.threat_thresholds['large_transaction'], datetime.now() - timedelta(hours=1)))

                for row in cursor.fetchall():
                    threats.append({
                        'type': 'LARGE_TRANSACTION',
                        'severity': 'MEDIUM',
                        'user_address': row['user_address'],
                        'amount': float(row['amount']),
                        'timestamp': row['timestamp'],
                        'transaction_hash': row['transaction_hash'],
                        'description': f"Large transaction of {row['amount']} ETH"
                    })
                    security_threats_total.labels(threat_type='large_transaction').inc()

                # Rapid transactions
                cursor.execute("""
                    SELECT user_address, COUNT(*) as tx_count
                    FROM transactions
                    WHERE timestamp > %s
                    GROUP BY user_address
                    HAVING COUNT(*) > %s
                """, (datetime.now() - timedelta(hours=1), self.threat_thresholds['rapid_transactions']))

                for row in cursor.fetchall():
                    threats.append({
                        'type': 'RAPID_TRANSACTIONS',
                        'severity': 'HIGH',
                        'user_address': row['user_address'],
                        'transaction_count': row['tx_count'],
                        'timestamp': datetime.now(),
                        'description': f"Rapid transactions: {row['tx_count']} in last hour"
                    })
                    security_threats_total.labels(threat_type='rapid_transactions').inc()

        except Exception as e:
            logger.error(f"Transaction scan failed: {e}")

        return threats

    def scan_failed_logins(self) -> List[Dict]:
        """Scan for brute force login attempts"""
        threats = []

        try:
            # Get failed login attempts from Redis
            failed_logins = self.redis_client.hgetall('failed_logins')

            for ip_address, attempts in failed_logins.items():
                if int(attempts) > self.threat_thresholds['failed_logins']:
                    threats.append({
                        'type': 'BRUTE_FORCE_ATTACK',
                        'severity': 'HIGH',
                        'ip_address': ip_address,
                        'attempts': int(attempts),
                        'timestamp': datetime.now(),
                        'description': f"Brute force attack from {ip_address}: {attempts} attempts"
                    })
                    security_threats_total.labels(threat_type='brute_force').inc()

        except Exception as e:
            logger.error(f"Failed login scan failed: {e}")

        return threats

    def scan_contract_anomalies(self) -> List[Dict]:
        """Scan for smart contract anomalies"""
        threats = []

        try:
            # Get recent contract interactions
            latest_block = self.web3.eth.block_number
            from_block = latest_block - 100  # Last 100 blocks

            # Scan for contract creation
            for block_num in range(from_block, latest_block + 1):
                try:
                    block = self.web3.eth.get_block(block_num, full_transactions=True)

                    for tx in block.transactions:
                        # Check for contract creation
                        if tx.to is None:
                            threats.append({
                                'type': 'CONTRACT_CREATION',
                                'severity': 'MEDIUM',
                                'transaction_hash': tx.hash.hex(),
                                'from_address': tx['from'],
                                'gas_used': tx.gas,
                                'timestamp': datetime.fromtimestamp(block.timestamp),
                                'description': f"New contract created by {tx['from']}"
                            })
                            security_threats_total.labels(threat_type='contract_creation').inc()

                        # Check for gas anomalies
                        if tx.gas > self.threat_thresholds['gas_anomaly']:
                            threats.append({
                                'type': 'GAS_ANOMALY',
                                'severity': 'MEDIUM',
                                'transaction_hash': tx.hash.hex(),
                                'from_address': tx['from'],
                                'gas_used': tx.gas,
                                'timestamp': datetime.fromtimestamp(block.timestamp),
                                'description': f"High gas usage: {tx.gas}"
                            })
                            security_threats_total.labels(threat_type='gas_anomaly').inc()

                except Exception as e:
                    logger.warning(f"Failed to process block {block_num}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Contract anomaly scan failed: {e}")

        return threats

    def scan_wallet_patterns(self) -> List[Dict]:
        """Scan for suspicious wallet patterns"""
        threats = []

        try:
            # Check for interactions with known malicious addresses
            if self.db_connection:
                with self.db_connection.cursor(cursor_factory=RealDictCursor) as cursor:
                    for malicious_addr in self.malicious_patterns:
                        cursor.execute("""
                            SELECT DISTINCT user_address, COUNT(*) as interaction_count
                            FROM transactions
                            WHERE (to_address = %s OR from_address = %s)
                            AND timestamp > %s
                            GROUP BY user_address
                        """, (malicious_addr, malicious_addr, datetime.now() - timedelta(days=1)))

                        for row in cursor.fetchall():
                            threats.append({
                                'type': 'MALICIOUS_INTERACTION',
                                'severity': 'CRITICAL',
                                'user_address': row['user_address'],
                                'malicious_address': malicious_addr,
                                'interaction_count': row['interaction_count'],
                                'timestamp': datetime.now(),
                                'description': f"Interaction with known malicious address {malicious_addr}"
                            })
                            security_threats_total.labels(threat_type='malicious_interaction').inc()

                            # Update wallet risk score
                            wallet_risk_score.labels(address=row['user_address']).set(100)

        except Exception as e:
            logger.error(f"Wallet pattern scan failed: {e}")

        return threats

    def scan_network_anomalies(self) -> List[Dict]:
        """Scan for network-level anomalies"""
        threats = []

        try:
            # Check for unusual network activity
            network_stats = self.redis_client.hgetall('network_stats')

            if network_stats:
                current_tps = float(network_stats.get('transactions_per_second', 0))
                avg_tps = float(network_stats.get('avg_transactions_per_second', 0))

                # Detect TPS anomalies
                if current_tps > avg_tps * 5:  # 5x normal rate
                    threats.append({
                        'type': 'NETWORK_ANOMALY',
                        'severity': 'HIGH',
                        'current_tps': current_tps,
                        'average_tps': avg_tps,
                        'timestamp': datetime.now(),
                        'description': f"Unusual network activity: {current_tps} TPS (avg: {avg_tps})"
                    })
                    security_threats_total.labels(threat_type='network_anomaly').inc()

        except Exception as e:
            logger.error(f"Network anomaly scan failed: {e}")

        return threats

    def process_threat(self, threat: Dict):
        """Process and store detected threat"""
        try:
            # Store threat in Redis for real-time access
            threat_key = f"threat:{threat['type']}:{int(time.time())}"
            self.redis_client.setex(threat_key, 86400, json.dumps(threat, default=str))

            # Store in database for historical analysis
            if self.db_connection:
                with self.db_connection.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO security_threats
                        (threat_type, severity, data, timestamp, resolved)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        threat['type'],
                        threat['severity'],
                        json.dumps(threat, default=str),
                        threat['timestamp'],
                        False
                    ))
                    self.db_connection.commit()

            # Send alerts for critical threats
            if threat['severity'] == 'CRITICAL':
                self.send_alert(threat)

        except Exception as e:
            logger.error(f"Failed to process threat: {e}")

    def send_alert(self, threat: Dict):
        """Send alert for critical threats"""
        try:
            # Send to external alerting system
            webhook_url = os.getenv('ALERT_WEBHOOK_URL')
            if webhook_url:
                alert_data = {
                    'text': f"🚨 CRITICAL SECURITY THREAT: {threat['type']}\n"
                           f"Description: {threat['description']}\n"
                           f"Timestamp: {threat['timestamp']}"
                }
                requests.post(webhook_url, json=alert_data, timeout=10)

            # Store in high-priority Redis queue
            self.redis_client.lpush('critical_alerts', json.dumps(threat, default=str))

            logger.critical(f"CRITICAL THREAT DETECTED: {threat['type']} - {threat['description']}")

        except Exception as e:
            logger.error(f"Failed to send alert: {e}")

    def health_check(self):
        """Health check endpoint"""
        try:
            # Check Redis connection
            self.redis_client.ping()

            # Check database connection
            if self.db_connection:
                with self.db_connection.cursor() as cursor:
                    cursor.execute("SELECT 1")

            # Check Web3 connection
            self.web3.eth.block_number

            return {"status": "healthy", "timestamp": datetime.now().isoformat()}

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "unhealthy", "error": str(e)}

def main():
    """Main execution function"""
    scanner = SecurityScanner()

    # Start Prometheus metrics server
    start_http_server(8080)
    logger.info("Security scanner started on port 8080")

    # Schedule security scans
    scan_interval = int(os.getenv('SCAN_INTERVAL', 300))  # Default 5 minutes
    schedule.every(scan_interval).seconds.do(scanner.run_security_scan)

    # Run initial scan
    scanner.run_security_scan()

    # Main loop
    try:
        while True:
            schedule.run_pending()
            time.sleep(10)
    except KeyboardInterrupt:
        logger.info("Security scanner stopped by user")
    except Exception as e:
        logger.error(f"Security scanner crashed: {e}")
        raise

if __name__ == "__main__":
    main()