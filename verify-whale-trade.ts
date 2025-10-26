import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

async function verifyWhaleTrade() {
  const txHash = '0x6d39f5329ee5388879d465fa2a5596db668a68a97ee46fb6b1a688e8dc883613';
  
  console.log('🔍 Verifying whale trade:', txHash);
  console.log('━'.repeat(80));
  
  // 1. Check what we have stored in our database
  console.log('\n📦 STEP 1: Checking our database...\n');
  
  const { data: storedTrade, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', txHash)
    .single();
  
  if (error || !storedTrade) {
    console.error('❌ Trade not found in database:', error);
    return;
  }
  
  console.log('✅ Found in database:');
  console.log('  Market:', storedTrade.market_question);
  console.log('  Size:', `$${storedTrade.size.toLocaleString()}`);
  console.log('  Price:', storedTrade.price);
  console.log('  Side:', storedTrade.side);
  console.log('  Outcome:', storedTrade.outcome);
  console.log('  Timestamp:', storedTrade.timestamp);
  console.log('  Maker Address:', storedTrade.maker_address || 'MISSING ❌');
  console.log('  Taker Address:', storedTrade.taker_address || 'MISSING ❌');
  
  // 2. Check the raw API data we stored
  console.log('\n📦 STEP 2: Raw API data from Polymarket...\n');
  
  if (storedTrade.platform_data) {
    const rawData = storedTrade.platform_data;
    console.log('✅ Available fields from Polymarket API:');
    console.log(JSON.stringify(Object.keys(rawData), null, 2));
    
    console.log('\n📋 Full raw trade data:');
    console.log(JSON.stringify(rawData, null, 2));
    
    // Check for any wallet-related fields
    console.log('\n👤 Wallet-related fields:');
    const walletFields = [
      'maker', 'maker_address', 'makerAddress',
      'taker', 'taker_address', 'takerAddress',
      'owner', 'trader', 'user', 'address',
      'username', 'displayName', 'account'
    ];
    
    walletFields.forEach(field => {
      if (rawData[field]) {
        console.log(`  ✅ ${field}:`, rawData[field]);
      }
    });
  } else {
    console.log('❌ No platform_data stored!');
  }
  
  // 3. Verify on Polygon blockchain
  console.log('\n🔗 STEP 3: Blockchain verification...\n');
  console.log('Transaction hash:', txHash);
  console.log('View on PolygonScan:', `https://polygonscan.com/tx/${txHash}`);
  
  // Try to fetch from Polygon API
  try {
    const polygonResponse = await fetch(
      `https://api.polygonscan.com/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=YourApiKeyToken`
    );
    
    if (polygonResponse.ok) {
      const polygonData = await polygonResponse.json();
      if (polygonData.result) {
        console.log('✅ Transaction verified on Polygon:');
        console.log('  From:', polygonData.result.from);
        console.log('  To:', polygonData.result.to);
        console.log('  Block:', polygonData.result.blockNumber);
      } else {
        console.log('⚠️ Transaction not found on Polygon (may need API key)');
      }
    }
  } catch (err) {
    console.log('⚠️ Could not verify on blockchain (requires API key)');
  }
  
  // 4. Check if Polymarket has a user profile API
  console.log('\n👤 STEP 4: Checking for user profiles...\n');
  
  const possibleAddresses = [
    storedTrade.maker_address,
    storedTrade.taker_address,
    storedTrade.platform_data?.maker,
    storedTrade.platform_data?.taker
  ].filter(Boolean);
  
  if (possibleAddresses.length > 0) {
    for (const address of possibleAddresses) {
      console.log(`\n🔍 Checking Polymarket profile for: ${address}`);
      
      // Try Polymarket's user profile endpoint
      try {
        const profileResponse = await fetch(
          `https://gamma-api.polymarket.com/users/${address}`,
          {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'HarpoonBot/1.0'
            }
          }
        );
        
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          console.log('✅ Found user profile:');
          console.log(JSON.stringify(profile, null, 2));
        } else {
          console.log(`⚠️ No profile found (${profileResponse.status})`);
        }
      } catch (err) {
        console.log('⚠️ Could not fetch profile');
      }
    }
  } else {
    console.log('❌ No wallet addresses to look up');
  }
  
  // 5. Summary
  console.log('\n' + '━'.repeat(80));
  console.log('📊 VERIFICATION SUMMARY\n');
  
  const isLegit = storedTrade.size > 0 && storedTrade.price > 0;
  console.log(isLegit ? '✅ Trade data looks legitimate' : '❌ Trade data is suspicious');
  console.log('\nData Quality:');
  console.log(`  ${storedTrade.maker_address ? '✅' : '❌'} Has maker address`);
  console.log(`  ${storedTrade.taker_address ? '✅' : '❌'} Has taker address`);
  console.log(`  ${storedTrade.platform_data ? '✅' : '❌'} Has raw API data`);
  console.log(`  ${storedTrade.size >= 10000 ? '✅' : '❌'} Meets whale threshold ($10k+)`);
  
  console.log('\nRecommendations:');
  if (!storedTrade.maker_address && !storedTrade.taker_address) {
    console.log('  ⚠️ Wallet addresses are missing - check API response format');
  }
  if (!storedTrade.platform_data) {
    console.log('  ⚠️ Platform data not stored - update collector to save raw data');
  }
}

verifyWhaleTrade().catch(console.error);

