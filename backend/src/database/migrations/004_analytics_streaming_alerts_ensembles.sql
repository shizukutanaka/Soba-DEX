-- Migration: 004_analytics_streaming_alerts_ensembles.sql
-- Version: 3.8.0
-- Description: Advanced Analytics, Real-time Streaming, Custom Alerting, and Model Ensembles
-- Date: 2025-10-19

BEGIN;

-- ============================================================================
-- Advanced Analytics Tables
-- ============================================================================

-- Cohorts table
CREATE TABLE IF NOT EXISTS analytics_cohorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Cohort definition
    cohort_type VARCHAR(100) NOT NULL, -- 'signup_date', 'behavioral', 'value_based', 'engagement'
    definition JSONB NOT NULL,

    -- Cohort size
    user_count INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_analytics_cohort_type ON analytics_cohorts(cohort_type);
CREATE INDEX idx_analytics_cohort_created ON analytics_cohorts(created_at DESC);

-- Cohort metrics table
CREATE TABLE IF NOT EXISTS analytics_cohort_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_id UUID REFERENCES analytics_cohorts(id) ON DELETE CASCADE,

    -- Time period
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type VARCHAR(50), -- 'daily', 'weekly', 'monthly'

    -- Retention metrics
    active_users INTEGER DEFAULT 0,
    retention_rate DECIMAL(5,4),

    -- Revenue metrics
    total_revenue DECIMAL(18,2) DEFAULT 0,
    avg_revenue_per_user DECIMAL(18,2) DEFAULT 0,

    -- Engagement metrics
    avg_sessions_per_user DECIMAL(8,2) DEFAULT 0,
    avg_actions_per_user DECIMAL(8,2) DEFAULT 0,
    avg_session_duration_seconds INTEGER DEFAULT 0,

    -- Conversion metrics
    conversion_rate DECIMAL(5,4),
    conversions_total INTEGER DEFAULT 0,

    -- Calculated at
    calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cohort_metrics_cohort ON analytics_cohort_metrics(cohort_id);
CREATE INDEX idx_cohort_metrics_period ON analytics_cohort_metrics(period_start DESC, period_end DESC);
CREATE INDEX idx_cohort_metrics_type ON analytics_cohort_metrics(period_type);

-- Funnels table
CREATE TABLE IF NOT EXISTS analytics_funnels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Funnel steps (array of step definitions)
    steps JSONB NOT NULL,
    -- Example: [
    --   { "step": 1, "name": "Visit", "event": "page_view" },
    --   { "step": 2, "name": "Connect Wallet", "event": "wallet_connected" },
    --   { "step": 3, "name": "Swap", "event": "swap_completed" }
    -- ]

    -- Funnel configuration
    time_window_hours INTEGER DEFAULT 24,
    conversion_window_hours INTEGER DEFAULT 168, -- 7 days

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'archived'

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_analytics_funnel_status ON analytics_funnels(status);
CREATE INDEX idx_analytics_funnel_created ON analytics_funnels(created_at DESC);

-- Funnel metrics table
CREATE TABLE IF NOT EXISTS analytics_funnel_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID REFERENCES analytics_funnels(id) ON DELETE CASCADE,

    -- Time period
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,

    -- Step metrics (JSONB array)
    step_metrics JSONB NOT NULL,
    -- Example: [
    --   { "step": 1, "entered": 1000, "completed": 800, "conversion": 0.8, "avg_time_seconds": 5 },
    --   { "step": 2, "entered": 800, "completed": 600, "conversion": 0.75, "avg_time_seconds": 30 },
    --   { "step": 3, "entered": 600, "completed": 450, "conversion": 0.75, "avg_time_seconds": 60 }
    -- ]

    -- Overall metrics
    total_entered INTEGER NOT NULL,
    total_completed INTEGER NOT NULL,
    overall_conversion DECIMAL(5,4),
    avg_completion_time_seconds INTEGER,

    -- Drop-off analysis
    biggest_dropoff_step INTEGER,
    biggest_dropoff_rate DECIMAL(5,4),

    -- Calculated at
    calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_funnel_metrics_funnel ON analytics_funnel_metrics(funnel_id);
