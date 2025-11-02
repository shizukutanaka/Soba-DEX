"""
Data Processing Service - ETL Pipelines & Real-time Data Processing
High-performance data pipelines for blockchain & market data
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json

import pandas as pd
import numpy as np
from sqlalchemy import text
import asyncpg
import aioredis
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge
import asyncio

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
events_processed = Counter('data_events_processed_total', 'Total events processed', ['event_type'])
processing_latency = Histogram('data_processing_latency_ms', 'Processing latency', ['operation'])
data_quality_score = Gauge('data_quality_score', 'Data quality score')
pipeline_throughput = Gauge('pipeline_throughput_events_per_sec', 'Pipeline throughput')

app = FastAPI(title="Data Processing Service", version="1.0.0")

# ============================================================================
# DATA MODELS
# ============================================================================

class BlockchainEvent(BaseModel):
    """Blockchain event"""
    event_id: str
    event_type: str  # 'swap', 'liquidity', 'transfer', 'mint', 'burn'
    timestamp: datetime
    block_number: int
    transaction_hash: str
    contract_address: str
    from_address: str
    to_address: str
    token_in: str
    token_out: str
    amount_in: float
    amount_out: float
    gas_used: float
    gas_price: float

class MarketDataPoint(BaseModel):
    """Market data point"""
    timestamp: datetime
    token_pair: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    trades_count: int
    liquidity: float

class DataValidationResult(BaseModel):
    """Data validation result"""
    is_valid: bool
    quality_score: float  # 0-1
    issues: List[str]
    recommendations: List[str]

class ETLPipelineStatus(BaseModel):
    """ETL pipeline status"""
    pipeline_id: str
    status: str  # 'running', 'completed', 'failed', 'paused'
    events_processed: int
    events_failed: int
    average_latency_ms: float
    throughput_eps: float
    start_time: datetime
    end_time: Optional[datetime]

# ============================================================================
# DATA VALIDATION & QUALITY CHECKS
# ============================================================================

class DataQualityValidator:
    """Validate data quality and integrity"""

    @staticmethod
    def validate_blockchain_event(event: Dict) -> DataValidationResult:
        """Validate blockchain event"""
        issues = []
        quality_score = 1.0

        # Check required fields
        required_fields = ['event_id', 'timestamp', 'transaction_hash', 'amount_in', 'amount_out']
        for field in required_fields:
            if field not in event or event[field] is None:
                issues.append(f'Missing required field: {field}')
                quality_score -= 0.1

        # Check data types and ranges
        if event.get('amount_in', 0) < 0:
            issues.append('amount_in cannot be negative')
            quality_score -= 0.1

        if event.get('amount_out', 0) < 0:
            issues.append('amount_out cannot be negative')
            quality_score -= 0.1

        # Check for outliers
        if event.get('gas_price', 0) > 1000:  # Gwei
            issues.append('Unusual gas price detected')
            quality_score -= 0.05

        # Check timestamp validity
        try:
            ts = pd.to_datetime(event.get('timestamp'))
            if ts > datetime.now():
                issues.append('Timestamp in future')
                quality_score -= 0.1
        except:
            issues.append('Invalid timestamp format')
            quality_score -= 0.2

        # Check address formats
        from_addr = event.get('from_address', '')
        if not from_addr.startswith('0x') or len(from_addr) != 42:
            issues.append('Invalid from_address format')
            quality_score -= 0.1

        recommendations = []
        if quality_score < 0.8:
            recommendations.append('Flag for manual review')
        if len(issues) > 3:
            recommendations.append('Consider data source quality')

        return DataValidationResult(
            is_valid=quality_score >= 0.7,
            quality_score=max(0.0, quality_score),
            issues=issues,
            recommendations=recommendations
        )

    @staticmethod
    def validate_market_data(data: Dict) -> DataValidationResult:
        """Validate market data point"""
        issues = []
        quality_score = 1.0

        # Check OHLC relationship
        ohlc = {
            'open': data.get('open', 0),
            'high': data.get('high', 0),
            'low': data.get('low', 0),
            'close': data.get('close', 0)
        }

        if ohlc['high'] < ohlc['low']:
            issues.append('High < Low')
            quality_score -= 0.2

        if ohlc['high'] < ohlc['open'] or ohlc['high'] < ohlc['close']:
            issues.append('High < Open or Close')
            quality_score -= 0.1

        if ohlc['low'] > ohlc['open'] or ohlc['low'] > ohlc['close']:
            issues.append('Low > Open or Close')
            quality_score -= 0.1

        # Check volume
        if data.get('volume', 0) < 0:
            issues.append('Negative volume')
            quality_score -= 0.2

        # Check for zeros
        if ohlc['close'] == 0:
            issues.append('Zero close price')
            quality_score -= 0.3

        return DataValidationResult(
            is_valid=quality_score >= 0.7,
            quality_score=max(0.0, quality_score),
            issues=issues,
            recommendations=['Investigate data source' if issues else 'Data looks good']
        )

# ============================================================================
# ETL PIPELINES
# ============================================================================

class ETLPipeline:
    """Base ETL pipeline"""

    def __init__(self, pipeline_id: str):
        self.pipeline_id = pipeline_id
        self.status = 'idle'
        self.events_processed = 0
        self.events_failed = 0
        self.start_time = None
        self.end_time = None
        self.latencies = []

    async def extract(self) -> List[Dict]:
        """Extract data from source"""
        raise NotImplementedError

    async def transform(self, data: List[Dict]) -> List[Dict]:
        """Transform data"""
        raise NotImplementedError

    async def load(self, data: List[Dict]) -> int:
        """Load data to destination"""
        raise NotImplementedError

    async def run(self):
        """Run ETL pipeline"""
        self.status = 'running'
        self.start_time = datetime.now()

        try:
            # Extract
            logger.info(f"[{self.pipeline_id}] Extracting...")
            raw_data = await self.extract()

            # Transform
            logger.info(f"[{self.pipeline_id}] Transforming {len(raw_data)} records...")
            transformed_data = await self.transform(raw_data)

            # Load
            logger.info(f"[{self.pipeline_id}] Loading {len(transformed_data)} records...")
            loaded = await self.load(transformed_data)

            self.events_processed = loaded
            self.status = 'completed'
            self.end_time = datetime.now()

            logger.info(f"[{self.pipeline_id}] Completed: {loaded} records processed")

        except Exception as e:
            logger.error(f"[{self.pipeline_id}] Failed: {e}")
            self.status = 'failed'
            self.events_failed += 1

    def get_status(self) -> ETLPipelineStatus:
        """Get pipeline status"""
        avg_latency = np.mean(self.latencies) if self.latencies else 0
        duration = (self.end_time or datetime.now()) - self.start_time
        throughput = self.events_processed / duration.total_seconds() if duration.total_seconds() > 0 else 0

        return ETLPipelineStatus(
            pipeline_id=self.pipeline_id,
            status=self.status,
            events_processed=self.events_processed,
            events_failed=self.events_failed,
            average_latency_ms=avg_latency,
            throughput_eps=throughput,
            start_time=self.start_time,
            end_time=self.end_time
        )

class BlockchainEventPipeline(ETLPipeline):
    """ETL pipeline for blockchain events"""

    def __init__(self, pipeline_id: str, db: asyncpg.Pool, redis: aioredis.Redis):
        super().__init__(pipeline_id)
        self.db = db
        self.redis = redis
        self.validator = DataQualityValidator()

    async def extract(self) -> List[Dict]:
        """Extract blockchain events from mempool/RPC"""
        # In production, this would pull from blockchain RPC or event stream
        logger.info("Extracting blockchain events...")

        # Simulated extraction
        events = []
        for i in range(100):
            events.append({
                'event_id': f'evt_{i}',
                'event_type': 'swap',
                'timestamp': datetime.now(),
                'block_number': 18000000 + i,
                'transaction_hash': f'0x{i:064x}',
                'contract_address': '0x' + 'a' * 40,
                'from_address': '0x' + 'b' * 40,
                'to_address': '0x' + 'c' * 40,
                'token_in': 'USDC',
                'token_out': 'ETH',
                'amount_in': 1000 + i,
                'amount_out': 0.5 + i * 0.001,
                'gas_used': 200000,
                'gas_price': 50 + i % 20
            })

        return events

    async def transform(self, data: List[Dict]) -> List[Dict]:
        """Transform and validate blockchain events"""
        transformed = []

        for event in data:
            # Validate
            validation = self.validator.validate_blockchain_event(event)

            if validation.is_valid:
                # Enrich data
                enriched = event.copy()
                enriched['validated'] = True
                enriched['quality_score'] = validation.quality_score
                enriched['ingestion_timestamp'] = datetime.now()

                transformed.append(enriched)
                events_processed.labels(event_type=event.get('event_type')).inc()
            else:
                logger.warning(f"Invalid event {event.get('event_id')}: {validation.issues}")
                self.events_failed += 1

        return transformed

    async def load(self, data: List[Dict]) -> int:
        """Load transformed events to database"""
        if not data:
            return 0

        async with self.db.acquire() as conn:
            async with conn.transaction():
                # Batch insert
                records = [
                    (
                        e['event_id'], e['event_type'], e['timestamp'],
                        e['block_number'], e['transaction_hash'], e['contract_address'],
                        e['from_address'], e['to_address'], e['token_in'], e['token_out'],
                        e['amount_in'], e['amount_out'], e['gas_used'], e['gas_price'],
                        e['quality_score']
                    )
                    for e in data
                ]

                # Insert into database
                await conn.executemany(
                    '''
                    INSERT INTO blockchain_events
                    (event_id, event_type, timestamp, block_number, tx_hash, contract_addr,
                     from_addr, to_addr, token_in, token_out, amount_in, amount_out,
                     gas_used, gas_price, quality_score)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (event_id) DO NOTHING
                    ''',
                    records
                )

                # Cache recent events in Redis
                for event in data[-10:]:  # Cache last 10
                    await self.redis.setex(
                        f"event:{event['event_id']}",
                        3600,  # 1 hour TTL
                        json.dumps(event, default=str)
                    )

        return len(data)

# ============================================================================
# DATA PROCESSING SERVICE
# ============================================================================

class DataProcessingService:
    """Main data processing service"""

    def __init__(self):
        self.db: Optional[asyncpg.Pool] = None
        self.redis: Optional[aioredis.Redis] = None
        self.pipelines: Dict[str, ETLPipeline] = {}
        self.validator = DataQualityValidator()

    async def initialize(self):
        """Initialize service"""
        logger.info("Initializing Data Processing Service...")

        self.db = await asyncpg.create_pool(
            user='postgres',
            password='postgres',
            database='dex',
            host='postgres',
            min_size=10,
            max_size=20
        )

        self.redis = await aioredis.create_redis_pool('redis://redis:6379')

        logger.info("Data Processing Service initialized")

    async def validate_blockchain_event(self, event: BlockchainEvent) -> DataValidationResult:
        """Validate blockchain event"""
        return self.validator.validate_blockchain_event(event.dict())

    async def validate_market_data(self, data: MarketDataPoint) -> DataValidationResult:
        """Validate market data"""
        return self.validator.validate_market_data(data.dict())

    async def process_event_stream(self, events: List[BlockchainEvent], background_tasks: BackgroundTasks):
        """Process stream of events asynchronously"""
        pipeline = BlockchainEventPipeline(
            pipeline_id=f"stream_{datetime.now().timestamp()}",
            db=self.db,
            redis=self.redis
        )

        # Run in background
        background_tasks.add_task(pipeline.run)

        return {
            "pipeline_id": pipeline.pipeline_id,
            "events_queued": len(events),
            "status": "processing"
        }

    async def get_pipeline_status(self, pipeline_id: str) -> ETLPipelineStatus:
        """Get ETL pipeline status"""
        if pipeline_id not in self.pipelines:
            raise HTTPException(status_code=404, detail=f"Pipeline {pipeline_id} not found")

        pipeline = self.pipelines[pipeline_id]
        return pipeline.get_status()

    async def aggregate_market_data(self, token_pair: str, period: str = '1h') -> Dict:
        """Aggregate market data for given period"""
        try:
            query = """
                SELECT
                    FLOOR(EXTRACT(EPOCH FROM timestamp) / ?) * ? AS bucket,
                    MIN(close) AS low,
                    MAX(close) AS high,
                    FIRST(close) AS open,
                    LAST(close) AS close,
                    SUM(volume) AS volume,
                    COUNT(*) AS trades
                FROM market_data
                WHERE token_pair = $1 AND timestamp > NOW() - INTERVAL $2
                GROUP BY bucket
                ORDER BY bucket DESC
            """

            period_seconds = {
                '1m': 60,
                '5m': 300,
                '15m': 900,
                '1h': 3600,
                '4h': 14400,
                '1d': 86400
            }.get(period, 3600)

            rows = await self.db.fetch(
                query,
                period_seconds, period_seconds, token_pair, period
            )

            return {
                "token_pair": token_pair,
                "period": period,
                "candles": [dict(row) for row in rows]
            }

        except Exception as e:
            logger.error(f"Aggregation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# FASTAPI ENDPOINTS
# ============================================================================

service = DataProcessingService()

@app.on_event("startup")
async def startup():
    """Initialize on startup"""
    await service.initialize()

@app.post("/validate/blockchain-event", response_model=DataValidationResult)
async def validate_blockchain_event(event: BlockchainEvent):
    """Validate blockchain event"""
    return await service.validate_blockchain_event(event)

@app.post("/validate/market-data", response_model=DataValidationResult)
async def validate_market_data(data: MarketDataPoint):
    """Validate market data"""
    return await service.validate_market_data(data)

@app.post("/process/event-stream")
async def process_event_stream(events: List[BlockchainEvent], background_tasks: BackgroundTasks):
    """Process event stream"""
    return await service.process_event_stream(events, background_tasks)

@app.get("/pipeline/{pipeline_id}/status", response_model=ETLPipelineStatus)
async def get_pipeline_status(pipeline_id: str):
    """Get pipeline status"""
    return await service.get_pipeline_status(pipeline_id)

@app.get("/aggregate/market-data")
async def aggregate_market_data(token_pair: str, period: str = "1h"):
    """Aggregate market data"""
    return await service.aggregate_market_data(token_pair, period)

@app.get("/health")
async def health_check():
    """Health check"""
    return {
        "status": "healthy",
        "service": "Data Processing Service",
        "pipelines_running": len(service.pipelines)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
