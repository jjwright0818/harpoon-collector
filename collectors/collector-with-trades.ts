/**
 * Enhanced Collector Service - Collects BOTH market snapshots AND trades
 * 
 * Features:
 * - Collects market snapshots every 1 minute
 * - Collects ALL trades for tracked markets
 * - Flags "interesting" trades (large, whale, price impact)
 * - Auto-cleanup of old data
 * 
 * Storage estimates (20 hours):
 * - Market snapshots: ~60 MB
 * - Trades: ~15 MB
 * - Total: ~75 MB (15% of free tier)
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

// Configuration
const COLLECTION_INTERVAL_MS = 60 * 1000; // 1 minute
const TRADE_COLLECTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (trades don't change that fast, prevents rate limiting)
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRADE_HISTORY_HOURS = 48; // Keep trades for 48 hours
const SNAPSHOT_HISTORY_DAYS = 7; // Keep snapshots for 7 days

// Market discovery thresholds
const MIN_VOLUME_THRESHOLD = 100000; // $100k minimum volume to track
const MARKET_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // Refresh market list every hour

// Thresholds for trades
const LARGE_TRADE_THRESHOLD = 1000;  // $1k (for flagging)
const WHALE_TRADE_THRESHOLD = 10000; // $10k (for flagging)
const MIN_TRADE_SIZE_TO_STORE = 10000; // Store trades >= $10k (whale trades only)

// In-memory cache of markets to track
let trackedMarkets: Array<{ 
  market_id: string; 
  event_id: string; 
  market_question: string; 
  volume_24h: number;
}> = [];

interface MarketSnapshot {
  market_id: string;
  condition_id: string; // Hex conditionId for trades endpoint
  event_id: string;
  market_question: string;
  snapshot_time: string;
  yes_price: number;
  no_price: number;
  spread: number;
  volume_24h: number;
  liquidity: number;
  price_change_5min: number | null;
  price_change_1h: number | null;
  price_change_24h: number | null;
  volume_change_24h: number | null;
  platform: string;
  status: string;
}

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

/**
 * Discover and refresh markets from Polymarket
 * Uses Polymarket's politics tag to efficiently fetch ONLY political markets
 * Then filters out sports, entertainment, crypto, weather
 */