CREATE INDEX idx_funnel_metrics_period ON analytics_funnel_metrics(period_start DESC);

-- User segments table
CREATE TABLE IF NOT EXISTS analytics_user_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,

    -- Segment type
    segment_type VARCHAR(100) NOT NULL, -- 'rfm', 'behavioral', 'value', 'risk'
    segment_name VARCHAR(255) NOT NULL,

    -- Segment scores
    recency_score INTEGER, -- 1-5
    frequency_score INTEGER, -- 1-5
    monetary_score INTEGER, -- 1-5

    -- Risk metrics
    churn_probability DECIMAL(5,4),
    ltv_prediction DECIMAL(18,2),

    -- Calculated at
    calculated_at TIMESTAMP DEFAULT NOW(),
    valid_until TIMESTAMP
);

CREATE INDEX idx_user_segment_user ON analytics_user_segments(user_id);
CREATE INDEX idx_user_segment_type ON analytics_user_segments(segment_type);
CREATE INDEX idx_user_segment_name ON analytics_user_segments(segment_name);
CREATE INDEX idx_user_segment_calculated ON analytics_user_segments(calculated_at DESC);

-- ============================================================================
-- Real-time Streaming Tables
-- ============================================================================

-- Streaming subscriptions table
CREATE TABLE IF NOT EXISTS streaming_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),

    -- Subscription details
    channel VARCHAR(255) NOT NULL,
    filters JSONB,

    -- Connection info
    connected_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,

    -- Rate limiting
    rate_limit INTEGER DEFAULT 100, -- messages per second
    messages_sent_last_second INTEGER DEFAULT 0,
    last_rate_reset TIMESTAMP DEFAULT NOW(),

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'disconnected', 'rate_limited'

    -- Metadata
    user_agent TEXT,
    ip_address VARCHAR(50)
);

CREATE INDEX idx_streaming_conn ON streaming_subscriptions(connection_id);
CREATE INDEX idx_streaming_channel ON streaming_subscriptions(channel);
CREATE INDEX idx_streaming_user ON streaming_subscriptions(user_id);
CREATE INDEX idx_streaming_status ON streaming_subscriptions(status);

-- Streaming messages log table (for debugging/analytics)
CREATE TABLE IF NOT EXISTS streaming_messages_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id VARCHAR(255) NOT NULL,
    channel VARCHAR(255) NOT NULL,

    -- Message details
    message_type VARCHAR(100),
    payload JSONB,
    payload_size INTEGER, -- bytes

    -- Timing
    sent_at TIMESTAMP DEFAULT NOW(),
    delivery_latency_ms INTEGER,

    -- Status
    status VARCHAR(50) DEFAULT 'sent' -- 'sent', 'failed', 'dropped'
);

CREATE INDEX idx_streaming_log_conn ON streaming_messages_log(connection_id);
CREATE INDEX idx_streaming_log_channel ON streaming_messages_log(channel);
CREATE INDEX idx_streaming_log_sent ON streaming_messages_log(sent_at DESC);

-- Streaming channels configuration
CREATE TABLE IF NOT EXISTS streaming_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,

    -- Channel configuration
    rate_limit INTEGER DEFAULT 100, -- messages per second per subscriber
    max_subscribers INTEGER DEFAULT 10000,
    message_ttl_seconds INTEGER DEFAULT 60,

    -- Access control
    public BOOLEAN DEFAULT false,
    allowed_roles VARCHAR(100)[],

    -- Status
    enabled BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    subscriber_count INTEGER DEFAULT 0
);

CREATE INDEX idx_streaming_channel_enabled ON streaming_channels(enabled);

-- ============================================================================
-- Custom Alerting Tables
-- ============================================================================

