/**
 * Database Migration: ML Visualization & Automation (v3.7.0)
 *
 * Creates tables for:
 * - Interactive visualizations and chart data
 * - Automated ML pipelines and workflow orchestration
 * - Intelligent reporting and scheduled reports
 * - Task execution and dependency management
 *
 * Version: 3.7.0
 * Migration: 003
 * Dependencies: 002_ml_monitoring_explainability.sql
 */

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ml_visualizations: Store visualization configurations and data
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_visualizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'line', 'bar', 'scatter', 'heatmap', 'waterfall', etc.
    model_id UUID REFERENCES ml_models(id) ON DELETE CASCADE,

    -- Chart configuration
    config JSONB NOT NULL DEFAULT '{}',

    -- Chart data (ready for frontend consumption)
    data JSONB NOT NULL,

    -- Metadata
    title VARCHAR(255),
    description TEXT,
    tags TEXT[],

    -- Versioning
    version INTEGER DEFAULT 1,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_viz_model ON ml_visualizations(model_id);
CREATE INDEX idx_ml_viz_type ON ml_visualizations(type);
CREATE INDEX idx_ml_viz_created ON ml_visualizations(created_at DESC);

-- ----------------------------------------------------------------------------
-- ml_pipelines: Define automated ML workflows
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,

    -- Pipeline definition (YAML/JSON workflow)
    definition JSONB NOT NULL,

    -- Trigger configuration
    trigger_type VARCHAR(100), -- 'manual', 'scheduled', 'event', 'metric_threshold'
    trigger_config JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    version INTEGER DEFAULT 1,

    -- Execution stats
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    last_execution_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_ml_pipelines_status ON ml_pipelines(status);
CREATE INDEX idx_ml_pipelines_trigger ON ml_pipelines(trigger_type);

-- ----------------------------------------------------------------------------
-- ml_pipeline_executions: Track pipeline execution history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_pipeline_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES ml_pipelines(id) ON DELETE CASCADE,

    -- Execution info
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,

    -- Progress tracking
    tasks_total INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    tasks_skipped INTEGER DEFAULT 0,

    -- Results
    execution_log JSONB DEFAULT '[]',
    error_message TEXT,
    final_result JSONB,

    -- Trigger info
    triggered_by VARCHAR(100), -- 'manual', 'schedule', 'event', 'api'
    trigger_data JSONB,

    -- Resource usage
    peak_memory_mb INTEGER,
    total_cpu_seconds DECIMAL(10,2),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_exec_pipeline ON ml_pipeline_executions(pipeline_id, created_at DESC);
CREATE INDEX idx_ml_exec_status ON ml_pipeline_executions(status);
CREATE INDEX idx_ml_exec_created ON ml_pipeline_executions(created_at DESC);

-- ----------------------------------------------------------------------------
-- ml_pipeline_tasks: Individual task executions within pipelines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_pipeline_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID REFERENCES ml_pipeline_executions(id) ON DELETE CASCADE,
    pipeline_id UUID REFERENCES ml_pipelines(id) ON DELETE CASCADE,

    -- Task identification
    task_id VARCHAR(255) NOT NULL,
    task_name VARCHAR(255),
    task_type VARCHAR(100) NOT NULL, -- 'data_collection', 'training', 'evaluation', etc.
    task_config JSONB DEFAULT '{}',

    -- Dependencies
    depends_on TEXT[] DEFAULT '{}',

    -- Execution status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,

    -- Results
    result JSONB,
    output JSONB,
    error_message TEXT,
    error_stack TEXT,

    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Resource usage
    memory_mb INTEGER,
    cpu_percent DECIMAL(5,2),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_tasks_exec ON ml_pipeline_tasks(execution_id);
CREATE INDEX idx_ml_tasks_status ON ml_pipeline_tasks(status);
CREATE INDEX idx_ml_tasks_type ON ml_pipeline_tasks(task_type);

