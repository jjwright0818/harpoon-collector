# 🎯 Harpoon Collector

Real-time Polymarket data collector for the Harpoon prediction market analysis platform.

## **What This Collects**

- **494 political markets** with $100k+ volume
- **Market snapshots** every 1 minute (price, volume, liquidity)
- **Whale trades** ($10k+) every 30 seconds
- **Auto-cleanup** after 7 days (snapshots) / 48 hours (trades)

## **Storage**

~276 MB for 3 days of data (55% of Supabase free tier)

## **Quick Deploy to Railway**

### **1. Create Supabase Tables**

Run these SQL scripts in your Supabase SQL Editor:
- `sql/create_active_week_data.sql`
- `sql/create_trades_table.sql`

### **2. Deploy to Railway**

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Select this repository
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Railway will automatically deploy and start collecting!

### **3. Populate Markets**

Clone the main harpoon repo and run locally:
```bash
pnpm tsx backend/setup/fetch-clean-politics.ts
```

This populates the `test_data` table with markets to track.

## **Monitoring**

### Railway Logs
Railway Dashboard → Deployments → View Logs

Expected output:
```
✅ Inserted 494 market snapshots
✅ Collected X new trades (X large, X whale)
```

### Supabase Data
```sql
SELECT COUNT(*) FROM active_week_data;  -- Growing every minute
SELECT COUNT(*) FROM trades;            -- Whale trades
```

## **What It Does**

This collector runs 24/7 on Railway:

1. **Market Snapshots** (every 1 minute)
   - Fetches current prices for all tracked markets
   - Stores in `active_week_data` table
   - Calculates price changes (5min, 1h, 24h)

2. **Whale Trades** (every 30 seconds)
   - Fetches recent trades for all markets
   - Filters for trades >= $10k
   - Stores in `trades` table
   - Flags large ($1k+) and whale ($10k+) trades

3. **Auto-Cleanup** (every 6 hours)
   - Deletes snapshots older than 7 days
   - Deletes trades older than 48 hours
   - Keeps database size manageable

## **Database Tables**

### `test_data` (Master List)
494 markets to track. Populated by fetch-clean-politics script.

### `active_week_data` (Snapshots)
Time-series data: price, volume, liquidity at 1-minute intervals.

### `trades` (Whale Trades)
Individual transactions >= $10k for institutional activity tracking.

## **Tech Stack**

- TypeScript
- Supabase (PostgreSQL database)
- Polymarket Gamma API
- Railway (deployment)

## **Configuration**

Edit `collectors/collector-with-trades.ts`:

```typescript
const COLLECTION_INTERVAL_MS = 60 * 1000;       // Market snapshots
const TRADE_COLLECTION_INTERVAL_MS = 30 * 1000; // Trade checks
const MIN_TRADE_SIZE_TO_STORE = 10000;          // $10k minimum
```

## **Troubleshooting**

**"No markets found in test_data"**
→ Run fetch-clean-politics.ts from main repo

**"Error inserting snapshots"**
→ Check Railway environment variables

**"Table not found"**
→ Run SQL scripts in Supabase

## **Part of Harpoon**

This collector is part of the larger Harpoon platform:
- Frontend: Next.js app (main repo)
- Backend: This collector (runs on Railway)
- Database: Supabase

---

**Collecting data 24/7 for prediction market analysis** 🎯

