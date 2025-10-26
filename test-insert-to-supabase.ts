/**
 * Test script to discover markets and insert into Supabase
 * Run with: npx tsx test-insert-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Create a .env.local file with:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your_url');
  console.log('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MIN_VOLUME_THRESHOLD = 100000; // $100k

// Exclusion keywords
const exclusionKeywords = [
  'f1', 'formula 1', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football',
  'basketball', 'tennis', 'golf', 'boxing', 'mma', 'ufc',
  'poker', 'heads-up poker', 'wsop', 'world series of poker',
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'oscar', 'emmy', 'grammy', 'movie', 'film', 'actor',
  'bitcoin price', 'ethereum price', 'btc hit', 'eth hit', 'solana price',
  'weather', 'temperature', 'celsius', 'fahrenheit'
];

async function discoverMarkets() {
  console.log('🔍 Discovering political markets...\n');
  
  let allEvents: any[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

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
      process.stdout.write(`\r   Fetched ${allEvents.length} events...`);
      offset += limit;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ Fetched ${allEvents.length} political events\n`);

  // Extract all markets from events and filter
  const qualifyingMarkets: any[] = [];

  for (const event of allEvents) {
    const markets = event.markets || [];
    
    for (const market of markets) {
      const volumeNum = parseFloat(market.volumeNum || market.volume || 0);
      if (volumeNum < MIN_VOLUME_THRESHOLD) continue;

      const searchText = [
        market.question || '',
        market.description || '',
        event.title || '',
        market.groupItemTitle || ''
      ].join(' ').toLowerCase();

      const hasExclusionKeyword = exclusionKeywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );

      if (hasExclusionKeyword) continue;

      qualifyingMarkets.push({
        market_id: market.id || market.conditionId,
        event_id: event.id || event.slug,
        question: market.question,
        volume_24h: volumeNum
      });
    }
  }

  console.log(`✅ Found ${qualifyingMarkets.length} qualifying political markets\n`);
  return qualifyingMarkets;
}

async function fetchAndInsertMarkets() {
  try {
    const markets = await discoverMarkets();
    
    if (markets.length === 0) {
      console.log('❌ No markets found to insert');
      return;
    }

    console.log('📊 Fetching live prices and inserting to Supabase...\n');
    
    const currentTimestamp = new Date().toISOString();
    const snapshotsToInsert: any[] = [];
    let validCount = 0;
    let skippedCount = 0;
    const skipReasons: { [key: string]: number } = {};

    // Process in batches
    for (let i = 0; i < markets.length; i += 20) {
      const batch = markets.slice(i, i + 20);
      
      await Promise.all(batch.map(async (market) => {
        try {
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
            skippedCount++;
            skipReasons['API error'] = (skipReasons['API error'] || 0) + 1;
            return;
          }

          const marketData = await marketResponse.json();
          
          // DEBUG: Log first market's full response to see structure
          if (validCount === 0 && skippedCount < 3) {
            console.log(`\n\n🔍 DEBUG - Market ${market.market_id} API Response:`);
            console.log('Question:', market.question);
            console.log('outcomePrices:', marketData.outcomePrices);
            console.log('outcomePrices[0]:', marketData.outcomePrices?.[0]);
            console.log('outcomePrices[1]:', marketData.outcomePrices?.[1]);
            console.log('Type of outcomePrices[0]:', typeof marketData.outcomePrices?.[0]);
            console.log('clobTokenIds[0]?.price:', marketData.clobTokenIds?.[0]?.price);
            console.log('Expression result:', marketData.outcomePrices?.[0] || marketData.clobTokenIds?.[0]?.price);
            console.log('\n');
          }
          
          // Parse outcomePrices - it's a JSON string like '["0.65","0.35"]'
          let yes_price = 0.5;
          let no_price = 0.5;

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

          // DEBUG: Show parsed values
          if (validCount === 0 && skippedCount < 3) {
            console.log(`🔍 DEBUG - Parsed Values:`);
            console.log('yes_price:', yes_price, 'type:', typeof yes_price);
            console.log('no_price:', no_price, 'type:', typeof no_price);
            console.log('!yes_price:', !yes_price);
            console.log('isNaN(yes_price):', isNaN(yes_price));
            console.log('!no_price:', !no_price);
            console.log('isNaN(no_price):', isNaN(no_price));
            console.log('Will skip?:', !yes_price || isNaN(yes_price) || !no_price || isNaN(no_price));
            console.log('\n');
          }

          // Validate prices
          if (!yes_price || isNaN(yes_price) || !no_price || isNaN(no_price)) {
            skippedCount++;
            skipReasons['Missing price data'] = (skipReasons['Missing price data'] || 0) + 1;
            return;
          }

          // Check if closed
          if (!marketData.active && marketData.closed) {
            skippedCount++;
            skipReasons['Market closed'] = (skipReasons['Market closed'] || 0) + 1;
            return;
          }

          validCount++;
          snapshotsToInsert.push({
            market_id: market.market_id,
            event_id: market.event_id,
            snapshot_time: currentTimestamp,
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
            status: marketData.active ? 'active' : 'closed'
          });

        } catch (e) {
          skippedCount++;
          skipReasons['Fetch failed'] = (skipReasons['Fetch failed'] || 0) + 1;
        }
      }));

      process.stdout.write(`\r   Processed ${Math.min(i + 20, markets.length)}/${markets.length} markets...`);
      
      if (i + 20 < markets.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log('\n');
    console.log('=' .repeat(80));
    console.log('PROCESSING SUMMARY');
    console.log('=' .repeat(80));
    console.log(`✅ Valid markets with complete data: ${validCount}`);
    console.log(`❌ Skipped markets: ${skippedCount}`);
    
    if (Object.keys(skipReasons).length > 0) {
      console.log('\nSkip reasons:');
      Object.entries(skipReasons).forEach(([reason, count]) => {
        console.log(`   - ${reason}: ${count}`);
      });
    }

    console.log('\n' + '='.repeat(80));

    if (snapshotsToInsert.length === 0) {
      console.log('❌ No valid snapshots to insert');
      return;
    }

    // Show sample of what will be inserted
    console.log('\nSAMPLE OF DATA TO INSERT (first 5):');
    console.log('=' .repeat(80));
    snapshotsToInsert.slice(0, 5).forEach((snap, idx) => {
      console.log(`\n${idx + 1}. Market: ${snap.market_id}`);
      console.log(`   Yes Price: ${snap.yes_price}`);
      console.log(`   No Price: ${snap.no_price}`);
      console.log(`   Volume 24h: $${snap.volume_24h.toLocaleString()}`);
      console.log(`   Status: ${snap.status}`);
    });

    // Insert to Supabase
    console.log('\n' + '='.repeat(80));
    console.log(`\n💾 Inserting ${snapshotsToInsert.length} snapshots to Supabase...`);
    
    const { error: insertError, data } = await supabase
      .from('active_week_data')
      .insert(snapshotsToInsert);

    if (insertError) {
      console.error('❌ Error inserting to Supabase:', insertError);
    } else {
      console.log(`✅ Successfully inserted ${snapshotsToInsert.length} market snapshots!`);
      console.log('\n🎉 Test complete! Check your Supabase table to verify the data.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

console.log('🚀 Starting local test...\n');
fetchAndInsertMarkets();

