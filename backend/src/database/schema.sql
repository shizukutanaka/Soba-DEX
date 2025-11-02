-- DEX Database Schema
-- Optimized for high-performance trading operations

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255),
    username VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    kyc_status VARCHAR(20) DEFAULT 'none',
    trading_volume DECIMAL(20,8) DEFAULT 0,
    total_fees_paid DECIMAL(20,8) DEFAULT 0
);

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    contract_address VARCHAR(42) UNIQUE,
    decimals INTEGER DEFAULT 18,
    total_supply DECIMAL(30,0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    price_usd DECIMAL(20,8),
    market_cap DECIMAL(30,2),
    circulating_supply DECIMAL(30,0)
);

-- Trading pairs
CREATE TABLE IF NOT EXISTS trading_pairs (
    id SERIAL PRIMARY KEY,
    token_a_id INTEGER REFERENCES tokens(id),
    token_b_id INTEGER REFERENCES tokens(id),
    base_token_id INTEGER REFERENCES tokens(id),
    quote_token_id INTEGER REFERENCES tokens(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    min_trade_size DECIMAL(20,8) DEFAULT 0.0001,
    max_trade_size DECIMAL(20,8),
    fee_rate DECIMAL(8,6) DEFAULT 0.003,
    UNIQUE(token_a_id, token_b_id)
);

-- Liquidity pools
CREATE TABLE IF NOT EXISTS liquidity_pools (
    id SERIAL PRIMARY KEY,
    pair_id INTEGER REFERENCES trading_pairs(id),
    token_a_reserve DECIMAL(30,8) DEFAULT 0,
    token_b_reserve DECIMAL(30,8) DEFAULT 0,
    total_supply DECIMAL(30,8) DEFAULT 0,
    fee_rate DECIMAL(8,6) DEFAULT 0.003,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    volume_24h DECIMAL(30,8) DEFAULT 0,
    fees_24h DECIMAL(30,8) DEFAULT 0,
    tx_count_24h INTEGER DEFAULT 0,
    k_constant DECIMAL(50,16),
    is_active BOOLEAN DEFAULT true
);

-- User liquidity positions
CREATE TABLE IF NOT EXISTS liquidity_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    pool_id INTEGER REFERENCES liquidity_pools(id),
    liquidity_tokens DECIMAL(30,8) NOT NULL,
    initial_token_a_amount DECIMAL(30,8),
    initial_token_b_amount DECIMAL(30,8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    entry_price_a DECIMAL(20,8),
    entry_price_b DECIMAL(20,8)
);

-- Orders table (for order book)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    pair_id INTEGER REFERENCES trading_pairs(id),
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('buy', 'sell')),
    price DECIMAL(20,8) NOT NULL,
    amount DECIMAL(30,8) NOT NULL,
    filled DECIMAL(30,8) DEFAULT 0,
    remaining DECIMAL(30,8) NOT NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'partial', 'filled', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    gas_price DECIMAL(20,0),
    nonce INTEGER
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pair_id INTEGER REFERENCES trading_pairs(id),
    buy_order_id UUID REFERENCES orders(id),
    sell_order_id UUID REFERENCES orders(id),
    buyer_id UUID REFERENCES users(id),
    seller_id UUID REFERENCES users(id),
    price DECIMAL(20,8) NOT NULL,
    amount DECIMAL(30,8) NOT NULL,
    total_value DECIMAL(30,8) NOT NULL,
    fee DECIMAL(30,8) DEFAULT 0,
    trade_type VARCHAR(20) DEFAULT 'limit',
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tx_hash VARCHAR(66),
    block_number BIGINT
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tx_hash VARCHAR(66) UNIQUE,
    tx_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    from_address VARCHAR(42),
    to_address VARCHAR(42),
    amount DECIMAL(30,8),
    gas_limit BIGINT,
    gas_price DECIMAL(20,0),
    gas_used BIGINT,
    block_number BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0
);

-- Price history table
CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(id),
    price_usd DECIMAL(20,8) NOT NULL,
    volume_24h DECIMAL(30,8),
    market_cap DECIMAL(30,2),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'internal'
);

-- Reward programs
CREATE TABLE IF NOT EXISTS reward_programs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    pool_ids INTEGER[],
    total_rewards DECIMAL(30,8) NOT NULL,
    remaining_rewards DECIMAL(30,8) NOT NULL,
    reward_rate DECIMAL(8,6) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    min_liquidity DECIMAL(30,8) DEFAULT 1000,
    min_duration_days INTEGER DEFAULT 7
);

-- User rewards
CREATE TABLE IF NOT EXISTS user_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    program_id INTEGER REFERENCES reward_programs(id),
    pool_id INTEGER REFERENCES liquidity_pools(id),
    total_earned DECIMAL(30,8) DEFAULT 0,
    total_claimed DECIMAL(30,8) DEFAULT 0,
    pending_instant DECIMAL(30,8) DEFAULT 0,
    pending_month1 DECIMAL(30,8) DEFAULT 0,
    pending_month3 DECIMAL(30,8) DEFAULT 0,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- MEV protection requests
