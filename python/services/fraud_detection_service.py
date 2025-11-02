"""
Fraud Detection Service - ML-based Anomaly Detection & Risk Scoring
Detects fraudulent trades, suspicious patterns, flash loans, MEV attacks
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import HDBSCAN
import asyncpg
import aioredis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
fraud_alerts = Counter('fraud_alerts_total', 'Total fraud alerts', ['alert_type'])
anomaly_score_histogram = Histogram('anomaly_score', 'Anomaly score distribution')
detection_latency = Histogram('fraud_detection_latency_ms', 'Detection latency')
false_positive_rate = Gauge('false_positive_rate', 'False positive rate')

app = FastAPI(title="Fraud Detection Service", version="1.0.0")

# ============================================================================
# DATA MODELS
# ============================================================================

class Transaction(BaseModel):
    """Transaction data"""
    tx_hash: str
    from_address: str
    to_address: str
    amount: float
    token_pair: str
    timestamp: datetime
    gas_price: float
    slippage: float
    route_length: int
    contract_interaction: bool

class RiskAssessmentRequest(BaseModel):
    """Risk assessment request"""
    transaction: Transaction
    user_history: Optional[List[Transaction]] = None
    check_patterns: bool = True
    check_network: bool = True
    check_contract: bool = True

class AnomalyAlert(BaseModel):
    """Anomaly alert"""
    alert_type: str  # 'flash_loan', 'mev', 'sandwich', 'unusual_pattern', 'contract_risk'
    risk_level: str  # 'low', 'medium', 'high', 'critical'
    confidence: float
    description: str
    recommended_action: str

class RiskAssessmentResponse(BaseModel):
    """Risk assessment response"""
    tx_hash: str
    risk_score: float  # 0-1
    risk_level: str  # 'safe', 'low', 'medium', 'high', 'critical'
    alerts: List[AnomalyAlert]
    timestamp: datetime
    latency_ms: float

# ============================================================================
# FRAUD DETECTION MODELS
# ============================================================================

class AnomalyDetector:
    """Detects anomalous patterns in transactions"""

    def __init__(self):
        self.isolation_forest = IsolationForest(
            contamination=0.05,
            random_state=42,
            n_jobs=-1
        )
        self.scaler = StandardScaler()
        self.hdbscan = HDBSCAN(min_cluster_size=10)
        self.model_trained = False

    def extract_features(self, transactions: List[Dict]) -> np.ndarray:
        """Extract features from transactions"""
        features = []

        for tx in transactions:
            feature_vector = [
                tx.get('amount', 0),
                tx.get('gas_price', 0),
                tx.get('slippage', 0),
                tx.get('route_length', 1),
                1.0 if tx.get('contract_interaction', False) else 0.0,
                # Time-based features
                (datetime.now() - tx.get('timestamp', datetime.now())).total_seconds(),
            ]
            features.append(feature_vector)

        return np.array(features)

    def train(self, transactions: List[Dict]):
        """Train anomaly detection models"""
        if len(transactions) < 10:
            logger.warning("Not enough transactions to train")
            return

        X = self.extract_features(transactions)
        X_scaled = self.scaler.fit_transform(X)

        self.isolation_forest.fit(X_scaled)
        try:
            self.hdbscan.fit(X_scaled)
        except:
            logger.warning("HDBSCAN failed, skipping")

        self.model_trained = True
        logger.info(f"Trained on {len(transactions)} transactions")

    def detect_anomalies(self, transaction: Dict) -> Tuple[float, List[str]]:
        """Detect anomalies in transaction"""
        if not self.model_trained:
            return 0.0, []

        X = self.extract_features([transaction])
        X_scaled = self.scaler.transform(X)

        # Isolation Forest anomaly score
        anomaly_score = -self.isolation_forest.score_samples(X_scaled)[0]
        anomaly_score = (anomaly_score + 1) / 2  # Normalize to 0-1

        # Detect issues
        issues = []
        if transaction.get('slippage', 0) > 0.05:
            issues.append('high_slippage')
        if transaction.get('gas_price', 0) > np.percentile([t.get('gas_price', 0) for t in [transaction]], 90):
            issues.append('unusual_gas_price')
        if transaction.get('route_length', 1) > 5:
            issues.append('complex_route')

        return float(anomaly_score), issues

# ============================================================================
# PATTERN DETECTION
# ============================================================================

class PatternDetector:
    """Detects suspicious trading patterns"""

    @staticmethod
    def detect_sandwich_attack(current_tx: Dict, recent_txs: List[Dict]) -> bool:
        """Detect sandwich attack (front-run + back-run)"""
        if len(recent_txs) < 2:
            return False

        # Check for large tx followed by our tx followed by reverse
        sorted_txs = sorted(recent_txs, key=lambda x: x['timestamp'])

        for i in range(len(sorted_txs) - 2):
            tx1, tx2, tx3 = sorted_txs[i], sorted_txs[i+1], sorted_txs[i+2]

            # Check timing (< 30 seconds between txs)
            time_diff = (tx3['timestamp'] - tx1['timestamp']).total_seconds()
            if time_diff > 30:
                continue

            # Check amounts and directions
            if (tx1.get('amount', 0) > current_tx.get('amount', 0) and
                tx3.get('amount', 0) > current_tx.get('amount', 0)):
                return True

        return False

    @staticmethod
    def detect_flash_loan(tx: Dict) -> bool:
        """Detect flash loan usage"""
        # Flash loans often have:
        # 1. Very large amount
        # 2. Zero slippage (because they use callbacks)
        # 3. Complex route with multiple contracts

        is_large_amount = tx.get('amount', 0) > 1000000
        is_zero_slippage = tx.get('slippage', 0) < 0.001
        is_complex = tx.get('route_length', 1) > 4

        return is_large_amount and is_zero_slippage and is_complex

    @staticmethod
    def detect_mev_attack(tx: Dict, mempool_txs: List[Dict]) -> bool:
        """Detect MEV (Maximal Extractable Value) attacks"""
        # Check if this tx could be a sandwich/MEV attack

        # Features:
        # 1. High gas price (tries to prioritize)
        # 2. Same token pair as other txs
        # 3. Occurring between other large txs

        high_gas = tx.get('gas_price', 0) > 100  # gwei
        same_pair_txs = [t for t in mempool_txs if t.get('token_pair') == tx.get('token_pair')]

        return high_gas and len(same_pair_txs) > 3

    @staticmethod
    def detect_unusual_patterns(current_tx: Dict, user_history: List[Dict]) -> List[str]:
        """Detect unusual user patterns"""
        alerts = []

        if not user_history:
            return alerts

        user_txs = sorted(user_history, key=lambda x: x['timestamp'], reverse=True)

        # Pattern 1: Sudden large trade after period of inactivity
        if len(user_txs) > 0:
            last_tx_time = user_txs[0]['timestamp']
            time_gap = (datetime.now() - last_tx_time).total_seconds() / 3600  # hours

            if time_gap > 48 and current_tx.get('amount', 0) > np.mean([t.get('amount', 0) for t in user_txs]):
                alerts.append('unusual_after_inactivity')

        # Pattern 2: Rapid succession of trades (possible bot attack)
        recent_txs = [t for t in user_txs if (datetime.now() - t['timestamp']).total_seconds() < 300]
        if len(recent_txs) > 10:
            alerts.append('rapid_trading')

        # Pattern 3: Round number amounts (possible test trades)
        amount_str = str(current_tx.get('amount', 0))
        if amount_str.endswith('000'):
            alerts.append('round_amount')

        return alerts

# ============================================================================
# FRAUD DETECTION SERVICE
# ============================================================================

class FraudDetectionService:
    """Main fraud detection service"""

    def __init__(self):
        self.db: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.anomaly_detector = AnomalyDetector()
        self.pattern_detector = PatternDetector()

    async def initialize(self):
        """Initialize service"""
        logger.info("Initializing Fraud Detection Service...")

        self.db = await asyncpg.create_pool(
            user='postgres',
            password='postgres',
            database='dex',
            host='postgres',
            min_size=5,
            max_size=10
        )

        self.redis = await aioredis.create_redis_pool('redis://redis:6379')

        # Load training data
        await self._train_models()

        logger.info("Fraud Detection Service initialized")

    async def _train_models(self):
        """Train models on historical data"""
        try:
            query = """
                SELECT amount, gas_price, slippage, route_length, contract_interaction, timestamp
                FROM transactions
                ORDER BY timestamp DESC
                LIMIT 5000
            """

            rows = await self.db.fetch(query)

            if rows:
                transactions = [dict(row) for row in rows]
                self.anomaly_detector.train(transactions)
                logger.info(f"Trained on {len(transactions)} historical transactions")

        except Exception as e:
            logger.warning(f"Could not train models: {e}")

    async def assess_risk(self, request: RiskAssessmentRequest) -> RiskAssessmentResponse:
        """Assess transaction risk"""
        start_time = datetime.now()

        try:
            tx = request.transaction
            alerts = []
            risk_score = 0.0

            # Check for flash loan
            if request.check_contract and self.pattern_detector.detect_flash_loan(tx.dict()):
                alerts.append(AnomalyAlert(
                    alert_type='flash_loan',
                    risk_level='medium',
                    confidence=0.75,
                    description='Potential flash loan usage detected',
                    recommended_action='Monitor for repayment'
                ))
                risk_score += 0.15

            # Check for MEV attack
            mempool_txs = request.user_history or []
            if request.check_contract and self.pattern_detector.detect_mev_attack(tx.dict(), mempool_txs):
                alerts.append(AnomalyAlert(
                    alert_type='mev',
                    risk_level='high',
                    confidence=0.70,
                    description='Potential MEV/sandwich attack detected',
                    recommended_action='Review transaction carefully'
                ))
                risk_score += 0.25

            # Check user history for patterns
            if request.check_patterns and request.user_history:
                pattern_alerts = self.pattern_detector.detect_unusual_patterns(tx.dict(), request.user_history)

                if 'rapid_trading' in pattern_alerts:
                    alerts.append(AnomalyAlert(
                        alert_type='unusual_pattern',
                        risk_level='medium',
                        confidence=0.65,
                        description='Rapid trading detected',
                        recommended_action='Possible bot activity'
                    ))
                    risk_score += 0.10

                if 'unusual_after_inactivity' in pattern_alerts:
                    alerts.append(AnomalyAlert(
                        alert_type='unusual_pattern',
                        risk_level='low',
                        confidence=0.50,
                        description='Large trade after inactivity',
                        recommended_action='Monitor user account'
                    ))
                    risk_score += 0.05

            # Anomaly detection
            anomaly_score, issues = self.anomaly_detector.detect_anomalies(tx.dict())
            anomaly_score_histogram.observe(anomaly_score)

            if anomaly_score > 0.7:
                alerts.append(AnomalyAlert(
                    alert_type='contract_risk',
                    risk_level='high' if anomaly_score > 0.85 else 'medium',
                    confidence=anomaly_score,
                    description=f'Anomalous transaction detected (score: {anomaly_score:.2f})',
                    recommended_action='Review transaction parameters'
                ))
                risk_score += anomaly_score * 0.3

            # Determine risk level
            risk_score = min(1.0, risk_score)

            if risk_score < 0.3:
                risk_level = 'safe'
            elif risk_score < 0.5:
                risk_level = 'low'
            elif risk_score < 0.7:
                risk_level = 'medium'
            elif risk_score < 0.85:
                risk_level = 'high'
            else:
                risk_level = 'critical'

            # Record metrics
            latency = (datetime.now() - start_time).total_seconds() * 1000
            detection_latency.observe(latency)

            for alert in alerts:
                fraud_alerts.labels(alert_type=alert.alert_type).inc()

            return RiskAssessmentResponse(
                tx_hash=tx.tx_hash,
                risk_score=float(risk_score),
                risk_level=risk_level,
                alerts=alerts,
                timestamp=datetime.now(),
                latency_ms=latency
            )

        except Exception as e:
            logger.error(f"Risk assessment error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# FASTAPI ENDPOINTS
# ============================================================================

service = FraudDetectionService()

@app.on_event("startup")
async def startup():
    """Initialize on startup"""
    await service.initialize()

@app.post("/assess-risk", response_model=RiskAssessmentResponse)
async def assess_risk(request: RiskAssessmentRequest):
    """Assess transaction risk"""
    return await service.assess_risk(request)

@app.get("/health")
async def health_check():
    """Health check"""
    return {
        "status": "healthy",
        "service": "Fraud Detection Service",
        "models_trained": service.anomaly_detector.model_trained
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
