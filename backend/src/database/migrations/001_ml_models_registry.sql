-- ML Models Registry Migration
-- Version: v3.5.0
-- Date: 2025-10-19
-- Description: Creates tables for ML model management, versioning, and lifecycle tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ML Models Registry Table
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL, -- anomaly_detection, predictive_scaling, churn_prediction, ab_testing, auto_tuning
  version VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, archived, experimental, deprecated
  description TEXT,

  -- Model configuration and metadata
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Model binary data (serialized model weights/parameters)
  model_data BYTEA,

  -- Performance metrics snapshot
  accuracy DECIMAL(5,4),
  precision_score DECIMAL(5,4),
  recall DECIMAL(5,4),
  f1_score DECIMAL(5,4),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deployed_at TIMESTAMP,
  archived_at TIMESTAMP,

  -- Audit fields
  created_by VARCHAR(255) DEFAULT 'system',

  -- Constraints
  UNIQUE(name, version),
  CHECK (accuracy >= 0 AND accuracy <= 1),
  CHECK (precision_score >= 0 AND precision_score <= 1),
  CHECK (recall >= 0 AND recall <= 1),
  CHECK (f1_score >= 0 AND f1_score <= 1)
);

-- Indexes for fast queries
CREATE INDEX idx_ml_models_type ON ml_models(type);
CREATE INDEX idx_ml_models_status ON ml_models(status);
CREATE INDEX idx_ml_models_name ON ml_models(name);
CREATE INDEX idx_ml_models_created_at ON ml_models(created_at DESC);

-- Model Performance Metrics Table (time-series data)
CREATE TABLE IF NOT EXISTS ml_model_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

  -- Metric details
  metric_type VARCHAR(100) NOT NULL, -- accuracy, precision, recall, f1, mae, mse, rmse, auc_roc, latency
  metric_value DECIMAL(10,6) NOT NULL,

  -- Sample size and confidence
  sample_size INTEGER,
  confidence_interval JSONB, -- {lower: 0.85, upper: 0.95}

  -- Timestamp
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Additional metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for time-series queries
CREATE INDEX idx_ml_model_metrics_model_id ON ml_model_metrics(model_id);
CREATE INDEX idx_ml_model_metrics_timestamp ON ml_model_metrics(timestamp DESC);
CREATE INDEX idx_ml_model_metrics_type ON ml_model_metrics(metric_type);
CREATE INDEX idx_ml_model_metrics_model_time ON ml_model_metrics(model_id, timestamp DESC);

-- Retraining Jobs Table
CREATE TABLE IF NOT EXISTS ml_retraining_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

  -- Job configuration
  trigger_type VARCHAR(100) NOT NULL, -- scheduled, performance_degradation, data_drift, manual
  config JSONB DEFAULT '{}',

  -- Job status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  progress INTEGER DEFAULT 0, -- 0-100

  -- Training data info
  training_samples INTEGER,
  validation_samples INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Results
  new_model_version VARCHAR(50),
  performance_improvement DECIMAL(6,4), -- -1.0 to 1.0 (percentage improvement)
  result JSONB DEFAULT '{}',

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Audit
  triggered_by VARCHAR(255) DEFAULT 'system'
);

-- Indexes for job management
CREATE INDEX idx_ml_retraining_jobs_model_id ON ml_retraining_jobs(model_id);
CREATE INDEX idx_ml_retraining_jobs_status ON ml_retraining_jobs(status);
CREATE INDEX idx_ml_retraining_jobs_created_at ON ml_retraining_jobs(created_at DESC);

-- Data Drift Logs Table
CREATE TABLE IF NOT EXISTS ml_drift_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

  -- Drift detection details
  drift_type VARCHAR(100) NOT NULL, -- feature_drift, concept_drift, prediction_drift
  drift_method VARCHAR(100), -- kolmogorov_smirnov, chi_squared, psi, statistical
  drift_score DECIMAL(6,4) NOT NULL, -- 0.0 to 1.0

  -- Affected features
  features_affected JSONB, -- [{name: 'feature1', score: 0.15}, ...]

  -- Statistical details
  baseline_stats JSONB,
  current_stats JSONB,
  test_result JSONB, -- {p_value: 0.05, statistic: 0.12, ...}

  -- Severity and action
  severity VARCHAR(50), -- low, medium, high, critical
  action_recommended VARCHAR(255), -- retrain, monitor, investigate
  action_taken VARCHAR(255),

  -- Timestamp
  timestamp TIMESTAMP DEFAULT NOW(),
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,

  -- Additional details
  details JSONB DEFAULT '{}'
);

