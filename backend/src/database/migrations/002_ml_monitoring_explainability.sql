/**
 * Database Migration: ML Monitoring & Explainability (v3.6.0)
 *
 * Creates tables, indexes, and views for:
 * - Model explainability (SHAP, LIME, counterfactuals)
 * - Performance monitoring and alerting
 * - Data quality validation and logging
 * - Model comparison and analysis
 * - Feature statistics tracking
 *
 * Version: 3.6.0
 * Migration: 002
 * Dependencies: 001_ml_models_registry.sql
 */

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ml_explanations: Store ML model prediction explanations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_explanations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    prediction_id UUID,

    -- Explanation metadata
    explanation_type VARCHAR(50) NOT NULL CHECK (explanation_type IN ('shap', 'lime', 'counterfactual', 'global')),

    -- Feature attributions (e.g., {feature1: 0.5, feature2: -0.3})
    feature_attributions JSONB NOT NULL,

    -- Global importance scores
    global_importance JSONB,

    -- Confidence intervals for attributions
    confidence_interval JSONB,

    -- Original input that was explained
    input_data JSONB,

    -- Predicted output
    prediction_output JSONB,

    -- Explanation quality metrics
    explanation_confidence DECIMAL(5,4),
    coverage_score DECIMAL(5,4),

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ml_explanations
CREATE INDEX idx_ml_explanations_model_time ON ml_explanations(model_id, created_at DESC);
CREATE INDEX idx_ml_explanations_prediction ON ml_explanations(prediction_id);
CREATE INDEX idx_ml_explanations_type ON ml_explanations(explanation_type);
CREATE INDEX idx_ml_explanations_created ON ml_explanations(created_at DESC);

-- ----------------------------------------------------------------------------
-- ml_performance_logs: Track model performance over time
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_performance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT NOW(),

    -- Accuracy metrics (0.0 to 1.0)
    accuracy DECIMAL(6,4),
    precision_score DECIMAL(6,4),
    recall_score DECIMAL(6,4),
    f1_score DECIMAL(6,4),

    -- AUC/ROC metrics
    roc_auc DECIMAL(6,4),
    pr_auc DECIMAL(6,4),

    -- Latency metrics (milliseconds)
    latency_p50 INTEGER,
    latency_p95 INTEGER,
    latency_p99 INTEGER,
    latency_max INTEGER,
    latency_mean DECIMAL(10,4),

    -- Throughput
    predictions_per_second INTEGER,
    total_predictions INTEGER,

    -- Error metrics
    error_rate DECIMAL(6,4),
    false_positive_rate DECIMAL(6,4),
    false_negative_rate DECIMAL(6,4),

    -- Confusion matrix (for classification)
    -- Format: {tp: 100, tn: 200, fp: 10, fn: 5}
    confusion_matrix JSONB,

    -- Calibration metrics
    calibration_error DECIMAL(6,4),

    -- Resource usage
    memory_usage_mb INTEGER,
    cpu_usage_percent DECIMAL(5,2),

    -- Metadata
    sample_size INTEGER NOT NULL,
    time_window_minutes INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for ml_performance_logs
CREATE INDEX idx_ml_perf_model_time ON ml_performance_logs(model_id, timestamp DESC);
CREATE INDEX idx_ml_perf_timestamp ON ml_performance_logs(timestamp DESC);
CREATE INDEX idx_ml_perf_accuracy ON ml_performance_logs(model_id, accuracy DESC);

-- ----------------------------------------------------------------------------
-- ml_performance_alerts: Store performance-related alerts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_performance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

    -- Alert classification
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Threshold information
    metric_name VARCHAR(100) NOT NULL,
    threshold_value DECIMAL(10,4),
    actual_value DECIMAL(10,4),
    deviation_percent DECIMAL(6,2),

    -- Alert details
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',

    -- Alert lifecycle
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
    acknowledged_by VARCHAR(255),
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_note TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ml_performance_alerts
CREATE INDEX idx_ml_alerts_model_time ON ml_performance_alerts(model_id, created_at DESC);
CREATE INDEX idx_ml_alerts_status_severity ON ml_performance_alerts(status, severity);
CREATE INDEX idx_ml_alerts_type ON ml_performance_alerts(alert_type);
CREATE INDEX idx_ml_alerts_unresolved ON ml_performance_alerts(model_id, status) WHERE status IN ('open', 'acknowledged');

