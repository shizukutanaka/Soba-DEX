# Service Consolidation Plan - Soba DEX Backend

## Executive Summary
The backend has **87 duplicate/overlapping services** that need consolidation. This document outlines the consolidation strategy and identifies services to retain, merge, or deprecate.

---

## 1. A/B TESTING SERVICES (4 duplicates)
**Status:** CONSOLIDATE INTO `unifiedABTestingService.js`

| File | Size | Status | Action |
|------|------|--------|--------|
| `abTesting.js` | 23.5 KB | Basic | ⛔ DEPRECATE |
| `abTestingFramework.js` | 19.6 KB | Intermediate | ⛔ DEPRECATE |
| `advancedABTesting.js` | 21.3 KB | Advanced | ⛔ DEPRECATE |
| `unifiedABTestingService.js` | 27.2 KB | **UNIFIED** | ✅ KEEP & ENHANCE |

**Action Items:**
- [x] Keep `unifiedABTestingService.js` as single source of truth
- [ ] Merge any missing features from deprecated files
- [ ] Update all imports across codebase to use `unifiedABTestingService`
- [ ] Archive deprecated files in `/archive/ab-testing/`
- [ ] Document migration path for any dependent code

---

## 2. INTERNATIONALIZATION (I18N) SERVICES (3 duplicates)
**Status:** CONSOLIDATE INTO `advancedI18nService.js`

| File | Size | Status | Action |
|------|------|--------|--------|
| `i18nService.js` | 18.7 KB | Basic | ⛔ DEPRECATE |
| `enhancedI18nService.js` | 9.5 KB | Enhanced | ⛔ DEPRECATE |
| `advancedI18nService.js` | 20.0 KB | **ADVANCED** | ✅ KEEP & ENHANCE |
| `extendedInternationalizationService.js` | - | Extended | ⛔ DEPRECATE |

**Action Items:**
- [ ] Review all 4 implementations for unique features
- [ ] Merge into `advancedI18nService.js`
- [ ] Handle `aiTranslationService.js` (7,518 lines - separate concern)
- [ ] Update imports across routes and middleware
- [ ] Archive deprecated files

---

## 3. MACHINE LEARNING SERVICES (13+ files, mostly non-overlapping)
**Status:** ORGANIZE INTO COHERENT MODULES

### Core ML Pipeline:
| File | Size | Purpose | Action |
|------|------|---------|--------|
| `mlWorkflowOrchestration.js` | 29.1 KB | **ORCHESTRATOR** | ✅ KEEP |
| `mlPipeline.js` | 20.6 KB | Pipeline definition | ✅ KEEP |

### Feature Engineering & Data:
| File | Size | Purpose | Action |
|------|------|---------|--------|
| `mlFeatureEngineering.js` | 19.8 KB | Feature creation | ✅ KEEP |
| `mlDataQuality.js` | 24.2 KB | Data validation | ✅ KEEP |
| `mlExplainability.js` | 28.6 KB | Model interpretability | ✅ KEEP |

### Model Management:
| File | Size | Purpose | Action |
|------|------|---------|--------|
| `mlModelPersistence.js` | 18.3 KB | Model storage | ✅ KEEP |
| `mlModelComparison.js` | 19.9 KB | Model evaluation | ✅ KEEP |
| `mlAnomalyDetection.js` | 18.9 KB | Fraud detection | ✅ KEEP |

### Monitoring & Performance:
| File | Size | Purpose | Action |
|------|------|---------|--------|
| `mlPerformanceMonitoring.js` | 22.9 KB | Runtime monitoring | ⚠️ REVIEW |
| `mlPerformanceTracking.js` | 23.3 KB | Performance metrics | ⚠️ REVIEW |
| `mlDriftDetection.js` | 21.1 KB | Model drift | ✅ KEEP |
| `mlRetrainingService.js` | 19.7 KB | Auto-retraining | ✅ KEEP |
| `mlModelABTesting.js` | 21.6 KB | Model A/B testing | MERGE → ML orchestrator |
| `mlReporting.js` | 22.3 KB | Reporting | ✅ KEEP |
| `mlVisualization.js` | 16.9 KB | Visualization | ✅ KEEP |