-- ----------------------------------------------------------------------------
-- ml_reports: Generated ML reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'performance', 'quality', 'comparison', 'drift', 'health', 'custom'

    -- Report period
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    period_label VARCHAR(100), -- 'daily', 'weekly', 'monthly'

    -- Report content
    summary JSONB NOT NULL,
    insights JSONB DEFAULT '[]',
    visualizations JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',

    -- Metrics
    metrics JSONB,

    -- Export info
    format VARCHAR(50) DEFAULT 'json', -- 'json', 'pdf', 'html', 'markdown'
    file_path VARCHAR(500),
    file_size_kb INTEGER,

    -- Metadata
    generated_at TIMESTAMP DEFAULT NOW(),
    generated_by VARCHAR(255) DEFAULT 'system',
    model_ids UUID[],
    tags TEXT[],

    -- Status
    status VARCHAR(50) DEFAULT 'completed' CHECK (status IN ('generating', 'completed', 'failed')),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_reports_type ON ml_reports(type);
CREATE INDEX idx_ml_reports_period ON ml_reports(period_start, period_end);
CREATE INDEX idx_ml_reports_created ON ml_reports(created_at DESC);
CREATE INDEX idx_ml_reports_models ON ml_reports USING GIN(model_ids);

-- ----------------------------------------------------------------------------
-- ml_workflow_schedules: Scheduled workflow executions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_workflow_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    pipeline_id UUID REFERENCES ml_pipelines(id) ON DELETE CASCADE,

    -- Schedule configuration
    cron_expression VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Execution control
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    last_status VARCHAR(50),

    -- Execution limits
    max_concurrent INTEGER DEFAULT 1,
    timeout_seconds INTEGER DEFAULT 3600,
    max_retries INTEGER DEFAULT 3,

    -- Notifications
    notify_on_success BOOLEAN DEFAULT false,
    notify_on_failure BOOLEAN DEFAULT true,
    notification_channels TEXT[],

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_ml_schedules_pipeline ON ml_workflow_schedules(pipeline_id);
CREATE INDEX idx_ml_schedules_enabled ON ml_workflow_schedules(enabled) WHERE enabled = true;
CREATE INDEX idx_ml_schedules_next_run ON ml_workflow_schedules(next_run_at) WHERE enabled = true;

-- ----------------------------------------------------------------------------
-- ml_dashboard_configs: Saved dashboard configurations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_dashboard_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Dashboard layout
    layout JSONB NOT NULL, -- Grid layout configuration

    -- Widgets/panels
    widgets JSONB NOT NULL DEFAULT '[]', -- Array of widget configs

    -- Filters
    default_filters JSONB DEFAULT '{}',

    -- Sharing
    is_public BOOLEAN DEFAULT false,
    owner VARCHAR(255),
    shared_with TEXT[],

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ml_dashboards_owner ON ml_dashboard_configs(owner);
CREATE INDEX idx_ml_dashboards_public ON ml_dashboard_configs(is_public) WHERE is_public = true;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ml_pipeline_summary: Aggregated pipeline statistics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ml_pipeline_summary AS
SELECT
    p.id,
    p.name,
    p.status,
    p.trigger_type,

    -- Execution stats
    p.total_executions,
    p.successful_executions,
    p.failed_executions,
    CASE
        WHEN p.total_executions > 0
        THEN ROUND((p.successful_executions::DECIMAL / p.total_executions) * 100, 2)
        ELSE 0
    END as success_rate_percent,

    -- Recent execution
    p.last_execution_at,
    (SELECT status FROM ml_pipeline_executions
     WHERE pipeline_id = p.id
     ORDER BY created_at DESC LIMIT 1) as last_execution_status,

    -- Average duration (last 10 executions)
    (SELECT AVG(duration_seconds)
     FROM ml_pipeline_executions
     WHERE pipeline_id = p.id
     AND status = 'completed'
     ORDER BY created_at DESC
     LIMIT 10) as avg_duration_seconds,

    -- Next scheduled run
    (SELECT next_run_at FROM ml_workflow_schedules
     WHERE pipeline_id = p.id
     AND enabled = true
     ORDER BY next_run_at ASC LIMIT 1) as next_scheduled_run

FROM ml_pipelines p;

