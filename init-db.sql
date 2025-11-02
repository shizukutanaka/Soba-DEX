-- ============================================================================
-- DEX Security Monitoring System - Database Initialization
-- PostgreSQL + TimescaleDB schema and optimization
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ============================================================================
-- Security Events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS security_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'MEDIUM',
    ip VARCHAR(45),
    url TEXT,
    user_agent TEXT,
    timestamp BIGINT NOT NULL,
    risk_score INTEGER DEFAULT 0,
    threat_level VARCHAR(20) DEFAULT 'LOW',
    blocked BOOLEAN DEFAULT FALSE,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create hypertable for time-series data
SELECT create_hypertable('security_events', 'timestamp',
    chunk_time_interval => 86400000,
    if_not_exists => TRUE);

-- Indexes for security_events
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_ip ON security_events(ip);
CREATE INDEX IF NOT EXISTS idx_events_type ON security_events(type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_threat_level ON security_events(threat_level);
CREATE INDEX IF NOT EXISTS idx_events_blocked ON security_events(blocked);
CREATE INDEX IF NOT EXISTS idx_events_details ON security_events USING GIN(details);
CREATE INDEX IF NOT EXISTS idx_events_composite ON security_events(ip, type, timestamp DESC);

-- ============================================================================
-- Incidents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(255) PRIMARY KEY,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    title VARCHAR(500),
    description TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    resolved_at BIGINT,
    assigned_to VARCHAR(255),
    tags JSONB,
    metadata JSONB
);

-- Indexes for incidents
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_tags ON incidents USING GIN(tags);

-- ============================================================================
-- Threat Intelligence Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS threat_intelligence (
    id SERIAL PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    domain VARCHAR(255),
    hash VARCHAR(255),
    source VARCHAR(100) NOT NULL,
    threat_type VARCHAR(100),
    confidence_score INTEGER,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    UNIQUE(ip, source)
);

-- Indexes for threat_intelligence
CREATE INDEX IF NOT EXISTS idx_threat_ip ON threat_intelligence(ip);
CREATE INDEX IF NOT EXISTS idx_threat_domain ON threat_intelligence(domain);
CREATE INDEX IF NOT EXISTS idx_threat_hash ON threat_intelligence(hash);
CREATE INDEX IF NOT EXISTS idx_threat_source ON threat_intelligence(source);
CREATE INDEX IF NOT EXISTS idx_threat_active ON threat_intelligence(is_active);
CREATE INDEX IF NOT EXISTS idx_threat_last_seen ON threat_intelligence(last_seen DESC);

