# 🐋 Whale Trade Tracking with Usernames

## ✅ What We Can Track

Based on Polymarket's API, we can now capture **full trader profiles** for every whale trade:

### Available Data:
- ✅ **Username** (`name`): e.g., "Arthes86"
- ✅ **Pseudonym** (`pseudonym`): e.g., "Pretty-Littleneck" 
- ✅ **Wallet Address** (`proxyWallet`): e.g., "0x08d8da..."
- ✅ **Bio** (`bio`): User description
- ✅ **Profile Image** (`profileImage`): Avatar URL
- ✅ **Transaction Hash** (`transactionHash`): Blockchain proof

## 📊 Example Trade Data

```json
{
  "name": "Arthes86",                    // Username
  "pseudonym": "Pretty-Littleneck",      // Auto-generated nickname
  "proxyWallet": "0x08d8da...",          // Wallet
  "size": 351.11,                        // $351 bet
  "price": 0.997,                        // At 99.7¢
  "outcome": "Yes",                      // Betting YES
  "title": "Will Trump win 2024?",       // Market
  "transactionHash": "0xcfaa..."         // Blockchain proof
}
```

## 🚀 Deployment Steps

### 1. Add Database Columns
Run this in Supabase SQL Editor:

```sql
-- Run: sql/add_user_info.sql
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS trader_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_pseudonym VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_wallet VARCHAR(255),
ADD COLUMN IF NOT EXISTS trader_bio TEXT,
ADD COLUMN IF NOT EXISTS trader_profile_image TEXT;

CREATE INDEX ON trades(trader_username);
CREATE INDEX ON trades(trader_wallet);
```

### 2. Optional: Clean Existing Data
If you want to start fresh and backfill usernames:

```sql
-- Option A: Clear all trades (fresh start)
DELETE FROM trades;

-- Option B: Keep trades, add usernames later via backfill
```

### 3. Push Code Changes

```bash
git add .
git commit -m "feat: add username tracking for whale trades"
git push origin main
```

Railway will automatically redeploy with username tracking enabled.

### 4. Verify It's Working

After deployment, run in Supabase:

```sql
-- Check recent trades with usernames
SELECT 
  trader_username,
  trader_pseudonym,
  market_question,
  size,
  timestamp
FROM trades
WHERE trader_username IS NOT NULL
ORDER BY timestamp DESC
LIMIT 10;
```

## 📈 What You Can Build

### 1. **Whale Leaderboard**
Track the most active whale traders:

```sql
SELECT 
  trader_username,
  COUNT(*) as total_trades,
  SUM(size) as total_volume,
  AVG(size) as avg_trade_size
FROM trades
WHERE trader_username IS NOT NULL
GROUP BY trader_username
ORDER BY total_volume DESC
LIMIT 20;
```

### 2. **Smart Money Tracker**
See what successful traders are betting on:

```sql
SELECT 
  trader_username,
  market_question,
  outcome,
  size,
  price,
  timestamp
FROM trades
WHERE trader_username = 'Arthes86'  -- Replace with any username
ORDER BY timestamp DESC;
```

### 3. **Contrarian Bets**
Find traders making big longshot bets:

```sql
SELECT 
  trader_username,
  market_question,
  size,
  price,
  ROUND(size / price, 2) as potential_payout
FROM trades
WHERE price < 0.1  -- Less than 10% odds
  AND size >= 10000  -- $10k+ bets
ORDER BY potential_payout DESC;
```

### 4. **Whale Activity Timeline**
Track a specific whale's betting patterns:

```sql
SELECT 
  DATE_TRUNC('day', timestamp) as date,
  COUNT(*) as trades_per_day,
  SUM(size) as volume_per_day
FROM trades
WHERE trader_wallet = '0x...'  -- Replace with wallet address
GROUP BY date
ORDER BY date DESC;
```

## 🔍 Verifying the $99k Trade

To verify your specific trade (`0x6d39f5329ee5388879d465fa2a5596db668a68a97ee46fb6b1a688e8dc883613`):

```sql
-- Run: sql/inspect_whale_trade.sql
SELECT 
  trader_username,
  trader_wallet,
  market_question,
  outcome,
  size,
  price,
  timestamp,
  platform_data
FROM trades
WHERE id = '0x6d39f5329ee5388879d465fa2a5596db668a68a97ee46fb6b1a688e8dc883613';

-- Verify on blockchain:
-- https://polygonscan.com/tx/0x6d39f5329ee5388879d465fa2a5596db668a68a97ee46fb6b1a688e8dc883613
```

## 🎯 Next Steps

1. ✅ Run `sql/add_user_info.sql` in Supabase
2. ✅ Push code to GitHub (already updated)
3. ✅ Wait for Railway to redeploy
4. ✅ Check for new trades with usernames
5. 🎨 Build whale tracker dashboard in your frontend!

## 📝 Privacy Note

All data is publicly available on:
- Polymarket's public API
- Polygon blockchain (public ledger)

We're just aggregating it for easier analysis. If you want to anonymize further, you can:
- Hash wallet addresses
- Omit usernames from public display
- Only show aggregated stats (no individual trades)