async function discoverMarkets() {
  console.log(`\n🔍 [${new Date().toISOString()}] Discovering political markets...`);
  try {
    // Exclusion keywords to filter out non-political content
    const exclusionKeywords = [
      'f1', 'formula 1', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football',
      'basketball', 'tennis', 'golf', 'boxing', 'mma', 'ufc',
      'poker', 'heads-up poker', 'wsop', 'world series of poker',
      'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
      'oscar', 'emmy', 'grammy', 'movie', 'film', 'actor',
      'bitcoin price', 'ethereum price', 'btc hit', 'eth hit', 'solana price',
      'weather', 'temperature', 'celsius', 'fahrenheit'
    ];

    let allEvents: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    // Fetch all political events with pagination
    console.log('   Fetching from politics tag...');
    while (hasMore) {
      const url = `https://gamma-api.polymarket.com/events?tag=politics&closed=false&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HarpoonBot/1.0'
        }
      });

      if (!response.ok) {
        console.error(`⚠️  Failed to fetch events at offset ${offset}`);
        break;
      }

      const eventsData = await response.json();
      const events = Array.isArray(eventsData) ? eventsData : (eventsData.data || []);

      if (events.length === 0) {
        hasMore = false;
      } else {
        allEvents = allEvents.concat(events);
        offset += limit;
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`   Fetched ${allEvents.length} political events`);

    // Extract all markets from events and filter
    const qualifyingMarkets: any[] = [];

    for (const event of allEvents) {
      const markets = event.markets || [];
      
      for (const market of markets) {
        // Check volume threshold
        const volumeNum = parseFloat(market.volumeNum || market.volume || 0);
        if (volumeNum < MIN_VOLUME_THRESHOLD) continue;

        // Get searchable text
        const searchText = [
          market.question || '',
          market.description || '',
          event.title || '',
          market.groupItemTitle || ''
        ].join(' ').toLowerCase();

        // Check for exclusion keywords
        const hasExclusionKeyword = exclusionKeywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );

        if (hasExclusionKeyword) continue;

        // Extract market data (condition_id will be fetched and stored in database during snapshot)
        qualifyingMarkets.push({
          market_id: market.id || market.conditionId,
          event_id: event.id || event.slug,
          market_question: market.question || market.title || event.title || 'Unknown',
          volume_24h: volumeNum,
        });
      }
    }

    trackedMarkets = qualifyingMarkets;
    console.log(`✅ Discovered ${qualifyingMarkets.length} political markets with >= $${MIN_VOLUME_THRESHOLD.toLocaleString()} volume`);

    return qualifyingMarkets;
  } catch (error) {
    console.error('❌ Error discovering markets:', error);
    return [];
  }
}

/**
 * Fetch and store market snapshots
 */
async function fetchAndStoreSnapshot() {
  console.log(`\n📊 [${new Date().toISOString()}] Collecting market snapshots...`);
  try {
    // If no markets discovered yet, discovery them first
    if (trackedMarkets.length === 0) {
      await discoverMarkets();
    }

    if (trackedMarkets.length === 0) {
      console.log('⚠️ No markets discovered yet');
      return;
    }

    const currentTimestamp = new Date();
    const snapshotsToInsert: MarketSnapshot[] = [];

    console.log(`   Processing ${trackedMarkets.length} markets in batches...`);

    // Process markets in batches to avoid rate limits
    for (let i = 0; i < trackedMarkets.length; i += 10) {
      const batch = trackedMarkets.slice(i, i + 10);
      
      await Promise.all(batch.map(async (market) => {
        try {
          // Fetch live market data
          const marketResponse = await fetch(
            `https://gamma-api.polymarket.com/markets/${market.market_id}`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'HarpoonBot/1.0'
              }
            }
          );

          if (!marketResponse.ok) {
            console.log(`⚠️  Skipping market ${market.market_id} - API error`);
            return; // Skip this market
          }

          const marketData = await marketResponse.json();
          
          // Parse outcomePrices - it's a JSON string like '["0.65","0.35"]'
          let yes_price = 0;
          let no_price = 0;

          try {
            if (marketData.outcomePrices) {
              const prices = JSON.parse(marketData.outcomePrices);
              if (Array.isArray(prices) && prices.length >= 2) {
                yes_price = parseFloat(prices[0]);
                no_price = parseFloat(prices[1]);
              }
            }
          } catch (e) {
            // If parsing fails, try clobTokenIds as fallback
            if (marketData.clobTokenIds?.[0]?.price) {
              yes_price = parseFloat(marketData.clobTokenIds[0].price);
            }
            if (marketData.clobTokenIds?.[1]?.price) {
              no_price = parseFloat(marketData.clobTokenIds[1].price);
            }
          }

          const volume_24h = parseFloat(marketData.volume24hr || marketData.volumeNum || 0);
          const liquidity = parseFloat(marketData.liquidity || 0);

          // Validate: SKIP markets without valid price data
          if (!yes_price || isNaN(yes_price) || !no_price || isNaN(no_price)) {
            console.log(`⚠️  Skipping market ${market.market_id} - missing price data (yes: ${yes_price}, no: ${no_price})`);
            return; // Skip this market - no valid prices
          }

          // Validate: SKIP if market is closed/inactive
          if (!marketData.active && marketData.closed) {
            console.log(`⚠️  Skipping market ${market.market_id} - market closed`);
            return;
          }

          const latestSnapshot: MarketSnapshot = {
            market_id: market.market_id,
            condition_id: marketData.conditionId || '', // Store conditionId for trade queries
            event_id: market.event_id,
            market_question: marketData.question || marketData.title || 'Unknown',
            snapshot_time: currentTimestamp.toISOString(),
            yes_price: yes_price,
            no_price: no_price,
            spread: Math.abs(yes_price - no_price),
            volume_24h: volume_24h,
            liquidity: liquidity,
            price_change_5min: null,
            price_change_1h: null,
            price_change_24h: null,
            volume_change_24h: null,
            platform: 'polymarket',
            status: marketData.active ? 'active' : 'closed',
          };

          // Calculate price changes (simplified - fetch latest previous snapshot)
          const { data: previousSnapshots } = await supabase
            .from('active_week_data')
            .select('snapshot_time, yes_price, volume_24h')
            .eq('market_id', market.market_id)
            .order('snapshot_time', { ascending: false })
            .limit(1);

          if (previousSnapshots && previousSnapshots.length > 0) {
            const prev = previousSnapshots[0];
            latestSnapshot.price_change_5min = latestSnapshot.yes_price - prev.yes_price;
            latestSnapshot.volume_change_24h = latestSnapshot.volume_24h - prev.volume_24h;
          }

          snapshotsToInsert.push(latestSnapshot);
        } catch (e) {
          console.log(`⚠️  Skipping market ${market.market_id} - fetch failed:`, e);
        }
      }));

      // Delay between batches to respect API rate limits
      if (i + 10 < trackedMarkets.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (snapshotsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('active_week_data')
        .insert(snapshotsToInsert);

      if (insertError) {
        console.error('❌ Error inserting snapshots:', insertError);
      } else {
        const skipped = trackedMarkets.length - snapshotsToInsert.length;
        console.log(`✅ Inserted ${snapshotsToInsert.length} market snapshots (${skipped} skipped due to missing/invalid data)`);
      }
    } else {
      console.log(`⚠️  No valid market snapshots to insert (all ${trackedMarkets.length} markets skipped)`);
    }
  } catch (error) {
    console.error('❌ Error in snapshot collection:', error);
  }
}