**Action Items:**
- [ ] Consolidate `mlPerformanceMonitoring.js` and `mlPerformanceTracking.js`
- [ ] Merge `mlModelABTesting.js` into orchestrator
- [ ] Create `ml/index.js` exporting unified ML services
- [ ] Document ML pipeline architecture
- [ ] Add service tests for each ML module

---

## 4. CACHING SERVICES (3+ versions)
**Status:** CONSOLIDATE INTO `advancedCacheService.js`

| File | Size | Purpose | Action |
|------|------|---------|--------|
| `cacheService.js` | - | Basic | ⛔ DEPRECATE |
| `advancedCacheService.js` | - | **ADVANCED** | ✅ KEEP |
| `multiTierCacheService.js` | - | Multi-tier | MERGE → Advanced |
| `unifiedCacheService.js` | - | Unified | REVIEW |

**Action Items:**
- [ ] Review all cache implementations
- [ ] Keep best-of-breed `advancedCacheService.js`
- [ ] Ensure Redis + in-memory dual-layer support
- [ ] Add cache invalidation strategy documentation

---

## 5. WEBSOCKET SERVICES (2 versions)
**Status:** CONSOLIDATE INTO `scalableWebSocketService.js`

| File | Size | Purpose | Action |
|------|------|---------|--------|
| `websocketService.js` | - | Basic | ⛔ DEPRECATE |
| `scalableWebSocketService.js` | 24.1 KB | **SCALABLE** | ✅ KEEP |
| `optimizedWebSocketService.js` | - | Optimized | REVIEW & MERGE |

**Action Items:**
- [ ] Review optimized version for unique features
- [ ] Consolidate into `scalableWebSocketService.js`
- [ ] Update all routes using WebSocket to import from consolidated service
- [ ] Archive old files

---

## 6. MEV PROTECTION SERVICES (2 versions)
**Status:** CONSOLIDATE INTO `mevProtectionAdvanced.js`

| File | Size | Purpose | Action |
|------|------|---------|--------|
| `mevProtection.js` | - | Basic | ⛔ DEPRECATE |
| `mevProtectionService.js` | - | Enhanced | ⛔ DEPRECATE |
| `mevProtectionAdvanced.js` | - | **ADVANCED** | ✅ KEEP |

**Action Items:**
- [ ] Merge any missing features
- [ ] Rename to `mevProtectionService.js` for clarity
- [ ] Update imports across flash loan, swap, and order routes

---

## 7. PRICE ORACLE SERVICES (2+ versions)
**Status:** CONSOLIDATE

| File | Size | Purpose | Action |
|------|------|---------|--------|
| `priceService.js` | - | Basic | REVIEW |
| `priceOracle.js` | - | Oracle | REVIEW |
| `hybridOracleService.js` | - | **HYBRID** | ✅ LIKELY BEST |
| `gasPriceOracle.js` | - | Gas prices | ✅ KEEP (specialized) |

**Action Items:**
- [ ] Determine primary oracle service
- [ ] Keep specialized gas price oracle separate
- [ ] Archive redundant versions

---

## 8. MONITORING & ANALYTICS (Multiple versions)
**Status:** CONSOLIDATE INTO SINGLE PLATFORM

| File | Purpose | Action |
|------|---------|--------|
| `metricsService.js` | Prometheus metrics | ✅ KEEP |
| `performanceMonitor.js` | Performance | MERGE → metrics |
| `performanceOptimization.js` | Optimization | MERGE → metrics |
| `realTimeIntelligence.js` | Real-time | ✅ KEEP |
| `userBehaviorAnalytics.js` | User behavior | ✅ KEEP |
| `frontendAnalytics.js` | Frontend tracking | ✅ KEEP |
| `enhancedPerformanceMonitoringService.js` | Enhanced | MERGE |
| `advancedMonitoring.js` | Advanced | MERGE |
| `sloMonitoringService.js` | SLO | ✅ KEEP |
| `rumService.js` | RUM | ✅ KEEP |

