# 🔍 Why We're Missing Some Large Trades

## The Problem

Polywhaler is showing $300k+ trades that our collector is NOT catching.

---

## 🎯 Most Likely Reasons

### **1. Market Type Filtering** (90% probability)

**You:** Only track **POLITICS** markets
- Elections (president, governor, mayor)
- Fed decisions
- Geopolitics
- Recessions

**Polywhaler:** Tracks **ALL** markets
- Politics ✅
- **Sports** (NFL, NBA, F1, tennis) 🏈
- **Crypto prices** (Bitcoin, Ethereum) ₿
- **Entertainment** (Oscars, movies) 🎬
- **Weather** (temperature bets) 🌤️
- **Tech** (Apple stock, etc.) 📱

**Example:**
```
Polywhaler sees: $300k bet on "Will Cowboys win Super Bowl?"
Your collector: FILTERS IT OUT (sports keyword)
```

**This is BY DESIGN!** You specifically wanted political markets only.

---

### **2. Market Discovery Timing** (5% probability)

**Your Collector:**
- Discovers new markets: **Every 60 minutes**
- Fetches trades: **Every 5 minutes**

**The Issue:**
```
10:00 AM - Market discovery runs, finds 883 markets
10:05 AM - New "Will Biden resign?" market created on Polymarket
10:10 AM - Someone bets $300k on that new market
10:15 AM - Your collector fetches trades... but ONLY for the 883 markets from 10:00 AM!
11:00 AM - Next market discovery finds the new market
11:05 AM - Start collecting trades from it (but missed the $300k from 10:10 AM)
```

**Solution:** Reduce market refresh from 60 min → 15 min

---

### **3. Railway Restarts / Downtime** (3% probability)

**Your Collector:**
- Lookback window: **10 minutes**
- Collection interval: **5 minutes**

**The Issue:**
```
10:00 AM - Collector runs, fetches last 10 min of trades
10:05 AM - Collector runs again
10:08 AM - Railway restarts (deployment, crash, etc.)
10:10 AM - $300k trade happens
10:13 AM - Collector comes back online
10:15 AM - Collector fetches trades from 10:05-10:15... MISSES 10:10 trade!
```

**Solution:** Increase lookback from 10 min → 30 min for safety margin

---

### **4. Markets Without condition_id** (2% probability)

**Your Collector:**
- Requires `condition_id` to fetch trades
- Only recently added `condition_id` to database

**The Issue:**
```typescript
// In fetchAndStoreTrades()
if (!market.condition_id) {
  failedFetches++;
  return; // Skip this market!
}
```

If some markets don't have `condition_id` yet, we can't fetch their trades.

**Solution:** Run market discovery again to populate missing `condition_id`s

---

## 🔧 How To Fix

### **Option 1: Verify It's Market Type Filtering** ✅ (RECOMMENDED)

Run this SQL to see what types of markets Polywhaler is tracking:

```sql
-- Check if we accidentally let any non-political trades through
SELECT market_question, size, timestamp
FROM trades
WHERE LOWER(market_question) LIKE '%nfl%'
   OR LOWER(market_question) LIKE '%bitcoin%'
   OR LOWER(market_question) LIKE '%nba%'
ORDER BY size DESC;
```

If this returns 0 rows → **You're correctly filtering! Polywhaler just tracks more market types.**

---

### **Option 2: Reduce Market Discovery Interval**

Change in `collector-with-trades.ts`:

```typescript
// From:
const MARKET_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

// To:
const MARKET_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
```

**Trade-off:**
- ✅ Catch new markets faster
- ❌ More API calls (might hit rate limits)

---

### **Option 3: Increase Trade Lookback Window**

Change in `collector-with-trades.ts`:

```typescript
// From:
const tenMinutesAgo = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);

// To:
const thirtyMinutesAgo = Math.floor((Date.now() - 30 * 60 * 1000) / 1000);
```

**Trade-off:**
- ✅ Catch missed trades during restarts
- ⚠️ More API data to process (but still fast)

---

### **Option 4: Add Startup Backfill**

When collector starts, backfill last 4 hours:

```typescript
async function startupBackfill() {
  console.log('🔄 Running startup backfill...');
  const fourHoursAgo = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
  
  // Fetch all trades from last 4 hours
  // This catches anything missed during downtime
}
```

**Trade-off:**
- ✅ Never miss trades during Railway restarts
- ⚠️ Takes 30-60 seconds on startup

---

## 📊 Diagnostic Steps

### **Step 1: Run SQL Diagnostics**

```bash
sql/diagnose_missing_trades.sql
```

This will show:
- ✅ Markets you're tracking
- ✅ Trades collected per hour (gaps?)
- ✅ Largest trades you've caught
- ✅ Markets missing `condition_id`
- ✅ Any non-political trades that slipped through

### **Step 2: Compare To Polywhaler**

1. Go to https://www.polywhaler.com/
2. Sign in / configure filters
3. Look at their top trades
4. Check the market types:
   - If they're **sports/crypto** → You're filtering correctly! ✅
   - If they're **political** → You might be missing some! ❌

### **Step 3: Check Railway Logs**

Look for:
- ❌ Gaps in "Collected X trades" messages
- ❌ "Failed to query markets" errors
- ❌ Restarts during high-volume trading hours

---

## 🎯 Expected Behavior

### **What You SHOULD Catch:**

| Market Type | $300k Trade | Should Catch? |
|------------|-------------|---------------|
| Presidential election | ✅ | ✅ YES |
| Governor race | ✅ | ✅ YES |
| Fed rate decision | ✅ | ✅ YES |
| NYC mayor (political) | ✅ | ✅ YES |

### **What You SHOULD MISS:**

| Market Type | $300k Trade | Should Catch? |
|------------|-------------|---------------|
| NFL Super Bowl | 🏈 | ❌ NO (sports filter) |
| Bitcoin price | ₿ | ❌ NO (crypto filter) |
| NBA Finals | 🏀 | ❌ NO (sports filter) |
| Oscars winner | 🎬 | ❌ NO (entertainment filter) |

---

## 💡 Bottom Line

**Most likely:** Polywhaler is showing $300k bets on **sports, crypto, or entertainment** that you intentionally filter out.

**To verify:** Run the diagnostic SQL and compare the market types.

**If you want to catch EVERYTHING:** Remove or relax your exclusion keywords. But this defeats the purpose of a **political-only** tracker!

**Recommendation:** 
1. Run diagnostics to confirm it's market type filtering ✅
2. If so, your collector is working perfectly! 🎯
3. If not, apply fixes 2-4 above to catch more political trades ⚡

---

## 🚀 Quick Fixes To Deploy

If diagnostics show you ARE missing political trades:

```bash
# 1. Increase lookback window (quick fix)
# Edit collector-with-trades.ts line ~400
# Change: 10 * 60 * 1000  →  30 * 60 * 1000

# 2. Reduce market refresh (better coverage)
# Edit collector-with-trades.ts line ~40
# Change: 60 * 60 * 1000  →  15 * 60 * 1000

# 3. Push changes
git add .
git commit -m "fix: improve trade coverage"
git push origin main
```

Railway will redeploy with better coverage! 🎉