/**
 * Fetch and store trades for all tracked markets
 */
async function fetchAndStoreTrades() {
  console.log(`\n💰 [${new Date().toISOString()}] Collecting trades...`);
  try {
    // Query active markets from database (get latest snapshot for each market)
    const { data: markets, error: queryError } = await supabase
      .from('active_week_data')
      .select('market_id, condition_id, event_id, market_question')
      .eq('platform', 'polymarket')
      .order('snapshot_time', { ascending: false });

    if (queryError) {
      console.error('❌ Failed to query markets:', queryError);
      return;
    }

    if (!markets || markets.length === 0) {
      console.log('⚠️ No markets found in database');
      return;
    }

    // Deduplicate by market_id (get latest snapshot per market)
    const uniqueMarkets = Array.from(
      new Map(markets.map(m => [m.market_id, m])).values()
    );

    console.log(`📊 Checking ${uniqueMarkets.length} markets for trades...`);

    let totalTrades = 0;
    let largeTrades = 0;
    let whaleTrades = 0;
    let failedFetches = 0;

    // Fetch trades for each market (in batches to avoid rate limits)
    for (let i = 0; i < uniqueMarkets.length; i += 5) {
      const batch = uniqueMarkets.slice(i, i + 5);
      
      await Promise.all(batch.map(async (market) => {
        try {
          // Skip markets without conditionId
          if (!market.condition_id) {
            failedFetches++;
            return;
          }

          // Fetch trades using the correct conditionId parameter
          const tenMinutesAgo = Math.floor((Date.now() - 10 * 60 * 1000) / 1000);
          
          const response = await fetch(
            `https://data-api.polymarket.com/trades?market=${market.condition_id}&after=${tenMinutesAgo}&limit=200`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'HarpoonBot/1.0'
              }
            }
          );

          if (!response.ok) {
            failedFetches++;
            return;
          }

          const tradesData = await response.json();
          const trades = Array.isArray(tradesData) ? tradesData : (tradesData.data || []);

          if (trades.length === 0) return;

          // Get the latest trade timestamp we have stored to avoid duplicates
          const { data: latestStoredTrade } = await supabase
            .from('trades')
            .select('timestamp')
            .eq('market_id', market.market_id)
            .order('timestamp', { ascending: false })
            .limit(1);

          const latestTimestamp = latestStoredTrade?.[0]?.timestamp 
            ? new Date(latestStoredTrade[0].timestamp).getTime() 
            : 0;

          // Transform and filter new trades (only >= $10k)
          const newTrades: Trade[] = trades
            .filter((t: any) => {
              const tradeTime = new Date(t.timestamp * 1000).getTime(); // Unix timestamp is in seconds
              const size = parseFloat(t.size || t.amount || 0);
              return tradeTime > latestTimestamp && size >= MIN_TRADE_SIZE_TO_STORE;
            })
            .map((t: any) => {
              const size = parseFloat(t.size || t.amount || 0);
              const price = parseFloat(t.price || 0);
              
              return {
                id: t.transactionHash || `${market.market_id}-${t.timestamp}-${t.asset}`, // Use transaction hash, fallback to unique combo
                market_id: market.market_id,
                event_id: market.event_id,
                market_question: market.market_question || 'Unknown',
                asset_id: t.asset || '', // The token ID being traded (Yes or No token)
                side: t.side?.toUpperCase() || 'BUY',
                outcome: t.outcome || 'Yes',
                outcome_index: t.outcome_index || 0,
                price: price,
                size: size,
                fee: parseFloat(t.fee || t.makerFee || 0),
                maker_address: t.maker_address || t.maker || '',
                taker_address: t.taker_address || t.taker || '',
                timestamp: new Date(t.timestamp * 1000).toISOString(), // Convert Unix timestamp to ISO string
                platform: 'polymarket',
                is_large_trade: size >= LARGE_TRADE_THRESHOLD,
                is_whale_trade: size >= WHALE_TRADE_THRESHOLD,
                price_impact: null, // Calculate later if needed
                platform_data: t
              };
            });

          if (newTrades.length > 0) {
            const { error: insertError } = await supabase
              .from('trades')
              .insert(newTrades);

            if (insertError) {
              console.error(`❌ Error inserting trades for ${market.market_id}:`, insertError);
            } else {
              totalTrades += newTrades.length;
              largeTrades += newTrades.filter(t => t.is_large_trade).length;
              whaleTrades += newTrades.filter(t => t.is_whale_trade).length;
            }
          }
        } catch (error) {
          console.error(`❌ Error processing trades for ${market.market_id}:`, error);
        }
      }));

      // Delay between batches to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    if (totalTrades > 0) {
      console.log(`✅ Collected ${totalTrades} new trades (${largeTrades} >= $1k, ${whaleTrades} >= $10k)`);
    } else {
      console.log(`   No new trades >= $1k since last check`);
    }
    
    if (failedFetches > 0) {
      console.log(`   ⚠️  ${failedFetches} markets failed to fetch (API errors/rate limits)`);
    }
  } catch (error) {
    console.error('❌ Error in trade collection:', error);
  }
}

