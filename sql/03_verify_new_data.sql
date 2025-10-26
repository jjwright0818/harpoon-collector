-- Step 3: Verify new data is being collected correctly
-- Run this AFTER deploying new code and waiting 10-15 minutes

-- 1. Check that trades are being collected
SELECT 
  '=== COLLECTION STATUS ===' as section,
  COUNT(*) as total_trades,
  MIN(timestamp) as first_trade,
  MAX(timestamp) as latest_trade,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 60 as minutes_of_data
FROM trades;

-- 2. Verify trade sizes are in realistic range (not inflated)
SELECT 
  '=== TRADE SIZE DISTRIBUTION ===' as section,
  CASE 
    WHEN usd < 15000 THEN '$10k-$15k'
    WHEN usd < 25000 THEN '$15k-$25k'
    WHEN usd < 50000 THEN '$25k-$50k'
    WHEN usd < 100000 THEN '$50k-$100k'
    WHEN usd < 500000 THEN '$100k-$500k'
    ELSE '$500k+'
  END as usd_range,
  COUNT(*) as trade_count,
  ROUND(AVG(usd), 2) as avg_usd_in_range
FROM trades
GROUP BY usd_range
ORDER BY MIN(usd);

-- 3. Check user attribution coverage
SELECT 
  '=== USER TRACKING ===' as section,
  COUNT(*) as total_trades,
  COUNT(trader_username) as trades_with_username,
  COUNT(trader_wallet) as trades_with_wallet,
  ROUND(100.0 * COUNT(trader_username) / NULLIF(COUNT(*), 0), 1) as username_pct,
  ROUND(100.0 * COUNT(trader_wallet) / NULLIF(COUNT(*), 0), 1) as wallet_pct
FROM trades;

-- 4. Show recent trades with all fields
SELECT 
  '=== RECENT TRADES SAMPLE ===' as section,
  market_question,
  ROUND(shares, 2) as shares_bought,
  price as price_per_share,
  ROUND(usd, 2) as usd_spent,
  outcome,
  side,
  trader_username,
  LEFT(trader_wallet, 10) as wallet_prefix,
  timestamp
FROM trades
ORDER BY timestamp DESC
LIMIT 10;

-- 5. Check for any suspiciously large trades (>$100k)
SELECT 
  '=== LARGE TRADES CHECK ===' as section,
  COUNT(*) as trades_over_100k,
  ARRAY_AGG(ROUND(usd, 2) ORDER BY usd DESC) as usd_amounts,
  ARRAY_AGG(market_question ORDER BY usd DESC) as markets
FROM trades
WHERE usd >= 100000;

-- 6. Verify $10k threshold is working
SELECT 
  '=== THRESHOLD VERIFICATION ===' as section,
  MIN(usd) as smallest_trade_usd,
  MAX(usd) as largest_trade_usd,
  ROUND(AVG(usd), 2) as average_trade_usd,
  CASE 
    WHEN MIN(usd) >= 10000 THEN '✅ All trades >= $10k'
    ELSE '❌ Trades below $10k found!'
  END as threshold_status
FROM trades;

-- 7. Top whales (by username)
SELECT 
  '=== TOP WHALES ===' as section,
  trader_username,
  COUNT(*) as trade_count,
  ROUND(SUM(usd), 2) as total_usd_spent,
  ROUND(AVG(usd), 2) as avg_trade_usd,
  ROUND(SUM(shares), 2) as total_shares_held
FROM trades
WHERE trader_username IS NOT NULL
GROUP BY trader_username
ORDER BY total_usd_spent DESC
LIMIT 10;