-- ============================================================================
-- Compliance Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_audit_log (
    id SERIAL PRIMARY KEY,
    framework VARCHAR(50) NOT NULL,
    control_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    evidence TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Indexes for compliance_audit_log
CREATE INDEX IF NOT EXISTS idx_compliance_framework ON compliance_audit_log(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_control ON compliance_audit_log(control_id);
CREATE INDEX IF NOT EXISTS idx_compliance_timestamp ON compliance_audit_log(timestamp DESC);

-- ============================================================================
-- SOAR Playbook Executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS playbook_executions (
    id VARCHAR(255) PRIMARY KEY,
    playbook_name VARCHAR(255) NOT NULL,
    trigger_event_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'RUNNING',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    actions_executed JSONB,
    results JSONB,
    error_message TEXT
);

-- Indexes for playbook_executions
CREATE INDEX IF NOT EXISTS idx_playbook_name ON playbook_executions(playbook_name);
CREATE INDEX IF NOT EXISTS idx_playbook_status ON playbook_executions(status);
CREATE INDEX IF NOT EXISTS idx_playbook_started ON playbook_executions(started_at DESC);

-- ============================================================================
-- Forensics Evidence
-- ============================================================================

CREATE TABLE IF NOT EXISTS forensics_evidence (
    id VARCHAR(255) PRIMARY KEY,
    incident_id VARCHAR(255) REFERENCES incidents(id),
    evidence_type VARCHAR(100) NOT NULL,
    file_path TEXT,
    file_hash VARCHAR(255),
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chain_of_custody JSONB,
    metadata JSONB
);

-- Indexes for forensics_evidence
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON forensics_evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON forensics_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_collected ON forensics_evidence(collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON forensics_evidence(file_hash);

-- ============================================================================
-- ML Model Predictions
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_predictions (
    id SERIAL PRIMARY KEY,
    model_type VARCHAR(100) NOT NULL,
    input_data JSONB NOT NULL,
    prediction JSONB NOT NULL,
    confidence NUMERIC(5,4),
    predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actual_outcome VARCHAR(100),
    feedback_at TIMESTAMP
);

-- Indexes for ml_predictions
CREATE INDEX IF NOT EXISTS idx_ml_model_type ON ml_predictions(model_type);
CREATE INDEX IF NOT EXISTS idx_ml_predicted_at ON ml_predictions(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_confidence ON ml_predictions(confidence DESC);

-- ============================================================================
-- Rate Limiting Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_violations (
    id SERIAL PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    endpoint VARCHAR(255),
    violation_count INTEGER DEFAULT 1,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    blocked BOOLEAN DEFAULT FALSE
);

-- Indexes for rate_limit_violations
CREATE INDEX IF NOT EXISTS idx_ratelimit_ip ON rate_limit_violations(ip);
CREATE INDEX IF NOT EXISTS idx_ratelimit_window ON rate_limit_violations(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_ratelimit_blocked ON rate_limit_violations(blocked);

-- ============================================================================
-- Retention Policies
-- ============================================================================

-- Compress security_events older than 7 days
SELECT add_compression_policy('security_events', INTERVAL '7 days');

-- Drop security_events older than 90 days
SELECT add_retention_policy('security_events', INTERVAL '90 days');

-- ============================================================================
-- Continuous Aggregates for Performance
-- ============================================================================

-- Hourly security event summary
CREATE MATERIALIZED VIEW IF NOT EXISTS security_events_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', to_timestamp(timestamp/1000)) AS hour,
    type,
    severity,
    COUNT(*) as event_count,
    AVG(risk_score) as avg_risk_score,
    MAX(risk_score) as max_risk_score,
    COUNT(*) FILTER (WHERE blocked = TRUE) as blocked_count
FROM security_events
GROUP BY hour, type, severity
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('security_events_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Daily security event summary
CREATE MATERIALIZED VIEW IF NOT EXISTS security_events_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', to_timestamp(timestamp/1000)) AS day,
    type,
    severity,
    COUNT(*) as event_count,
    COUNT(DISTINCT ip) as unique_ips,
    AVG(risk_score) as avg_risk_score,
    MAX(risk_score) as max_risk_score,
    COUNT(*) FILTER (WHERE blocked = TRUE) as blocked_count
FROM security_events
GROUP BY day, type, severity
WITH NO DATA;

-- Refresh policy for daily aggregate
SELECT add_continuous_aggregate_policy('security_events_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = extract(epoch from now()) * 1000;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for incidents table
CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate risk score
CREATE OR REPLACE FUNCTION calculate_risk_score(
    p_type VARCHAR,
    p_severity VARCHAR,
    p_threat_level VARCHAR
) RETURNS INTEGER AS $$
DECLARE
    base_score INTEGER := 0;
    type_multiplier NUMERIC := 1.0;
    severity_multiplier NUMERIC := 1.0;
    threat_multiplier NUMERIC := 1.0;
BEGIN
    -- Base scores by type
    base_score := CASE p_type
        WHEN 'SQL_INJECTION' THEN 80
        WHEN 'XSS' THEN 70
        WHEN 'COMMAND_INJECTION' THEN 90
        WHEN 'PATH_TRAVERSAL' THEN 75
        WHEN 'DDOS' THEN 85
        WHEN 'BRUTE_FORCE' THEN 65
        ELSE 50
    END;

    -- Severity multiplier
    severity_multiplier := CASE p_severity
        WHEN 'CRITICAL' THEN 1.5
        WHEN 'HIGH' THEN 1.3
        WHEN 'MEDIUM' THEN 1.0
        WHEN 'LOW' THEN 0.7
        ELSE 1.0
    END;

    -- Threat level multiplier
    threat_multiplier := CASE p_threat_level
        WHEN 'CRITICAL' THEN 1.4
        WHEN 'HIGH' THEN 1.2
        WHEN 'MEDIUM' THEN 1.0
        WHEN 'LOW' THEN 0.8
        ELSE 1.0
    END;

    RETURN LEAST(100, GREATEST(0,
        (base_score * severity_multiplier * threat_multiplier)::INTEGER
    ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Initial Data / Reference Tables
-- ============================================================================

-- Attack types reference
CREATE TABLE IF NOT EXISTS attack_types (
    type VARCHAR(100) PRIMARY KEY,
    description TEXT,
    base_severity VARCHAR(20),
    mitigation_guidance TEXT
);

INSERT INTO attack_types (type, description, base_severity, mitigation_guidance) VALUES
    ('SQL_INJECTION', 'SQL Injection attack attempt', 'CRITICAL', 'Use parameterized queries, input validation'),
    ('XSS', 'Cross-Site Scripting attack', 'HIGH', 'Sanitize output, Content Security Policy'),
    ('COMMAND_INJECTION', 'Command injection attack', 'CRITICAL', 'Avoid system calls, input validation'),
    ('PATH_TRAVERSAL', 'Path traversal attack', 'HIGH', 'Validate file paths, use allowlists'),
    ('DDOS', 'Distributed Denial of Service', 'CRITICAL', 'Rate limiting, traffic filtering'),
    ('BRUTE_FORCE', 'Brute force attack', 'MEDIUM', 'Account lockout, CAPTCHA, rate limiting'),
    ('LDAP_INJECTION', 'LDAP injection attack', 'HIGH', 'Input sanitization, parameterized queries'),
    ('XXE', 'XML External Entity attack', 'HIGH', 'Disable external entities in XML parser'),
    ('SSRF', 'Server-Side Request Forgery', 'HIGH', 'URL validation, network segmentation'),
    ('PROTOTYPE_POLLUTION', 'JavaScript prototype pollution', 'MEDIUM', 'Object.freeze, input validation'),
    ('NOSQL_INJECTION', 'NoSQL injection attack', 'HIGH', 'Input validation, query sanitization'),
    ('TEMPLATE_INJECTION', 'Server-side template injection', 'HIGH', 'Avoid user input in templates'),
    ('DESERIALIZATION', 'Insecure deserialization', 'CRITICAL', 'Validate serialized data, use safe formats')
ON CONFLICT (type) DO NOTHING;

-- ============================================================================
-- Grants (adjust based on your security requirements)
-- ============================================================================

-- Grant necessary permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================================
-- Performance Optimization
-- ============================================================================

-- Analyze tables for query planning
ANALYZE security_events;
ANALYZE incidents;
ANALYZE threat_intelligence;
ANALYZE compliance_audit_log;
ANALYZE playbook_executions;
ANALYZE forensics_evidence;
ANALYZE ml_predictions;

-- Vacuum tables
VACUUM ANALYZE;

-- ============================================================================
-- Database Complete
-- ============================================================================
