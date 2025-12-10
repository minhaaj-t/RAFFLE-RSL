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

// Simulate the distributePlayersBalanced function from App.js
function distributePlayersBalanced(playersByInterest, playersWithoutInterest, totalTeams, teamArrays, teams, sportId = null) {
  // Guard against undefined or empty teams
  if (!teams || teams.length === 0) {
    console.error('⚠️ Teams array is empty or undefined in distributePlayersBalanced');
    return teamArrays;
  }
  
  // Track interest category for each player
  const playerInterestMap = new Map();
  
  // Calculate total players
  let totalPlayers = playersWithoutInterest.length;
  Object.keys(playersByInterest).forEach(interestKey => {
    totalPlayers += playersByInterest[interestKey].length;
  });
  
  // For Relay sport, ensure minimum 1 player per team if we have enough players
  const isRelay = sportId === 'relay';
  
  // Debug logging for Relay
  if (isRelay) {
    console.log(`🏃‍♂️ Relay distribution: totalPlayers=${totalPlayers}, totalTeams=${totalTeams}`);
  }
  
  // If Relay and we have fewer players than teams, we can't guarantee 1 per team
  // But if we have at least as many players as teams, ensure minimum distribution
  if (isRelay && totalPlayers >= totalTeams) {
    console.log(`🏃‍♂️ Using Relay-specific distribution (ensuring min 1 per team)`);
    
    // First pass: ensure minimum 1 player per team
    const allPlayersFlat = [];
    Object.keys(playersByInterest).forEach(interestKey => {
      playersByInterest[interestKey].forEach(player => {
        allPlayersFlat.push({ player, interest: interestKey });
      });
    });
    playersWithoutInterest.forEach(player => {
      allPlayersFlat.push({ player, interest: 'no-interest' });
    });
    
    const shuffledAll = shuffleArray(allPlayersFlat);
    let playerIndex = 0;
    
    console.log(`🏃‍♂️ Shuffled players: ${shuffledAll.length}`);
    
    // Assign minimum 1 to each team first
    for (let teamIndex = 0; teamIndex < totalTeams && playerIndex < shuffledAll.length; teamIndex++) {
      const { player, interest } = shuffledAll[playerIndex];
      const teamId = teams[teamIndex].id;
      teamArrays[teamId].push(player);
      playerInterestMap.set(player.id, interest);
      console.log(`🏃‍♂️ Assigned ${player.name} to team ${teamId} (teamIndex ${teamIndex})`);
      playerIndex++;
    }
    
    // Remove assigned players from interest groups
    const assignedPlayerIds = new Set();
    for (let i = 0; i < playerIndex; i++) {
      assignedPlayerIds.add(shuffledAll[i].player.id);
    }
    
    // Update interest groups to remove assigned players
    Object.keys(playersByInterest).forEach(interestKey => {
      playersByInterest[interestKey] = playersByInterest[interestKey].filter(p => !assignedPlayerIds.has(p.id));
    });
    const remainingNoInterest = playersWithoutInterest.filter(p => !assignedPlayerIds.has(p.id));
    
    console.log(`🏃‍♂️ After first pass: ${playerIndex} players assigned (1 per team)`);
    console.log(`🏃‍♂️ Remaining players: ${Object.keys(playersByInterest).reduce((sum, k) => sum + playersByInterest[k].length, 0) + remainingNoInterest.length}`);
    
    // Continue with normal distribution for remaining players
    Object.keys(playersByInterest).forEach(interestKey => {
      const interestPlayers = shuffleArray(playersByInterest[interestKey]);
      interestPlayers.forEach((player, index) => {
        const teamIndex = (playerIndex + index) % totalTeams;
        const teamId = teams[teamIndex].id;
        teamArrays[teamId].push(player);
        playerInterestMap.set(player.id, interestKey);
      });
      playerIndex += interestPlayers.length;
    });
    
    if (remainingNoInterest.length > 0) {
      const shuffledNoInterest = shuffleArray(remainingNoInterest);
      shuffledNoInterest.forEach((player, index) => {
        const teamIndex = (playerIndex + index) % totalTeams;
        const teamId = teams[teamIndex].id;
        teamArrays[teamId].push(player);
        playerInterestMap.set(player.id, 'no-interest');
      });
    }
  } else {
    // Normal distribution for non-Relay or when we have enough players
    Object.keys(playersByInterest).forEach(interestKey => {
      const interestPlayers = shuffleArray(playersByInterest[interestKey]);
      interestPlayers.forEach((player, index) => {
        const teamIndex = index % totalTeams;
        const teamId = teams[teamIndex].id;
        teamArrays[teamId].push(player);
        playerInterestMap.set(player.id, interestKey);
      });
    });
    
    if (playersWithoutInterest.length > 0) {
      const shuffledNoInterest = shuffleArray(playersWithoutInterest);
      shuffledNoInterest.forEach((player, index) => {
        const teamIndex = index % totalTeams;
        const teamId = teams[teamIndex].id;
        teamArrays[teamId].push(player);
        playerInterestMap.set(player.id, 'no-interest');
      });
    }
  }
  
  // Calculate team counts
  const teamCounts = teams.map(team => ({
    teamId: team.id,
    count: teamArrays[team.id].length
  }));
  
  const distributedTotal = teamCounts.reduce((sum, t) => sum + t.count, 0);
  const targetPerTeam = Math.floor(distributedTotal / totalTeams);
  const remainder = distributedTotal % totalTeams;
  
  // Balance totals
  const minCount = Math.min(...teamCounts.map(t => t.count));
  const maxCount = Math.max(...teamCounts.map(t => t.count));
  
  console.log(`🏃‍♂️ After distribution: min=${minCount}, max=${maxCount}, targetPerTeam=${targetPerTeam}, remainder=${remainder}`);
  
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
    
    console.log(`🏃‍♂️ Teams needing: ${teamsNeeding.length}, Teams with excess: ${teamsWithExcess.length}`);
    
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
            console.log(`🏃‍♂️ Moved player from ${excessTeam.teamId} to ${teamId}`);
          }
        }
      }
    });
  }
  
  return teamArrays;
}

