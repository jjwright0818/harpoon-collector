-- Active week data table for 7-day rolling time-series snapshots
-- Stores price snapshots every 5 minutes for the last 7 days

CREATE TABLE active_week_data (
  -- Primary key
  id SERIAL PRIMARY KEY,
  
  -- Market identification (links to test_data for full metadata)
  market_id VARCHAR(255) NOT NULL,
  event_id VARCHAR(255),
  
  -- Time-series tracking
  snapshot_time TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Core pricing data (what changes frequently)
  yes_price DECIMAL(10,8) NOT NULL,
  no_price DECIMAL(10,8) NOT NULL,
  spread DECIMAL(10,8),
  
  -- Volume and liquidity (track changes)
  volume_24h DECIMAL(15,2),
  liquidity DECIMAL(15,2),
  
  -- Calculated metrics
  price_change_5min DECIMAL(10,8),   -- vs 5 min ago
  price_change_1h DECIMAL(10,8),     -- vs 1 hour ago
  price_change_24h DECIMAL(10,8),    -- vs 24 hours ago
  volume_change_24h DECIMAL(15,2),   -- volume delta
  
  -- Metadata (minimal, reference test_data for full info)
  platform VARCHAR(50) NOT NULL DEFAULT 'polymarket',
  status VARCHAR(50) DEFAULT 'active',
  
  -- Tracking
  created_at_db TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_market_snapshot UNIQUE (market_id, snapshot_time),
  CONSTRAINT chk_prices CHECK (yes_price >= 0 AND yes_price <= 1 AND no_price >= 0 AND no_price <= 1)
);

-- Indexes for performance
CREATE INDEX idx_active_week_market_id ON active_week_data(market_id);
CREATE INDEX idx_active_week_snapshot_time ON active_week_data(snapshot_time DESC);
CREATE INDEX idx_active_week_market_time ON active_week_data(market_id, snapshot_time DESC);
CREATE INDEX idx_active_week_event_id ON active_week_data(event_id);
CREATE INDEX idx_active_week_price_change ON active_week_data(price_change_24h DESC) 
  WHERE price_change_24h IS NOT NULL;

-- Partition by day for better performance (optional but recommended)
-- This will make deletions of old data much faster
CREATE INDEX idx_active_week_snapshot_day ON active_week_data(DATE(snapshot_time));

-- Auto-cleanup function: Delete data older than 7 days
CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS void AS $$
BEGIN
  DELETE FROM active_week_data 
  WHERE snapshot_time < NOW() - INTERVAL '7 days';
  
  RAISE NOTICE 'Cleaned up snapshots older than 7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to run cleanup daily (requires pg_cron extension)
-- If you don't have pg_cron, run this manually or via your Node script
-- SELECT cron.schedule('cleanup-old-data', '0 0 * * *', 'SELECT cleanup_old_snapshots()');

-- Comments for documentation
COMMENT ON TABLE active_week_data IS 'Rolling 7-day time-series snapshots of market prices (5-minute intervals)';
COMMENT ON COLUMN active_week_data.market_id IS 'Links to test_data.market_id for full market metadata';
COMMENT ON COLUMN active_week_data.snapshot_time IS 'Timestamp when this snapshot was taken';
COMMENT ON COLUMN active_week_data.price_change_5min IS 'Price change vs 5 minutes ago (for real-time alerts)';
COMMENT ON COLUMN active_week_data.price_change_1h IS 'Price change vs 1 hour ago (for trend analysis)';
COMMENT ON COLUMN active_week_data.price_change_24h IS 'Price change vs 24 hours ago (for daily trends)';

-- Example queries you can run:

-- 1. Get latest snapshot for all markets:
--    SELECT DISTINCT ON (market_id) *
--    FROM active_week_data
--    ORDER BY market_id, snapshot_time DESC;

-- 2. Get price history for a specific market:
--    SELECT snapshot_time, yes_price, no_price
--    FROM active_week_data
--    WHERE market_id = '521532'
--    ORDER BY snapshot_time DESC;

-- 3. Find markets with biggest 24h price swings:
--    SELECT market_id, yes_price, price_change_24h
--    FROM active_week_data
--    WHERE snapshot_time > NOW() - INTERVAL '5 minutes'
--    ORDER BY ABS(price_change_24h) DESC
--    LIMIT 10;

-- 4. Get average price over last 24 hours:
--    SELECT market_id, AVG(yes_price) as avg_price
--    FROM active_week_data
--    WHERE snapshot_time > NOW() - INTERVAL '24 hours'
--    GROUP BY market_id;

-- 5. Clean up old data manually:
--    SELECT cleanup_old_snapshots();

