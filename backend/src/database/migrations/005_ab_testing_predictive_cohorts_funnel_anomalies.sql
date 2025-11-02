/**
 * Database Migration: v3.9.0
 * A/B Testing, Predictive Cohorts, and Funnel Anomaly Detection
 *
 * This migration creates tables for:
 * 1. A/B Testing Framework
 * 2. Predictive Cohort Models
 * 3. Funnel Anomaly Detection
 * 4. Frontend Dashboard Support
 *
 * @version 3.9.0
 */

-- ============================================================================
-- 1. A/B TESTING FRAMEWORK
-- ============================================================================

-- Experiments table
CREATE TABLE IF NOT EXISTS ab_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hypothesis TEXT,

    -- Experiment configuration
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft', -- draft, running, paused, completed, archived

    -- Traffic allocation (percentage of total traffic to include in experiment)
    traffic_allocation DECIMAL(5,4) DEFAULT 1.0, -- 0.0 to 1.0 (0% to 100%)

    -- Targeting
    target_segments JSONB, -- Which user segments to include
    exclusion_criteria JSONB, -- Users to exclude

    -- Primary and secondary metrics
    primary_metric VARCHAR(255) NOT NULL,
    secondary_metrics JSONB, -- Additional metrics to track

    -- Statistical parameters
    confidence_level DECIMAL(5,4) DEFAULT 0.95, -- 95% confidence
    minimum_sample_size INTEGER DEFAULT 1000,
    minimum_detectable_effect DECIMAL(5,4) DEFAULT 0.05, -- 5% MDE

    -- Results
    winner_variant_id UUID,
    statistical_significance BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for experiments
CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON ab_experiments(status);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_dates ON ab_experiments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_created ON ab_experiments(created_at);

