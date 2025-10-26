/**
 * Explore Polymarket Trades API to find the correct parameters
 * Test different ways to query market-specific trades
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function exploreTradesAPI() {
  console.log('🔍 EXPLORING POLYMARKET TRADES API\n');
  console.log('='.repeat(80));
  
  // Get a sample market
  const { data: snapshots } = await supabase
    .from('active_week_data')
    .select('market_id, market_question')
    .limit(1);

  if (!snapshots || snapshots.length === 0) {
    console.error('No markets found');
    return;
  }

  const testMarket = snapshots[0];
  console.log(`Test Market: ${testMarket.market_question}`);
  console.log(`Market ID: ${testMarket.market_id}\n`);
  console.log('='.repeat(80));

  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  // Test 1: Current approach - market parameter
  console.log('\n📋 TEST 1: Using "market" parameter (current approach)');
  console.log(`URL: /trades?market=${testMarket.market_id}&after=${oneDayAgo}&limit=10`);
  
  try {
    const response1 = await fetch(
      `https://data-api.polymarket.com/trades?market=${testMarket.market_id}&after=${oneDayAgo}&limit=10`
    );
    
    if (response1.ok) {
      const data1 = await response1.json();
      const trades1 = Array.isArray(data1) ? data1 : (data1.data || []);
      console.log(`✅ Status: ${response1.status}`);
      console.log(`✅ Trades returned: ${trades1.length}`);
      
      if (trades1.length > 0) {
        const sample = trades1[0];
        console.log(`\nSample trade structure:`);
        console.log(`  - id: ${sample.id || 'MISSING'}`);
        console.log(`  - market: ${sample.market || 'MISSING'}`);
        console.log(`  - market_id: ${sample.market_id || 'MISSING'}`);
        console.log(`  - asset_id: ${sample.asset_id || 'MISSING'}`);
        console.log(`  - token_id: ${sample.token_id || 'MISSING'}`);
        console.log(`  - size: ${sample.size}`);
        console.log(`  - timestamp: ${sample.timestamp}`);
        console.log(`  - outcome: ${sample.outcome || 'MISSING'}`);
        
        console.log(`\nAll available fields in trade:`);
        console.log(Object.keys(sample).join(', '));
      }
    } else {
      console.log(`❌ Status: ${response1.status} ${response1.statusText}`);
      const errorText = await response1.text();
      console.log(`Error: ${errorText.substring(0, 200)}`);
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}`);
  }

  // Test 2: Try token_id parameter
  console.log('\n\n📋 TEST 2: Using "token_id" parameter');
  console.log(`URL: /trades?token_id=${testMarket.market_id}&after=${oneDayAgo}&limit=10`);
  
  try {
    const response2 = await fetch(
      `https://data-api.polymarket.com/trades?token_id=${testMarket.market_id}&after=${oneDayAgo}&limit=10`
    );
    
    if (response2.ok) {
      const data2 = await response2.json();
      const trades2 = Array.isArray(data2) ? data2 : (data2.data || []);
      console.log(`✅ Status: ${response2.status}`);
      console.log(`✅ Trades returned: ${trades2.length}`);
    } else {
      console.log(`❌ Status: ${response2.status} ${response2.statusText}`);
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}`);
  }

  // Test 3: Try asset_id parameter  
  console.log('\n\n📋 TEST 3: Using "asset_id" parameter');
  console.log(`URL: /trades?asset_id=${testMarket.market_id}&after=${oneDayAgo}&limit=10`);
  
  try {
    const response3 = await fetch(
      `https://data-api.polymarket.com/trades?asset_id=${testMarket.market_id}&after=${oneDayAgo}&limit=10`
    );
    
    if (response3.ok) {
      const data3 = await response3.json();
      const trades3 = Array.isArray(data3) ? data3 : (data3.data || []);
      console.log(`✅ Status: ${response3.status}`);
      console.log(`✅ Trades returned: ${trades3.length}`);
    } else {
      console.log(`❌ Status: ${response3.status} ${response3.statusText}`);
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}`);
  }

  // Test 4: No market filter - see what comes back
  console.log('\n\n📋 TEST 4: No market filter (just time filter)');
  console.log(`URL: /trades?after=${oneDayAgo}&limit=10`);
  
  try {
    const response4 = await fetch(
      `https://data-api.polymarket.com/trades?after=${oneDayAgo}&limit=10`
    );
    
    if (response4.ok) {
      const data4 = await response4.json();
      const trades4 = Array.isArray(data4) ? data4 : (data4.data || []);
      console.log(`✅ Status: ${response4.status}`);
      console.log(`✅ Trades returned: ${trades4.length}`);
      
      if (trades4.length > 0) {
        console.log(`\nMarkets represented in these 10 trades:`);
        const markets = new Set(trades4.map((t: any) => t.market || t.market_id || 'unknown'));
        markets.forEach(m => console.log(`  - ${m}`));
      }
    } else {
      console.log(`❌ Status: ${response4.status} ${response4.statusText}`);
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS BASED ON RESULTS');
  console.log('='.repeat(80));
  console.log('Check which approach returned trades successfully.');
  console.log('Look at the trade structure to see what field identifies the market.');
  console.log('This will tell us the correct way to query market-specific trades.');
  console.log('='.repeat(80));
}

exploreTradesAPI().catch(console.error);

