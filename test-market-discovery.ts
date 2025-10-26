/**
 * Test script to preview which markets will be discovered
 * Run with: npx tsx test-market-discovery.ts
 */

const MIN_VOLUME_THRESHOLD = 100000; // $100k

// Exclusion keywords (sports, entertainment, crypto, weather)
const exclusionKeywords = [
  'f1', 'formula 1', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football',
  'basketball', 'tennis', 'golf', 'boxing', 'mma', 'ufc',
  'poker', 'heads-up poker', 'wsop', 'world series of poker',
  'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga',
  'oscar', 'emmy', 'grammy', 'movie', 'film', 'actor',
  'bitcoin price', 'ethereum price', 'btc hit', 'eth hit', 'solana price',
  'weather', 'temperature', 'celsius', 'fahrenheit'
];

async function testMarketDiscovery() {
  console.log('🔍 Fetching political markets from Polymarket API...\n');
  
  try {
    // Use the optimized politics tag endpoint
    let allEvents: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    console.log('   Using tag=politics endpoint with pagination...');
    while (hasMore) {
      const url = `https://gamma-api.polymarket.com/events?tag=politics&closed=false&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HarpoonBot/1.0'
        }
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch events at offset ${offset}`);
        break;
      }

      const eventsData = await response.json();
      const events = Array.isArray(eventsData) ? eventsData : (eventsData.data || []);

      if (events.length === 0) {
        hasMore = false;
      } else {
        allEvents = allEvents.concat(events);
        console.log(`   Fetched ${events.length} events (offset ${offset})`);
        offset += limit;
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n📊 Total political events fetched: ${allEvents.length}`);

    // Extract all markets from events
    let allMarkets: any[] = [];
    for (const event of allEvents) {
      const markets = (event.markets || []).map((m: any) => ({
        ...m,
        eventTitle: event.title,
        eventId: event.id
      }));
      allMarkets = allMarkets.concat(markets);
    }

    console.log(`📊 Total markets from events: ${allMarkets.length}\n`);

    // Step 1: Filter by volume
    const highVolumeMarkets = allMarkets.filter((m: any) => {
      const volume = parseFloat(m.volumeNum || m.volume || 0);
      return volume >= MIN_VOLUME_THRESHOLD;
    });

    console.log(`💰 Markets with >= $${MIN_VOLUME_THRESHOLD.toLocaleString()} volume: ${highVolumeMarkets.length}\n`);

    // Step 2: Apply exclusion filters
    const politicalMarkets = highVolumeMarkets.filter((m: any) => {
      const searchText = [
        m.question || '',
        m.description || '',
        m.eventTitle || '',
        m.groupItemTitle || ''
      ].join(' ').toLowerCase();

      const hasExclusionKeyword = exclusionKeywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );

      return !hasExclusionKeyword;
    });

    console.log(`🎯 POLITICAL markets after filtering: ${politicalMarkets.length}\n`);
    console.log('=' .repeat(80));
    console.log('TOP 20 POLITICAL MARKETS THAT WILL BE TRACKED:');
    console.log('=' .repeat(80));

    // Sort by volume and show top 20
    politicalMarkets
      .sort((a: any, b: any) => {
        const volA = parseFloat(a.volumeNum || a.volume || 0);
        const volB = parseFloat(b.volumeNum || b.volume || 0);
        return volB - volA;
      })
      .slice(0, 20)
      .forEach((m: any, idx: number) => {
        const volume = parseFloat(m.volumeNum || m.volume || 0);
        const question = m.question || 'No question';
        
        console.log(`\n${idx + 1}. ${question}`);
        console.log(`   Volume: $${volume.toLocaleString()}`);
        console.log(`   Event: ${m.eventTitle || 'N/A'}`);
      });

    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Total political markets that will be tracked: ${politicalMarkets.length}`);
    console.log(`🚫 Markets excluded (sports/entertainment/crypto/weather): ${highVolumeMarkets.length - politicalMarkets.length}`);

    // Show some excluded examples
    const excludedMarkets = highVolumeMarkets.filter((m: any) => {
      const searchText = [
        m.question || '',
        m.description || '',
        m.eventTitle || '',
        m.groupItemTitle || ''
      ].join(' ').toLowerCase();

      const hasExclusionKeyword = exclusionKeywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );

      return hasExclusionKeyword;
    });

    if (excludedMarkets.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('EXAMPLES OF EXCLUDED MARKETS (sports/entertainment/crypto/weather):');
      console.log('='.repeat(80));
      
      excludedMarkets.slice(0, 10).forEach((m: any, idx: number) => {
        const volume = parseFloat(m.volumeNum || m.volume || 0);
        const question = m.question || 'No question';
        
        console.log(`\n${idx + 1}. ${question}`);
        console.log(`   Volume: $${volume.toLocaleString()}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testMarketDiscovery();

