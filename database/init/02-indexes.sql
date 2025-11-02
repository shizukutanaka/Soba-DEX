-- Database Optimization: Essential Indexes for DEX Platform
-- This file creates basic indexes for improved query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Tokens table indexes
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_contract_address ON tokens(contract_address);
CREATE INDEX IF NOT EXISTS idx_tokens_active ON tokens(is_active);

-- Pairs table indexes
CREATE INDEX IF NOT EXISTS idx_pairs_symbol ON pairs(symbol);
CREATE INDEX IF NOT EXISTS idx_pairs_base_token ON pairs(base_token_id);
CREATE INDEX IF NOT EXISTS idx_pairs_quote_token ON pairs(quote_token_id);
CREATE INDEX IF NOT EXISTS idx_pairs_active ON pairs(is_active);

-- Orders table indexes (critical for trading performance)
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_pair_id ON orders(pair_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
CREATE INDEX IF NOT EXISTS idx_orders_side ON orders(side);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);

-- Composite indexes for orders (for order book queries)
CREATE INDEX IF NOT EXISTS idx_orders_pair_side_status ON orders(pair_id, side, status);
CREATE INDEX IF NOT EXISTS idx_orders_pair_price ON orders(pair_id, price);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);

-- Trades table indexes
CREATE INDEX IF NOT EXISTS idx_trades_pair_id ON trades(pair_id);
CREATE INDEX IF NOT EXISTS idx_trades_maker_user_id ON trades(maker_user_id);
CREATE INDEX IF NOT EXISTS idx_trades_taker_user_id ON trades(taker_user_id);
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_price ON trades(price);

-- Composite index for trades (for trade history)
CREATE INDEX IF NOT EXISTS idx_trades_pair_created_at ON trades(pair_id, created_at DESC);

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);

-- Balances table indexes
CREATE INDEX IF NOT EXISTS idx_balances_user_id ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_balances_token_id ON balances(token_id);
CREATE INDEX IF NOT EXISTS idx_balances_updated_at ON balances(updated_at);

-- Unique composite index for balances
CREATE UNIQUE INDEX IF NOT EXISTS idx_balances_user_token ON balances(user_id, token_id);

-- Liquidity pools table indexes
CREATE INDEX IF NOT EXISTS idx_pools_pair_id ON liquidity_pools(pair_id);
CREATE INDEX IF NOT EXISTS idx_pools_created_at ON liquidity_pools(created_at);
CREATE INDEX IF NOT EXISTS idx_pools_total_liquidity ON liquidity_pools(total_liquidity);

-- Liquidity positions table indexes
CREATE INDEX IF NOT EXISTS idx_positions_user_id ON liquidity_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_pool_id ON liquidity_positions(pool_id);
CREATE INDEX IF NOT EXISTS idx_positions_created_at ON liquidity_positions(created_at);

-- Session/Auth table indexes (if using database sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);

-- Price history table indexes (for charts)
CREATE INDEX IF NOT EXISTS idx_price_history_pair_id ON price_history(pair_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_price_history_timeframe ON price_history(timeframe);

-- Composite index for price history queries
CREATE INDEX IF NOT EXISTS idx_price_history_pair_time ON price_history(pair_id, timeframe, timestamp DESC);

-- Audit logs indexes (for security and compliance)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- API usage tracking indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint ON api_usage(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);

-- Performance optimization indexes for specific queries

-- Fast user authentication
CREATE INDEX IF NOT EXISTS idx_users_auth ON users(email, password_hash) WHERE is_active = true;

-- Fast order book retrieval
CREATE INDEX IF NOT EXISTS idx_orders_book ON orders(pair_id, side, price, created_at)
WHERE status IN ('open', 'partial');

-- Fast trade volume calculations
CREATE INDEX IF NOT EXISTS idx_trades_volume ON trades(pair_id, created_at, amount, price);

-- Fast balance lookups
CREATE INDEX IF NOT EXISTS idx_balances_nonzero ON balances(user_id, token_id, available)
WHERE available > 0;

-- Partial indexes for better performance on large datasets

-- Only index active orders
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders(pair_id, side, price)
WHERE status IN ('open', 'partial');

-- Only index recent trades (last 30 days)
CREATE INDEX IF NOT EXISTS idx_trades_recent ON trades(pair_id, created_at DESC)
WHERE created_at > NOW() - INTERVAL '30 days';

-- Only index pending transactions
CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions(user_id, created_at)
WHERE status = 'pending';

-- Statistics and maintenance queries
-- Create extended statistics for better query planning
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        -- Statistics are already available
        RAISE NOTICE 'pg_stat_statements extension is available';
    ELSE
        RAISE NOTICE 'Consider installing pg_stat_statements extension for query performance monitoring';
    END IF;
END $$;

-- Create function to analyze table statistics
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS void AS $$
BEGIN
    -- Update statistics for all tables
    ANALYZE users;
    ANALYZE tokens;
    ANALYZE pairs;
    ANALYZE orders;
    ANALYZE trades;
    ANALYZE transactions;
    ANALYZE balances;
    ANALYZE liquidity_pools;
    ANALYZE liquidity_positions;

    RAISE NOTICE 'Table statistics updated successfully';
END;
$$ LANGUAGE plpgsql;

-- Create function to get index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE(
    schemaname text,
    tablename text,
    indexname text,
    index_scans bigint,
    index_tuples_read bigint,
    index_tuples_fetched bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::text,
        s.tablename::text,
        s.indexrelname::text,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.schemaname = 'public'
    ORDER BY s.idx_scan DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to identify unused indexes
CREATE OR REPLACE FUNCTION get_unused_indexes()
RETURNS TABLE(
    schemaname text,
    tablename text,
    indexname text,
    index_size text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.schemaname::text,
        s.tablename::text,
        s.indexrelname::text,
        pg_size_pretty(pg_relation_size(s.indexrelid))::text
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON s.indexrelid = i.indexrelid
    WHERE s.idx_scan = 0
    AND s.schemaname = 'public'
    AND NOT i.indisprimary
    AND NOT i.indisunique;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON FUNCTION update_table_statistics() IS 'Updates statistics for all main tables to improve query planning';
COMMENT ON FUNCTION get_index_usage_stats() IS 'Returns statistics about index usage to identify performance patterns';
COMMENT ON FUNCTION get_unused_indexes() IS 'Identifies indexes that are never used and could be dropped';

-- Final optimization note
DO $$
BEGIN
    RAISE NOTICE 'Database indexes created successfully. Run update_table_statistics() periodically to maintain optimal performance.';
END $$;