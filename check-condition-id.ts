/**
 * Check if market_id vs conditionId are different
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkConditionId() {
  const { data: snapshots } = await supabase
    .from('active_week_data')
    .select('market_id, market_question')
    .limit(1);

  const market = snapshots![0];
  console.log(`Market: ${market.market_question}`);
  console.log(`Stored market_id: ${market.market_id}\n`);
  
  // Fetch from Polymarket to see conditionId
  const response = await fetch(`https://gamma-api.polymarket.com/markets/${market.market_id}`);
  const marketData = await response.json();
  
  console.log('Fields from Polymarket API:');
  console.log(`  id: ${marketData.id}`);
  console.log(`  conditionId: ${marketData.conditionId}`);
  console.log(`  questionID: ${marketData.questionID}`);
  
  console.log(`\n🔍 Comparison:`);
  console.log(`  market_id (what we store): ${market.market_id}`);
  console.log(`  conditionId (what trades wants): ${marketData.conditionId}`);
  console.log(`  Are they the same? ${market.market_id === marketData.conditionId ? 'YES ✅' : 'NO ❌'}`);
  
  if (market.market_id !== marketData.conditionId) {
    console.log(`\n💡 THIS IS THE PROBLEM!`);
    console.log(`   We've been querying /trades?market=${market.market_id}`);
    console.log(`   But should be querying /trades?market=${marketData.conditionId}`);
  }
}

checkConditionId().catch(console.error);