-- Custom alert rules table
CREATE TABLE IF NOT EXISTS custom_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rule definition
    condition JSONB NOT NULL,
    -- Example: {
    --   "metric": "model.accuracy",
    --   "operator": "less_than",
    --   "threshold": 0.85,
    --   "window": "5m",
    --   "aggregation": "avg"
    -- }

    severity VARCHAR(50) NOT NULL, -- 'info', 'warning', 'critical'

    -- Actions to take when triggered
    actions JSONB NOT NULL,
    -- Example: [
    --   { "type": "notify", "channel": "slack", "target": "#ml-alerts" },
    --   { "type": "webhook", "url": "https://..." },
    --   { "type": "email", "recipients": ["team@example.com"] }
    -- ]

    -- Evaluation configuration
    evaluation_interval INTEGER DEFAULT 60, -- seconds
    consecutive_failures INTEGER DEFAULT 1, -- trigger after N consecutive failures
    enabled BOOLEAN DEFAULT true,

    -- Deduplication
    dedup_window_seconds INTEGER DEFAULT 300,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    last_evaluated_at TIMESTAMP,
    evaluation_count INTEGER DEFAULT 0
);

CREATE INDEX idx_alert_rules_enabled ON custom_alert_rules(enabled);
CREATE INDEX idx_alert_rules_severity ON custom_alert_rules(severity);
CREATE INDEX idx_alert_rules_created_by ON custom_alert_rules(created_by);

-- Custom alert history table
CREATE TABLE IF NOT EXISTS custom_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES custom_alert_rules(id) ON DELETE CASCADE,

    -- Alert details
    triggered_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'triggered', -- 'triggered', 'acknowledged', 'resolved', 'auto_resolved'

    -- Context
    trigger_value JSONB,
    condition_met BOOLEAN DEFAULT true,
    evaluation_context JSONB,

    -- Actions taken
    actions_executed JSONB,
    actions_failed JSONB,

    -- Resolution
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    auto_resolved BOOLEAN DEFAULT false,

    -- Metrics
    duration_seconds INTEGER
);

CREATE INDEX idx_alert_history_rule ON custom_alert_history(rule_id);
CREATE INDEX idx_alert_history_triggered ON custom_alert_history(triggered_at DESC);
CREATE INDEX idx_alert_history_status ON custom_alert_history(status);
CREATE INDEX idx_alert_history_resolved ON custom_alert_history(resolved_at DESC);

-- Alert escalation policies table
CREATE TABLE IF NOT EXISTS alert_escalation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Escalation steps (JSONB array)
    steps JSONB NOT NULL,
    -- Example: [
    --   { "delay_minutes": 0, "notify": ["oncall-primary"] },
    --   { "delay_minutes": 15, "notify": ["oncall-secondary", "manager"] },
    --   { "delay_minutes": 30, "notify": ["director"] }
    -- ]

    -- Assignment
    rule_ids UUID[],

    -- Status
    enabled BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_escalation_enabled ON alert_escalation_policies(enabled);

-- ============================================================================
-- Model Ensemble Tables
-- ============================================================================

-- ML ensembles table
CREATE TABLE IF NOT EXISTS ml_ensembles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,

    -- Ensemble configuration
    ensemble_type VARCHAR(100) NOT NULL, -- 'voting', 'weighted_voting', 'stacking', 'boosting', 'dynamic'
    strategy JSONB NOT NULL,
    -- Example for weighted_voting: {
    --   "aggregation": "weighted_average",
    --   "weights": [0.4, 0.35, 0.25],
    --   "fallback": "best_model"
    -- }

    -- Member models
    model_ids UUID[] NOT NULL,
    model_weights DECIMAL(5,4)[],

    -- Meta-learner (for stacking)
    meta_learner_id UUID,
    meta_learner_config JSONB,

    -- Performance metrics
    accuracy DECIMAL(5,4),
    precision DECIMAL(5,4),
    recall DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    latency_p50_ms INTEGER,
    latency_p95_ms INTEGER,
    latency_p99_ms INTEGER,

    -- Optimization
    last_optimized_at TIMESTAMP,
    optimization_metric VARCHAR(100) DEFAULT 'accuracy',

    -- Status
    status VARCHAR(50) DEFAULT 'training', -- 'training', 'active', 'retired'
    version INTEGER DEFAULT 1,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deployed_at TIMESTAMP,
    retired_at TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX idx_ml_ensemble_status ON ml_ensembles(status);
