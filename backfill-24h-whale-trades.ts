/**
 * Backfill whale trades from last 24 hours
 * Run once to populate trades table with historical data
 * 
 * Usage: npx tsx backfill-24h-whale-trades.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const WHALE_THRESHOLD = 10000; // $10k minimum

interface Trade {
  id: string;
  market_id: string;
  event_id: string | null;
  market_question: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  outcome_index: number;
  price: number;
  size: number;
  fee: number;
  maker_address: string;
  taker_address: string;
  timestamp: string;
  platform: string;
  is_large_trade: boolean;
  is_whale_trade: boolean;
  price_impact: number | null;
  platform_data: any;
}

async function backfillWhaleTrades() {
  console.log('🐋 BACKFILLING WHALE TRADES - LAST 24 HOURS\n');
  console.log('='.repeat(80));
  
  // Get all tracked markets from active_week_data
  console.log('📊 Fetching tracked markets from Supabase...');
  const { data: snapshots, error } = await supabase
    .from('active_week_data')
    .select('market_id, event_id, market_question')
    .order('snapshot_time', { ascending: false })
    .limit(2000);

  if (error || !snapshots) {
    console.error('❌ Error fetching markets:', error);
    return;
  }

  // Get unique markets with their questions and fetch token IDs
  const marketMap = new Map<string, { event_id: string, market_question: string, token_ids: string[] }>();
  
  console.log('Fetching token IDs for markets...');
  let fetchedCount = 0;
  
  for (const snapshot of snapshots) {
    if (marketMap.has(snapshot.market_id)) continue;
    
    try {
      // Fetch market details to get token IDs
      const response = await fetch(`https://gamma-api.polymarket.com/markets/${snapshot.market_id}`);
      if (response.ok) {
        const marketData = await response.json();
        const tokenIds: string[] = [];
        
        if (marketData.clobTokenIds) {
          if (Array.isArray(marketData.clobTokenIds)) {
            tokenIds.push(...marketData.clobTokenIds);
          } else if (typeof marketData.clobTokenIds === 'string') {
            try {
              const parsed = JSON.parse(marketData.clobTokenIds);
              if (Array.isArray(parsed)) tokenIds.push(...parsed);
            } catch (e) {}
          }
        }
        
        marketMap.set(snapshot.market_id, {
          event_id: snapshot.event_id || '',
          market_question: snapshot.market_question || 'Unknown',
          token_ids: tokenIds
        });
        
        fetchedCount++;
        if (fetchedCount % 50 === 0) {
          process.stdout.write(`\r   Fetched ${fetchedCount}/${snapshots.length} markets...`);
        }
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (e) {
      // Skip markets that fail to fetch
    }
  }
  
  console.log(`\r   ✅ Fetched token IDs for ${marketMap.size} markets\n`);

  const markets = Array.from(marketMap.entries()).map(([market_id, data]) => ({
    market_id,
    event_id: data.event_id,
    market_question: data.market_question,
    token_ids: data.token_ids
  })).filter(m => m.token_ids && m.token_ids.length > 0); // Only markets with token IDs

  console.log(`✅ Found ${markets.length} unique markets to scan\n`);
  console.log('='.repeat(80));

  const twentyFourHoursAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  
  let totalTrades = 0;
  let totalWhales = 0;
  let marketsScanned = 0;
  let failedFetches = 0;
  const startTime = Date.now();

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < markets.length; i += 5) {
    const batch = markets.slice(i, i + 5);
    
    await Promise.all(batch.map(async (market) => {
      try {
        // Fetch trades for ALL tokens in this market
        const allTrades: any[] = [];
        
        for (const tokenId of market.token_ids) {
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/trades?asset=${tokenId}&after=${twentyFourHoursAgo}&limit=200`,
              {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'HarpoonBot/1.0'
                }
              }
            );

            if (response.ok) {
              const tradesData = await response.json();
              const tokenTrades = Array.isArray(tradesData) ? tradesData : (tradesData.data || []);
              allTrades.push(...tokenTrades);
            } else {
              failedFetches++;
            }
          } catch (e) {
            failedFetches++;
          }
        }

        marketsScanned++;
        const trades = allTrades;

        // Filter for whale trades only
        const whaleTrades: Trade[] = trades
          .filter((t: any) => {
            const size = parseFloat(t.size || t.amount || 0);
            return size >= WHALE_THRESHOLD;
          })
          .map((t: any) => {
            const size = parseFloat(t.size || t.amount || 0);
            const price = parseFloat(t.price || 0);
            
            return {
              id: t.transactionHash || `${t.asset}-${t.timestamp}`, // Use transaction hash for uniqueness
              market_id: market.market_id,
              event_id: market.event_id,
              market_question: market.market_question,
              asset_id: t.asset_id || t.token_id || '',
              side: (t.side?.toUpperCase() || 'BUY') as 'BUY' | 'SELL',
              outcome: t.outcome || 'Yes',
              outcome_index: t.outcome_index || 0,
              price: price,
              size: size,
              fee: parseFloat(t.fee || t.makerFee || 0),
              maker_address: t.maker_address || t.maker || '',
              taker_address: t.taker_address || t.taker || '',
              timestamp: new Date(t.timestamp * 1000).toISOString(),
              platform: 'polymarket',
              is_large_trade: size >= 1000,
              is_whale_trade: size >= WHALE_THRESHOLD,
              price_impact: null,
              platform_data: t
            };
          });

        if (whaleTrades.length > 0) {
          // Insert into database
          const { error: insertError } = await supabase
            .from('trades')
            .insert(whaleTrades);

          if (insertError) {
            // Check if it's a duplicate key error (code 23505)
            if (insertError.code !== '23505') {
              console.error(`❌ Error inserting trades for ${market.market_id}:`, insertError.message);
            }
            // Silently skip duplicates
          } else {
            totalTrades += whaleTrades.length;
            totalWhales += whaleTrades.length;
          }
        }

      } catch (e: any) {
        failedFetches++;
      }
    }));

    // Progress update
    const pct = Math.round((marketsScanned / markets.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r   Progress: ${pct}% (${marketsScanned}/${markets.length}) - ${totalWhales} whales found - ${elapsed}s elapsed`);

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  console.log('\n\n' + '='.repeat(80));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(80));
  console.log(`⏱️  Total time: ${totalTime}s (${Math.round(totalTime / 60)} minutes)`);
  console.log(`📊 Markets scanned: ${marketsScanned}`);
  console.log(`⚠️  Failed fetches: ${failedFetches}`);
  console.log(`✅ API success rate: ${Math.round(((marketsScanned - failedFetches) / marketsScanned) * 100)}%`);
  console.log('='.repeat(80));
  console.log(`🐋 WHALE TRADES INSERTED: ${totalWhales}`);
  console.log('='.repeat(80));
  console.log('\n✅ Backfill complete! Check your Supabase trades table.\n');
}

console.log('🚀 Starting backfill...\n');
backfillWhaleTrades().catch(console.error);