**Action Items:**
- [ ] Consolidate all performance monitoring into `metricsService.js`
- [ ] Ensure Prometheus compatibility
- [ ] Add custom metrics for trading operations
- [ ] Create monitoring dashboard exports

---

## 9. ANALYTICS & FRAUD DETECTION (Multiple versions)
**Status:** CONSOLIDATE

| File | Size | Purpose | Action |
|------|------|---------|--------|
| `aiMLFraudDetectionService.js` | 23.9 KB | AI-based fraud | ✅ KEEP |
| `mlAnomalyDetection.js` | 18.9 KB | ML anomaly | ✅ KEEP (part of ML pipeline) |
| `funnelAnomalyDetection.js` | - | Funnel anomaly | ARCHIVE |

**Action Items:**
- [ ] Keep both services (different approaches)
- [ ] Ensure they don't duplicate detection logic
- [ ] Integrate with security monitoring

---

## 10. DEPRECATED/REDUNDANT SERVICES TO ARCHIVE

Files with unclear usage or apparent duplication:

| File | Reason | Action |
|------|--------|--------|
| `abTesting.js` | Replaced by unified version | ARCHIVE |
| `abTestingFramework.js` | Replaced by unified version | ARCHIVE |
| `advancedABTesting.js` | Replaced by unified version | ARCHIVE |
| `i18nService.js` | Replaced by advanced version | ARCHIVE |
| `enhancedI18nService.js` | Replaced by advanced version | ARCHIVE |
| `extendedInternationalizationService.js` | Replaced by advanced version | ARCHIVE |
| `websocketService.js` | Replaced by scalable version | ARCHIVE |
| `mevProtection.js` | Replaced by advanced version | ARCHIVE |
| `mevProtectionService.js` | Replaced by advanced version | ARCHIVE |
| `baselineService.js` | Unclear usage | REVIEW & ARCHIVE |
| `featureModules.js` | Unclear usage | REVIEW & ARCHIVE |
| `reactFrontend.js` | Frontend code in backend | DELETE |

---

## 11. CONSOLIDATION TIMELINE

### Phase 1: A/B Testing & I18n (Week 1)
- [ ] Consolidate A/B Testing services
- [ ] Consolidate I18n services
- [ ] Update all imports
- [ ] Run tests

### Phase 2: Caching & WebSocket (Week 2)
- [ ] Consolidate cache services
- [ ] Consolidate WebSocket services
- [ ] Test in staging

### Phase 3: ML Services (Week 3)
- [ ] Organize ML into coherent modules
- [ ] Create `ml/index.js` with unified exports
- [ ] Document pipeline architecture

### Phase 4: Monitoring & Analytics (Week 4)
- [ ] Consolidate monitoring services
- [ ] Create unified metrics dashboard
- [ ] Test monitoring in production

### Phase 5: Cleanup (Week 5)
- [ ] Archive all deprecated files
- [ ] Update documentation
- [ ] Full regression testing

---

## 12. IMPORT MIGRATION EXAMPLES

### Before (Old imports):
```javascript
const abTesting = require('./services/abTesting');
const i18n = require('./services/i18nService');
const cache = require('./services/cacheService');
const websocket = require('./services/websocketService');
```

### After (Unified imports):
```javascript
const { UnifiedABTestingService } = require('./services/unifiedABTestingService');
const { AdvancedI18nService } = require('./services/advancedI18nService');
const { AdvancedCacheService } = require('./services/advancedCacheService');
const { ScalableWebSocketService } = require('./services/scalableWebSocketService');
```

---

## 13. VERIFICATION CHECKLIST

- [ ] All consolidated services have unit tests
- [ ] All deprecated services are archived
- [ ] No remaining imports of archived files
- [ ] Services properly exported from modules
- [ ] Documentation updated for all changes
- [ ] Full integration testing passed
- [ ] Performance metrics baseline established
- [ ] No functional regressions detected

---

**Status:** IN PROGRESS
**Last Updated:** 2025-01-01
**Owner:** Backend Engineering Team
