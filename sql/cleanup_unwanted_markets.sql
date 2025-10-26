-- Remove unwanted markets from existing data
-- This removes crypto, sports, entertainment, weather, and tech stock markets
-- Run this in Supabase SQL Editor

-- First, let's see what we're about to delete (run this first to review)
SELECT 
  'Crypto/Tech' as category,
  COUNT(DISTINCT market_id) as market_count,
  COUNT(*) as snapshot_count
FROM active_week_data
WHERE LOWER(market_question) LIKE '%bitcoin%' 
   OR LOWER(market_question) LIKE '%btc%'
   OR LOWER(market_question) LIKE '%ethereum%'
   OR LOWER(market_question) LIKE '%eth%'
   OR LOWER(market_question) LIKE '%solana%'
   OR LOWER(market_question) LIKE '%sol%'
   OR LOWER(market_question) LIKE '%crypto%'
   OR LOWER(market_question) LIKE '%dogecoin%'
   OR LOWER(market_question) LIKE '%xrp%'
   OR LOWER(market_question) LIKE '%amazon%'
   OR LOWER(market_question) LIKE '%apple%'
   OR LOWER(market_question) LIKE '%tesla%'
   OR LOWER(market_question) LIKE '%nvidia%'
   OR LOWER(market_question) LIKE '%anthropic%'

UNION ALL

SELECT 
  'Sports' as category,
  COUNT(DISTINCT market_id) as market_count,
  COUNT(*) as snapshot_count
FROM active_week_data
WHERE LOWER(market_question) LIKE '%nfl%'
   OR LOWER(market_question) LIKE '%nba%'
   OR LOWER(market_question) LIKE '%mlb%'
   OR LOWER(market_question) LIKE '%nhl%'
   OR LOWER(market_question) LIKE '%soccer%'
   OR LOWER(market_question) LIKE '%football%'
   OR LOWER(market_question) LIKE '%basketball%'
   OR LOWER(market_question) LIKE '%tennis%'

UNION ALL

SELECT 
  'Entertainment' as category,
  COUNT(DISTINCT market_id) as market_count,
  COUNT(*) as snapshot_count
FROM active_week_data
WHERE LOWER(market_question) LIKE '%oscar%'
   OR LOWER(market_question) LIKE '%emmy%'
   OR LOWER(market_question) LIKE '%movie%'
   OR LOWER(market_question) LIKE '%film%';

-- Now delete the unwanted markets and their trades
-- Run this AFTER reviewing the counts above

BEGIN;

-- Step 1: Delete trades for unwanted markets
DELETE FROM trades
WHERE LOWER(market_question) LIKE '%bitcoin%' 
   OR LOWER(market_question) LIKE '%btc%'
   OR LOWER(market_question) LIKE '%ethereum%'
   OR LOWER(market_question) LIKE '%eth%'
   OR LOWER(market_question) LIKE '%solana%'
   OR LOWER(market_question) LIKE '%sol%'
   OR LOWER(market_question) LIKE '%crypto%'
   OR LOWER(market_question) LIKE '%dogecoin%'
   OR LOWER(market_question) LIKE '%xrp%'
   OR LOWER(market_question) LIKE '%amazon%'
   OR LOWER(market_question) LIKE '%apple%'
   OR LOWER(market_question) LIKE '%tesla%'
   OR LOWER(market_question) LIKE '%nvidia%'
   OR LOWER(market_question) LIKE '%anthropic%'
   OR LOWER(market_question) LIKE '%nfl%'
   OR LOWER(market_question) LIKE '%nba%'
   OR LOWER(market_question) LIKE '%mlb%'
   OR LOWER(market_question) LIKE '%nhl%'
   OR LOWER(market_question) LIKE '%soccer%'
   OR LOWER(market_question) LIKE '%football%'
   OR LOWER(market_question) LIKE '%basketball%'
   OR LOWER(market_question) LIKE '%tennis%'
   OR LOWER(market_question) LIKE '%oscar%'
   OR LOWER(market_question) LIKE '%emmy%'
   OR LOWER(market_question) LIKE '%movie%'
   OR LOWER(market_question) LIKE '%film%';

-- Step 2: Delete snapshots for unwanted markets
DELETE FROM active_week_data
WHERE LOWER(market_question) LIKE '%bitcoin%' 
   OR LOWER(market_question) LIKE '%btc%'
   OR LOWER(market_question) LIKE '%ethereum%'
   OR LOWER(market_question) LIKE '%eth%'
   OR LOWER(market_question) LIKE '%solana%'
   OR LOWER(market_question) LIKE '%sol%'
   OR LOWER(market_question) LIKE '%crypto%'
   OR LOWER(market_question) LIKE '%dogecoin%'
   OR LOWER(market_question) LIKE '%xrp%'
   OR LOWER(market_question) LIKE '%amazon%'
   OR LOWER(market_question) LIKE '%apple%'
   OR LOWER(market_question) LIKE '%tesla%'
   OR LOWER(market_question) LIKE '%nvidia%'
   OR LOWER(market_question) LIKE '%anthropic%'
   OR LOWER(market_question) LIKE '%nfl%'
   OR LOWER(market_question) LIKE '%nba%'
   OR LOWER(market_question) LIKE '%mlb%'
   OR LOWER(market_question) LIKE '%nhl%'
   OR LOWER(market_question) LIKE '%soccer%'
   OR LOWER(market_question) LIKE '%football%'
   OR LOWER(market_question) LIKE '%basketball%'
   OR LOWER(market_question) LIKE '%tennis%'
   OR LOWER(market_question) LIKE '%oscar%'
   OR LOWER(market_question) LIKE '%emmy%'
   OR LOWER(market_question) LIKE '%movie%'
   OR LOWER(market_question) LIKE '%film%';

COMMIT;

-- Verify what remains
SELECT 
  COUNT(DISTINCT market_id) as remaining_markets,
  COUNT(*) as remaining_snapshots
FROM active_week_data;

SELECT 
  COUNT(*) as remaining_trades
FROM trades;

-- Show some examples of what's left (should all be political)
SELECT DISTINCT market_question
FROM active_week_data
ORDER BY market_question
LIMIT 20;

