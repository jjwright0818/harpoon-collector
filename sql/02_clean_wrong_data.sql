-- Step 2: Delete all trades with incorrect size data
-- Run this AFTER adding trader columns but BEFORE deploying new code
-- All existing trade sizes are WRONG (inflated 100-1000x)

-- Check how many trades will be deleted
SELECT 
  'Trades to be deleted' as info,
  COUNT(*) as count,
  MIN(timestamp) as oldest,
  MAX(timestamp) as newest
FROM trades;

-- Delete all trades
DELETE FROM trades;

-- Verify deletion
SELECT 
  'Trades remaining' as info,
  COUNT(*) as count
FROM trades;

-- Expected result: 0 trades