CREATE INDEX idx_ml_ensemble_type ON ml_ensembles(ensemble_type);
CREATE INDEX idx_ml_ensemble_created ON ml_ensembles(created_at DESC);

-- ML ensemble predictions table
CREATE TABLE IF NOT EXISTS ml_ensemble_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ensemble_id UUID REFERENCES ml_ensembles(id) ON DELETE CASCADE,

    -- Input
    input_data JSONB NOT NULL,
    input_hash VARCHAR(64), -- SHA256 hash for deduplication

    -- Individual model predictions
    model_predictions JSONB NOT NULL,
    -- Example: [
    --   { "model_id": "model_1", "prediction": 0.8, "confidence": 0.92 },
    --   { "model_id": "model_2", "prediction": 0.75, "confidence": 0.88 }
    -- ]

    -- Ensemble result
    ensemble_prediction JSONB NOT NULL,
    prediction_value DECIMAL(10,6),
    confidence DECIMAL(5,4),

    -- Disagreement metrics
    prediction_variance DECIMAL(10,6),
    model_agreement_score DECIMAL(5,4),

    -- Performance
    latency_ms INTEGER,
    models_used INTEGER,

    -- Actual result (for evaluation)
    actual_result JSONB,
    actual_value DECIMAL(10,6),
    error DECIMAL(10,6),
    correct BOOLEAN,

    -- Metadata
    predicted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ensemble_pred_ensemble ON ml_ensemble_predictions(ensemble_id);
CREATE INDEX idx_ensemble_pred_at ON ml_ensemble_predictions(predicted_at DESC);
CREATE INDEX idx_ensemble_pred_hash ON ml_ensemble_predictions(input_hash);

-- Ensemble performance tracking table
CREATE TABLE IF NOT EXISTS ml_ensemble_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ensemble_id UUID REFERENCES ml_ensembles(id) ON DELETE CASCADE,

    -- Time window
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,

    -- Prediction metrics
    predictions_total INTEGER DEFAULT 0,
    predictions_correct INTEGER DEFAULT 0,
    accuracy DECIMAL(5,4),

    -- Performance metrics
    avg_latency_ms INTEGER,
    p95_latency_ms INTEGER,
    avg_confidence DECIMAL(5,4),

    -- Model contribution
    model_contributions JSONB,
    -- Example: [
    --   { "model_id": "model_1", "weight": 0.4, "individual_accuracy": 0.92 },
    --   { "model_id": "model_2", "weight": 0.35, "individual_accuracy": 0.89 }
    -- ]

    -- Calculated at
    calculated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ensemble_perf_ensemble ON ml_ensemble_performance(ensemble_id);
CREATE INDEX idx_ensemble_perf_window ON ml_ensemble_performance(window_start DESC);

-- ============================================================================
-- Views
-- ============================================================================

-- Active alerts view
CREATE OR REPLACE VIEW v_active_alerts AS
SELECT
    h.id,
    h.rule_id,
    r.name AS rule_name,
    r.severity,
    h.triggered_at,
    h.status,
    h.trigger_value,
    EXTRACT(EPOCH FROM (NOW() - h.triggered_at))::INTEGER AS duration_seconds
FROM custom_alert_history h
JOIN custom_alert_rules r ON r.id = h.rule_id
WHERE h.status IN ('triggered', 'acknowledged')
ORDER BY h.triggered_at DESC;

-- Cohort retention summary view
CREATE OR REPLACE VIEW v_cohort_retention_summary AS
SELECT
    c.id AS cohort_id,
    c.name AS cohort_name,
    c.cohort_type,
    c.user_count,
    AVG(m.retention_rate) AS avg_retention_rate,
    AVG(m.avg_revenue_per_user) AS avg_revenue_per_user,
    COUNT(m.id) AS metric_periods
FROM analytics_cohorts c
LEFT JOIN analytics_cohort_metrics m ON m.cohort_id = c.id
GROUP BY c.id, c.name, c.cohort_type, c.user_count;

