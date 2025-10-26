-- Test data table for prediction market data from multiple platforms
-- Supports both Polymarket and Kalshi data with unified schema

CREATE TABLE test_data (
  -- Primary identification
  id SERIAL PRIMARY KEY,
  market_id VARCHAR(255) NOT NULL,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('polymarket', 'kalshi', 'other')),
  
  -- Market metadata
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  
  -- Market status and timing
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'resolved', 'cancelled', 'paused')),
  created_at TIMESTAMP,
  resolves_at TIMESTAMP,
  resolved_at TIMESTAMP,
  
  -- Resolution information
  resolution VARCHAR(50) CHECK (resolution IN ('yes', 'no', 'other', 'cancelled')),
  outcome TEXT,
  resolution_source TEXT,
  
  -- Pricing data
  yes_price DECIMAL(10,8),
  no_price DECIMAL(10,8),
  volume_24h DECIMAL(15,2),
  liquidity DECIMAL(15,2),
  market_cap DECIMAL(15,2),
  
  -- Additional metrics
  num_traders INTEGER,
  num_orders INTEGER,
  spread DECIMAL(10,8),
  
  -- Platform-specific data (stored as JSON)
  platform_data JSONB,
  
  -- Tracking fields
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at_db TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT unique_market_platform UNIQUE (market_id, platform)
);

-- Create indexes for common queries
CREATE INDEX idx_test_data_platform ON test_data(platform);
CREATE INDEX idx_test_data_status ON test_data(status);
CREATE INDEX idx_test_data_category ON test_data(category);
CREATE INDEX idx_test_data_resolves_at ON test_data(resolves_at);
CREATE INDEX idx_test_data_last_updated ON test_data(last_updated);
CREATE INDEX idx_test_data_platform_data ON test_data USING GIN(platform_data);

-- Comments for documentation
COMMENT ON TABLE test_data IS 'Unified table for prediction market data from multiple platforms';
COMMENT ON COLUMN test_data.market_id IS 'Unique identifier for the market within the platform';
COMMENT ON COLUMN test_data.platform IS 'Source platform: polymarket, kalshi, or other';
COMMENT ON COLUMN test_data.platform_data IS 'Platform-specific data stored as JSON (e.g., slugs, internal IDs)';
COMMENT ON COLUMN test_data.yes_price IS 'Current price for YES outcome (0.0 to 1.0)';
COMMENT ON COLUMN test_data.no_price IS 'Current price for NO outcome (0.0 to 1.0)';
COMMENT ON COLUMN test_data.volume_24h IS '24-hour trading volume in USD';
COMMENT ON COLUMN test_data.liquidity IS 'Available liquidity for trading';
