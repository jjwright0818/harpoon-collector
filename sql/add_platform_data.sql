-- Add platform_data column to active_week_data
-- This stores platform-specific metadata (token IDs for Polymarket, tickers for Kalshi, etc.)
-- Safe to run - existing data will have NULL, which is fine

ALTER TABLE active_week_data 
ADD COLUMN IF NOT EXISTS platform_data JSONB;

-- Add index for querying platform-specific data
CREATE INDEX IF NOT EXISTS idx_active_week_platform_data 
ON active_week_data USING gin(platform_data);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'active_week_data' 
AND column_name = 'platform_data';

