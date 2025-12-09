const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Database connection
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

// Sport configurations
const sportConfigs = {
  cricket: { name: 'Cricket', playersPerTeam: 11, icon: '🏏' },
  football: { name: 'Football', playersPerTeam: 11, icon: '⚽' },
  badminton: { name: 'Badminton', playersPerTeam: 2, icon: '🏸' },
  volleyball: { name: 'Volleyball', playersPerTeam: 6, icon: '🏐' },
  tug: { name: 'Tug of War', playersPerTeam: 8, icon: '🪢' },
  race: { name: '100 Meter Race', playersPerTeam: 1, icon: '🏃' },
  relay: { name: 'Relay', playersPerTeam: 4, icon: '🏃‍♂️' }
};

// Helper function to check if player is registered for a sport
function isRegisteredForSport(row, sportKey) {
  const priorityField = `${sportKey}_priority`;
  const interestField = `${sportKey}_interest`;
  
  const priority = row[priorityField];
  const interest = row[interestField];
  
  // Registered if priority > 0 OR interest is not null/empty/not "Not specified"
  if (priority !== null && priority !== undefined && !isNaN(priority) && parseInt(priority) > 0) {
    return true;
  }
  
  if (interest && typeof interest === 'string' && interest.trim() !== '' && interest.trim().toLowerCase() !== 'not specified') {
    return true;
  }
  
  return false;
}

// Generate report
async function generateReport() {
  try {
    console.log('Connecting to database...');
    
    // Query all employees with sports data
    const query = `
      SELECT 
        reg_id,
        employee_code,
        employee_name,
        designation,
        working_branch,
        division,
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
      WHERE played_season_two = 1
    `;
    
    const [rows] = await db.query(query);
    console.log(`Fetched ${rows.length} employees from database`);
    
    // Process data for each sport
    const sportData = {};
    const allPlayers = new Set();
    
    for (const [key, config] of Object.entries(sportConfigs)) {
      const registeredPlayers = rows.filter(row => {
        // Handle tag_of_war vs tug mapping
        if (key === 'tug') {
          return isRegisteredForSport(row, 'tag_of_war');
        }
        // Handle hundred_meter vs race mapping
        if (key === 'race') {
          return isRegisteredForSport(row, 'hundred_meter');
        }
        return isRegisteredForSport(row, key);
      });
      
      const playerIds = registeredPlayers.map(p => p.reg_id);
      playerIds.forEach(id => allPlayers.add(id));
      
      const teamsNeeded = Math.ceil(registeredPlayers.length / config.playersPerTeam);
      const playersFor4Teams = config.playersPerTeam * 4;
      const remainingPlayers = registeredPlayers.length % config.playersPerTeam;
      
      sportData[key] = {
        ...config,
        totalRegistered: registeredPlayers.length,
        teamsNeeded,
        playersFor4Teams,
        remainingPlayers: remainingPlayers === 0 ? null : remainingPlayers,
        registeredPlayers
      };
    }
    
    // Calculate totals
    const totalRegistrations = Object.values(sportData).reduce((sum, sport) => sum + sport.totalRegistered, 0);
    const uniquePlayers = allPlayers.size;
    const totalPlayersInDB = rows.length;
    const totalPlayersFor1Team = Object.values(sportData).reduce((sum, sport) => sum + sport.playersPerTeam, 0);
    const totalPlayersFor4Teams = Object.values(sportData).reduce((sum, sport) => sum + sport.playersFor4Teams, 0);
    const sportsWithRegistrations = Object.values(sportData).filter(sport => sport.totalRegistered > 0).length;
    const totalSports = Object.keys(sportConfigs).length;
    
    // Generate timestamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
    
    // Generate markdown report
    let markdown = `# Sports Registration Statistics\n\n`;
    markdown += `**Generated on:** ${dateStr}, ${timeStr}\n\n`;
    markdown += `---\n\n`;
    
    // Registration Overview Table
    markdown += `## Registration Overview\n\n`;
    markdown += `| Sports Name | Total Register | One Team Needed Players | 4 Team needed Players |\n`;
    markdown += `|-------------|----------------|------------------------|----------------------|\n`;
    
    for (const [key, data] of Object.entries(sportData)) {
      const sportName = data.name;
      const totalReg = data.totalRegistered;
      const oneTeam = data.playersPerTeam;
      const fourTeam = data.playersFor4Teams;
      markdown += `| ${sportName} | ${totalReg} | ${oneTeam} | ${fourTeam} |\n`;
    }
    
    markdown += `| **TOTAL** | **${totalRegistrations}** | **${totalPlayersFor1Team}** | **${totalPlayersFor4Teams}** |\n\n`;
    
    // Summary
    markdown += `## Summary\n\n`;
    markdown += `- **Total Sport Registrations (sum of all sport registrations):** ${totalRegistrations}\n`;
    markdown += `- **Unique Players Registered (players who registered for at least one sport):** ${uniquePlayers}\n`;
    markdown += `- **Total Players in Database:** ${totalPlayersInDB}\n`;
    markdown += `- **Total Players Needed for 1 Team (all sports):** ${totalPlayersFor1Team}\n`;
    markdown += `- **Total Players Needed for 4 Teams (all sports):** ${totalPlayersFor4Teams}\n`;
    markdown += `- **Sports with Registrations:** ${sportsWithRegistrations} out of ${totalSports}\n\n`;
    markdown += `---\n\n`;
    
    // Detailed Breakdown
    markdown += `## Detailed Breakdown\n\n`;
    
    for (const [key, data] of Object.entries(sportData)) {
      markdown += `### ${data.icon} ${data.name}\n\n`;
      markdown += `- **Total Registered Players:** ${data.totalRegistered}\n`;
      markdown += `- **Players per Team:** ${data.playersPerTeam}\n`;
      markdown += `- **Teams Needed (based on current registrations):** ${data.teamsNeeded}\n`;
      markdown += `- **Players Needed for 4 Teams:** ${data.playersFor4Teams}\n`;
      
      if (data.remainingPlayers !== null) {
        markdown += `- **Remaining Players (if teams are full):** ${data.remainingPlayers}\n`;
      }
      
      markdown += `\n`;
    }
    
    // Footer
    markdown += `---\n\n`;
    markdown += `**Powered By : IT Department**\n`;
    
    // Write to file
    const outputPath = path.join(__dirname, 'SPORTS_REGISTRATION_REPORT.md');
    fs.writeFileSync(outputPath, markdown, 'utf8');
    
    console.log(`\nReport generated successfully!`);
    console.log(`Output file: ${outputPath}`);
    console.log(`\nSummary:`);
    console.log(`- Total Registrations: ${totalRegistrations}`);
    console.log(`- Unique Players: ${uniquePlayers}`);
    console.log(`- Total Players in DB: ${totalPlayersInDB}`);
    
    // Close database connection
    await db.end();
    
  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }
}

// Run the script
generateReport();
