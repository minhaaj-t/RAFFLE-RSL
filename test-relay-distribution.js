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

// Helper function to shuffle array
function shuffleArray(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

// Simulate the distributePlayersBalanced function
function distributePlayersBalanced(playersByInterest, playersWithoutInterest, totalTeams, teamArrays, teams) {
  // Track interest category for each player
  const playerInterestMap = new Map();
  
  // First, distribute each interest category using round-robin for perfect balance
  Object.keys(playersByInterest).forEach(interestKey => {
    const interestPlayers = shuffleArray(playersByInterest[interestKey]);
    
    // Round-robin distribution
    interestPlayers.forEach((player, index) => {
      const teamIndex = index % totalTeams;
      const teamId = teams[teamIndex].id;
      teamArrays[teamId].push(player);
      playerInterestMap.set(player.id, interestKey);
    });
  });
  
  // Distribute players without interest using round-robin
  if (playersWithoutInterest.length > 0) {
    const shuffledNoInterest = shuffleArray(playersWithoutInterest);
    shuffledNoInterest.forEach((player, index) => {
      const teamIndex = index % totalTeams;
      const teamId = teams[teamIndex].id;
      teamArrays[teamId].push(player);
      playerInterestMap.set(player.id, 'no-interest');
    });
  }
  
  // Calculate team counts
  const teamCounts = teams.map(team => ({
    teamId: team.id,
    count: teamArrays[team.id].length
  }));
  
  const totalPlayers = teamCounts.reduce((sum, t) => sum + t.count, 0);
  const targetPerTeam = Math.floor(totalPlayers / totalTeams);
  const remainder = totalPlayers % totalTeams;
  
  // Balance totals
  const minCount = Math.min(...teamCounts.map(t => t.count));
  const maxCount = Math.max(...teamCounts.map(t => t.count));
  
  if (maxCount - minCount > 1 || (remainder > 0 && maxCount !== minCount + 1)) {
    const teamsNeeding = [];
    const teamsWithExcess = [];
    
    const shuffledTeamIds = shuffleArray([...teams.map(t => t.id)]);
    const teamsGettingRemainder = shuffledTeamIds.slice(0, remainder);
    
    teamCounts.forEach(({ teamId, count }) => {
      const target = targetPerTeam + (teamsGettingRemainder.includes(teamId) ? 1 : 0);
      
      if (count < target) {
        teamsNeeding.push({ teamId, needed: target - count, currentCount: count });
      } else if (count > target) {
        teamsWithExcess.push({ teamId, excess: count - target, currentCount: count });
      }
    });
    
    // Redistribute
    teamsNeeding.forEach(({ teamId, needed }) => {
      for (let i = 0; i < needed; i++) {
        const excessTeam = teamsWithExcess.find(t => t.excess > 0);
        if (excessTeam) {
          const excessPlayers = teamArrays[excessTeam.teamId];
          if (excessPlayers.length > 0) {
            const player = excessPlayers.pop();
            teamArrays[teamId].push(player);
            excessTeam.excess--;
          }
        }
      }
    });
  }
  
  return teamArrays;
}

// Enhanced distribution for Relay - ensures minimum 1 per team
function distributeRelayPlayers(playersByInterest, playersWithoutInterest, totalTeams, teamArrays, teams) {
  // Combine all players
  const allPlayers = [];
  Object.keys(playersByInterest).forEach(interestKey => {
    allPlayers.push(...playersByInterest[interestKey]);
  });
  allPlayers.push(...playersWithoutInterest);
  
  const shuffledPlayers = shuffleArray(allPlayers);
  
  // Step 1: Ensure minimum 1 player per team first
  const minPerTeam = 1;
  let playerIndex = 0;
  
  // First pass: assign 1 player to each team
  for (let teamIndex = 0; teamIndex < totalTeams && playerIndex < shuffledPlayers.length; teamIndex++) {
    const teamId = teams[teamIndex].id;
    teamArrays[teamId].push(shuffledPlayers[playerIndex]);
    playerIndex++;
  }
  
  // Step 2: Distribute remaining players evenly using round-robin
  while (playerIndex < shuffledPlayers.length) {
    const teamIndex = (playerIndex - totalTeams) % totalTeams;
    const teamId = teams[teamIndex].id;
    teamArrays[teamId].push(shuffledPlayers[playerIndex]);
    playerIndex++;
  }
  
  return teamArrays;
}

async function testRelayDistribution() {
  let connection;
  try {
    // Fetch teams
    const [teams] = await db.query(`
      SELECT team_id, team_name, team_code
      FROM teams
      ORDER BY team_id ASC
    `);
    
    const formattedTeams = teams.map(row => ({
      id: row.team_code.toLowerCase(),
      teamId: row.team_id,
      name: row.team_name,
      code: row.team_code
    }));
    
    console.log(`\n📊 Found ${formattedTeams.length} teams:`);
    formattedTeams.forEach(team => console.log(`  - ${team.name} (${team.code})`));
    
    // Fetch employees
    const [employees] = await db.query(`
      SELECT 
        reg_id,
        employee_code,
        employee_name,
        relay_priority,
        relay_interest
      FROM employee_registrations
      WHERE relay_priority > 0 
         OR (relay_interest IS NOT NULL 
             AND relay_interest != '' 
             AND relay_interest != 'Not specified'
             AND relay_interest != 'None'
             AND relay_interest != 'null')
    `);
    
    console.log(`\n🏃‍♂️ Found ${employees.length} players registered for Relay`);
    
    // Process players
    const playersWithPreferences = employees.map(emp => {
      const priority = parseInt(emp.relay_priority) || 0;
      const interest = emp.relay_interest || 'Not specified';
      
      let score = priority;
      if (interest && typeof interest === 'string') {
        const interestLower = interest.toLowerCase();
        if (interestLower.includes('high') || interestLower.includes('very')) {
          score += 2;
        } else if (interestLower.includes('medium') || interestLower.includes('moderate')) {
          score += 1;
        } else if (interestLower.includes('low') || interestLower.includes('no')) {
          score -= 1;
        }
      }
      
      return {
        id: emp.reg_id,
        employeeCode: emp.employee_code,
        name: emp.employee_name,
        sportScore: score,
        sportPriority: priority,
        sportInterest: interest
      };
    });
    
    // Sort by score
    playersWithPreferences.sort((a, b) => {
      if (b.sportScore !== a.sportScore) {
        return b.sportScore - a.sportScore;
      }
      if (b.sportPriority !== a.sportPriority) {
        return b.sportPriority - a.sportPriority;
      }
      return Math.random() - 0.5;
    });
    
    // Group by interest
    const playersByInterest = {};
    const playersWithoutInterest = [];
    
    playersWithPreferences.forEach((player) => {
      const interest = player.sportInterest?.trim() || '';
      
      if (interest && 
          interest !== 'Not specified' && 
          interest !== 'None' && 
          interest !== 'null' &&
          interest !== '') {
        const interestKey = interest.toLowerCase();
        if (!playersByInterest[interestKey]) {
          playersByInterest[interestKey] = [];
        }
        playersByInterest[interestKey].push(player);
      } else {
        playersWithoutInterest.push(player);
      }
    });
    
    console.log(`\n📈 Interest distribution:`);
    Object.keys(playersByInterest).forEach(key => {
      console.log(`  - ${key}: ${playersByInterest[key].length} players`);
    });
    console.log(`  - No interest: ${playersWithoutInterest.length} players`);
    
    // Test current distribution (without sportId)
    console.log(`\n🔄 Testing CURRENT distribution logic (no sportId):`);
    const teamArraysCurrent = {};
    formattedTeams.forEach(team => {
      teamArraysCurrent[team.id] = [];
    });
    
    distributePlayersBalanced(playersByInterest, playersWithoutInterest, formattedTeams.length, teamArraysCurrent, formattedTeams, null);
    
    console.log(`\n📊 Current Distribution Results:`);
    let allTeamsHaveAtLeastOne = true;
    formattedTeams.forEach(team => {
      const count = teamArraysCurrent[team.id].length;
      const status = count >= 1 ? '✅' : '❌';
      if (count < 1) allTeamsHaveAtLeastOne = false;
      console.log(`  ${status} ${team.name}: ${count} players`);
    });
    
    if (!allTeamsHaveAtLeastOne) {
      console.log(`\n⚠️ PROBLEM: Not all teams have at least 1 player!`);
    } else {
      console.log(`\n✅ All teams have at least 1 player`);
    }
    
    // Test enhanced distribution (with sportId='relay')
    console.log(`\n🔄 Testing ENHANCED distribution logic (with sportId='relay'):`);
    const teamArraysEnhanced = {};
    formattedTeams.forEach(team => {
      teamArraysEnhanced[team.id] = [];
    });
    
    distributePlayersBalanced(playersByInterest, playersWithoutInterest, formattedTeams.length, teamArraysEnhanced, formattedTeams, 'relay');
    
    console.log(`\n📊 Enhanced Distribution Results:`);
    allTeamsHaveAtLeastOne = true;
    formattedTeams.forEach(team => {
      const count = teamArraysEnhanced[team.id].length;
      const status = count >= 1 ? '✅' : '❌';
      if (count < 1) allTeamsHaveAtLeastOne = false;
      console.log(`  ${status} ${team.name}: ${count} players`);
    });
    
    if (!allTeamsHaveAtLeastOne) {
      console.log(`\n❌ ERROR: Enhanced distribution failed!`);
    } else {
      console.log(`\n✅ All teams have at least 1 player with enhanced logic`);
    }
    
    // Calculate totals
    const totalCurrent = Object.values(teamArraysCurrent).reduce((sum, arr) => sum + arr.length, 0);
    const totalEnhanced = Object.values(teamArraysEnhanced).reduce((sum, arr) => sum + arr.length, 0);
    
    console.log(`\n📊 Totals:`);
    console.log(`  Current: ${totalCurrent} players`);
    console.log(`  Enhanced: ${totalEnhanced} players`);
    
    // Check balance
    const currentCounts = Object.values(teamArraysCurrent).map(arr => arr.length);
    const enhancedCounts = Object.values(teamArraysEnhanced).map(arr => arr.length);
    
    const currentMin = Math.min(...currentCounts);
    const currentMax = Math.max(...currentCounts);
    const enhancedMin = Math.min(...enhancedCounts);
    const enhancedMax = Math.max(...enhancedCounts);
    
    console.log(`\n⚖️ Balance:`);
    console.log(`  Current: min=${currentMin}, max=${currentMax}, diff=${currentMax - currentMin}`);
    console.log(`  Enhanced: min=${enhancedMin}, max=${enhancedMax}, diff=${enhancedMax - enhancedMin}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.end();
  }
}

testRelayDistribution();

