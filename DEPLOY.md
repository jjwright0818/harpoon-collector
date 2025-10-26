# 🚀 Deploy to Railway - 5 Minutes

## **Step 1: Push to GitHub**

```bash
# On GitHub, create a new repository called "harpoon-collector"
# Then run:

cd /Users/jjwright/Desktop/harpoon-collector
git remote add origin https://github.com/YOUR_USERNAME/harpoon-collector.git
git push -u origin main
```

---

## **Step 2: Create Supabase Tables** (3 minutes)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **SQL Editor** (left sidebar)

### Run these SQL files (one at a time):

**Table 1: active_week_data**
```bash
cat sql/create_active_week_data.sql
```
Copy output → Paste in Supabase → Run

**Table 2: trades**
```bash
cat sql/create_trades_table.sql
```
Copy output → Paste in Supabase → Run

✅ Tables created!

---

## **Step 3: Deploy to Railway** (2 minutes)

1. Go to [railway.app](https://railway.app)
2. Login with GitHub
3. Click **New Project**
4. Select **Deploy from GitHub repo**
5. Choose **harpoon-collector**
6. Click **Deploy Now**

Railway will build automatically (~2 minutes)

---

## **Step 4: Add Environment Variables**

While Railway is building:

1. Click **Variables** tab (left sidebar)
2. Click **+ New Variable**

**Add these two:**

```
NEXT_PUBLIC_SUPABASE_URL = <your_supabase_url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = <your_supabase_anon_key>
```

**Get these from:**
Supabase → Settings (gear icon) → API

Railway will automatically redeploy.

---

## **Step 5: Check Logs**

1. Click **Deployments** tab
2. Click latest deployment
3. Click **View Logs**

**You should see:**
```
🚀 Enhanced Collector Service Starting...
📊 Collecting market snapshots...
⚠️  No markets found in test_data
```

⚠️ "No markets" is OK! We populate them next.

---

## **Step 6: Populate Markets** (from main repo)

Go back to your main **harpoon** repo and run:

```bash
cd /Users/jjwright/Desktop/Calhacks/harpoon
pnpm tsx backend/setup/fetch-clean-politics.ts
```

**Expected:**
```
✅ Fetched ~150 unique events with ~494 markets >= $100k volume
✅ Successfully inserted 494 markets
```

---

## **Step 7: Verify It's Working**

### Railway Logs (wait 1 minute)
Should now show:
```
✅ Inserted 494 market snapshots
✅ Collected 0 new trades (0 large, 0 whale)
```

### Supabase Data
Go to Supabase → Table Editor → `active_week_data`

You should see rows appearing every minute!

---

## **🎉 Done!**

Your collector is now running 24/7:
- ✅ Tracking 494 political markets
- ✅ Snapshots every 1 minute
- ✅ Whale trades every 30 seconds
- ✅ Auto-cleanup after 7 days

**By tomorrow morning you'll have 20+ hours of data!**

---

## **Monitoring**

**Railway Logs:**
Railway Dashboard → Deployments → View Logs

**Supabase Data:**
```sql
SELECT COUNT(*) FROM active_week_data;
SELECT COUNT(*) FROM trades;
```

---

## **Troubleshooting**

**"No markets found"**
→ Run step 6 again

**"Error inserting snapshots"**
→ Check environment variables in Railway

**"Table not found"**
→ Run step 2 again (SQL scripts)

---

**That's it! Now go build your frontend in the main harpoon repo!** 🚀