-- Indexes for drift analysis
CREATE INDEX idx_ml_drift_logs_model_id ON ml_drift_logs(model_id);
CREATE INDEX idx_ml_drift_logs_timestamp ON ml_drift_logs(timestamp DESC);
CREATE INDEX idx_ml_drift_logs_severity ON ml_drift_logs(severity);
CREATE INDEX idx_ml_drift_logs_type ON ml_drift_logs(drift_type);

-- Model A/B Tests Table
CREATE TABLE IF NOT EXISTS ml_model_ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Test configuration
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Models being tested
  control_model_id UUID NOT NULL REFERENCES ml_models(id),
  variant_model_id UUID NOT NULL REFERENCES ml_models(id),

  -- Traffic split configuration
  traffic_split JSONB NOT NULL DEFAULT '{"control": 0.5, "variant": 0.5}',

  -- Test status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, stopped

  -- Test metrics
  target_metric VARCHAR(100) DEFAULT 'accuracy',
  minimum_sample_size INTEGER DEFAULT 1000,
  confidence_level DECIMAL(3,2) DEFAULT 0.95,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Results
  results JSONB DEFAULT '{}',
  winner VARCHAR(50), -- control, variant, no_winner
  statistical_significance BOOLEAN,

  -- Rollout configuration
  rollout_strategy VARCHAR(100), -- immediate, gradual, canary
  rollout_status JSONB DEFAULT '{}',

  -- Audit
  created_by VARCHAR(255) DEFAULT 'system'
);

-- Indexes for A/B test management
CREATE INDEX idx_ml_model_ab_tests_status ON ml_model_ab_tests(status);
CREATE INDEX idx_ml_model_ab_tests_created_at ON ml_model_ab_tests(created_at DESC);
CREATE INDEX idx_ml_model_ab_tests_control ON ml_model_ab_tests(control_model_id);
CREATE INDEX idx_ml_model_ab_tests_variant ON ml_model_ab_tests(variant_model_id);

-- Model A/B Test Predictions Table (for tracking individual predictions)
CREATE TABLE IF NOT EXISTS ml_model_ab_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES ml_model_ab_tests(id) ON DELETE CASCADE,

  -- Prediction details
  model_version VARCHAR(50), -- control or variant
  model_id UUID REFERENCES ml_models(id),

  -- Input/output
  input_hash VARCHAR(64), -- Hash of input for deduplication
  prediction_result JSONB,

  -- Actual outcome (if available)
  actual_outcome JSONB,
  is_correct BOOLEAN,

  -- Performance metrics
  latency_ms INTEGER,

  -- Timestamp
  timestamp TIMESTAMP DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for prediction tracking
CREATE INDEX idx_ml_model_ab_predictions_test_id ON ml_model_ab_predictions(test_id);
CREATE INDEX idx_ml_model_ab_predictions_timestamp ON ml_model_ab_predictions(timestamp DESC);
CREATE INDEX idx_ml_model_ab_predictions_model_version ON ml_model_ab_predictions(model_version);

-- Feature Store Table (for feature engineering)
CREATE TABLE IF NOT EXISTS ml_feature_store (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Feature identification
  feature_name VARCHAR(255) NOT NULL,
  feature_type VARCHAR(100) NOT NULL, -- numerical, categorical, boolean, text, datetime

  -- Feature metadata
  description TEXT,
  data_type VARCHAR(50),

  -- Feature statistics
  importance_score DECIMAL(6,4),
  correlation_scores JSONB, -- {feature1: 0.8, feature2: -0.3, ...}

  -- Feature configuration
  transformation VARCHAR(100), -- none, log, sqrt, normalization, one_hot, etc.
  transformation_params JSONB,

  -- Usage tracking
  models_using JSONB, -- [model_id1, model_id2, ...]
  usage_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Audit
  created_by VARCHAR(255) DEFAULT 'system',

  UNIQUE(feature_name)
);

