const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// MySQL Connection Pool
const db = mysql.createPool({
  host: 'db.fr-pari1.bengt.wasmernet.com',
  port: 10272,
  database: 'rsl_server',
  user: '418c9eb47ee7800084034406d140',
  password: '0692418c-9eb5-7020-8000-ba0e5bfb530d',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testSportBySport() {
  let connection;
  try {
    console.log('🔍 Testing Sport-by-Sport Raffle Logic...\n');
    
    connection = await db.getConnection();
    
    // Get all employees
    const [employees] = await connection.query(`
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
      ORDER BY employee_code
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
    
    // Process employees similar to frontend
    const processedEmployees = employees.map(emp => {
      const sportsPreferences = {};
      
      SPORTS_CONFIG.forEach(sport => {
        const priorityField = `${sport.key}_priority`;
        const interestField = `${sport.key}_interest`;
        const priority = emp[priorityField] || 0;
        const interest = emp[interestField] || 'Not specified';
        
        sportsPreferences[sport.id] = {
          priority: parseInt(priority) || 0,
          interest: interest
        };
      });
      
      return {
        id: emp.reg_id,
        employeeCode: emp.employee_code,
        name: emp.employee_name,
        sportsPreferences: sportsPreferences
      };
    });
    
    // Simulate sport-by-sport raffle logic
    const assignedPlayerIds = new Set();
    const sportAssignments = {};
    const excludedPlayers = [];
    
    // Track which players are in which sports (for sport-by-sport mode)
    const playersInSports = {}; // { sportId: Set of player IDs }
    SPORTS_CONFIG.forEach(sport => {
      playersInSports[sport.id] = new Set();
    });
    
    SPORTS_CONFIG.forEach(sport => {
      const sportKey = sport.key;
      const sportId = sport.id;
      
      // Filter players (NEW logic - allow multiple sports, just check if already in THIS sport)
      const playersForSport = processedEmployees
        .map(player => {
          const prefs = player.sportsPreferences || {};
          const sportPrefs = prefs[sportId] || {};
          const priority = sportPrefs.priority || 0;
          const interest = sportPrefs.interest || 'Not specified';
          
          // Calculate score
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
            ...player,
            sportScore: score,
            sportPriority: priority,
            sportInterest: interest
          };
        })
        .filter(player => {
          const hasPriority = player.sportPriority > 0;
          const hasInterest = player.sportInterest && 
                             player.sportInterest.trim() !== '' &&
                             player.sportInterest.toLowerCase() !== 'not specified' &&
                             player.sportInterest.toLowerCase() !== 'none' &&
                             player.sportInterest.toLowerCase() !== 'null';
          
          if (!(hasPriority || hasInterest)) {
            return false; // Not registered for this sport
          }
          
          // Check if already in THIS sport (not other sports)
          return !playersInSports[sportId].has(player.id);
        });
      
      sportAssignments[sportId] = playersForSport;
      
      // Mark players as in this sport
      playersForSport.forEach(player => {
        playersInSports[sportId].add(player.id);
        assignedPlayerIds.add(player.id); // Also track for total count
      });
      
      console.log(`${sport.name}: ${playersForSport.length} players assigned`);
    });
    
    // Find players not assigned to any sport
    const totalAssigned = assignedPlayerIds.size;
    const unassignedPlayers = processedEmployees.filter(emp => !assignedPlayerIds.has(emp.id));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total employees: ${employees.length}`);
    console.log(`   Total assigned: ${totalAssigned}`);
    console.log(`   Unassigned: ${unassignedPlayers.length}`);
    
    if (unassignedPlayers.length > 0) {
      console.log(`\n⚠️ Unassigned Players (${unassignedPlayers.length}):`);
      unassignedPlayers.forEach(player => {
        const registrations = [];
        SPORTS_CONFIG.forEach(sport => {
          const pref = player.sportsPreferences[sport.id];
          if (pref && (pref.priority > 0 || 
              (pref.interest && pref.interest.toLowerCase() !== 'not specified'))) {
            registrations.push(`${sport.name} (P:${pref.priority})`);
          }
        });
        console.log(`   - ${player.employeeCode} (${player.name}): ${registrations.join(', ') || 'No registrations'}`);
      });
    }
    
    // Generate report
    let report = `# Sport-by-Sport Raffle Test Report\n\n`;
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    report += `---\n\n`;
    report += `## 📊 Summary\n\n`;
    report += `| Metric | Count |\n`;
    report += `|--------|-------|\n`;
    report += `| Total Employees | ${employees.length} |\n`;
    report += `| Total Assigned | ${totalAssigned} |\n`;
    report += `| **Unassigned** | **${unassignedPlayers.length}** |\n`;
    report += `\n---\n\n`;
    
    report += `## 🏃 Players Per Sport\n\n`;
    report += `| Sport | Assigned Players |\n`;
    report += `|-------|------------------|\n`;
    SPORTS_CONFIG.forEach(sport => {
      report += `| ${sport.name} | ${sportAssignments[sport.id].length} |\n`;
    });
    report += `\n---\n\n`;
    
    if (unassignedPlayers.length > 0) {
      report += `## ⚠️ Unassigned Players\n\n`;
      report += `These players are NOT assigned to any sport in sport-by-sport mode:\n\n`;
      report += `| Employee Code | Name | Registrations |\n`;
      report += `|---------------|------|---------------|\n`;
      
      unassignedPlayers.forEach(player => {
        const registrations = [];
        SPORTS_CONFIG.forEach(sport => {
          const pref = player.sportsPreferences[sport.id];
          if (pref && (pref.priority > 0 || 
              (pref.interest && pref.interest.toLowerCase() !== 'not specified'))) {
            registrations.push(`${sport.name} (P:${pref.priority})`);
          }
        });
        report += `| ${player.employeeCode} | ${player.name} | ${registrations.join(', ') || 'No registrations'} |\n`;
      });
    }
    
    const reportPath = path.join(__dirname, 'SPORT_BY_SPORT_TEST_REPORT.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\n📄 Report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await db.end();
  }
}

testSportBySport()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