-- ----------------------------------------------------------------------------
-- ml_active_executions: Currently running pipeline executions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW ml_active_executions AS
SELECT
    e.id,
    e.pipeline_id,
    p.name as pipeline_name,
    e.status,
    e.started_at,
    EXTRACT(EPOCH FROM (NOW() - e.started_at)) as running_seconds,

    -- Progress
    e.tasks_total,
    e.tasks_completed,
    e.tasks_failed,
    CASE
        WHEN e.tasks_total > 0
        THEN ROUND((e.tasks_completed::DECIMAL / e.tasks_total) * 100, 2)
        ELSE 0
    END as progress_percent,

    -- Currently running tasks
    (SELECT COUNT(*) FROM ml_pipeline_tasks
     WHERE execution_id = e.id
     AND status = 'running') as tasks_running

FROM ml_pipeline_executions e
JOIN ml_pipelines p ON e.pipeline_id = p.id
WHERE e.status IN ('pending', 'running');

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function to calculate next run time for cron schedules
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr VARCHAR, from_time TIMESTAMP)
RETURNS TIMESTAMP AS $$
DECLARE
    next_time TIMESTAMP;
BEGIN
    -- Simplified cron calculation (production would use proper cron parser)
    -- For now, assume hourly if not specified
    next_time := from_time + INTERVAL '1 hour';
    RETURN next_time;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function to update pipeline execution statistics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_pipeline_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        UPDATE ml_pipelines
        SET
            total_executions = total_executions + 1,
            successful_executions = successful_executions + 1,
            last_execution_at = NEW.completed_at
        WHERE id = NEW.pipeline_id;
    ELSIF NEW.status = 'failed' THEN
        UPDATE ml_pipelines
        SET
            total_executions = total_executions + 1,
            failed_executions = failed_executions + 1,
            last_execution_at = NEW.completed_at
        WHERE id = NEW.pipeline_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pipeline_stats_trigger
    AFTER UPDATE ON ml_pipeline_executions
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('completed', 'failed'))
    EXECUTE FUNCTION update_pipeline_stats();

-- ----------------------------------------------------------------------------
-- Function to auto-update execution duration
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_execution_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_execution_duration_trigger
    BEFORE UPDATE ON ml_pipeline_executions
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION update_execution_duration();

-- Similar trigger for tasks
CREATE TRIGGER update_task_duration_trigger
    BEFORE UPDATE ON ml_pipeline_tasks
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION update_task_duration();

CREATE OR REPLACE FUNCTION update_task_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_ms := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert example dashboard configuration
INSERT INTO ml_dashboard_configs (name, description, layout, widgets, owner)
VALUES (
    'Default ML Dashboard',
    'Default overview dashboard for ML models',
    '{"rows": 3, "cols": 4}',
    '[
        {"type": "accuracy_chart", "position": {"x": 0, "y": 0, "w": 2, "h": 1}},
        {"type": "latency_chart", "position": {"x": 2, "y": 0, "w": 2, "h": 1}},
        {"type": "quality_score", "position": {"x": 0, "y": 1, "w": 1, "h": 1}},
        {"type": "active_alerts", "position": {"x": 1, "y": 1, "w": 1, "h": 1}}
    ]',
    'system'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ml_visualizations IS 'Stores visualization configurations and chart data for ML metrics';
COMMENT ON TABLE ml_pipelines IS 'Defines automated ML workflows and pipelines';
COMMENT ON TABLE ml_pipeline_executions IS 'Tracks execution history of ML pipelines';
COMMENT ON TABLE ml_pipeline_tasks IS 'Individual task executions within pipeline runs';
COMMENT ON TABLE ml_reports IS 'Generated ML reports with insights and recommendations';
COMMENT ON TABLE ml_workflow_schedules IS 'Scheduled execution of ML workflows';
COMMENT ON TABLE ml_dashboard_configs IS 'Saved dashboard configurations and layouts';

-- ============================================================================
-- MIGRATION VERIFICATION
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'ml_visualizations',
        'ml_pipelines',
        'ml_pipeline_executions',
        'ml_pipeline_tasks',
        'ml_reports',
        'ml_workflow_schedules',
        'ml_dashboard_configs'
    );

    IF table_count = 7 THEN
        RAISE NOTICE 'Migration 003 completed successfully: 7 tables created';
    ELSE
        RAISE EXCEPTION 'Migration 003 failed: Expected 7 tables, found %', table_count;
    END IF;
END $$;
