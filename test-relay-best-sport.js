const mysql = require('mysql2/promise');

// MySQL Connection Pool
const db = mysql.createPool({
  host: process.env.DB_HOST || 'db.fr-pari1.bengt.wasmernet.com',
  port: parseInt(process.env.DB_PORT) || 10272,
  database: process.env.DB_NAME || 'rsl_server',
  user: process.env.DB_USER || '418c9eb47ee7800084034406d140',
  password: process.env.DB_PASSWORD || '0692418c-9eb5-7020-8000-ba0e5bfb530d',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: false
});

async function testRelayBestSport() {
  try {
    console.log('🔍 Testing which players have Relay as their BEST sport (All Sports mode)\n');
    
    // Fetch all employees with all sport preferences
    const [employees] = await db.query(`
      SELECT 
        reg_id,
        employee_code,
        employee_name,
        cricket_priority,
        cricket_interest,
        football_priority,
        football_interest,
        badminton_priority,
        badminton_interest,
        volleyball_priority,
        volleyball_interest,
        tag_of_war_priority,
        tag_of_war_interest,
        hundred_meter_priority,
        hundred_meter_interest,
        relay_priority,
        relay_interest
      FROM employee_registrations
    `);
    
    console.log(`📊 Total employees: ${employees.length}\n`);
    
    const SPORTS_CONFIG = [
      { id: 'cricket', name: 'Cricket', key: 'cricket' },
      { id: 'football', name: 'Football', key: 'football' },
      { id: 'badminton', name: 'Badminton', key: 'badminton' },
      { id: 'volleyball', name: 'Volleyball', key: 'volleyball' },
      { id: 'tug', name: 'Tug of War', key: 'tag_of_war' },
      { id: 'race', name: '100 Meter Race', key: 'hundred_meter' },
      { id: 'relay', name: 'Relay', key: 'relay' }
    ];
    
    // Process employees and find their best sport
    const playersWithBestSport = employees.map(emp => {
      const sportScores = {};
      
      SPORTS_CONFIG.forEach((sport) => {
        const priorityField = `${sport.key}_priority`;
        const interestField = `${sport.key}_interest`;
        const priority = parseInt(emp[priorityField]) || 0;
        const interest = emp[interestField] || 'Not specified';
        
        // Check if player has registered for this sport
        const hasRegistered = priority > 0 || 
                             (interest && 
                              interest.trim() !== '' &&
                              interest.toLowerCase() !== 'not specified' &&
                              interest.toLowerCase() !== 'none' &&
                              interest.toLowerCase() !== 'null');
        
        // Calculate score: priority (0-3) + interest bonus
        let score = hasRegistered ? priority : -999;
        if (hasRegistered && interest && typeof interest === 'string') {
          const interestLower = interest.toLowerCase();
          if (interestLower.includes('high') || interestLower.includes('very')) {
            score += 2;
          } else if (interestLower.includes('medium') || interestLower.includes('moderate')) {
            score += 1;
          } else if (interestLower.includes('low') || interestLower.includes('no')) {
            score -= 1;
          }
        }
        
        sportScores[sport.id] = {
          score: score,
          priority: priority,
          interest: interest,
          hasRegistered: hasRegistered
        };
      });
      
      // Find best sport
      let bestSport = null;
      let bestScore = -999;
      
      SPORTS_CONFIG.forEach((sport) => {
        const sportData = sportScores[sport.id];
        if (sportData && sportData.hasRegistered && sportData.score > bestScore) {
          bestScore = sportData.score;
          bestSport = sport.id;
        }
      });
      
      return {
        id: emp.reg_id,
        employeeCode: emp.employee_code,
        name: emp.employee_name,
        sportScores: sportScores,
        bestSport: bestSport,
        bestScore: bestScore
      };
    });
    
    // Count players by best sport
    const playersByBestSport = {};
    SPORTS_CONFIG.forEach(sport => {
      playersByBestSport[sport.id] = [];
    });
    
    playersWithBestSport.forEach(player => {
      if (player.bestSport) {
        playersByBestSport[player.bestSport].push(player);
      }
    });
    
    console.log('📊 Players assigned to each sport (All Sports mode - best sport only):');
    SPORTS_CONFIG.forEach(sport => {
      const count = playersByBestSport[sport.id].length;
      console.log(`  ${sport.emoji} ${sport.name}: ${count} players`);
    });
    
    console.log(`\n🏃‍♂️ Players with Relay as BEST sport (${playersByBestSport['relay'].length}):`);
    if (playersByBestSport['relay'].length > 0) {
      playersByBestSport['relay'].forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (Code: ${p.employeeCode}) - Score: ${p.bestScore}`);
      });
    } else {
      console.log(`  ⚠️  No players have Relay as their best sport!`);
      console.log(`\n  This explains why Relay shows 1 0 0 0 - only 1 player (or fewer) has Relay as best sport.`);
    }
    
    // Check players who registered for Relay but have other sports as best
    const relayRegistered = playersWithBestSport.filter(p => {
      const relayData = p.sportScores?.relay;
      return relayData && relayData.hasRegistered;
    });
    
    console.log(`\n📋 Total players registered for Relay: ${relayRegistered.length}`);
    console.log(`📋 Players with Relay as BEST sport: ${playersByBestSport['relay'].length}`);
    console.log(`📋 Players registered for Relay but have OTHER sport as best: ${relayRegistered.length - playersByBestSport['relay'].length}`);
    
    if (relayRegistered.length > playersByBestSport['relay'].length) {
      console.log(`\n  ⚠️  ISSUE: ${relayRegistered.length - playersByBestSport['relay'].length} players registered for Relay but are assigned to other sports in All Sports mode!`);
      console.log(`\n  These players:`);
      relayRegistered
        .filter(p => p.bestSport !== 'relay')
        .slice(0, 10)
        .forEach((p, i) => {
          const relayScore = p.sportScores.relay.score;
          const bestScore = p.bestScore;
          console.log(`    ${i + 1}. ${p.name} - Relay score: ${relayScore}, Best: ${p.bestSport} (score: ${bestScore})`);
        });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.end();
  }
}

testRelayBestSport();

