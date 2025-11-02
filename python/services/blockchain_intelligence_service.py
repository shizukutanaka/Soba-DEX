"""
Blockchain Intelligence Service - Smart Contract Analysis & MEV Detection
Advanced blockchain network analysis and threat detection
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import json

from web3 import Web3
import networkx as nx
from sklearn.preprocessing import StandardScaler
import numpy as np
import asyncpg
import aioredis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
contracts_analyzed = Counter('contracts_analyzed_total', 'Total contracts analyzed')
mev_detected = Counter('mev_detected_total', 'MEV attacks detected', ['type'])
analysis_latency = Histogram('blockchain_analysis_latency_ms', 'Analysis latency')
network_insights = Gauge('network_insights_score', 'Network intelligence score')

app = FastAPI(title="Blockchain Intelligence Service", version="1.0.0")

# ============================================================================
# DATA MODELS
# ============================================================================

class SmartContract(BaseModel):
    """Smart contract information"""
    address: str = Field(..., description="Contract address")
    name: Optional[str] = None
    symbol: Optional[str] = None
    decimals: Optional[int] = None
    total_supply: Optional[float] = None
    owner_address: Optional[str] = None
    creation_block: int
    creation_timestamp: datetime

class ContractRiskAssessment(BaseModel):
    """Contract risk assessment"""
    contract_address: str
    risk_score: float  # 0-1
    risk_level: str  # 'low', 'medium', 'high', 'critical'
    vulnerabilities: List[str]
    pattern_flags: List[str]
    recommendations: List[str]
    last_update: datetime

class MEVOpportunity(BaseModel):
    """MEV opportunity detection"""
    opportunity_type: str  # 'sandwich', 'frontrun', 'liquidation', 'arbitrage'
    confidence: float  # 0-1
    potential_profit: float
    target_transaction: str
    block_number: int
    timestamp: datetime
    detection_method: str

class WalletIntelligence(BaseModel):
    """Wallet intelligence analysis"""
    wallet_address: str
    risk_score: float
    transaction_count: int
    unique_counterparties: int
    avg_transaction_value: float
    pattern: str  # 'normal', 'bot', 'whale', 'arbitrageur', 'suspicious'
    connected_wallets: List[str]
    recommendation: str

# ============================================================================
# SMART CONTRACT ANALYSIS
# ============================================================================

class SmartContractAnalyzer:
    """Analyze smart contracts for vulnerabilities and patterns"""

    def __init__(self, web3: Web3):
        self.web3 = web3
        self.known_vulnerabilities = {
            'reentrancy': 'Potential reentrancy vulnerability',
            'unchecked_call': 'Unchecked external call',
            'integer_overflow': 'Integer overflow/underflow',
            'front_run': 'Front-run vulnerable function',
            'time_dependence': 'Timestamp dependence',
            'delegatecall': 'Delegatecall usage detected',
            'selfdestruct': 'Selfdestruct in contract',
            'flash_loan': 'Flash loan susceptibility'
        }

    async def analyze_contract(self, address: str) -> ContractRiskAssessment:
        """Analyze contract for risks and vulnerabilities"""
        start_time = datetime.now()

        try:
            # Get contract code
            code = self.web3.eth.get_code(address)

            if code == b'0x':
                raise HTTPException(status_code=400, detail="Not a smart contract")

            vulnerabilities = []
            pattern_flags = []
            risk_score = 0.0

            # Check for common patterns in bytecode
            code_hex = code.hex()

            # 1. Check for reentrancy patterns
            if 'a9059cbb' in code_hex:  # transfer() function
                if 'f1a3a4ed' in code_hex:  # call() in same contract
                    vulnerabilities.append('reentrancy')
                    pattern_flags.append('transfer+call pattern detected')
                    risk_score += 0.2

            # 2. Check for selfdestruct
            if 'ff' in code_hex:
                vulnerabilities.append('selfdestruct')
                pattern_flags.append('Selfdestruct instruction found')
                risk_score += 0.15

            # 3. Check for delegatecall
            if 'f4' in code_hex:
                vulnerabilities.append('delegatecall')
                pattern_flags.append('Delegatecall usage detected')
                risk_score += 0.25

            # 4. Check for arithmetic operations
            if any(op in code_hex for op in ['01', '03', '04', '05']):  # add, sub, mul, div
                # Check if SafeMath is used
                if 'c3d58168' not in code_hex:  # SafeMath function selector
                    pattern_flags.append('Potential arithmetic vulnerability')
                    risk_score += 0.1

            # 5. Check for flash loan hooks
            if '23b872dd' in code_hex:  # transferFrom
                if '94985dbc' in code_hex:  # flashLoan pattern
                    pattern_flags.append('Flash loan susceptibility')
                    risk_score += 0.15

            # Get contract info
            try:
                # Try to call basic functions
                contract = self.web3.eth.contract(address=address)
                total_supply = 0
                try:
                    total_supply = contract.functions.totalSupply().call()
                except:
                    pass
            except:
                contract = None
                total_supply = 0

            risk_score = min(1.0, risk_score)

            if risk_score < 0.3:
                risk_level = 'low'
            elif risk_score < 0.6:
                risk_level = 'medium'
            elif risk_score < 0.8:
                risk_level = 'high'
            else:
                risk_level = 'critical'

            recommendations = []
            if 'delegatecall' in vulnerabilities:
                recommendations.append('Verify delegatecall target validation')
            if 'reentrancy' in vulnerabilities:
                recommendations.append('Implement reentrancy guard')
            if risk_level in ['high', 'critical']:
                recommendations.append('Do not interact with this contract')

            latency = (datetime.now() - start_time).total_seconds() * 1000
            analysis_latency.observe(latency)
            contracts_analyzed.inc()

            return ContractRiskAssessment(
                contract_address=address,
                risk_score=float(risk_score),
                risk_level=risk_level,
                vulnerabilities=vulnerabilities,
                pattern_flags=pattern_flags,
                recommendations=recommendations,
                last_update=datetime.now()
            )

        except Exception as e:
            logger.error(f"Contract analysis error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MEV DETECTION
# ============================================================================

class MEVDetector:
    """Detect Maximal Extractable Value (MEV) opportunities"""

    @staticmethod
    def detect_sandwich_attack(target_tx: Dict, surrounding_txs: List[Dict]) -> Tuple[bool, float]:
        """
        Detect sandwich attack:
        1. Large transaction
        2. High gas price (attempts to frontrun)
        3. Reverse transaction afterwards
        """
        target_amount = target_tx.get('amount', 0)
        target_gas = target_tx.get('gas_price', 0)
        target_time = target_tx.get('timestamp', datetime.now())

        # Look for large transactions before and after
        before = [tx for tx in surrounding_txs if tx.get('timestamp', datetime.now()) < target_time]
        after = [tx for tx in surrounding_txs if tx.get('timestamp', datetime.now()) > target_time]

        large_before = sum(1 for tx in before if tx.get('amount', 0) > target_amount * 0.5)
        large_after = sum(1 for tx in after if tx.get('amount', 0) > target_amount * 0.5)

        is_sandwich = large_before > 0 and large_after > 0
        confidence = 0.7 if large_before > 1 and large_after > 1 else 0.5

        return is_sandwich, confidence

    @staticmethod
    def detect_liquidation_opportunity(user_address: str, health_factor: float, pool_data: Dict) -> Tuple[bool, float]:
        """
        Detect liquidation opportunity
        Health factor < 1.0 means position is liquidatable
        """
        is_liquidatable = health_factor < 1.0

        if is_liquidatable:
            # Calculate potential profit
            debt = pool_data.get('user_debt', 0)
            collateral = pool_data.get('user_collateral', 0)
            liquidation_penalty = 0.05  # 5% penalty

            potential_profit = debt * liquidation_penalty
            confidence = min(1.0, 1.0 - health_factor)

            return True, confidence

        return False, 0.0

    @staticmethod
    def detect_arbitrage_opportunity(price_spread: float, volume: float) -> Tuple[bool, float]:
        """
        Detect arbitrage opportunity
        Price spread > 0.5% with sufficient volume
        """
        min_spread = 0.005  # 0.5%
        min_volume = 100000  # Minimum transaction value

        is_arbitrage = price_spread > min_spread and volume > min_volume
        confidence = min(price_spread / 0.02, 1.0)  # Higher spread = higher confidence

        return is_arbitrage, confidence

# ============================================================================
# WALLET ANALYSIS & CLUSTERING
# ============================================================================

class WalletIntelligence:
    """Analyze wallet behavior and patterns"""

    def __init__(self):
        self.scaler = StandardScaler()

    async def analyze_wallet(self, wallet_address: str, transaction_history: List[Dict]) -> 'WalletIntelligence':
        """Analyze wallet behavior"""
        if not transaction_history:
            return WalletIntelligence(
                wallet_address=wallet_address,
                risk_score=0.0,
                transaction_count=0,
                unique_counterparties=0,
                avg_transaction_value=0.0,
                pattern='unknown',
                connected_wallets=[],
                recommendation='Insufficient data'
            )

        # Extract features
        tx_count = len(transaction_history)
        unique_counterparties = len(set(
            tx.get('to_address') for tx in transaction_history
        ))
        avg_value = np.mean([tx.get('amount', 0) for tx in transaction_history])

        # Classify pattern
        if tx_count > 1000:
            pattern = 'bot'
            risk_score = 0.6
        elif avg_value > 1000000:
            pattern = 'whale'
            risk_score = 0.4
        elif unique_counterparties > tx_count * 0.8:
            pattern = 'arbitrageur'
            risk_score = 0.3
        elif any(tx.get('function') == 'flashLoan' for tx in transaction_history):
            pattern = 'suspicious'
            risk_score = 0.7
        else:
            pattern = 'normal'
            risk_score = 0.1

        # Find connected wallets (clustering)
        connected = list(set(
            tx.get('to_address') for tx in transaction_history[-20:]  # Last 20 txs
        ))[:5]  # Top 5

        recommendation = 'Normal activity' if risk_score < 0.5 else 'Monitor closely'

        return WalletIntelligence(
            wallet_address=wallet_address,
            risk_score=risk_score,
            transaction_count=tx_count,
            unique_counterparties=unique_counterparties,
            avg_transaction_value=float(avg_value),
            pattern=pattern,
            connected_wallets=connected,
            recommendation=recommendation
        )

# ============================================================================
# BLOCKCHAIN INTELLIGENCE SERVICE
# ============================================================================

class BlockchainIntelligenceService:
    """Main blockchain intelligence service"""

    def __init__(self):
        self.db: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.web3 = Web3(Web3.HTTPProvider('http://ethereum:8545'))
        self.contract_analyzer = SmartContractAnalyzer(self.web3)
        self.mev_detector = MEVDetector()
        self.wallet_intelligence = WalletIntelligence()

    async def initialize(self):
        """Initialize service"""
        logger.info("Initializing Blockchain Intelligence Service...")

        self.db = await asyncpg.create_pool(
            user='postgres',
            password='postgres',
            database='dex',
            host='postgres',
            min_size=5,
            max_size=10
        )

        self.redis = await aioredis.create_redis_pool('redis://redis:6379')

        logger.info("Blockchain Intelligence Service initialized")

    async def analyze_contract(self, address: str) -> ContractRiskAssessment:
        """Analyze smart contract"""
        return await self.contract_analyzer.analyze_contract(address)

    async def detect_mev(self, target_tx: Dict, surrounding_txs: List[Dict]) -> List[MEVOpportunity]:
        """Detect MEV opportunities"""
        opportunities = []

        # Check for sandwich attack
        is_sandwich, confidence = self.mev_detector.detect_sandwich_attack(target_tx, surrounding_txs)
        if is_sandwich:
            opportunities.append(MEVOpportunity(
                opportunity_type='sandwich',
                confidence=confidence,
                potential_profit=target_tx.get('amount', 0) * 0.02,  # 2% potential
                target_transaction=target_tx.get('tx_hash'),
                block_number=target_tx.get('block_number'),
                timestamp=datetime.now(),
                detection_method='pattern_analysis'
            ))
            mev_detected.labels(type='sandwich').inc()

        return opportunities

    async def analyze_wallet_cluster(self, wallet_addresses: List[str]) -> Dict:
        """Analyze network of related wallets"""
        # Create network graph
        G = nx.Graph()

        for wallet in wallet_addresses:
            G.add_node(wallet)

        # Add edges based on shared transactions
        for i, wallet1 in enumerate(wallet_addresses):
            for wallet2 in wallet_addresses[i+1:]:
                G.add_edge(wallet1, wallet2, weight=1)

        # Calculate metrics
        density = nx.density(G)
        avg_clustering = nx.average_clustering(G)

        return {
            'node_count': len(G.nodes()),
            'edge_count': len(G.edges()),
            'density': float(density),
            'avg_clustering': float(avg_clustering),
            'network_health': 'healthy' if density < 0.3 else 'highly connected'
        }

    async def get_transaction_graph(self, token_pair: str, limit: int = 100) -> Dict:
        """Get transaction flow graph for token pair"""
        try:
            query = """
                SELECT from_address, to_address, COUNT(*) as tx_count, SUM(amount_in) as volume
                FROM transactions
                WHERE token_pair = $1
                GROUP BY from_address, to_address
                LIMIT $2
            """

            rows = await self.db.fetch(query, token_pair, limit)

            return {
                'token_pair': token_pair,
                'transaction_count': len(rows),
                'major_flows': [
                    {
                        'from': row['from_address'],
                        'to': row['to_address'],
                        'tx_count': row['tx_count'],
                        'volume': float(row['volume'])
                    }
                    for row in rows
                ]
            }

        except Exception as e:
            logger.error(f"Graph error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# FASTAPI ENDPOINTS
# ============================================================================

service = BlockchainIntelligenceService()

@app.on_event("startup")
async def startup():
    """Initialize on startup"""
    await service.initialize()

@app.post("/analyze-contract", response_model=ContractRiskAssessment)
async def analyze_contract(address: str = Field(..., description="Contract address")):
    """Analyze smart contract"""
    return await service.analyze_contract(address)

@app.post("/detect-mev")
async def detect_mev(
    target_tx: Dict,
    surrounding_txs: List[Dict]
):
    """Detect MEV opportunities"""
    opportunities = await service.detect_mev(target_tx, surrounding_txs)
    return {"opportunities": opportunities}

@app.post("/analyze-wallet-cluster")
async def analyze_wallet_cluster(wallet_addresses: List[str]):
    """Analyze wallet network"""
    return await service.analyze_wallet_cluster(wallet_addresses)

@app.get("/transaction-graph")
async def get_transaction_graph(token_pair: str, limit: int = 100):
    """Get transaction flow graph"""
    return await service.get_transaction_graph(token_pair, limit)

@app.get("/health")
async def health_check():
    """Health check"""
    is_connected = service.web3.is_connected()
    return {
        "status": "healthy" if is_connected else "degraded",
        "service": "Blockchain Intelligence Service",
        "web3_connected": is_connected
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
