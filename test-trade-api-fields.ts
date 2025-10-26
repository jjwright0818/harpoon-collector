import 'dotenv/config';

// Test what fields the Polymarket trades API actually returns
async function testTradeFields() {
  // Jim Walden market condition ID (from your screenshot)
  const conditionId = '0xf1bb9605b0eb1b05e86c3f96cd4e94e7f52e55ae0b4f00308d37d65bdbd28cd0';
  
  const url = `https://data-api.polymarket.com/trades?market=${conditionId}&limit=5`;
  
  console.log('🔍 Fetching trades from:', url);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'HarpoonBot/1.0'
    }
  });
  
  if (!response.ok) {
    console.error(`❌ API Error: ${response.status} ${response.statusText}`);
    return;
  }
  
  const trades = await response.json();
  
  console.log(`\n📊 Found ${trades.length} trades\n`);
  
  if (trades.length > 0) {
    const firstTrade = trades[0];
    
    console.log('🔑 Available fields in trade object:');
    console.log(JSON.stringify(Object.keys(firstTrade), null, 2));
    
    console.log('\n📦 Full first trade object:');
    console.log(JSON.stringify(firstTrade, null, 2));
    
    // Check specifically for wallet addresses
    console.log('\n👤 Wallet address fields:');
    console.log('- maker:', firstTrade.maker);
    console.log('- maker_address:', firstTrade.maker_address);
    console.log('- taker:', firstTrade.taker);
    console.log('- taker_address:', firstTrade.taker_address);
    console.log('- makerAddress:', firstTrade.makerAddress);
    console.log('- takerAddress:', firstTrade.takerAddress);
  }
}

testTradeFields().catch(console.error);