-- Funnel conversion summary view
CREATE OR REPLACE VIEW v_funnel_conversion_summary AS
SELECT
    f.id AS funnel_id,
    f.name AS funnel_name,
    f.status,
    AVG(m.overall_conversion) AS avg_conversion_rate,
    AVG(m.total_entered) AS avg_entries,
    AVG(m.total_completed) AS avg_completions,
    COUNT(m.id) AS metric_periods
FROM analytics_funnels f
LEFT JOIN analytics_funnel_metrics m ON m.funnel_id = f.id
GROUP BY f.id, f.name, f.status;

-- Ensemble performance summary view
CREATE OR REPLACE VIEW v_ensemble_performance_summary AS
SELECT
    e.id AS ensemble_id,
    e.name AS ensemble_name,
    e.ensemble_type,
    e.status,
    e.accuracy,
    e.latency_p95_ms,
    ARRAY_LENGTH(e.model_ids, 1) AS model_count,
    p.predictions_total,
    p.accuracy AS recent_accuracy
FROM ml_ensembles e
LEFT JOIN LATERAL (
    SELECT
        predictions_total,
        accuracy
    FROM ml_ensemble_performance
    WHERE ensemble_id = e.id
    ORDER BY window_start DESC
    LIMIT 1
) p ON true;

-- Streaming channel statistics view
CREATE OR REPLACE VIEW v_streaming_channel_stats AS
SELECT
    ch.id AS channel_id,
    ch.name AS channel_name,
    ch.enabled,
    COUNT(s.id) AS active_subscribers,
    SUM(s.message_count) AS total_messages_sent,
    AVG(s.message_count) AS avg_messages_per_subscriber
FROM streaming_channels ch
LEFT JOIN streaming_subscriptions s ON s.channel = ch.name AND s.status = 'active'
GROUP BY ch.id, ch.name, ch.enabled;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update cohort metrics
CREATE OR REPLACE FUNCTION update_cohort_metrics(
    p_cohort_id UUID,
    p_period_start TIMESTAMP,
    p_period_end TIMESTAMP
) RETURNS void AS $$
BEGIN
    -- This is a placeholder function
    -- In production, this would calculate actual retention and engagement metrics
    -- based on the cohort definition and user event data

    INSERT INTO analytics_cohort_metrics (
        cohort_id,
        period_start,
        period_end,
        calculated_at
    ) VALUES (
        p_cohort_id,
        p_period_start,
        p_period_end,
        NOW()
    )
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate funnel metrics
CREATE OR REPLACE FUNCTION calculate_funnel_metrics(
    p_funnel_id UUID,
    p_period_start TIMESTAMP,
    p_period_end TIMESTAMP
) RETURNS void AS $$
BEGIN
    -- Placeholder function for funnel metrics calculation
    -- Would analyze user events to calculate step-by-step conversion

    INSERT INTO analytics_funnel_metrics (
        funnel_id,
        period_start,
        period_end,
        step_metrics,
        total_entered,
        total_completed,
        calculated_at
    ) VALUES (
        p_funnel_id,
        p_period_start,
        p_period_end,
        '[]'::JSONB,
        0,
        0,
        NOW()
    )
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old streaming logs
CREATE OR REPLACE FUNCTION cleanup_streaming_logs() RETURNS void AS $$
BEGIN
    DELETE FROM streaming_messages_log
    WHERE sent_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to auto-resolve stale alerts
CREATE OR REPLACE FUNCTION auto_resolve_stale_alerts() RETURNS void AS $$
BEGIN
    UPDATE custom_alert_history
    SET
        status = 'auto_resolved',
        resolved_at = NOW(),
        auto_resolved = true,
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - triggered_at))::INTEGER
    WHERE status IN ('triggered', 'acknowledged')
    AND triggered_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to update ensemble performance
