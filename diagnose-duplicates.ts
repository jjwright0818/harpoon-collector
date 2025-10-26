/**
 * Diagnose duplicate trades in Supabase
 * Shows what duplicates exist and why
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function diagnoseDuplicates() {
  console.log('🔍 DIAGNOSING DUPLICATE TRADES\n');
  console.log('='.repeat(80));
  
  // Get all trades
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error || !trades) {
    console.error('❌ Error fetching trades:', error);
    return;
  }

  console.log(`📊 Total trades in database: ${trades.length}\n`);

  // Check 1: Duplicate IDs (should be impossible with PRIMARY KEY)
  const idCounts = new Map<string, number>();
  trades.forEach(t => {
    idCounts.set(t.id, (idCounts.get(t.id) || 0) + 1);
  });

  const duplicateIds = Array.from(idCounts.entries()).filter(([id, count]) => count > 1);
  console.log('1️⃣  DUPLICATE IDs (PRIMARY KEY violations):');
  if (duplicateIds.length > 0) {
    console.log(`   ❌ Found ${duplicateIds.length} duplicate IDs!`);
    duplicateIds.slice(0, 5).forEach(([id, count]) => {
      console.log(`      ${id}: ${count} times`);
    });
  } else {
    console.log('   ✅ No duplicate IDs (as expected with PRIMARY KEY)');
  }

  // Check 2: Same trade data across multiple markets
  console.log('\n2️⃣  SAME TRADE DATA ACROSS DIFFERENT MARKETS:');
  const tradeSignatures = new Map<string, Array<{ market_id: string, market_question: string, id: string }>>();
  
  trades.forEach(t => {
    const signature = `${t.timestamp}-${t.size}-${t.price}-${t.outcome}`;
    if (!tradeSignatures.has(signature)) {
      tradeSignatures.set(signature, []);
    }
    tradeSignatures.get(signature)!.push({
      market_id: t.market_id,
      market_question: t.market_question || 'Unknown',
      id: t.id
    });
  });

  const duplicateSignatures = Array.from(tradeSignatures.entries())
    .filter(([sig, markets]) => markets.length > 1);

  if (duplicateSignatures.length > 0) {
    console.log(`   ⚠️  Found ${duplicateSignatures.length} trades appearing in multiple markets!`);
    console.log(`\n   Sample duplicates:\n`);
    
    duplicateSignatures.slice(0, 3).forEach(([sig, markets]) => {
      const [timestamp, size, price, outcome] = sig.split('-');
      console.log(`   Trade: $${size} @ ${price} - ${outcome} - ${timestamp}`);
      console.log(`   Appears in ${markets.length} markets:`);
      markets.forEach(m => {
        console.log(`      • ${m.market_id}: ${m.market_question}`);
      });
      console.log('');
    });
  } else {
    console.log('   ✅ No duplicate trades across markets');
  }

  // Check 3: Trades with same market_id but appearing multiple times
  console.log('3️⃣  DUPLICATE TRADES WITHIN SAME MARKET:');
  const marketTrades = new Map<string, Array<any>>();
  
  trades.forEach(t => {
    const key = `${t.market_id}-${t.timestamp}-${t.size}`;
    if (!marketTrades.has(key)) {
      marketTrades.set(key, []);
    }
    marketTrades.get(key)!.push(t);
  });

  const duplicateMarketTrades = Array.from(marketTrades.entries())
    .filter(([key, trades]) => trades.length > 1);

  if (duplicateMarketTrades.length > 0) {
    console.log(`   ⚠️  Found ${duplicateMarketTrades.length} duplicate trades in same market!`);
    console.log(`\n   Sample:\n`);
    
    duplicateMarketTrades.slice(0, 3).forEach(([key, trades]) => {
      console.log(`   ${trades[0].market_question || 'Unknown'}`);
      console.log(`   Market ID: ${trades[0].market_id}`);
      console.log(`   Trade details: $${trades[0].size} at ${trades[0].timestamp}`);
      console.log(`   Appears ${trades.length} times with IDs:`);
      trades.forEach(t => console.log(`      - ${t.id}`));
      console.log('');
    });
  } else {
    console.log('   ✅ No duplicate trades within same market');
  }

  // Check 4: How are IDs being generated?
  console.log('4️⃣  ID GENERATION ANALYSIS:');
  const polymarketIds = trades.filter(t => !t.id.includes('-')).length;
  const generatedIds = trades.filter(t => t.id.includes('-')).length;
  
  console.log(`   Polymarket IDs (from API): ${polymarketIds} (${Math.round((polymarketIds / trades.length) * 100)}%)`);
  console.log(`   Generated IDs (fallback):  ${generatedIds} (${Math.round((generatedIds / trades.length) * 100)}%)`);
  
  if (generatedIds > 0) {
    console.log(`\n   ⚠️  Using generated IDs - could cause duplicates if multiple trades have same timestamp!`);
    console.log(`   Sample generated IDs:`);
    trades.filter(t => t.id.includes('-')).slice(0, 3).forEach(t => {
      console.log(`      ${t.id}`);
    });
  }

  // Check 5: Markets with most trades
  console.log('\n5️⃣  TOP MARKETS BY TRADE COUNT:');
  const marketCounts = new Map<string, { count: number, question: string }>();
  
  trades.forEach(t => {
    if (!marketCounts.has(t.market_id)) {
      marketCounts.set(t.market_id, { count: 0, question: t.market_question || 'Unknown' });
    }
    marketCounts.get(t.market_id)!.count++;
  });

  const topMarkets = Array.from(marketCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  topMarkets.forEach(([marketId, data], i) => {
    console.log(`   ${i + 1}. ${data.question}`);
    console.log(`      Market: ${marketId} - ${data.count} trades`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total trades: ${trades.length}`);
  console.log(`Unique trade IDs: ${idCounts.size}`);
  console.log(`Trades with same data across markets: ${duplicateSignatures.length}`);
  console.log(`Duplicate trades in same market: ${duplicateMarketTrades.length}`);
  console.log('='.repeat(80));
}

diagnoseDuplicates().catch(console.error);