/**
 * Cleanup old data
 */
async function cleanupOldData() {
  console.log(`\n🧹 [${new Date().toISOString()}] Running cleanup...`);
  try {
    // Clean up old snapshots (7 days)
    const snapshotCutoff = new Date(Date.now() - SNAPSHOT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: snapshotError } = await supabase
      .from('active_week_data')
      .delete()
      .lt('snapshot_time', snapshotCutoff);

    if (snapshotError) {
      console.error('❌ Error cleaning snapshots:', snapshotError);
    } else {
      console.log(`✅ Cleaned snapshots older than ${SNAPSHOT_HISTORY_DAYS} days`);
    }

    // Clean up old trades (48 hours)
    const tradeCutoff = new Date(Date.now() - TRADE_HISTORY_HOURS * 60 * 60 * 1000).toISOString();
    const { error: tradeError } = await supabase
      .from('trades')
      .delete()
      .lt('timestamp', tradeCutoff);

    if (tradeError) {
      console.error('❌ Error cleaning trades:', tradeError);
    } else {
      console.log(`✅ Cleaned trades older than ${TRADE_HISTORY_HOURS} hours`);
    }
  } catch (error) {
    console.error('❌ Error in cleanup:', error);
  }
}

// Initial runs
console.log(`🚀 Enhanced Collector Service Starting...`);
console.log(`   🔍 Market discovery: every ${MARKET_REFRESH_INTERVAL_MS / (1000 * 60)} minutes`);
console.log(`   📊 Market snapshots: every ${COLLECTION_INTERVAL_MS / 1000}s`);
console.log(`   💰 Trade collection: every ${TRADE_COLLECTION_INTERVAL_MS / 1000}s`);
console.log(`   🧹 Cleanup: every ${CLEANUP_INTERVAL_MS / (1000 * 60 * 60)} hours`);
console.log(`   📦 Storage: ~${SNAPSHOT_HISTORY_DAYS} days snapshots + ${TRADE_HISTORY_HOURS}h trades`);
console.log(`   💵 Tracking markets with >= $${MIN_VOLUME_THRESHOLD.toLocaleString()} volume\n`);

// Discover markets first, then start collecting immediately
(async () => {
  await discoverMarkets();
  
  // Start snapshots immediately
  fetchAndStoreSnapshot();
  setInterval(fetchAndStoreSnapshot, COLLECTION_INTERVAL_MS);
  
  // Start trade collection after 30 seconds (just enough time for first snapshot to complete)
  console.log('⏰ Trade collection will start in 30 seconds...\n');
  setTimeout(() => {
    console.log('💰 Starting trade collection...\n');
    fetchAndStoreTrades();
    setInterval(fetchAndStoreTrades, TRADE_COLLECTION_INTERVAL_MS);
  }, 30 * 1000); // 30 second delay
  
  // Schedule other tasks
  setInterval(discoverMarkets, MARKET_REFRESH_INTERVAL_MS); // Refresh market list hourly
  setInterval(cleanupOldData, CLEANUP_INTERVAL_MS);
  
  console.log('✅ Collector service running!\n');
})();

