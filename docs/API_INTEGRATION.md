# API Integration Guide

Complete API documentation for all Python services.

## Base URL

```
http://localhost:3000/api/python
```

## Authentication

All endpoints (except public ones) require Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/python/...
```

## Health & Monitoring

### Check Overall Health

```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-01T12:00:00Z",
  "services": {
    "ML_MODELS": { "status": "healthy", "healthy": true },
    "NLP_TRANSLATION": { "status": "healthy", "healthy": true },
    "FRAUD_DETECTION": { "status": "healthy", "healthy": true },
    "DATA_PROCESSING": { "status": "healthy", "healthy": true },
    "BLOCKCHAIN_INTELLIGENCE": { "status": "healthy", "healthy": true }
  }
}
```

### Get Detailed Metrics

```bash
GET /api/health/metrics
```

### Service-Specific Status

```bash
GET /api/health/service/ML_MODELS
GET /api/health/service/NLP_TRANSLATION
GET /api/health/service/FRAUD_DETECTION
GET /api/health/service/DATA_PROCESSING
GET /api/health/service/BLOCKCHAIN_INTELLIGENCE
```

## ML Models Service

### Price Prediction

```bash
POST /ml/predict
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "tokenPair": "ETH/USDC",
  "priceHistory": [
    {
      "timestamp": "2025-11-01T00:00:00Z",
      "open": 2000,
      "high": 2050,
      "low": 1950,
      "close": 2030,
      "volume": 1000000
    }
  ],
  "forecastHorizon": 24,
  "confidenceLevel": 0.95
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token_pair": "ETH/USDC",
    "predicted_price": 2045.50,
    "confidence_interval": [2000, 2090],
    "predicted_direction": "up",
    "accuracy_score": 0.82
  }
}
```

### Train Model

```bash
POST /ml/train
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "tokenPair": "ETH/USDC"
}
```

## NLP Translation Service

### Translate Text

```bash
POST /nlp/translate
Content-Type: application/json

{
  "text": "Hello, world!",
  "targetLanguage": "es",
  "sourceLanguage": "en"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "original_text": "Hello, world!",
    "translated_text": "¡Hola, mundo!",
    "source_language": "en",
    "target_language": "es",
    "confidence": 0.98
  }
}
```

### Detect Language

```bash
POST /nlp/detect-language
Content-Type: application/json

{
  "text": "Bonjour, comment allez-vous?"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "text": "Bonjour, comment allez-vous?",
    "detected_language": "fr",
    "confidence": 0.95,
    "possible_languages": [
      {"language": "fr", "confidence": 0.95},
      {"language": "en", "confidence": 0.03},
      {"language": "es", "confidence": 0.02}
    ]
  }
}
```

### Batch Translate

```bash
POST /nlp/translate-batch
Content-Type: application/json