-- Indexes for feature store
CREATE INDEX idx_ml_feature_store_type ON ml_feature_store(feature_type);
CREATE INDEX idx_ml_feature_store_importance ON ml_feature_store(importance_score DESC);

-- Model Deployment History Table
CREATE TABLE IF NOT EXISTS ml_model_deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

  -- Deployment details
  environment VARCHAR(50) NOT NULL, -- development, staging, production
  deployment_type VARCHAR(100), -- full_rollout, canary, blue_green, shadow
  traffic_percentage INTEGER DEFAULT 100, -- 0-100

  -- Status
  status VARCHAR(50) NOT NULL, -- deploying, active, rolling_back, failed

  -- Timestamps
  deployed_at TIMESTAMP DEFAULT NOW(),
  rolled_back_at TIMESTAMP,

  -- Configuration
  config JSONB DEFAULT '{}',

  -- Health metrics
  health_status VARCHAR(50), -- healthy, degraded, unhealthy
  error_rate DECIMAL(6,4),

  -- Audit
  deployed_by VARCHAR(255) DEFAULT 'system',
  notes TEXT
);

-- Indexes for deployment tracking
CREATE INDEX idx_ml_model_deployments_model_id ON ml_model_deployments(model_id);
CREATE INDEX idx_ml_model_deployments_environment ON ml_model_deployments(environment);
CREATE INDEX idx_ml_model_deployments_status ON ml_model_deployments(status);
CREATE INDEX idx_ml_model_deployments_deployed_at ON ml_model_deployments(deployed_at DESC);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_ml_models_updated_at
    BEFORE UPDATE ON ml_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ml_feature_store_updated_at
    BEFORE UPDATE ON ml_feature_store
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE OR REPLACE VIEW ml_active_models AS
SELECT
    m.*,
    COUNT(DISTINCT mm.id) as metric_count,
    MAX(mm.timestamp) as last_metric_timestamp,
    AVG(CASE WHEN mm.metric_type = 'accuracy' THEN mm.metric_value END) as avg_accuracy
FROM ml_models m
LEFT JOIN ml_model_metrics mm ON m.id = mm.model_id
WHERE m.status = 'active'
GROUP BY m.id;

CREATE OR REPLACE VIEW ml_model_health AS
SELECT
    m.id,
    m.name,
    m.type,
    m.version,
    m.status,
    COUNT(DISTINCT dl.id) as drift_events_last_7days,
    COUNT(DISTINCT rj.id) as retraining_jobs_last_30days,
    MAX(mm.timestamp) as last_metric_update,
    AVG(CASE WHEN mm.metric_type = 'accuracy' AND mm.timestamp > NOW() - INTERVAL '7 days'
        THEN mm.metric_value END) as accuracy_7d_avg
FROM ml_models m
LEFT JOIN ml_drift_logs dl ON m.id = dl.model_id AND dl.timestamp > NOW() - INTERVAL '7 days'
LEFT JOIN ml_retraining_jobs rj ON m.id = rj.model_id AND rj.created_at > NOW() - INTERVAL '30 days'
LEFT JOIN ml_model_metrics mm ON m.id = mm.model_id
GROUP BY m.id, m.name, m.type, m.version, m.status;

-- Insert default system models metadata
COMMENT ON TABLE ml_models IS 'ML models registry with versioning and metadata';
COMMENT ON TABLE ml_model_metrics IS 'Time-series performance metrics for ML models';
COMMENT ON TABLE ml_retraining_jobs IS 'Automated retraining job tracking';
COMMENT ON TABLE ml_drift_logs IS 'Data and concept drift detection logs';
COMMENT ON TABLE ml_model_ab_tests IS 'A/B testing experiments for model comparison';
COMMENT ON TABLE ml_feature_store IS 'Feature engineering metadata and statistics';
COMMENT ON TABLE ml_model_deployments IS 'Model deployment history and rollback tracking';

-- Migration complete
SELECT 'ML Models Registry migration completed successfully' AS status;
