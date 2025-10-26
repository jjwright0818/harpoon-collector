-- Clear all trades from the trades table
-- Run this to remove duplicate/incorrect trades before deploying the token_id fix

-- Step 1: Check how many trades will be deleted
SELECT COUNT(*) AS total_trades FROM trades;

-- Step 2: Delete all trades
DELETE FROM trades;

-- Step 3: Verify deletion
SELECT COUNT(*) AS remaining_trades FROM trades;

-- Should return 0 rows

