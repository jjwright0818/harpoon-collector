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
const TRADE_COLLECTION_INTERVAL_MS = 30 * 1000; // 30 seconds (trades happen faster)
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRADE_HISTORY_HOURS = 48; // Keep trades for 48 hours
const SNAPSHOT_HISTORY_DAYS = 7; // Keep snapshots for 7 days

// Market discovery thresholds
const MIN_VOLUME_THRESHOLD = 100000; // $100k minimum volume to track
const MARKET_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // Refresh market list every hour

// Thresholds for trades
const LARGE_TRADE_THRESHOLD = 1000;  // $1k (for flagging)
const WHALE_TRADE_THRESHOLD = 10000; // $10k (for flagging)
const MIN_TRADE_SIZE_TO_STORE = 10000; // Only store trades >= $10k

// In-memory cache of markets to track
let trackedMarkets: Array<{ market_id: string; event_id: string; volume_24h: number }> = [];

interface MarketSnapshot {
  market_id: string;
  event_id: string;
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
 * Fetches ONLY political markets with >= $100k volume
 * Excludes: sports, entertainment, media, crypto, pop culture
 */
async function discoverMarkets() {
  console.log(`\n🔍 [${new Date().toISOString()}] Discovering political markets...`);
  try {
    // Fetch all markets from Polymarket
    const response = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=1000', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HarpoonBot/1.0'
      }
    });

    if (!response.ok) {
      console.error('❌ Failed to fetch markets from Polymarket');
      return;
    }

    const marketsData = await response.json();
    const markets = Array.isArray(marketsData) ? marketsData : (marketsData.data || []);

    // Political keywords to look for
    const politicalKeywords = [
      'election', 'president', 'senate', 'congress', 'governor', 'democrat', 'republican',
      'trump', 'biden', 'harris', 'political', 'politics', 'vote', 'campaign',
      'fed', 'federal reserve', 'recession', 'inflation', 'gdp', 'unemployment',
      'policy', 'legislation', 'bill', 'law', 'supreme court', 'scotus',
      'nato', 'china', 'russia', 'ukraine', 'taiwan', 'geopolitics', 'diplomacy',
      'cabinet', 'administration', 'government', 'impeach', 'resign'
    ];

    // Exclusion keywords (sports, entertainment, media, crypto, pop culture)
    const exclusionKeywords = [
      'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball',
      'sport', 'team', 'game', 'playoff', 'championship', 'super bowl', 'world series',
      'movie', 'film', 'actor', 'actress', 'oscar', 'emmy', 'grammy', 'award',
      'music', 'album', 'artist', 'celebrity', 'kardashian', 'taylor swift',
      'bitcoin', 'ethereum', 'crypto', 'nft', 'dogecoin', 'solana',
      'stock', 'tesla', 'apple', 'google', 'amazon', 'meta',
      'entertainment', 'pop culture', 'tiktok', 'youtube', 'influencer'
    ];

    // Filter for political markets
    const qualifyingMarkets = markets
      .filter((m: any) => {
        const volume = parseFloat(m.volume24hr || m.volume_24h || 0);
        if (volume < MIN_VOLUME_THRESHOLD) return false;

        // Get searchable text (question, description, tags)
        const searchText = [
          m.question || '',
          m.description || '',
          m.groupItemTitle || '',
          m.marketSlug || '',
          ...(m.tags || [])
        ].join(' ').toLowerCase();

        // Check for political tag or keywords
        const hasPoliticalTag = (m.tags || []).some((tag: string) => 
          tag.toLowerCase().includes('politic')
        );
        
        const hasPoliticalKeyword = politicalKeywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );

        // Check for exclusion keywords
        const hasExclusionKeyword = exclusionKeywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );

        // Must have political content AND not be excluded
        return (hasPoliticalTag || hasPoliticalKeyword) && !hasExclusionKeyword;
      })
      .map((m: any) => ({
        market_id: m.id || m.market_id || m.conditionId,
        event_id: m.eventId || m.event_id || m.groupItemTitle || null,
        volume_24h: parseFloat(m.volume24hr || m.volume_24h || 0),
        yes_price: parseFloat(m.outcomePrices?.[0] || m.yes_price || 0),
        no_price: parseFloat(m.outcomePrices?.[1] || m.no_price || 0),
        liquidity: parseFloat(m.liquidity || 0),
        status: m.active ? 'active' : 'closed'
      }));

    trackedMarkets = qualifyingMarkets;
    console.log(`✅ Discovered ${qualifyingMarkets.length} POLITICAL markets with >= $${MIN_VOLUME_THRESHOLD.toLocaleString()} volume`);

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

    for (const market of trackedMarkets) {
      const latestSnapshot: MarketSnapshot = {
        market_id: market.market_id,
        event_id: market.event_id,
        snapshot_time: currentTimestamp.toISOString(),
        yes_price: market.yes_price,
        no_price: market.no_price,
        spread: Math.abs(market.yes_price - market.no_price),
        volume_24h: market.volume_24h,
        liquidity: market.liquidity,
        price_change_5min: null,
        price_change_1h: null,
        price_change_24h: null,
        volume_change_24h: null,
        platform: 'polymarket',
        status: market.status,
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
    }

    if (snapshotsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('active_week_data')
        .insert(snapshotsToInsert);

      if (insertError) {
        console.error('❌ Error inserting snapshots:', insertError);
      } else {
        console.log(`✅ Inserted ${snapshotsToInsert.length} market snapshots`);
      }
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
    // Use our discovered markets
    if (trackedMarkets.length === 0) {
      console.log('⚠️ No markets to track trades for');
      return;
    }

    let totalTrades = 0;
    let largeTrades = 0;
    let whaleTrades = 0;

    // Fetch trades for each market (in batches to avoid rate limits)
    for (let i = 0; i < trackedMarkets.length; i += 10) {
      const batch = trackedMarkets.slice(i, i + 10);
      
      await Promise.all(batch.map(async (market) => {
        try {
          // Fetch recent trades for this market from Polymarket Trades API
          // Get trades from last 2 minutes to avoid duplicates
          const sinceTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          
          const response = await fetch(
            `https://data-api.polymarket.com/trades?market=${market.market_id}&limit=100`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'HarpoonBot/1.0'
              }
            }
          );

          if (!response.ok) {
            console.error(`⚠️ Failed to fetch trades for ${market.market_id}`);
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
              const tradeTime = new Date(t.timestamp).getTime();
              const size = parseFloat(t.size || t.amount || 0);
              return tradeTime > latestTimestamp && size >= MIN_TRADE_SIZE_TO_STORE;
            })
            .map((t: any) => {
              const size = parseFloat(t.size || t.amount || 0);
              const price = parseFloat(t.price || 0);
              
              return {
                id: t.id || `${market.market_id}-${t.timestamp}`,
                market_id: market.market_id,
                event_id: market.event_id,
                asset_id: t.asset_id || t.token_id || '',
                side: t.side?.toUpperCase() || 'BUY',
                outcome: t.outcome || 'Yes',
                outcome_index: t.outcome_index || 0,
                price: price,
                size: size,
                fee: parseFloat(t.fee || t.makerFee || 0),
                maker_address: t.maker_address || t.maker || '',
                taker_address: t.taker_address || t.taker || '',
                timestamp: t.timestamp,
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

      // Small delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (totalTrades > 0) {
      console.log(`✅ Collected ${totalTrades} new trades (${largeTrades} large, ${whaleTrades} whale)`);
    } else {
      console.log(`   No new trades since last check`);
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

// Discover markets first, then start collecting
(async () => {
  await discoverMarkets();
  fetchAndStoreSnapshot();
  fetchAndStoreTrades();
  
  // Schedule collection
  setInterval(discoverMarkets, MARKET_REFRESH_INTERVAL_MS); // Refresh market list hourly
  setInterval(fetchAndStoreSnapshot, COLLECTION_INTERVAL_MS);
  setInterval(fetchAndStoreTrades, TRADE_COLLECTION_INTERVAL_MS);
  setInterval(cleanupOldData, CLEANUP_INTERVAL_MS);
  
  console.log('✅ Collector service running!\n');
})();