-- ----------------------------------------------------------------------------
-- ml_data_quality_logs: Track data quality issues
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_data_quality_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES ml_models(id) ON DELETE CASCADE,
    prediction_id UUID,

    -- Quality scores (0-100)
    overall_quality_score INTEGER CHECK (overall_quality_score >= 0 AND overall_quality_score <= 100),
    completeness_score INTEGER CHECK (completeness_score >= 0 AND completeness_score <= 100),
    validity_score INTEGER CHECK (validity_score >= 0 AND validity_score <= 100),
    consistency_score INTEGER CHECK (consistency_score >= 0 AND consistency_score <= 100),
    accuracy_score INTEGER CHECK (accuracy_score >= 0 AND accuracy_score <= 100),

    -- Issue detection
    -- Format: [{type: 'missing', field: 'price', severity: 'high', message: '...'}]
    issues_detected JSONB DEFAULT '[]',

    -- Specific issue lists
    missing_features TEXT[],
    outlier_features TEXT[],
    invalid_features TEXT[],
    inconsistent_features TEXT[],

    -- Statistics
    total_features INTEGER NOT NULL,
    valid_features INTEGER NOT NULL,
    flagged_features INTEGER DEFAULT 0,

    -- Input data snapshot (for analysis)
    data_snapshot JSONB,

    -- Recommendations
    recommendations TEXT[],

    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for ml_data_quality_logs
CREATE INDEX idx_ml_quality_model_time ON ml_data_quality_logs(model_id, created_at DESC);
CREATE INDEX idx_ml_quality_score ON ml_data_quality_logs(overall_quality_score);
CREATE INDEX idx_ml_quality_prediction ON ml_data_quality_logs(prediction_id);
CREATE INDEX idx_ml_quality_low_scores ON ml_data_quality_logs(model_id, overall_quality_score) WHERE overall_quality_score < 70;

-- ----------------------------------------------------------------------------
-- ml_model_comparisons: Store model comparison results
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_model_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Models being compared
    model_ids UUID[] NOT NULL,

    -- Comparison results
    -- Format: {model1_id: {accuracy: 0.95, latency: 10}, model2_id: {...}}
    performance_comparison JSONB NOT NULL,

    -- Feature importance comparison
    -- Format: {feature1: {model1: 0.5, model2: 0.3}, ...}
    feature_importance_comparison JSONB,

    -- Error analysis
    -- Format: {model1_id: {error_types: {...}, distribution: {...}}, ...}
    error_analysis JSONB,

    -- Resource usage comparison
    resource_usage JSONB,

    -- Statistical significance tests
    -- Format: {accuracy: {p_value: 0.02, is_significant: true}, ...}
    statistical_significance JSONB,

    -- Winner determination
    winner_model_id UUID REFERENCES ml_models(id),
    winner_criteria VARCHAR(100),
    winner_confidence DECIMAL(5,4),

    -- Comparison metadata
    comparison_type VARCHAR(100) CHECK (comparison_type IN ('version', 'model_type', 'config', 'time_based', 'custom')),
    sample_size INTEGER,
    test_dataset_id UUID,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- Indexes for ml_model_comparisons
CREATE INDEX idx_ml_comp_models ON ml_model_comparisons USING GIN(model_ids);
CREATE INDEX idx_ml_comp_created ON ml_model_comparisons(created_at DESC);
CREATE INDEX idx_ml_comp_type ON ml_model_comparisons(comparison_type);
CREATE INDEX idx_ml_comp_winner ON ml_model_comparisons(winner_model_id);

