/**
 * Test that using conditionId gives us correct trades
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function testConditionId() {
  console.log('🧪 Testing conditionId approach for trades\n');
  console.log('='.repeat(80));
  
  // Get a market
  const { data: snapshots } = await supabase
    .from('active_week_data')
    .select('market_id, market_question')
    .limit(1);

  const market = snapshots![0];
  
  // Get conditionId from Polymarket
  const marketResponse = await fetch(`https://gamma-api.polymarket.com/markets/${market.market_id}`);
  const marketData = await marketResponse.json();
  
  const conditionId = marketData.conditionId;
  
  console.log(`Market: ${market.market_question}`);
  console.log(`Market ID: ${market.market_id}`);
  console.log(`Condition ID: ${conditionId}\n`);
  console.log('='.repeat(80));
  
  // Fetch trades using conditionId
  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  
  const tradesResponse = await fetch(
    `https://data-api.polymarket.com/trades?market=${conditionId}&after=${oneDayAgo}&limit=20`
  );
  
  if (!tradesResponse.ok) {
    console.log(`❌ Trades API returned: ${tradesResponse.status}`);
    return;
  }
  
  const tradesData = await tradesResponse.json();
  const trades = Array.isArray(tradesData) ? tradesData : (tradesData.data || []);
  
  console.log(`\n✅ Got ${trades.length} trades\n`);
  
  if (trades.length === 0) {
    console.log('⚠️  No trades in last 24h for this market');
    return;
  }
  
  // Check if all trades are from the correct market
  console.log('Trade Details:');
  console.log('='.repeat(80));
  
  const uniqueTitles = new Set<string>();
  const uniqueSlugs = new Set<string>();
  
  trades.slice(0, 5).forEach((t: any, i: number) => {
    uniqueTitles.add(t.title);
    uniqueSlugs.add(t.slug);
    
    console.log(`\nTrade ${i + 1}:`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Slug: ${t.slug}`);
    console.log(`  Side: ${t.side} ${t.outcome}`);
    console.log(`  Size: $${parseFloat(t.size).toFixed(2)}`);
    console.log(`  Price: ${(parseFloat(t.price) * 100).toFixed(1)}%`);
    console.log(`  Timestamp: ${new Date(t.timestamp * 1000).toLocaleString()}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION:');
  console.log('='.repeat(80));
  console.log(`Total trades analyzed: ${trades.length}`);
  console.log(`Unique titles: ${uniqueTitles.size}`);
  console.log(`Unique slugs: ${uniqueSlugs.size}`);
  
  if (uniqueTitles.size === 1 && uniqueSlugs.size === 1) {
    console.log('\n✅ SUCCESS! All trades are from the SAME MARKET!');
    console.log('   The conditionId approach works correctly!');
    
    const tradeTitle = Array.from(uniqueTitles)[0];
    const marketQuestion = marketData.question || marketData.title;
    
    console.log(`\n📊 Market Question: ${marketQuestion}`);
    console.log(`📊 Trade Title: ${tradeTitle}`);
    
    // Check if they match
    const titlesMatch = tradeTitle.toLowerCase().includes(marketQuestion.toLowerCase()) ||
                       marketQuestion.toLowerCase().includes(tradeTitle.toLowerCase());
    
    if (titlesMatch) {
      console.log('\n✅ PERFECT! Trade title matches market question!');
    } else {
      console.log('\n⚠️  Trade title is different from market question');
      console.log('   (This can be normal if event has multiple markets)');
    }
    
  } else {
    console.log('\n❌ PROBLEM! Trades are from DIFFERENT markets!');
    console.log('   Unique titles found:');
    uniqueTitles.forEach(title => console.log(`     - ${title}`));
  }
  
  // Show some whale trades if any
  const whaleTrades = trades.filter((t: any) => parseFloat(t.size) >= 10000);
  
  if (whaleTrades.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log(`🐋 WHALE TRADES FOUND: ${whaleTrades.length} trades >= $10k`);
    console.log('='.repeat(80));
    
    whaleTrades.slice(0, 3).forEach((t: any) => {
      console.log(`\n$${parseFloat(t.size).toLocaleString()} - ${t.side} ${t.outcome} @ ${(parseFloat(t.price) * 100).toFixed(1)}%`);
      console.log(`  Time: ${new Date(t.timestamp * 1000).toLocaleString()}`);
    });
  }
}

testConditionId().catch(console.error);