-- Experiment variants
CREATE TABLE IF NOT EXISTS ab_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL, -- control, variant_a, variant_b, etc.
    description TEXT,
    is_control BOOLEAN DEFAULT FALSE,

    -- Traffic allocation (must sum to 1.0 across all variants in an experiment)
    traffic_percentage DECIMAL(5,4) NOT NULL,

    -- Configuration (feature flags, parameters, etc.)
    configuration JSONB NOT NULL,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(experiment_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ab_variants_experiment ON ab_variants(experiment_id);

-- User assignments to variants
CREATE TABLE IF NOT EXISTS ab_user_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Track user context at assignment time
    user_segment VARCHAR(100),
    user_metadata JSONB,

    UNIQUE(experiment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_user ON ab_user_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment ON ab_user_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant ON ab_user_assignments(variant_id);

-- Experiment events
CREATE TABLE IF NOT EXISTS ab_experiment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    event_type VARCHAR(100) NOT NULL, -- impression, conversion, custom_event
    event_name VARCHAR(255),
    event_value DECIMAL(15,6), -- Numeric value (revenue, time, etc.)
    event_metadata JSONB,

    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ab_events_experiment ON ab_experiment_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_variant ON ab_experiment_events(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_user ON ab_experiment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_type ON ab_experiment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ab_events_timestamp ON ab_experiment_events(timestamp);

-- Experiment results (materialized/cached)
CREATE TABLE IF NOT EXISTS ab_experiment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_variants(id) ON DELETE CASCADE,

    -- Sample sizes
    total_users INTEGER DEFAULT 0,
    total_impressions INTEGER DEFAULT 0,
    total_conversions INTEGER DEFAULT 0,

    -- Metrics
    conversion_rate DECIMAL(10,6),
    average_value DECIMAL(15,6),
    total_value DECIMAL(15,6),

    -- Statistical analysis
    confidence_interval_lower DECIMAL(10,6),
    confidence_interval_upper DECIMAL(10,6),
    p_value DECIMAL(10,6),
    z_score DECIMAL(10,6),

    -- Compared to control
    lift_percentage DECIMAL(10,4), -- % improvement over control
    is_significant BOOLEAN DEFAULT FALSE,

    -- Metadata
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(experiment_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_results_experiment ON ab_experiment_results(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_results_calculated ON ab_experiment_results(calculated_at);

-- View for experiment summary
CREATE OR REPLACE VIEW ab_experiment_summary AS
SELECT
    e.id,
    e.name,
    e.description,
    e.status,
    e.start_date,
    e.end_date,
    e.primary_metric,
    COUNT(DISTINCT v.id) as variant_count,
    COUNT(DISTINCT ua.user_id) as total_users,
    e.statistical_significance,
    e.winner_variant_id,
    wv.name as winner_name,
    e.created_at
FROM ab_experiments e
LEFT JOIN ab_variants v ON v.experiment_id = e.id
LEFT JOIN ab_user_assignments ua ON ua.experiment_id = e.id
LEFT JOIN ab_variants wv ON wv.id = e.winner_variant_id
GROUP BY e.id, wv.name;

-- ============================================================================
-- 2. PREDICTIVE COHORT MODELS
-- ============================================================================

-- Predictive cohort models
CREATE TABLE IF NOT EXISTS predictive_cohort_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    target_cohort_id UUID, -- Can be NULL for general models

    -- Model configuration
    model_type VARCHAR(100) NOT NULL, -- logistic_regression, random_forest, neural_network, gradient_boosting
    features JSONB NOT NULL, -- Feature names and transformations
    hyperparameters JSONB,

    -- Performance metrics
    accuracy DECIMAL(5,4),
    precision_score DECIMAL(5,4),
    recall DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    auc_roc DECIMAL(5,4),

    -- Training metadata
    training_samples INTEGER,
    validation_samples INTEGER,
    test_samples INTEGER,
    trained_at TIMESTAMP,

    -- Model storage
    model_data BYTEA, -- Serialized model weights/parameters

    -- Status
    status VARCHAR(50) DEFAULT 'training', -- training, ready, retraining, failed, archived

    -- Version control
    version INTEGER DEFAULT 1,
    parent_model_id UUID, -- For tracking model lineage

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictive_models_status ON predictive_cohort_models(status);
CREATE INDEX IF NOT EXISTS idx_predictive_models_trained ON predictive_cohort_models(trained_at);
CREATE INDEX IF NOT EXISTS idx_predictive_models_target ON predictive_cohort_models(target_cohort_id);

-- Cohort predictions
CREATE TABLE IF NOT EXISTS cohort_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES predictive_cohort_models(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- Prediction
    predicted_cohort_id UUID, -- Can reference analytics_cohorts if exists
    probability DECIMAL(5,4) NOT NULL, -- 0.0 to 1.0
    confidence_score DECIMAL(5,4), -- Model confidence

    -- Feature values at prediction time
    feature_values JSONB,

    -- Verification (actual outcome)
    actual_cohort_id UUID,
    was_correct BOOLEAN,

    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cohort_predictions_user ON cohort_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_predictions_model ON cohort_predictions(model_id);
CREATE INDEX IF NOT EXISTS idx_cohort_predictions_predicted ON cohort_predictions(predicted_at);
CREATE INDEX IF NOT EXISTS idx_cohort_predictions_verified ON cohort_predictions(verified_at);

-- Cohort recommendations
CREATE TABLE IF NOT EXISTS cohort_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    -- Recommended cohorts (ordered by relevance)
    recommended_cohorts JSONB NOT NULL, -- [{ cohort_id, score, reason, probability }]

    -- Context
    based_on_features JSONB,
    model_ids UUID[], -- Models used for recommendations

    -- Metadata
    recommendation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP -- Recommendations can expire
);

CREATE INDEX IF NOT EXISTS idx_cohort_recs_user ON cohort_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_recs_date ON cohort_recommendations(recommendation_date);
CREATE INDEX IF NOT EXISTS idx_cohort_recs_expires ON cohort_recommendations(expires_at);

-- Feature importance tracking
CREATE TABLE IF NOT EXISTS cohort_feature_importance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES predictive_cohort_models(id) ON DELETE CASCADE,

    feature_name VARCHAR(255) NOT NULL,
    importance_score DECIMAL(10,6) NOT NULL,
    rank INTEGER,

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(model_id, feature_name)
);

CREATE INDEX IF NOT EXISTS idx_feature_importance_model ON cohort_feature_importance(model_id);
CREATE INDEX IF NOT EXISTS idx_feature_importance_score ON cohort_feature_importance(importance_score DESC);

-- ============================================================================
-- 3. FUNNEL ANOMALY DETECTION
-- ============================================================================

-- Funnel anomalies
CREATE TABLE IF NOT EXISTS funnel_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL, -- References analytics_funnels

    -- Anomaly details
    step_index INTEGER NOT NULL,
    step_name VARCHAR(255),

    -- Metrics
    expected_conversion_rate DECIMAL(10,6),
    actual_conversion_rate DECIMAL(10,6),
    deviation_percentage DECIMAL(10,4),

    -- Statistical measures
    z_score DECIMAL(10,4),
    p_value DECIMAL(10,6),
    is_significant BOOLEAN DEFAULT TRUE,

    -- Severity
    severity VARCHAR(50), -- low, medium, high, critical

    -- Time period
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,

    -- Root cause analysis
    potential_causes JSONB, -- [{ type, description, impact, confidence }]
    affected_segments JSONB, -- Segments most impacted

    -- Related metrics
    sample_size INTEGER,
    additional_metrics JSONB,

    -- Status
    status VARCHAR(50) DEFAULT 'detected', -- detected, investigating, resolved, false_positive, ignored
    resolved_at TIMESTAMP,
    resolved_by UUID,
    resolution_notes TEXT,

    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_funnel_anomalies_funnel ON funnel_anomalies(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_anomalies_detected ON funnel_anomalies(detected_at);
CREATE INDEX IF NOT EXISTS idx_funnel_anomalies_status ON funnel_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_funnel_anomalies_severity ON funnel_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_funnel_anomalies_period ON funnel_anomalies(period_start, period_end);

-- Funnel baselines (for comparison)
CREATE TABLE IF NOT EXISTS funnel_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL, -- References analytics_funnels
    step_index INTEGER NOT NULL,

    -- Baseline metrics (statistical baseline)
    baseline_conversion_rate DECIMAL(10,6),
    baseline_std_dev DECIMAL(10,6),
    baseline_mean DECIMAL(10,6),

    -- Control limits (for SPC charts)
    upper_control_limit DECIMAL(10,6),
    lower_control_limit DECIMAL(10,6),
    upper_warning_limit DECIMAL(10,6),
    lower_warning_limit DECIMAL(10,6),

    -- Sample statistics
    sample_count INTEGER,
    min_value DECIMAL(10,6),
    max_value DECIMAL(10,6),
    percentile_25 DECIMAL(10,6),
    percentile_50 DECIMAL(10,6),
    percentile_75 DECIMAL(10,6),
    percentile_95 DECIMAL(10,6),
    percentile_99 DECIMAL(10,6),

    -- Time range for baseline calculation
    period_days INTEGER DEFAULT 30,
    baseline_start_date TIMESTAMP,
    baseline_end_date TIMESTAMP,

    -- Metadata
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recalculation_scheduled_at TIMESTAMP,

    UNIQUE(funnel_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_funnel_baselines_funnel ON funnel_baselines(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_baselines_calculated ON funnel_baselines(calculated_at);

-- Funnel anomaly alerts (integration with custom alerting)
CREATE TABLE IF NOT EXISTS funnel_anomaly_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_id UUID NOT NULL REFERENCES funnel_anomalies(id) ON DELETE CASCADE,
    alert_rule_id UUID, -- Can reference custom_alert_rules if exists

    -- Alert details
    alert_sent BOOLEAN DEFAULT FALSE,
    alert_channels JSONB, -- [{ channel, status, timestamp }]

    -- Recipients
    recipients JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_funnel_anomaly_alerts_anomaly ON funnel_anomaly_alerts(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_funnel_anomaly_alerts_sent ON funnel_anomaly_alerts(alert_sent);

-- ============================================================================
-- 4. DASHBOARD & VISUALIZATION SUPPORT
-- ============================================================================

-- Dashboard configurations (user-specific)
CREATE TABLE IF NOT EXISTS user_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Dashboard layout
    layout JSONB NOT NULL, -- Widget positions, sizes, configurations

    -- Filters
    default_filters JSONB,

    -- Settings
    refresh_interval INTEGER DEFAULT 60, -- seconds
    is_default BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_dashboards_user ON user_dashboards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboards_public ON user_dashboards(is_public);

-- Saved chart configurations
CREATE TABLE IF NOT EXISTS saved_charts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    dashboard_id UUID REFERENCES user_dashboards(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    chart_type VARCHAR(100) NOT NULL, -- line, bar, funnel, heatmap, etc.

    -- Data configuration
    data_source VARCHAR(255) NOT NULL, -- cohorts, funnels, rfm, ensembles, etc.
    data_config JSONB NOT NULL, -- Query parameters, filters

    -- Visualization configuration
    viz_config JSONB NOT NULL, -- Colors, axes, legends, etc.

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_charts_user ON saved_charts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_charts_dashboard ON saved_charts(dashboard_id);

-- Dashboard access logs (for analytics on dashboard usage)
CREATE TABLE IF NOT EXISTS dashboard_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID REFERENCES user_dashboards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    access_type VARCHAR(50), -- view, edit, export
    duration_seconds INTEGER,
    interactions INTEGER,

    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboard_access_dashboard ON dashboard_access_logs(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_access_user ON dashboard_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_access_timestamp ON dashboard_access_logs(accessed_at);

-- ============================================================================
-- 5. VIEWS FOR ANALYTICS
-- ============================================================================

-- Active experiments view
CREATE OR REPLACE VIEW active_experiments AS
SELECT
    e.id,
    e.name,
    e.status,
    e.start_date,
    COUNT(DISTINCT v.id) as variant_count,
    COUNT(DISTINCT ua.user_id) as assigned_users,
    COUNT(DISTINCT ae.id) as total_events,
    MAX(ae.timestamp) as last_event_at
FROM ab_experiments e
LEFT JOIN ab_variants v ON v.experiment_id = e.id
LEFT JOIN ab_user_assignments ua ON ua.experiment_id = e.id
LEFT JOIN ab_experiment_events ae ON ae.experiment_id = e.id
WHERE e.status IN ('running', 'paused')
GROUP BY e.id;

-- Recent funnel anomalies view
CREATE OR REPLACE VIEW recent_funnel_anomalies AS
SELECT
    fa.id,
    fa.funnel_id,
    fa.step_name,
    fa.severity,
    fa.status,
    fa.deviation_percentage,
    fa.detected_at,
    COALESCE(
        (SELECT COUNT(*) FROM funnel_anomaly_alerts WHERE anomaly_id = fa.id AND alert_sent = TRUE),
        0
    ) as alerts_sent
FROM funnel_anomalies fa
WHERE fa.detected_at >= NOW() - INTERVAL '7 days'
ORDER BY fa.detected_at DESC;

-- Model performance summary view
CREATE OR REPLACE VIEW predictive_model_summary AS
SELECT
    m.id,
    m.name,
    m.model_type,
    m.status,
    m.accuracy,
    m.f1_score,
    m.auc_roc,
    m.training_samples,
    m.trained_at,
    COUNT(DISTINCT p.id) as total_predictions,
    COUNT(DISTINCT CASE WHEN p.was_correct = TRUE THEN p.id END) as correct_predictions,
    CASE
        WHEN COUNT(DISTINCT CASE WHEN p.verified_at IS NOT NULL THEN p.id END) > 0
        THEN COUNT(DISTINCT CASE WHEN p.was_correct = TRUE THEN p.id END)::DECIMAL /
             COUNT(DISTINCT CASE WHEN p.verified_at IS NOT NULL THEN p.id END)::DECIMAL
        ELSE NULL
    END as production_accuracy
FROM predictive_cohort_models m
LEFT JOIN cohort_predictions p ON p.model_id = m.id
GROUP BY m.id;

-- ============================================================================
-- 6. FUNCTIONS FOR COMMON OPERATIONS
-- ============================================================================

-- Function to calculate experiment result statistics
CREATE OR REPLACE FUNCTION calculate_experiment_statistics(
    p_experiment_id UUID,
    p_variant_id UUID
)
RETURNS TABLE (
    total_users BIGINT,
    total_impressions BIGINT,
    total_conversions BIGINT,
    conversion_rate NUMERIC,
    average_value NUMERIC,
    total_value NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT ua.user_id)::BIGINT as total_users,
        COUNT(DISTINCT CASE WHEN ae.event_type = 'impression' THEN ae.id END)::BIGINT as total_impressions,
        COUNT(DISTINCT CASE WHEN ae.event_type = 'conversion' THEN ae.id END)::BIGINT as total_conversions,
        CASE
            WHEN COUNT(DISTINCT CASE WHEN ae.event_type = 'impression' THEN ae.id END) > 0
            THEN COUNT(DISTINCT CASE WHEN ae.event_type = 'conversion' THEN ae.id END)::NUMERIC /
                 COUNT(DISTINCT CASE WHEN ae.event_type = 'impression' THEN ae.id END)::NUMERIC
            ELSE 0
        END as conversion_rate,
        AVG(CASE WHEN ae.event_type = 'conversion' THEN ae.event_value END) as average_value,
        SUM(CASE WHEN ae.event_type = 'conversion' THEN ae.event_value ELSE 0 END) as total_value
    FROM ab_user_assignments ua
    LEFT JOIN ab_experiment_events ae ON ae.user_id = ua.user_id AND ae.variant_id = ua.variant_id
    WHERE ua.experiment_id = p_experiment_id
      AND ua.variant_id = p_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to detect if current funnel metric is anomalous
CREATE OR REPLACE FUNCTION is_funnel_metric_anomalous(
    p_funnel_id UUID,
    p_step_index INTEGER,
    p_conversion_rate NUMERIC
)
RETURNS TABLE (
    is_anomalous BOOLEAN,
    z_score NUMERIC,
    severity VARCHAR
) AS $$
DECLARE
    v_baseline_rate NUMERIC;
    v_baseline_std NUMERIC;
    v_z_score NUMERIC;
    v_is_anomalous BOOLEAN;
    v_severity VARCHAR;
BEGIN
    -- Get baseline metrics
    SELECT baseline_conversion_rate, baseline_std_dev
    INTO v_baseline_rate, v_baseline_std
    FROM funnel_baselines
    WHERE funnel_id = p_funnel_id AND step_index = p_step_index;

    -- If no baseline, cannot determine
    IF v_baseline_rate IS NULL THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, 'unknown'::VARCHAR;
        RETURN;
    END IF;

    -- Calculate z-score
    IF v_baseline_std > 0 THEN
        v_z_score := (p_conversion_rate - v_baseline_rate) / v_baseline_std;
    ELSE
        v_z_score := 0;
    END IF;

    -- Determine if anomalous (|z| > 3 is typically considered anomalous)
    v_is_anomalous := ABS(v_z_score) > 3;

    -- Determine severity
    IF ABS(v_z_score) > 5 THEN
        v_severity := 'critical';
    ELSIF ABS(v_z_score) > 4 THEN
        v_severity := 'high';
    ELSIF ABS(v_z_score) > 3 THEN
        v_severity := 'medium';
    ELSE
        v_severity := 'low';
    END IF;

    RETURN QUERY SELECT v_is_anomalous, v_z_score, v_severity;
END;
$$ LANGUAGE plpgsql;

-- Function to get top cohort recommendations for a user
CREATE OR REPLACE FUNCTION get_cohort_recommendations_for_user(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    cohort_id UUID,
    score NUMERIC,
    reason TEXT,
    probability NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (rec->>'cohort_id')::UUID as cohort_id,
        (rec->>'score')::NUMERIC as score,
        rec->>'reason' as reason,
        (rec->>'probability')::NUMERIC as probability
    FROM cohort_recommendations cr,
         jsonb_array_elements(cr.recommended_cohorts) as rec
    WHERE cr.user_id = p_user_id
      AND (cr.expires_at IS NULL OR cr.expires_at > NOW())
    ORDER BY cr.recommendation_date DESC, (rec->>'score')::NUMERIC DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old experiment data (for archiving)
CREATE OR REPLACE FUNCTION archive_old_experiments(
    p_days_old INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    v_archived_count INTEGER;
BEGIN
    UPDATE ab_experiments
    SET status = 'archived'
    WHERE status = 'completed'
      AND end_date < NOW() - (p_days_old || ' days')::INTERVAL
      AND status != 'archived';

    GET DIAGNOSTICS v_archived_count = ROW_COUNT;

    RETURN v_archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. INITIAL DATA / SEED DATA
-- ============================================================================

-- No seed data required for v3.9.0
-- Tables will be populated through application usage

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 005 (v3.9.0) completed successfully';
    RAISE NOTICE 'Created 12 new tables for A/B testing, predictive cohorts, and funnel anomaly detection';
    RAISE NOTICE 'Created 4 views for analytics and reporting';
    RAISE NOTICE 'Created 5 functions for common operations';
END $$;
