/**
 * Test the SIMPLEST approach: Does /trades?market=X actually work?
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function testSimple() {
  console.log('🧪 Testing SIMPLE approach: /trades?market=X\n');
  
  // Get a market we know exists
  const { data: snapshots } = await supabase
    .from('active_week_data')
    .select('market_id, market_question')
    .limit(1);

  const market = snapshots![0];
  console.log(`Market: ${market.market_question}`);
  console.log(`Market ID: ${market.market_id}\n`);
  
  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  
  // Query with JUST market parameter (the way Polymarket intends)
  const response = await fetch(
    `https://data-api.polymarket.com/trades?market=${market.market_id}&after=${oneDayAgo}&limit=20`
  );
  
  if (!response.ok) {
    console.log(`❌ API returned: ${response.status}`);
    return;
  }
  
  const data = await response.json();
  const trades = Array.isArray(data) ? data : (data.data || []);
  
  console.log(`✅ Got ${trades.length} trades\n`);
  
  if (trades.length === 0) {
    console.log('No trades in last 24h for this market');
    return;
  }
  
  // Analyze what we got
  console.log('Trade Details:');
  console.log('='.repeat(80));
  
  trades.slice(0, 5).forEach((t: any, i: number) => {
    console.log(`\nTrade ${i + 1}:`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Slug: ${t.slug}`);
    console.log(`  Side: ${t.side}`);
    console.log(`  Outcome: ${t.outcome}`);
    console.log(`  Size: $${parseFloat(t.size).toFixed(2)}`);
    console.log(`  Price: ${(parseFloat(t.price) * 100).toFixed(1)}%`);
    console.log(`  Asset: ${t.asset?.substring(0, 20)}...`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('CHECK: Do all trades have the same title/slug?');
  
  const uniqueTitles = new Set(trades.map((t: any) => t.title));
  const uniqueSlugs = new Set(trades.map((t: any) => t.slug));
  
  console.log(`  Unique titles: ${uniqueTitles.size}`);
  console.log(`  Unique slugs: ${uniqueSlugs.size}`);
  
  if (uniqueTitles.size === 1 && uniqueSlugs.size === 1) {
    console.log('\n✅ ALL TRADES ARE FROM THE SAME MARKET!');
    console.log('   The /trades?market=X endpoint DOES work correctly!');
    console.log('   Our earlier issues were from something else.');
  } else {
    console.log('\n❌ TRADES ARE FROM DIFFERENT MARKETS!');
    console.log('   Unique titles found:');
    uniqueTitles.forEach(title => console.log(`     - ${title}`));
  }
}

testSimple().catch(console.error);

