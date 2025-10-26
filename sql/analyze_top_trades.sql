-- COMPREHENSIVE TRADE ANALYSIS
-- Investigate suspicious patterns and view largest trades

-- ========================================
-- TOP 50 LARGEST TRADES
-- ========================================
SELECT 
  market_question,
  outcome,
  side,
  size,
  price,
  timestamp,
  maker_address,
  taker_address,
  id as transaction_hash
FROM trades
ORDER BY size DESC
LIMIT 50;

-- ========================================
-- JIM WALDEN SUSPICIOUS ACTIVITY
-- ========================================

-- Count of Jim Walden trades by size
SELECT 
  'Jim Walden Trade Summary' as analysis,
  COUNT(*) as total_trades,
  COUNT(DISTINCT maker_address) as unique_makers,
  COUNT(DISTINCT id) as unique_transactions,
  SUM(size) as total_volume,
  AVG(size) as avg_trade_size,
  MIN(size) as smallest,
  MAX(size) as largest,
  MIN(price) as min_price,
  MAX(price) as max_price
FROM trades
WHERE LOWER(market_question) LIKE '%jim walden%';

-- All Jim Walden trades sorted by size
SELECT 
  'All Jim Walden Trades' as section,
  size,
  price,
  outcome,
  side,
  timestamp,
  maker_address,
  taker_address,
  id as transaction_hash
FROM trades
WHERE LOWER(market_question) LIKE '%jim walden%'
ORDER BY size DESC;

-- Check for duplicate transaction hashes (data quality issue)
SELECT 
  'Duplicate Transactions?' as analysis,
  id as transaction_hash,
  COUNT(*) as duplicate_count,
  SUM(size) as total_size
FROM trades
WHERE LOWER(market_question) LIKE '%jim walden%'
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Traders making multiple large Jim Walden bets (coordinated activity?)
SELECT 
  'Repeat Jim Walden Traders' as analysis,
  COALESCE(maker_address, taker_address, 'Unknown') as trader,
  COUNT(*) as trade_count,
  SUM(size) as total_spent,
  AVG(size) as avg_bet,
  MIN(timestamp) as first_bet,
  MAX(timestamp) as last_bet
FROM trades
WHERE LOWER(market_question) LIKE '%jim walden%'
GROUP BY COALESCE(maker_address, taker_address, 'Unknown')
HAVING COUNT(*) > 1
ORDER BY total_spent DESC;

-- ========================================
-- CHECK FOR DATA COLLECTION BUGS
-- ========================================

-- Same transaction appearing multiple times (MAJOR BUG)
SELECT 
  'Duplicate Transaction IDs Across All Markets' as analysis,
  id as transaction_hash,
  COUNT(*) as times_stored,
  STRING_AGG(DISTINCT market_question, ' | ') as markets,
  MAX(size) as size
FROM trades
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY times_stored DESC
LIMIT 20;

-- Trades with identical timestamp, size, and price (suspicious)
SELECT 
  'Potentially Duplicate Trades (by data)' as analysis,
  market_question,
  size,
  price,
  timestamp,
  COUNT(*) as duplicate_count
FROM trades
GROUP BY market_question, size, price, timestamp
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- ========================================
-- NYC MAYOR RACE OVERVIEW
-- ========================================

-- All NYC Mayor trades by candidate
SELECT 
  market_question,
  COUNT(*) as trade_count,
  COUNT(DISTINCT maker_address) as unique_traders,
  SUM(size) as total_volume,
  MAX(size) as largest_trade,
  MIN(timestamp) as first_trade,
  MAX(timestamp) as last_trade
FROM trades
WHERE LOWER(market_question) LIKE '%nyc%mayor%'
   OR LOWER(market_question) LIKE '%new york%mayor%'
GROUP BY market_question
ORDER BY total_volume DESC;

-- ========================================
-- MARKET COVERAGE CHECK
-- ========================================

-- Total stats
SELECT 
  'Overall Statistics' as analysis,
  COUNT(*) as total_trades,
  COUNT(DISTINCT market_id) as unique_markets,
  COUNT(DISTINCT maker_address) as unique_traders,
  SUM(size) as total_volume,
  MIN(timestamp) as oldest_trade,
  MAX(timestamp) as newest_trade
FROM trades;