-- ----------------------------------------------------------------------------
-- ml_feature_statistics: Track statistical properties of features
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_feature_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    feature_name VARCHAR(255) NOT NULL,
    feature_type VARCHAR(50) NOT NULL CHECK (feature_type IN ('numeric', 'categorical', 'boolean', 'text', 'timestamp')),

    -- Statistical measures (for numeric features)
    mean_value DECIMAL(12,6),
    std_value DECIMAL(12,6),
    min_value DECIMAL(12,6),
    max_value DECIMAL(12,6),
    median_value DECIMAL(12,6),

    -- Percentiles
    percentile_25 DECIMAL(12,6),
    percentile_50 DECIMAL(12,6),
    percentile_75 DECIMAL(12,6),
    percentile_95 DECIMAL(12,6),
    percentile_99 DECIMAL(12,6),

    -- Distribution metrics
    skewness DECIMAL(8,4),
    kurtosis DECIMAL(8,4),

    -- Importance
    global_importance DECIMAL(6,4),
    local_importance_avg DECIMAL(6,4),
    importance_rank INTEGER,

    -- Data quality
    null_percentage DECIMAL(5,2),
    outlier_percentage DECIMAL(5,2),
    unique_values_count INTEGER,

    -- Categorical statistics (if applicable)
    categorical_distribution JSONB,  -- {value1: count, value2: count}
    top_categories TEXT[],

    -- Correlation with target
    correlation_with_target DECIMAL(6,4),

    -- Temporal tracking
    updated_at TIMESTAMP DEFAULT NOW(),
    sample_count INTEGER NOT NULL,
    observation_window_hours INTEGER DEFAULT 24,

    UNIQUE(model_id, feature_name)
);

-- Indexes for ml_feature_statistics
CREATE INDEX idx_ml_feat_stats_model ON ml_feature_statistics(model_id);
CREATE INDEX idx_ml_feat_stats_importance ON ml_feature_statistics(global_importance DESC NULLS LAST);
CREATE INDEX idx_ml_feat_stats_updated ON ml_feature_statistics(updated_at DESC);
CREATE INDEX idx_ml_feat_stats_rank ON ml_feature_statistics(model_id, importance_rank);

-- ----------------------------------------------------------------------------
-- ml_alert_thresholds: Configurable alert thresholds
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES ml_models(id) ON DELETE CASCADE,

    -- Threshold definition
    metric_name VARCHAR(100) NOT NULL,
    operator VARCHAR(10) NOT NULL CHECK (operator IN ('<', '<=', '>', '>=', '=', '!=')),
    threshold_value DECIMAL(10,4) NOT NULL,

    -- Alert configuration
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    alert_message_template TEXT,

    -- Threshold behavior
    enabled BOOLEAN DEFAULT true,
    cooldown_minutes INTEGER DEFAULT 15,  -- Prevent alert spam

    -- Notification settings
    notify_channels TEXT[],  -- ['email', 'slack', 'pagerduty']

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),

    UNIQUE(model_id, metric_name)
);

-- Indexes for ml_alert_thresholds
CREATE INDEX idx_ml_thresholds_model ON ml_alert_thresholds(model_id);
CREATE INDEX idx_ml_thresholds_enabled ON ml_alert_thresholds(enabled) WHERE enabled = true;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ml_model_health_extended: Comprehensive model health view
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ml_model_health_extended AS
SELECT
    m.id,
    m.name,
    m.version,
    m.type,
    m.status,
    m.created_at,
    m.updated_at,

    -- Latest performance metrics
    (SELECT accuracy FROM ml_performance_logs
     WHERE model_id = m.id
     ORDER BY timestamp DESC LIMIT 1) as current_accuracy,

    (SELECT latency_p95 FROM ml_performance_logs
     WHERE model_id = m.id
     ORDER BY timestamp DESC LIMIT 1) as current_latency_p95,

    (SELECT predictions_per_second FROM ml_performance_logs
     WHERE model_id = m.id
     ORDER BY timestamp DESC LIMIT 1) as current_throughput,

    -- Average quality score (last hour)
    (SELECT AVG(overall_quality_score) FROM ml_data_quality_logs
     WHERE model_id = m.id
     AND created_at > NOW() - INTERVAL '1 hour') as avg_quality_score_1h,

    -- Active alerts
    (SELECT COUNT(*) FROM ml_performance_alerts
     WHERE model_id = m.id
     AND status = 'open') as active_alerts_count,

    (SELECT COUNT(*) FROM ml_performance_alerts
     WHERE model_id = m.id
     AND status = 'open'
     AND severity IN ('high', 'critical')) as critical_alerts_count,

    -- Explanation coverage (last 24h)
    (SELECT COUNT(*) FROM ml_explanations
     WHERE model_id = m.id
     AND created_at > NOW() - INTERVAL '1 day') as explanations_24h,

    -- Data quality issues (last 24h)
    (SELECT COUNT(*) FROM ml_data_quality_logs
     WHERE model_id = m.id
     AND overall_quality_score < 70
     AND created_at > NOW() - INTERVAL '1 day') as low_quality_samples_24h,

    -- Performance trend (comparing last hour to previous hour)
    (SELECT
        CASE
            WHEN prev.accuracy IS NULL THEN 'no_data'
            WHEN curr.accuracy > prev.accuracy + 0.01 THEN 'improving'
            WHEN curr.accuracy < prev.accuracy - 0.01 THEN 'degrading'
            ELSE 'stable'
        END
     FROM
        (SELECT AVG(accuracy) as accuracy FROM ml_performance_logs
         WHERE model_id = m.id
         AND timestamp > NOW() - INTERVAL '1 hour') curr,
        (SELECT AVG(accuracy) as accuracy FROM ml_performance_logs
         WHERE model_id = m.id
         AND timestamp BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '1 hour') prev
    ) as performance_trend,

    -- Overall health score (0-100)
    (SELECT
        LEAST(100, GREATEST(0,
            COALESCE((SELECT accuracy * 100 FROM ml_performance_logs
                      WHERE model_id = m.id
                      ORDER BY timestamp DESC LIMIT 1), 0) * 0.4 +
            COALESCE((SELECT AVG(overall_quality_score) FROM ml_data_quality_logs
                      WHERE model_id = m.id
                      AND created_at > NOW() - INTERVAL '1 hour'), 0) * 0.3 +
            (100 - COALESCE((SELECT COUNT(*) * 10 FROM ml_performance_alerts
                             WHERE model_id = m.id
                             AND status = 'open'), 0)) * 0.3
        ))
    ) as health_score