async function testAllSportsRelay() {
  try {
    console.log('🔍 Testing All Sports Raffle - Relay Distribution\n');
    
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
    
    console.log(`📊 Found ${formattedTeams.length} teams:`);
    formattedTeams.forEach(team => console.log(`  - ${team.name} (${team.code})`));
    
    // Fetch employees who registered for Relay
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
      ORDER BY relay_priority DESC, employee_code
      LIMIT 10
    `);
    
    console.log(`\n🏃‍♂️ Found ${employees.length} players registered for Relay`);
    
    // Simulate "All Sports" mode - players are assigned to their BEST sport only
    // So we need to check which players would be assigned to Relay as their best sport
    // For this test, let's use the first 4 players (simulating the actual scenario)
    const relayPlayers = employees.slice(0, 4).map(emp => ({
      id: emp.reg_id,
      employeeCode: emp.employee_code,
      name: emp.employee_name,
      sportsPreferences: {
        relay: {
          priority: parseInt(emp.relay_priority) || 0,
          interest: emp.relay_interest || 'Not specified'
        }
      }
    }));
    
    console.log(`\n🏃‍♂️ Testing with ${relayPlayers.length} Relay players (simulating All Sports mode):`);
    relayPlayers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (Code: ${p.employeeCode})`);
    });
    
    // Group by interest (all will likely be "no-interest" or similar)
    const playersByInterest = {};
    const playersWithoutInterest = [];
    
    relayPlayers.forEach((player) => {
      const interest = player.sportsPreferences?.relay?.interest?.trim() || '';
      
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
    
    // Test distribution
    console.log(`\n🔄 Testing Relay distribution (4 players, 4 teams):`);
    const teamSportArrays = {};
    formattedTeams.forEach(team => {
      teamSportArrays[team.id] = [];
    });
    
    distributePlayersBalanced(playersByInterest, playersWithoutInterest, formattedTeams.length, teamSportArrays, formattedTeams, 'relay');
    
    console.log(`\n📊 Distribution Results:`);
    let allTeamsHaveOne = true;
    formattedTeams.forEach(team => {
      const count = teamSportArrays[team.id].length;
      const status = count >= 1 ? '✅' : '❌';
      if (count < 1) allTeamsHaveOne = false;
      console.log(`  ${status} ${team.name}: ${count} players`);
      if (count > 0) {
        teamSportArrays[team.id].forEach((p, i) => {
          console.log(`    ${i + 1}. ${p.name} (${p.employeeCode})`);
        });
      }
    });
    
    if (!allTeamsHaveOne) {
      console.log(`\n❌ PROBLEM: Not all teams have at least 1 player!`);
      console.log(`This matches the user's reported issue.`);
    } else {
      console.log(`\n✅ All teams have at least 1 player`);
    }
    
    // Test multiple times to see if it's consistent
    console.log(`\n🔄 Testing 5 times to check consistency:`);
    for (let test = 1; test <= 5; test++) {
      const testArrays = {};
      formattedTeams.forEach(team => {
        testArrays[team.id] = [];
      });
      
      distributePlayersBalanced(playersByInterest, playersWithoutInterest, formattedTeams.length, testArrays, formattedTeams, 'relay');
      
      const counts = formattedTeams.map(team => testArrays[team.id].length);
      const allHaveOne = counts.every(c => c >= 1);
      console.log(`  Test ${test}: ${counts.join(' ')} ${allHaveOne ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.end();
  }
}

testAllSportsRelay();

