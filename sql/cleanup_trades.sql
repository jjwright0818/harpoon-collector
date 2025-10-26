-- Clean unwanted trades from the trades table
-- Removes crypto, sports, entertainment, weather, and tech stock trades
-- Run this in Supabase SQL Editor AFTER deploying the code fix

-- First, preview what will be deleted
SELECT 
  'Crypto/Tech Trades' as category,
  COUNT(*) as trade_count,
  SUM(size) as total_volume
FROM trades
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
  'Sports Trades' as category,
  COUNT(*) as trade_count,
  SUM(size) as total_volume
FROM trades
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
  'Entertainment Trades' as category,
  COUNT(*) as trade_count,
  SUM(size) as total_volume
FROM trades
WHERE LOWER(market_question) LIKE '%oscar%'
   OR LOWER(market_question) LIKE '%emmy%'
   OR LOWER(market_question) LIKE '%movie%'
   OR LOWER(market_question) LIKE '%film%';

-- Show examples of what will be deleted
SELECT market_question, size, timestamp
FROM trades
WHERE LOWER(market_question) LIKE '%bitcoin%' 
   OR LOWER(market_question) LIKE '%ethereum%'
   OR LOWER(market_question) LIKE '%nfl%'
   OR LOWER(market_question) LIKE '%nba%'
ORDER BY timestamp DESC
LIMIT 10;

-- Now delete the unwanted trades
-- Run this AFTER reviewing the counts above

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
   OR LOWER(market_question) LIKE '%golf%'
   OR LOWER(market_question) LIKE '%boxing%'
   OR LOWER(market_question) LIKE '%mma%'
   OR LOWER(market_question) LIKE '%ufc%'
   OR LOWER(market_question) LIKE '%poker%'
   OR LOWER(market_question) LIKE '%oscar%'
   OR LOWER(market_question) LIKE '%emmy%'
   OR LOWER(market_question) LIKE '%grammy%'
   OR LOWER(market_question) LIKE '%movie%'
   OR LOWER(market_question) LIKE '%film%'
   OR LOWER(market_question) LIKE '%actor%'
   OR LOWER(market_question) LIKE '%weather%'
   OR LOWER(market_question) LIKE '%temperature%';

-- Verify what remains
SELECT 
  COUNT(*) as remaining_trades,
  SUM(size) as total_volume,
  MIN(timestamp) as oldest_trade,
  MAX(timestamp) as newest_trade
FROM trades;

-- Show examples of remaining trades (should all be political)
SELECT market_question, size, timestamp
FROM trades
ORDER BY timestamp DESC
LIMIT 10;