FROM ml_models m
WHERE m.status IN ('active', 'deployed');

-- ----------------------------------------------------------------------------
-- ml_performance_summary: Aggregated performance metrics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ml_performance_summary AS
SELECT
    model_id,

    -- Last 24 hours stats
    COUNT(*) as log_entries_24h,
    AVG(accuracy) as avg_accuracy_24h,
    STDDEV(accuracy) as stddev_accuracy_24h,
    AVG(latency_p95) as avg_latency_p95_24h,
    MAX(latency_p95) as max_latency_p95_24h,
    AVG(predictions_per_second) as avg_throughput_24h,
    AVG(error_rate) as avg_error_rate_24h,
    SUM(total_predictions) as total_predictions_24h

FROM ml_performance_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY model_id;

-- ----------------------------------------------------------------------------
-- ml_quality_summary: Aggregated quality metrics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ml_quality_summary AS
SELECT
    model_id,

    -- Last 24 hours stats
    COUNT(*) as validations_24h,
    AVG(overall_quality_score) as avg_quality_score_24h,
    MIN(overall_quality_score) as min_quality_score_24h,

    -- Issue counts
    SUM(ARRAY_LENGTH(missing_features, 1)) as total_missing_features_24h,
    SUM(ARRAY_LENGTH(outlier_features, 1)) as total_outlier_features_24h,
    SUM(ARRAY_LENGTH(invalid_features, 1)) as total_invalid_features_24h,

    -- Percentage with issues
    ROUND(100.0 * SUM(CASE WHEN overall_quality_score < 70 THEN 1 ELSE 0 END) / COUNT(*), 2) as low_quality_percentage

FROM ml_data_quality_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY model_id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ml_performance_alerts_updated_at
    BEFORE UPDATE ON ml_performance_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ml_alert_thresholds_updated_at
    BEFORE UPDATE ON ml_alert_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ml_feature_statistics_updated_at
    BEFORE UPDATE ON ml_feature_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to automatically create performance alerts based on thresholds
CREATE OR REPLACE FUNCTION check_performance_thresholds()
RETURNS TRIGGER AS $$
DECLARE
    threshold_record RECORD;
    threshold_violated BOOLEAN;
    deviation DECIMAL(6,2);