CREATE TABLE IF NOT EXISTS mev_protection (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    original_tx_data JSONB NOT NULL,
    protection_type VARCHAR(50) NOT NULL,
    risk_score DECIMAL(4,3),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Gas price history
CREATE TABLE IF NOT EXISTS gas_price_history (
    id BIGSERIAL PRIMARY KEY,
    slow_price DECIMAL(10,0) NOT NULL,
    standard_price DECIMAL(10,0) NOT NULL,
    fast_price DECIMAL(10,0) NOT NULL,
    instant_price DECIMAL(10,0) NOT NULL,
    network_congestion DECIMAL(4,3) DEFAULT 1.0,
    block_utilization DECIMAL(4,3) DEFAULT 0.5,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Slippage records
CREATE TABLE IF NOT EXISTS slippage_records (
    id BIGSERIAL PRIMARY KEY,
    pair_id INTEGER REFERENCES trading_pairs(id),
    expected_slippage DECIMAL(8,6),
    actual_slippage DECIMAL(8,6),
    price_impact DECIMAL(8,6),
    trade_amount DECIMAL(30,8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System events and logs
CREATE TABLE IF NOT EXISTS system_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Performance indexes

-- Users indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_active ON users(last_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_trading_volume ON users(trading_volume DESC);

-- Tokens indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_is_active ON tokens(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap DESC NULLS LAST);

-- Trading pairs indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_pairs_tokens ON trading_pairs(token_a_id, token_b_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_pairs_active ON trading_pairs(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_pairs_base_quote ON trading_pairs(base_token_id, quote_token_id);

-- Liquidity pools indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_pools_pair ON liquidity_pools(pair_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_pools_volume ON liquidity_pools(volume_24h DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_pools_active ON liquidity_pools(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_pools_updated ON liquidity_pools(updated_at);

-- Liquidity positions indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_positions_user ON liquidity_positions(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_positions_pool ON liquidity_positions(pool_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_positions_active ON liquidity_positions(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_positions_user_pool ON liquidity_positions(user_id, pool_id);

-- Orders indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pair ON orders(pair_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_type_price ON orders(order_type, price);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_expires_at ON orders(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pair_type_status ON orders(pair_id, order_type, status);

-- Trades indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_pair ON trades(pair_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_buyer ON trades(buyer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_seller ON trades(seller_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_executed_at ON trades(executed_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_pair_time ON trades(pair_id, executed_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_tx_hash ON trades(tx_hash) WHERE tx_hash IS NOT NULL;

-- Transactions indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type ON transactions(tx_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_block_number ON transactions(block_number) WHERE block_number IS NOT NULL;

-- Price history indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_history_token ON price_history(token_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_history_token_time ON price_history(token_id, timestamp);

-- Reward programs indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reward_programs_active ON reward_programs(is_active);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reward_programs_time ON reward_programs(start_time, end_time);

-- User rewards indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_rewards_user ON user_rewards(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_rewards_program ON user_rewards(program_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_rewards_pool ON user_rewards(pool_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_rewards_user_pool ON user_rewards(user_id, pool_id);

-- MEV protection indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mev_protection_user ON mev_protection(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mev_protection_status ON mev_protection(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mev_protection_created ON mev_protection(created_at);

-- Gas price history indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gas_price_history_timestamp ON gas_price_history(timestamp);

-- Slippage records indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slippage_records_pair ON slippage_records(pair_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slippage_records_created ON slippage_records(created_at);

-- System events indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_severity ON system_events(severity);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_events_created ON system_events(created_at);

-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pair_status_price ON orders(pair_id, status, price) WHERE status = 'open';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trades_pair_time_amount ON trades(pair_id, executed_at, amount);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_liquidity_positions_user_active ON liquidity_positions(user_id, is_active);

-- Partial indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_open ON orders(pair_id, order_type, price) WHERE status = 'open';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pending_expiry ON orders(expires_at) WHERE status = 'open' AND expires_at < NOW() + INTERVAL '1 hour';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_pending ON transactions(created_at) WHERE status = 'pending';

-- Update triggers for maintaining updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_liquidity_pools_updated_at BEFORE UPDATE ON liquidity_pools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_liquidity_positions_updated_at BEFORE UPDATE ON liquidity_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Active trading pairs with volume
CREATE OR REPLACE VIEW active_trading_pairs AS
SELECT
    tp.id,
    tp.token_a_id,
    tp.token_b_id,
    ta.symbol as token_a_symbol,
    tb.symbol as token_b_symbol,
    lp.volume_24h,
    lp.fees_24h,
    lp.tx_count_24h,
    lp.token_a_reserve,
    lp.token_b_reserve
FROM trading_pairs tp
JOIN tokens ta ON tp.token_a_id = ta.id
JOIN tokens tb ON tp.token_b_id = tb.id
LEFT JOIN liquidity_pools lp ON tp.id = lp.pair_id
WHERE tp.is_active = true AND ta.is_active = true AND tb.is_active = true;

-- User portfolio summary
CREATE OR REPLACE VIEW user_portfolio AS
SELECT
    u.id as user_id,
    u.wallet_address,
    COUNT(DISTINCT lp.pool_id) as active_positions,
    SUM(lp.liquidity_tokens) as total_liquidity_tokens,
    SUM(ur.total_earned) as total_rewards_earned,
    SUM(ur.total_claimed) as total_rewards_claimed,
    u.trading_volume,
    u.total_fees_paid
FROM users u
LEFT JOIN liquidity_positions lp ON u.id = lp.user_id AND lp.is_active = true
LEFT JOIN user_rewards ur ON u.id = ur.user_id
WHERE u.is_active = true
GROUP BY u.id, u.wallet_address, u.trading_volume, u.total_fees_paid;

-- Recent trades with pair information
CREATE OR REPLACE VIEW recent_trades AS
SELECT
    t.id,
    t.pair_id,
    ta.symbol as token_a,
    tb.symbol as token_b,
    t.price,
    t.amount,
    t.total_value,
    t.fee,
    t.executed_at,
    t.trade_type
FROM trades t
JOIN trading_pairs tp ON t.pair_id = tp.id
JOIN tokens ta ON tp.token_a_id = ta.id
JOIN tokens tb ON tp.token_b_id = tb.id
ORDER BY t.executed_at DESC;

-- Performance statistics
CREATE OR REPLACE VIEW performance_stats AS
SELECT
    'trades_24h' as metric,
    COUNT(*)::text as value
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'volume_24h' as metric,
    SUM(total_value)::text as value
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'active_users_24h' as metric,
    COUNT(DISTINCT buyer_id)::text as value
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
    'total_liquidity' as metric,
    SUM(token_a_reserve + token_b_reserve)::text as value
FROM liquidity_pools
WHERE is_active = true;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dex_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dex_app_user;

-- Initial data inserts for common tokens
INSERT INTO tokens (symbol, name, contract_address, decimals) VALUES
('ETH', 'Ethereum', '0x0000000000000000000000000000000000000000', 18),
('USDT', 'Tether USD', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6),
('USDC', 'USD Coin', '0xA0b86a33E6411a3cf1DE8df3C92aD64Bba1A6b0a', 6),
('DAI', 'Dai Stablecoin', '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18),
('WBTC', 'Wrapped Bitcoin', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 8)
ON CONFLICT (symbol) DO NOTHING;

-- Create common trading pairs
INSERT INTO trading_pairs (token_a_id, token_b_id, base_token_id, quote_token_id)
SELECT
    eth.id, usdt.id, eth.id, usdt.id
FROM tokens eth, tokens usdt
WHERE eth.symbol = 'ETH' AND usdt.symbol = 'USDT'
ON CONFLICT DO NOTHING;

INSERT INTO trading_pairs (token_a_id, token_b_id, base_token_id, quote_token_id)
SELECT
    eth.id, usdc.id, eth.id, usdc.id
FROM tokens eth, tokens usdc
WHERE eth.symbol = 'ETH' AND usdc.symbol = 'USDC'
ON CONFLICT DO NOTHING;

INSERT INTO trading_pairs (token_a_id, token_b_id, base_token_id, quote_token_id)
SELECT
    wbtc.id, usdt.id, wbtc.id, usdt.id
FROM tokens wbtc, tokens usdt
WHERE wbtc.symbol = 'WBTC' AND usdt.symbol = 'USDT'
ON CONFLICT DO NOTHING;

-- Maintenance procedures

-- Cleanup old data procedure
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 90)
RETURNS void AS $$
BEGIN
    -- Clean old price history (keep last 90 days)
    DELETE FROM price_history WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;

    -- Clean old gas price history (keep last 30 days)
    DELETE FROM gas_price_history WHERE timestamp < NOW() - INTERVAL '30 days';

    -- Clean old system events (keep last 30 days, except errors)
    DELETE FROM system_events
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND severity NOT IN ('error', 'critical');

    -- Clean old slippage records (keep last 30 days)
    DELETE FROM slippage_records WHERE created_at < NOW() - INTERVAL '30 days';

    RAISE NOTICE 'Cleanup completed for data older than % days', days_to_keep;
END;
$$ LANGUAGE plpgsql;

-- Database statistics view
CREATE OR REPLACE VIEW database_stats AS
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY tablename, attname;