{
  "texts": ["Hello", "Good morning", "Thank you"],
  "targetLanguage": "es",
  "sourceLanguage": "en"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "translations": [
      {
        "original": "Hello",
        "translated": "Hola",
        "confidence": 0.98
      },
      {
        "original": "Good morning",
        "translated": "Buenos días",
        "confidence": 0.97
      },
      {
        "original": "Thank you",
        "translated": "Gracias",
        "confidence": 0.99
      }
    ]
  }
}
```

### Supported Languages

```bash
GET /nlp/supported-languages
```

Response:
```json
{
  "success": true,
  "data": {
    "total_languages": 100,
    "languages": [
      {
        "code": "en",
        "name": "English"
      },
      {
        "code": "es",
        "name": "Spanish"
      },
      ...
    ]
  }
}
```

## Fraud Detection Service

### Assess Risk

```bash
POST /fraud/assess-risk
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "transaction": {
    "txHash": "0x123...abc",
    "fromAddress": "0x456...def",
    "toAddress": "0x789...ghi",
    "amount": 100000,
    "tokenPair": "ETH/USDC",
    "timestamp": "2025-11-01T12:00:00Z",
    "gasPrice": 50,
    "slippage": 0.005,
    "routeLength": 3,
    "contractInteraction": true
  },
  "userHistory": {
    "previousTransactions": 150,
    "totalVolume": 5000000,
    "accountAge": 365
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "risk_score": 0.25,
    "risk_level": "low",
    "alerts": [],
    "is_suspicious": false,
    "recommended_action": "approve"
  }
}
```

## Data Processing Service

### Validate Blockchain Event

```bash
POST /data/validate-blockchain-event
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "event": {
    "event_id": "evt_001",
    "event_type": "swap",
    "timestamp": "2025-11-01T12:00:00Z",
    "block_number": 18000000,
    "transaction_hash": "0x123...abc",
    "contract_address": "0x456...def",
    "from_address": "0x789...ghi",
    "to_address": "0xabc...jkl",
    "token_in": "USDC",
    "token_out": "ETH",
    "amount_in": 1000,
    "amount_out": 0.5,
    "gas_used": 200000,
    "gas_price": 50
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "is_valid": true,
    "quality_score": 0.95,
    "issues": [],
    "warnings": []
  }
}
```

### Validate Market Data

```bash
POST /data/validate-market-data
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "data": {
    "timestamp": "2025-11-01T12:00:00Z",
    "token_pair": "ETH/USDC",
    "open": 2000,
    "high": 2050,
    "low": 1950,
    "close": 2030,
    "volume": 1000000
  }
}
```

### Aggregate Market Data

```bash
GET /data/aggregate-market-data?tokenPair=ETH/USDC&period=1h
Authorization: Bearer TOKEN
```

Response:
```json
{
  "success": true,
  "data": {
    "token_pair": "ETH/USDC",
    "period": "1h",
    "aggregated": {
      "open": 2000,
      "high": 2100,
      "low": 1900,
      "close": 2050,
      "volume": 50000000,
      "trades": 5000
    }
  }
}
```

## Blockchain Intelligence Service

### Analyze Contract

```bash
POST /blockchain/analyze-contract
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "address": "0x1234567890123456789012345678901234567890"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "address": "0x123...",
    "risk_score": 0.15,
    "vulnerabilities": [
      {
        "type": "reentrancy",
        "severity": "high",
        "description": "Potential reentrancy vulnerability"
      }
    ],
    "security_score": 0.85,
    "recommendations": []
  }
}
```

### Detect MEV

```bash
POST /blockchain/detect-mev
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "targetTx": {
    "amount": 100,
    "gas_price": 100,
    "timestamp": "2025-11-01T12:00:00Z"
  },
  "surroundingTxs": [
    {"amount": 60, "timestamp": "2025-11-01T11:59:55Z"},
    {"amount": 80, "timestamp": "2025-11-01T12:00:05Z"}
  ]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "mev_detected": true,
    "opportunities": [
      {
        "type": "sandwich",
        "confidence": 0.92,
        "potential_profit": 1500
      }
    ]
  }
}
```

### Analyze Wallet Cluster

```bash
POST /blockchain/analyze-wallet-cluster
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "walletAddresses": [
    "0x123...abc",
    "0x456...def",
    "0x789...ghi"
  ]
}
```

### Transaction Graph

```bash
GET /blockchain/transaction-graph?tokenPair=ETH/USDC&limit=100
Authorization: Bearer TOKEN
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Missing required fields: tokenPair and priceHistory",
  "status": 400
}
```

### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "status": 401
}
```

### 429 Rate Limited

```json
{
  "error": "Service rate limit exceeded",
  "status": 429
}
```

### 503 Service Unavailable

```json
{
  "error": "Service SERVICE_NAME is currently unavailable",
  "status": 503,
  "service": "ML_MODELS",
  "suggestions": [
    "Check service status: GET /health/service/ML_MODELS",
    "Try again in a few moments"
  ]
}
```

## Rate Limits

| Service | Limit |
|---------|-------|
| ML Models | 50 concurrent |
| NLP Translation | 50 concurrent |
| Fraud Detection | 100 concurrent |
| Data Processing | 75 concurrent |
| Blockchain Intel | 50 concurrent |

## Caching

Responses are cached based on operation:

| Operation | TTL |
|-----------|-----|
| Price prediction | 1 hour |
| Translation | 24 hours |
| Risk assessment | 30 minutes |
| Data validation | 1 hour |
| Contract analysis | 7 days |

To bypass cache, add `?cache=false` query parameter.

## Examples

### Complete ML Price Prediction

```bash
curl -X POST http://localhost:3000/api/python/ml/predict \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenPair": "ETH/USDC",
    "priceHistory": [
      {
        "timestamp": "2025-10-31T00:00:00Z",
        "open": 1900,
        "high": 1950,
        "low": 1850,
        "close": 1900,
        "volume": 1000000
      },
      {
        "timestamp": "2025-11-01T00:00:00Z",
        "open": 2000,
        "high": 2050,
        "low": 1950,
        "close": 2030,
        "volume": 1000000
      }
    ],
    "forecastHorizon": 24,
    "confidenceLevel": 0.95
  }'
```

---

**Last Updated:** November 1, 2025
**Version:** 1.0.0
