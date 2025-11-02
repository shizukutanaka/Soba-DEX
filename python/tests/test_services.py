"""
Comprehensive Test Suite for Python ML Services
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from typing import List

# Import services
import sys
sys.path.insert(0, '../services')

from ml_models_service import MLModelsService, PredictionRequest, PriceHistory
from nlp_translation_service import NLPTranslationService, TranslationRequest
from fraud_detection_service import FraudDetectionService, RiskAssessmentRequest, Transaction
from data_processing_service import DataProcessingService, BlockchainEvent, DataQualityValidator
from blockchain_intelligence_service import BlockchainIntelligenceService, SmartContractAnalyzer

# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
async def ml_service():
    """Initialize ML Models Service"""
    service = MLModelsService()
    await service.initialize()
    yield service

@pytest.fixture
async def nlp_service():
    """Initialize NLP Translation Service"""
    service = NLPTranslationService()
    await service.initialize()
    yield service

@pytest.fixture
async def fraud_service():
    """Initialize Fraud Detection Service"""
    service = FraudDetectionService()
    await service.initialize()
    yield service

@pytest.fixture
async def data_service():
    """Initialize Data Processing Service"""
    service = DataProcessingService()
    await service.initialize()
    yield service

@pytest.fixture
async def blockchain_service():
    """Initialize Blockchain Intelligence Service"""
    service = BlockchainIntelligenceService()
    await service.initialize()
    yield service

# Sample data fixtures
@pytest.fixture
def sample_price_history():
    """Generate sample price history"""
    prices = []
    base_price = 2000
    for i in range(100):
        prices.append(PriceHistory(
            timestamp=datetime.now() - timedelta(hours=100-i),
            open=base_price + i * 0.1,
            high=base_price + i * 0.15,
            low=base_price + i * 0.05,
            close=base_price + i * 0.12,
            volume=1000000 + i * 10000
        ))
    return prices

@pytest.fixture
def sample_blockchain_event():
    """Generate sample blockchain event"""
    return BlockchainEvent(
        event_id='evt_001',
        event_type='swap',
        timestamp=datetime.now(),
        block_number=18000000,
        transaction_hash='0x' + 'a' * 64,
        contract_address='0x' + 'b' * 40,
        from_address='0x' + 'c' * 40,
        to_address='0x' + 'd' * 40,
        token_in='USDC',
        token_out='ETH',
        amount_in=1000,
        amount_out=0.5,
        gas_used=200000,
        gas_price=50
    )

@pytest.fixture
def sample_transaction():
    """Generate sample transaction"""
    return Transaction(
        tx_hash='0x' + 'a' * 64,
        from_address='0x' + 'b' * 40,
        to_address='0x' + 'c' * 40,
        amount=100000,
        token_pair='ETH/USDC',
        timestamp=datetime.now(),
        gas_price=50,
        slippage=0.005,
        route_length=3,
        contract_interaction=True
    )

# ============================================================================
# ML MODELS TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_ml_models_service_initialization(ml_service):
    """Test ML service initializes correctly"""
    assert ml_service.device is not None
    assert ml_service.lstm_model is not None
    assert ml_service.scaler is not None

@pytest.mark.asyncio
async def test_price_prediction(ml_service, sample_price_history):
    """Test price prediction"""
    request = PredictionRequest(
        token_pair='ETH/USDC',
        price_history=sample_price_history,
        forecast_horizon=24,
        confidence_level=0.95
    )

    response = await ml_service.predict_price(request)

    assert response.token_pair == 'ETH/USDC'
    assert 0 <= response.accuracy_score <= 1
    assert response.confidence_interval[0] < response.confidence_interval[1]
    assert response.predicted_direction in ['up', 'down', 'sideways']
    assert response.latency_ms > 0

@pytest.mark.asyncio
async def test_prediction_confidence_levels(ml_service, sample_price_history):
    """Test different confidence levels"""
    for confidence in [0.5, 0.75, 0.95]:
        request = PredictionRequest(
            token_pair='ETH/USDC',
            price_history=sample_price_history,
            forecast_horizon=24,
            confidence_level=confidence
        )

        response = await ml_service.predict_price(request)
        assert response.confidence_interval[1] - response.confidence_interval[0] > 0

# ============================================================================
# NLP TRANSLATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_nlp_service_initialization(nlp_service):
    """Test NLP service initializes"""
    assert nlp_service.device is not None
    assert nlp_service.redis is not None

@pytest.mark.asyncio
async def test_language_detection(nlp_service):
    """Test language detection"""
    texts = {
        'Hello, how are you?': 'en',
        'Bonjour, comment allez-vous?': 'fr',
        'Hola, ¿cómo estás?': 'es',
        'Guten Tag, wie geht es Ihnen?': 'de'
    }

    for text, expected_lang in texts.items():
        detection = await nlp_service.detect_language(text)
        assert detection.detected_language in ['en', 'fr', 'es', 'de']
        assert 0 <= detection.confidence <= 1

@pytest.mark.asyncio
async def test_translation_accuracy(nlp_service):
    """Test translation quality"""
    test_cases = [
        ('Hello', 'en', 'es'),
        ('Good morning', 'en', 'fr'),
        ('Thank you', 'en', 'de'),
    ]

    for text, source, target in test_cases:
        request = TranslationRequest(
            text=text,
            source_language=source,
            target_language=target
        )

        response = await nlp_service.translate(request)
        assert response.translated_text != text
        assert len(response.translated_text) > 0
        assert response.latency_ms < 200  # Should be fast

@pytest.mark.asyncio
async def test_translation_caching(nlp_service):
    """Test translation caching"""
    request = TranslationRequest(
        text='Hello, world!',
        source_language='en',
        target_language='es'
    )

    # First call (cache miss)
    response1 = await nlp_service.translate(request)
    latency1 = response1.latency_ms

    # Second call (cache hit) - should be faster
    response2 = await nlp_service.translate(request)
    latency2 = response2.latency_ms

    assert response1.translated_text == response2.translated_text
    # Cache hits should be significantly faster
    assert latency2 < latency1

# ============================================================================
# FRAUD DETECTION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_fraud_service_initialization(fraud_service):
    """Test fraud service initializes"""
    assert fraud_service.anomaly_detector is not None
    assert fraud_service.db is not None

@pytest.mark.asyncio
async def test_normal_transaction_assessment(fraud_service, sample_transaction):
    """Test risk assessment for normal transaction"""
    request = RiskAssessmentRequest(
        transaction=sample_transaction,
        check_patterns=True,
        check_network=True,
        check_contract=True
    )

    response = await fraud_service.assess_risk(request)

    assert 0 <= response.risk_score <= 1
    assert response.risk_level in ['safe', 'low', 'medium', 'high', 'critical']
    assert response.latency_ms < 100  # Should be fast

@pytest.mark.asyncio
async def test_suspicious_transaction_detection(fraud_service):
    """Test detection of suspicious patterns"""
    suspicious_tx = Transaction(
        tx_hash='0x' + 'sus' * 21,
        from_address='0x' + 'b' * 40,
        to_address='0x' + 'c' * 40,
        amount=1000000000,  # Very large
        token_pair='ETH/USDC',
        timestamp=datetime.now(),
        gas_price=500,  # Very high
        slippage=0.0,  # Zero slippage - suspicious
        route_length=6,  # Complex route
        contract_interaction=True
    )

    request = RiskAssessmentRequest(
        transaction=suspicious_tx,
        check_patterns=True,
        check_contract=True
    )

    response = await fraud_service.assess_risk(request)

    # Should be flagged as higher risk
    assert response.risk_score > 0.3
    assert len(response.alerts) > 0

@pytest.mark.asyncio
async def test_risk_score_consistency(fraud_service, sample_transaction):
    """Test risk scoring is consistent"""
    request = RiskAssessmentRequest(
        transaction=sample_transaction,
        check_patterns=True
    )

    response1 = await fraud_service.assess_risk(request)
    response2 = await fraud_service.assess_risk(request)

    # Should produce same risk score for same input
    assert response1.risk_score == response2.risk_score
    assert response1.risk_level == response2.risk_level

# ============================================================================
# DATA PROCESSING TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_data_service_initialization(data_service):
    """Test data service initializes"""
    assert data_service.db is not None
    assert data_service.redis is not None
    assert data_service.validator is not None

def test_blockchain_event_validation(sample_blockchain_event):
    """Test blockchain event validation"""
    validator = DataQualityValidator()
    result = validator.validate_blockchain_event(sample_blockchain_event.dict())

    assert result.is_valid
    assert result.quality_score > 0.7
    assert len(result.issues) == 0

def test_invalid_blockchain_event_detection():
    """Test invalid event detection"""
    validator = DataQualityValidator()

    invalid_event = {
        'event_id': None,  # Missing
        'timestamp': datetime.now(),
        'amount_in': -100,  # Negative
        'amount_out': 50
    }

    result = validator.validate_blockchain_event(invalid_event)

    assert not result.is_valid
    assert len(result.issues) > 0
    assert result.quality_score < 0.7

def test_market_data_validation():
    """Test market data validation"""
    validator = DataQualityValidator()

    valid_data = {
        'open': 100,
        'high': 110,
        'low': 90,
        'close': 105,
        'volume': 1000000
    }

    result = validator.validate_market_data(valid_data)
    assert result.is_valid

    # Test invalid OHLC
    invalid_data = {
        'open': 100,
        'high': 90,  # High < Low
        'low': 80,
        'close': 95,
        'volume': 1000000
    }

    result = validator.validate_market_data(invalid_data)
    assert not result.is_valid

# ============================================================================
# BLOCKCHAIN INTELLIGENCE TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_blockchain_service_initialization(blockchain_service):
    """Test blockchain service initializes"""
    assert blockchain_service.db is not None
    assert blockchain_service.contract_analyzer is not None
    assert blockchain_service.mev_detector is not None

def test_mev_detection_sandwich_attack():
    """Test MEV sandwich attack detection"""
    detector = BlockchainIntelligenceService().mev_detector

    target_tx = {
        'amount': 100,
        'gas_price': 100,
        'timestamp': datetime.now()
    }

    surrounding_txs = [
        {'amount': 60, 'timestamp': datetime.now() - timedelta(seconds=5)},
        {'amount': 80, 'timestamp': datetime.now() + timedelta(seconds=5)}
    ]

    is_sandwich, confidence = detector.detect_sandwich_attack(target_tx, surrounding_txs)
    assert is_sandwich
    assert 0 <= confidence <= 1

def test_liquidation_opportunity_detection():
    """Test liquidation opportunity detection"""
    detector = BlockchainIntelligenceService().mev_detector

    # Test liquidatable position
    is_liquidatable, confidence = detector.detect_liquidation_opportunity(
        'wallet_0x123',
        health_factor=0.8,  # < 1.0
        pool_data={'user_debt': 10000, 'user_collateral': 12000}
    )

    assert is_liquidatable
    assert confidence > 0

    # Test safe position
    is_liquidatable, confidence = detector.detect_liquidation_opportunity(
        'wallet_0x456',
        health_factor=2.0,  # > 1.0
        pool_data={'user_debt': 5000, 'user_collateral': 15000}
    )

    assert not is_liquidatable

# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_ml_prediction_latency(ml_service, sample_price_history):
    """Test prediction latency is acceptable"""
    request = PredictionRequest(
        token_pair='ETH/USDC',
        price_history=sample_price_history,
        forecast_horizon=24,
        confidence_level=0.95
    )

    response = await ml_service.predict_price(request)
    assert response.latency_ms < 200  # Should be < 200ms

@pytest.mark.asyncio
async def test_translation_latency(nlp_service):
    """Test translation latency is acceptable"""
    request = TranslationRequest(
        text='Hello, how are you?',
        source_language='en',
        target_language='es'
    )

    response = await nlp_service.translate(request)
    assert response.latency_ms < 200  # Should be < 200ms

@pytest.mark.asyncio
async def test_fraud_detection_latency(fraud_service, sample_transaction):
    """Test fraud detection latency"""
    request = RiskAssessmentRequest(
        transaction=sample_transaction,
        check_patterns=True
    )

    response = await fraud_service.assess_risk(request)
    assert response.latency_ms < 100  # Should be < 100ms

# ============================================================================
# INTEGRATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_multi_service_workflow(ml_service, nlp_service, fraud_service):
    """Test workflow using multiple services"""
    # 1. Predict price
    price_request = PredictionRequest(
        token_pair='ETH/USDC',
        price_history=[
            PriceHistory(
                timestamp=datetime.now() - timedelta(hours=i),
                open=2000, high=2050, low=1980, close=2030, volume=1000000
            )
            for i in range(100)
        ],
        forecast_horizon=24
    )

    price_response = await ml_service.predict_price(price_request)
    assert price_response is not None

    # 2. Translate prediction to multiple languages
    text = f"Price prediction: {price_response.predicted_price}"
    for lang in ['es', 'fr', 'de']:
        translation_request = TranslationRequest(
            text=text,
            source_language='en',
            target_language=lang
        )
        translation_response = await nlp_service.translate(translation_request)
        assert translation_response.translated_text is not None

    # 3. Assess risk of hypothetical transaction
    tx_request = RiskAssessmentRequest(
        transaction=Transaction(
            tx_hash='0x123',
            from_address='0x' + 'a' * 40,
            to_address='0x' + 'b' * 40,
            amount=100000,
            token_pair='ETH/USDC',
            timestamp=datetime.now(),
            gas_price=50,
            slippage=0.005,
            route_length=3,
            contract_interaction=True
        )
    )

    risk_response = await fraud_service.assess_risk(tx_request)
    assert risk_response.risk_score is not None

# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--asyncio-mode=auto'])
