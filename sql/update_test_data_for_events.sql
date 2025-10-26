-- Update test_data table to support event + market hierarchy
-- This allows storing multiple markets per event while keeping one table

-- Add event-level columns
ALTER TABLE test_data 
ADD COLUMN IF NOT EXISTS event_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS event_title TEXT,
ADD COLUMN IF NOT EXISTS event_slug VARCHAR(255),
ADD COLUMN IF NOT EXISTS market_question TEXT,
ADD COLUMN IF NOT EXISTS market_slug VARCHAR(255),
ADD COLUMN IF NOT EXISTS event_volume DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS event_liquidity DECIMAL(15,2);

-- Update constraints - now unique on market_id instead of (market_id, platform)
-- since market_id is already unique per platform
ALTER TABLE test_data DROP CONSTRAINT IF EXISTS unique_market_platform;
ALTER TABLE test_data ADD CONSTRAINT unique_market_id UNIQUE (market_id);

-- Add indexes for event queries
CREATE INDEX IF NOT EXISTS idx_test_data_event_id ON test_data(event_id);
CREATE INDEX IF NOT EXISTS idx_test_data_event_title ON test_data(event_title);
CREATE INDEX IF NOT EXISTS idx_test_data_market_question ON test_data(market_question);

-- Add comments
COMMENT ON COLUMN test_data.event_id IS 'Parent event ID - multiple markets can belong to one event';
COMMENT ON COLUMN test_data.event_title IS 'Event title (e.g., "Starmer out by...?")';
COMMENT ON COLUMN test_data.event_slug IS 'Event slug for API lookups';
COMMENT ON COLUMN test_data.market_question IS 'Specific market question (e.g., "Starmer out in 2025?")';
COMMENT ON COLUMN test_data.market_slug IS 'Market slug for API lookups';
COMMENT ON COLUMN test_data.event_volume IS 'Total volume across all markets in this event';
COMMENT ON COLUMN test_data.event_liquidity IS 'Total liquidity across all markets in this event';

-- Example queries you can now run:
-- 1. Get all markets for an event:
--    SELECT * FROM test_data WHERE event_id = '17725';
--
-- 2. Get events with most markets:
--    SELECT event_title, COUNT(*) as num_markets 
--    FROM test_data 
--    GROUP BY event_id, event_title 
--    ORDER BY num_markets DESC;
--
-- 3. Find similar markets across events (arbitrage opportunities):
--    SELECT market_question, yes_price, event_title 
--    FROM test_data 
--    WHERE market_question LIKE '%Trump%' 
--    ORDER BY yes_price DESC;

