# A/B Testing Services Migration Guide

## Overview
We have consolidated 4 separate A/B testing implementations (3066 lines total) into a single unified service that combines all features.

## Previous Services (TO BE DEPRECATED)
1. `abTesting.js` - Basic A/B testing (810 lines)
2. `advancedABTesting.js` - Advanced features (801 lines)
3. `mlModelABTesting.js` - ML optimization (797 lines)
4. `abTestingFramework.js` - Framework features (658 lines)

## New Unified Service
- `unifiedABTestingService.js` - Complete unified implementation

## Migration Steps

### 1. Update Imports
```javascript
// OLD
const { abTestingService } = require('./services/abTesting');
const { advancedABTesting } = require('./services/advancedABTesting');
const { mlModelABTesting } = require('./services/mlModelABTesting');

// NEW
const { unifiedABTesting } = require('./services/unifiedABTestingService');
```

### 2. Update Method Calls

#### Creating Experiments
```javascript
// OLD (various methods across services)
await abTestingService.createTest({ ... });
await advancedABTesting.createExperiment({ ... });
await mlModelABTesting.setupExperiment({ ... });

// NEW (unified method)
await unifiedABTesting.createExperiment({
  name: 'My Experiment',
  type: 'STANDARD', // or 'ML_OPTIMIZED', 'BANDIT', 'MULTIVARIATE'
  variants: [
    { id: 'control', name: 'Control', allocation: 50 },
    { id: 'variant', name: 'Variant', allocation: 50 }
  ],
  targeting: { ... },
  mlConfig: { ... },
  statistics: { ... }
});
```

#### Getting Variants
```javascript
// OLD
const variant = await abTestingService.getTestVariant(testId, userId);
const variant = await advancedABTesting.assignVariant(expId, userId);

// NEW
const { variant } = await unifiedABTesting.getVariant(experimentId, userId, context);
```

#### Tracking Conversions
```javascript
// OLD
await abTestingService.recordConversion(testId, userId);
await advancedABTesting.trackConversion(expId, userId, value);

// NEW
await unifiedABTesting.trackConversion(experimentId, userId, value, metadata);
```

### 3. Features Mapping

| Old Service | Feature | New Service Method |
|------------|---------|-------------------|
| abTesting | Basic A/B tests | `type: 'STANDARD'` |
| advancedABTesting | Multivariate | `type: 'MULTIVARIATE'` |
| mlModelABTesting | Thompson Sampling | `mlConfig.algorithm: 'THOMPSON_SAMPLING'` |
| mlModelABTesting | Bandit algorithms | `type: 'BANDIT'` |
| abTestingFramework | Segmentation | `targeting.segmentation` |
| All | Statistical analysis | Built-in `getResults()` |

### 4. Configuration Changes

The unified service uses a single configuration object:

```javascript
{
  // Experiment configuration
  name: 'Experiment Name',
  type: 'ML_OPTIMIZED',

  // Targeting (replaces various targeting methods)
  targeting: {
    audience: 'ALL',
    percentage: 100,
    geoTargeting: ['US', 'CA'],
    deviceTargeting: ['mobile', 'desktop'],
    userAttributes: { premium: true }
  },

  // ML Configuration (replaces ML service configs)
  mlConfig: {
    enabled: true,
    algorithm: 'THOMPSON_SAMPLING',
    explorationRate: 0.1,
    updateFrequency: 3600000
  },

  // Statistics (replaces various statistical configs)
  statistics: {
    confidenceLevel: 0.95,
    minimumSampleSize: 100,
    testType: 'TWO_TAILED'
  }
}
```

### 5. Database Migration

Run the following to update existing experiments:

```sql
-- Add new fields to experiments table
ALTER TABLE experiments
ADD COLUMN unified_config JSONB,
ADD COLUMN migration_status VARCHAR(20) DEFAULT 'PENDING';

-- Migration script will be provided separately
```

### 6. Gradual Migration Strategy

1. **Phase 1**: Deploy unified service alongside existing services
2. **Phase 2**: Route new experiments to unified service
3. **Phase 3**: Migrate existing active experiments
4. **Phase 4**: Archive old services
5. **Phase 5**: Remove deprecated code

### 7. Testing Checklist

- [ ] All existing tests pass with new service
- [ ] Variant assignment consistency verified
- [ ] Statistical calculations match
- [ ] ML optimizations working
- [ ] Redis caching functional
- [ ] Database persistence working
- [ ] Event emissions correct

### 8. Rollback Plan

If issues arise:
1. Feature flag to switch back to old services
2. Keep old services for 30 days after migration
3. Database backup before migration

## Benefits of Migration

1. **Code Reduction**: 3066 lines → ~900 lines (70% reduction)
2. **Maintenance**: Single service to maintain instead of 4
3. **Features**: All features in one place
4. **Performance**: Optimized caching and database queries
5. **Consistency**: Unified API across all experiment types
6. **ML Integration**: Built-in ML optimization for all experiments
7. **Better Testing**: Easier to test single service

## Timeline

- Week 1: Deploy unified service
- Week 2: Start migrating new experiments
- Week 3-4: Migrate existing experiments
- Week 5: Monitor and optimize
- Week 6: Deprecate old services

## Support

For migration assistance:
- Check logs for migration status
- Use debug mode for detailed information
- Contact backend team for issues