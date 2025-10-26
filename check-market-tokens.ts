/**
 * Check what token IDs a market has
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkMarketTokens() {
  // Get a sample market
  const { data: snapshots } = await supabase
    .from('active_week_data')
    .select('market_id, market_question')
    .limit(1);

  const testMarket = snapshots![0];
  console.log(`Market: ${testMarket.market_question}`);
  console.log(`Market ID: ${testMarket.market_id}\n`);

  // Fetch market details
  const response = await fetch(`https://gamma-api.polymarket.com/markets/${testMarket.market_id}`);
  const marketData = await response.json();

  console.log('Token/Asset fields in market:');
  console.log(`  clobTokenIds:`, marketData.clobTokenIds);
  console.log(`  tokens:`, marketData.tokens);
  console.log(`  outcomePrices:`, marketData.outcomePrices);
  
  if (marketData.clobTokenIds) {
    console.log(`\nToken details:`);
    marketData.clobTokenIds.forEach((token: any, i: number) => {
      console.log(`  Token ${i}: ${token.tokenID || token.token_id || 'unknown'}`);
    });
  }
}

checkMarketTokens().catch(console.error);

