-- Check what markets are actually being tracked
-- Run these queries in Supabase SQL Editor

-- 1. Count unique markets
SELECT COUNT(DISTINCT market_id) as total_markets
FROM active_week_data
WHERE platform = 'polymarket';

-- 2. Find crypto price prediction markets
SELECT DISTINCT market_id, market_question, volume_24h
FROM active_week_data
WHERE platform = 'polymarket'
  AND (
    LOWER(market_question) LIKE '%bitcoin%' OR
    LOWER(market_question) LIKE '%ethereum%' OR
    LOWER(market_question) LIKE '%btc%' OR
    LOWER(market_question) LIKE '%eth%' OR
    LOWER(market_question) LIKE '%solana%' OR
    LOWER(market_question) LIKE '%crypto%' OR
    LOWER(market_question) LIKE '%price%'
  )
ORDER BY volume_24h DESC
LIMIT 20;

-- 3. Count trades for crypto markets
SELECT COUNT(*) as crypto_trades
FROM trades
WHERE platform = 'polymarket'
  AND (
    LOWER(market_question) LIKE '%bitcoin%' OR
    LOWER(market_question) LIKE '%ethereum%' OR
    LOWER(market_question) LIKE '%btc%' OR
    LOWER(market_question) LIKE '%eth%'
  );

-- 4. Check if other unwanted categories slipped through
SELECT 
  CASE 
    WHEN LOWER(market_question) LIKE '%nfl%' OR LOWER(market_question) LIKE '%nba%' THEN 'Sports'
    WHEN LOWER(market_question) LIKE '%oscar%' OR LOWER(market_question) LIKE '%emmy%' THEN 'Entertainment'
    WHEN LOWER(market_question) LIKE '%weather%' THEN 'Weather'
    ELSE 'Other'
  END as category,
  COUNT(DISTINCT market_id) as market_count
FROM active_week_data
WHERE platform = 'polymarket'
GROUP BY category;

-- 5. Sample of political markets (should be majority)
SELECT DISTINCT market_question
FROM active_week_data
WHERE platform = 'polymarket'
  AND (
    LOWER(market_question) LIKE '%election%' OR
    LOWER(market_question) LIKE '%trump%' OR
    LOWER(market_question) LIKE '%biden%' OR
    LOWER(market_question) LIKE '%fed%' OR
    LOWER(market_question) LIKE '%congress%' OR
    LOWER(market_question) LIKE '%senate%'
  )
ORDER BY market_question
LIMIT 10;