BEGIN
    -- Check all enabled thresholds for this model
    FOR threshold_record IN
        SELECT * FROM ml_alert_thresholds
        WHERE model_id = NEW.model_id
        AND enabled = true
    LOOP
        threshold_violated := false;

        -- Check if threshold is violated based on operator
        CASE threshold_record.metric_name
            WHEN 'accuracy' THEN
                threshold_violated :=
                    CASE threshold_record.operator
                        WHEN '<' THEN NEW.accuracy < threshold_record.threshold_value
                        WHEN '<=' THEN NEW.accuracy <= threshold_record.threshold_value
                        WHEN '>' THEN NEW.accuracy > threshold_record.threshold_value
                        WHEN '>=' THEN NEW.accuracy >= threshold_record.threshold_value
                        ELSE false
                    END;
                deviation := ABS((NEW.accuracy - threshold_record.threshold_value) / threshold_record.threshold_value * 100);

            WHEN 'latency_p95' THEN
                threshold_violated :=
                    CASE threshold_record.operator
                        WHEN '>' THEN NEW.latency_p95 > threshold_record.threshold_value
                        WHEN '>=' THEN NEW.latency_p95 >= threshold_record.threshold_value
                        ELSE false
                    END;
                deviation := ABS((NEW.latency_p95 - threshold_record.threshold_value) / threshold_record.threshold_value * 100);

            WHEN 'error_rate' THEN
                threshold_violated :=
                    CASE threshold_record.operator
                        WHEN '>' THEN NEW.error_rate > threshold_record.threshold_value
                        WHEN '>=' THEN NEW.error_rate >= threshold_record.threshold_value
                        ELSE false
                    END;
                deviation := ABS((NEW.error_rate - threshold_record.threshold_value) / threshold_record.threshold_value * 100);
        END CASE;

        -- Create alert if threshold violated
        IF threshold_violated THEN
            -- Check cooldown period to prevent alert spam
            IF NOT EXISTS (
                SELECT 1 FROM ml_performance_alerts
                WHERE model_id = NEW.model_id
                AND alert_type = threshold_record.metric_name || '_threshold'
                AND created_at > NOW() - (threshold_record.cooldown_minutes || ' minutes')::INTERVAL
            ) THEN
                INSERT INTO ml_performance_alerts (
                    model_id,
                    alert_type,
                    severity,
                    metric_name,
                    threshold_value,
                    actual_value,
                    deviation_percent,
                    message,
                    details
                ) VALUES (
                    NEW.model_id,
                    threshold_record.metric_name || '_threshold',
                    threshold_record.severity,
                    threshold_record.metric_name,
                    threshold_record.threshold_value,
                    CASE threshold_record.metric_name
                        WHEN 'accuracy' THEN NEW.accuracy
                        WHEN 'latency_p95' THEN NEW.latency_p95
                        WHEN 'error_rate' THEN NEW.error_rate
                    END,
                    deviation,
                    COALESCE(threshold_record.alert_message_template,
                            'Metric ' || threshold_record.metric_name || ' violated threshold'),
                    jsonb_build_object(
                        'performance_log_id', NEW.id,
                        'timestamp', NEW.timestamp
                    )
                );
            END IF;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_thresholds_on_performance_log
    AFTER INSERT ON ml_performance_logs
    FOR EACH ROW
    EXECUTE FUNCTION check_performance_thresholds();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default alert thresholds for new models
-- (This can be customized per deployment)

COMMENT ON TABLE ml_explanations IS 'Stores ML model prediction explanations using SHAP, LIME, and counterfactual methods';
COMMENT ON TABLE ml_performance_logs IS 'Time-series performance metrics for ML models';
COMMENT ON TABLE ml_performance_alerts IS 'Performance-based alerts and notifications';
COMMENT ON TABLE ml_data_quality_logs IS 'Data quality validation results and issues';
COMMENT ON TABLE ml_model_comparisons IS 'Side-by-side model comparison results';
COMMENT ON TABLE ml_feature_statistics IS 'Statistical properties and importance of features';
COMMENT ON TABLE ml_alert_thresholds IS 'Configurable thresholds for automatic alerting';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'ml_explanations',
        'ml_performance_logs',
        'ml_performance_alerts',
        'ml_data_quality_logs',
        'ml_model_comparisons',
        'ml_feature_statistics',
        'ml_alert_thresholds'
    );

    IF table_count = 7 THEN
        RAISE NOTICE 'Migration 002 completed successfully: 7 tables created';
    ELSE
        RAISE EXCEPTION 'Migration 002 failed: Expected 7 tables, found %', table_count;
    END IF;
END $$;
