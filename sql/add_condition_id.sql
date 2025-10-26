-- Add condition_id column to active_week_data
-- This stores the hex conditionId needed for querying Polymarket trades
-- Safe to run - existing data will have NULL, will be populated on next snapshot

ALTER TABLE active_week_data 
ADD COLUMN IF NOT EXISTS condition_id VARCHAR(66);

-- Add index for querying by condition_id
CREATE INDEX IF NOT EXISTS idx_active_week_condition_id 
ON active_week_data(condition_id);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'active_week_data' 
AND column_name = 'condition_id';

