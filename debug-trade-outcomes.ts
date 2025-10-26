/**
 * Debug trade outcomes to see if we're correctly attributing Yes vs No
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function debugOutcomes() {
  console.log('🔍 Debugging Trade Outcomes\n');
  
  // Get those suspicious trades
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .order('size', { ascending: false })
    .limit(3);

  if (!trades || trades.length === 0) {
    console.log('No trades found');
    return;
  }

  for (const trade of trades) {
    console.log('='.repeat(80));
    console.log(`Trade: ${trade.id}`);
    console.log(`Market: ${trade.market_question}`);
    console.log(`Size: $${trade.size.toLocaleString()}`);
    console.log(`Price: ${trade.price}`);
    console.log(`Side: ${trade.side}`);
    console.log(`Outcome: ${trade.outcome}`);
    console.log(`Asset ID: ${trade.asset_id || 'EMPTY'}`);
    
    // Get the market details to see which token is which
    const { data: snapshot } = await supabase
      .from('active_week_data')
      .select('yes_price, no_price')
      .eq('market_id', trade.market_id)
      .order('snapshot_time', { ascending: false })
      .limit(1);

    if (snapshot && snapshot.length > 0) {
      console.log(`\nMarket Current Prices:`);
      console.log(`  Yes: ${(snapshot[0].yes_price * 100).toFixed(1)}%`);
      console.log(`  No: ${(snapshot[0].no_price * 100).toFixed(1)}%`);
    }
    
    // Fetch raw trade from Polymarket to see original data
    console.log(`\nFetching raw trade data from Polymarket...`);
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    
    // Try to find this trade in the raw API response
    try {
      const response = await fetch(
        `https://data-api.polymarket.com/trades?market=${trade.market_id}&after=${oneDayAgo}&limit=100`
      );
      
      if (response.ok) {
        const data = await response.json();
        const allTrades = Array.isArray(data) ? data : (data.data || []);
        const rawTrade = allTrades.find((t: any) => 
          Math.abs(parseFloat(t.size) - trade.size) < 1 && 
          Math.abs(parseFloat(t.price) - trade.price) < 0.001
        );
        
        if (rawTrade) {
          console.log(`\nRaw API Data:`);
          console.log(`  side: ${rawTrade.side}`);
          console.log(`  outcome: ${rawTrade.outcome}`);
          console.log(`  outcomeIndex: ${rawTrade.outcomeIndex}`);
          console.log(`  asset: ${rawTrade.asset}`);
          console.log(`  price: ${rawTrade.price}`);
          console.log(`  size: ${rawTrade.size}`);
        }
      }
    } catch (e) {
      console.log('  Could not fetch raw data');
    }
    
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('\n💡 ANALYSIS:');
  console.log('If a trade shows:');
  console.log('  - Price 0.001 (0.1%) but market Yes is at 0.1%');
  console.log('  - This is someone BUYING Yes at 0.1% (betting Yes will happen)');
  console.log('  - OR someone SELLING No at 99.9% (equivalent position)');
  console.log('');
  console.log('Check if:');
  console.log('  1. outcome field matches the actual token being traded');
  console.log('  2. We need to invert based on side + outcome combination');
  console.log('  3. Large trades at extreme prices might be market makers');
}

debugOutcomes().catch(console.error);