CREATE OR REPLACE FUNCTION update_ensemble_performance(
    p_ensemble_id UUID,
    p_window_start TIMESTAMP,
    p_window_end TIMESTAMP
) RETURNS void AS $$
DECLARE
    v_total INTEGER;
    v_correct INTEGER;
    v_accuracy DECIMAL(5,4);
    v_avg_latency INTEGER;
    v_p95_latency INTEGER;
BEGIN
    -- Calculate metrics from predictions
    SELECT
        COUNT(*),
        SUM(CASE WHEN correct THEN 1 ELSE 0 END),
        AVG(latency_ms)::INTEGER,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::INTEGER
    INTO v_total, v_correct, v_avg_latency, v_p95_latency
    FROM ml_ensemble_predictions
    WHERE ensemble_id = p_ensemble_id
    AND predicted_at BETWEEN p_window_start AND p_window_end
    AND actual_value IS NOT NULL;

    IF v_total > 0 THEN
        v_accuracy := v_correct::DECIMAL / v_total;

        INSERT INTO ml_ensemble_performance (
            ensemble_id,
            window_start,
            window_end,
            predictions_total,
            predictions_correct,
            accuracy,
            avg_latency_ms,
            p95_latency_ms,
            calculated_at
        ) VALUES (
            p_ensemble_id,
            p_window_start,
            p_window_end,
            v_total,
            v_correct,
            v_accuracy,
            v_avg_latency,
            v_p95_latency,
            NOW()
        )
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger to update cohort updated_at
CREATE OR REPLACE FUNCTION update_cohort_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cohort_updated
    BEFORE UPDATE ON analytics_cohorts
    FOR EACH ROW
    EXECUTE FUNCTION update_cohort_timestamp();

-- Trigger to update funnel updated_at
CREATE OR REPLACE FUNCTION update_funnel_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_funnel_updated
    BEFORE UPDATE ON analytics_funnels
    FOR EACH ROW
    EXECUTE FUNCTION update_funnel_timestamp();

-- Trigger to update alert rule updated_at
CREATE OR REPLACE FUNCTION update_alert_rule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_alert_rule_updated
    BEFORE UPDATE ON custom_alert_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_rule_timestamp();

-- Trigger to update ensemble updated_at
CREATE OR REPLACE FUNCTION update_ensemble_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensemble_updated
    BEFORE UPDATE ON ml_ensembles
    FOR EACH ROW
    EXECUTE FUNCTION update_ensemble_timestamp();

-- ============================================================================
-- Indexes for Performance Optimization
-- ============================================================================

-- Additional composite indexes
CREATE INDEX idx_cohort_metrics_cohort_period ON analytics_cohort_metrics(cohort_id, period_start DESC);
CREATE INDEX idx_funnel_metrics_funnel_period ON analytics_funnel_metrics(funnel_id, period_start DESC);
CREATE INDEX idx_alert_history_rule_status ON custom_alert_history(rule_id, status);
CREATE INDEX idx_ensemble_pred_ensemble_at ON ml_ensemble_predictions(ensemble_id, predicted_at DESC);

-- GIN indexes for JSONB columns
CREATE INDEX idx_cohort_definition_gin ON analytics_cohorts USING GIN (definition);
CREATE INDEX idx_funnel_steps_gin ON analytics_funnels USING GIN (steps);
CREATE INDEX idx_alert_condition_gin ON custom_alert_rules USING GIN (condition);
CREATE INDEX idx_ensemble_strategy_gin ON ml_ensembles USING GIN (strategy);

-- Partial indexes for active records
CREATE INDEX idx_active_funnels ON analytics_funnels(id) WHERE status = 'active';
CREATE INDEX idx_enabled_alert_rules ON custom_alert_rules(id) WHERE enabled = true;
CREATE INDEX idx_active_ensembles ON ml_ensembles(id) WHERE status = 'active';
CREATE INDEX idx_enabled_channels ON streaming_channels(id) WHERE enabled = true;

COMMIT;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Summary:
-- - 15 new tables created
-- - 4 views for data aggregation
-- - 5 functions for automation and maintenance
-- - 4 triggers for timestamp updates
-- - 30+ indexes for query optimization
-- - Comprehensive schema for v3.8.0 features
