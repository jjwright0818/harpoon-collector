-- Trades table for storing individual transactions
-- Stores ALL trades (with optional filtering for "interesting" ones)

CREATE TABLE trades (
  -- Primary key
  id VARCHAR(255) PRIMARY KEY,  -- Trade ID from Polymarket
  
  -- Market identification
  market_id VARCHAR(255) NOT NULL,
  event_id VARCHAR(255),
  asset_id VARCHAR(255),
  
  -- Trade details
  side VARCHAR(10) NOT NULL,  -- 'BUY' or 'SELL'
  outcome VARCHAR(10),         -- 'Yes' or 'No' (or specific outcome)
  outcome_index INT,           -- 0 or 1
  
  -- Pricing & size
  price DECIMAL(10,8) NOT NULL,
  size DECIMAL(15,2) NOT NULL,  -- Size in USD
  fee DECIMAL(10,2),
  
  -- Trader info (anonymized)
  maker_address VARCHAR(255),
  taker_address VARCHAR(255),
  
  -- Timing
  timestamp TIMESTAMP NOT NULL,
  
  -- Metadata
  platform VARCHAR(50) DEFAULT 'polymarket',
  
  -- Flags for interesting trades
  is_large_trade BOOLEAN DEFAULT FALSE,  -- $1k+
  is_whale_trade BOOLEAN DEFAULT FALSE,  -- $10k+
  price_impact DECIMAL(10,8),            -- How much this moved the price
  
  -- Raw data
  platform_data JSONB,
  
  -- Tracking
  created_at_db TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_side CHECK (side IN ('BUY', 'SELL')),
  CONSTRAINT chk_price CHECK (price >= 0 AND price <= 1),
  CONSTRAINT chk_size CHECK (size > 0)
);

-- Indexes for performance
CREATE INDEX idx_trades_market_id ON trades(market_id);
CREATE INDEX idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX idx_trades_market_time ON trades(market_id, timestamp DESC);
CREATE INDEX idx_trades_size ON trades(size DESC) WHERE size >= 1000;  -- Large trades
CREATE INDEX idx_trades_large ON trades(is_large_trade) WHERE is_large_trade = TRUE;
CREATE INDEX idx_trades_whale ON trades(is_whale_trade) WHERE is_whale_trade = TRUE;

-- Auto-cleanup function: Delete trades older than 48 hours (configurable)
CREATE OR REPLACE FUNCTION cleanup_old_trades()
RETURNS void AS $$
BEGIN
  DELETE FROM trades 
  WHERE timestamp < NOW() - INTERVAL '48 hours';
  
  RAISE NOTICE 'Cleaned up trades older than 48 hours';
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE trades IS 'Individual trades/transactions from Polymarket';
COMMENT ON COLUMN trades.is_large_trade IS 'Flagged if trade size >= $1,000';
COMMENT ON COLUMN trades.is_whale_trade IS 'Flagged if trade size >= $10,000';
COMMENT ON COLUMN trades.price_impact IS 'How much this trade moved the market price';

-- Example queries:

-- 1. Get recent trades for a market:
--    SELECT * FROM trades 
--    WHERE market_id = '521532' 
--    ORDER BY timestamp DESC 
--    LIMIT 20;

-- 2. Find whale trades in last hour:
--    SELECT m.market_question, t.size, t.price, t.side
--    FROM trades t
--    JOIN test_data m ON t.market_id = m.market_id
--    WHERE t.is_whale_trade = TRUE
--      AND t.timestamp > NOW() - INTERVAL '1 hour'
--    ORDER BY t.size DESC;

-- 3. Calculate volume per market:
--    SELECT market_id, 
--           COUNT(*) as num_trades,
--           SUM(size) as total_volume
--    FROM trades
--    WHERE timestamp > NOW() - INTERVAL '24 hours'
--    GROUP BY market_id
--    ORDER BY total_volume DESC;

-- 4. Detect price movements from trades:
--    SELECT market_id,
--           timestamp,
--           price,
--           LAG(price) OVER (PARTITION BY market_id ORDER BY timestamp) as prev_price,
--           price - LAG(price) OVER (PARTITION BY market_id ORDER BY timestamp) as price_change
--    FROM trades
--    WHERE market_id = '521532'
--    ORDER BY timestamp DESC;

-- 5. Clean up old trades manually:
--    SELECT cleanup_old_trades();

