const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// MySQL Connection Pool (same as server.js)
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

// Sport mapping for better readability
const SPORT_NAMES = {
  'cricket': 'Cricket',
  'football': 'Football',
  'badminton': 'Badminton',
  'basketball': 'Basketball',
  'volleyball': 'Volleyball',
  'kabaddi': 'Kabaddi',
  'swimming': 'Swimming',
  'athletics': 'Athletics',
  'chess': 'Chess',
  'carrom': 'Carrom',
  'table_tennis': 'Table Tennis',
  'tennis': 'Tennis'
};

async function exportRaffleResultsToExcel() {
  let connection;
  try {
    console.log('🔍 Fetching raffle results data...\n');

    connection = await db.getConnection();

    // Get all raffle results with employee details
    const [raffleResults] = await connection.query(`
      SELECT
        rr.raffle_id,
        rr.sport_id,
        rr.team_id,
        rr.player_id,
        rr.player_name,
        rr.player_department,
        rr.player_code,
        rr.player_working_branch,
        rr.player_division,
        rr.raffle_date,
        rr.created_at,
        -- Get employee details from registrations table
        er.employee_name as reg_employee_name,
        er.employee_code as reg_employee_code,
        er.designation,
        er.working_branch as reg_working_branch,
        er.division as reg_division,
        er.mobile,
        er.email
      FROM raffle_results rr
      LEFT JOIN employee_registrations er ON rr.player_id = er.reg_id
      ORDER BY rr.sport_id, rr.team_id, rr.raffle_date DESC
    `);

    console.log(`📊 Found ${raffleResults.length} raffle results`);

    if (raffleResults.length === 0) {
      console.log('❌ No raffle results found!');
      return;
    }

    // Group data by sport
    const sportsData = {};
    raffleResults.forEach(result => {
      const sportId = result.sport_id;
      if (!sportsData[sportId]) {
        sportsData[sportId] = [];
      }
      sportsData[sportId].push(result);
    });

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(__dirname, 'raffle_exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir);
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const allData = [];

    console.log('\n📁 Creating Excel files...\n');

    // Create separate Excel files for each sport
    for (const [sportId, data] of Object.entries(sportsData)) {
      const sportName = SPORT_NAMES[sportId] || sportId.toUpperCase();
      const fileName = `${sportName}_Raffle_Results_${timestamp}.xlsx`;
      const filePath = path.join(exportsDir, fileName);

      // Prepare data for Excel
      const excelData = data.map(result => ({
        'Raffle ID': result.raffle_id,
        'Sport': sportName,
        'Team ID': result.team_id,
        'Player ID': result.player_id,
        'Employee Code': result.player_code || result.reg_employee_code || '',
        'Player Name': result.player_name || result.reg_employee_name || '',
        'Department': result.player_department || result.designation || '',
        'Working Branch': result.player_working_branch || result.reg_working_branch || '',
        'Division': result.player_division || result.reg_division || '',
        'Mobile': result.mobile || '',
        'Email': result.email || '',
        'Raffle Date': result.raffle_date ? new Date(result.raffle_date).toLocaleString() : '',
        'Created At': result.created_at ? new Date(result.created_at).toLocaleString() : ''
      }));

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const colWidths = [
        { wch: 10 }, // Raffle ID
        { wch: 12 }, // Sport
        { wch: 8 },  // Team ID
        { wch: 10 }, // Player ID
        { wch: 15 }, // Employee Code
        { wch: 30 }, // Player Name
        { wch: 25 }, // Department
        { wch: 20 }, // Working Branch
        { wch: 15 }, // Division
        { wch: 15 }, // Mobile
        { wch: 25 }, // Email
        { wch: 20 }, // Raffle Date
        { wch: 20 }  // Created At
      ];
      ws['!cols'] = colWidths;

      // Create workbook and add worksheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${sportName} Results`);

      // Add summary sheet
      const summaryData = [{
        'Metric': 'Total Players',
        'Value': data.length
      }, {
        'Metric': 'Unique Teams',
        'Value': [...new Set(data.map(r => r.team_id))].length
      }, {
        'Metric': 'Date Range',
        'Value': `${new Date(Math.min(...data.map(r => new Date(r.raffle_date)))).toLocaleDateString()} - ${new Date(Math.max(...data.map(r => new Date(r.raffle_date)))).toLocaleDateString()}`
      }];

      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // Write file
      XLSX.writeFile(wb, filePath);
      console.log(`✅ Created: ${fileName} (${data.length} players)`);

      // Add to all data for combined file
      allData.push(...excelData);
    }

    // Create combined Excel file with all sports
    const combinedFileName = `ALL_SPORTS_Raffle_Results_${timestamp}.xlsx`;
    const combinedFilePath = path.join(exportsDir, combinedFileName);

    // Sort all data by sport, then team, then raffle date
    allData.sort((a, b) => {
      if (a.Sport !== b.Sport) return a.Sport.localeCompare(b.Sport);
      if (a['Team ID'] !== b['Team ID']) return a['Team ID'] - b['Team ID'];
      return new Date(b['Raffle Date']) - new Date(a['Raffle Date']);
    });

    // Create combined worksheet
    const combinedWs = XLSX.utils.json_to_sheet(allData);

    // Set column widths for combined file
    combinedWs['!cols'] = [
      { wch: 10 }, // Raffle ID
      { wch: 12 }, // Sport
      { wch: 8 },  // Team ID
      { wch: 10 }, // Player ID
      { wch: 15 }, // Employee Code
      { wch: 30 }, // Player Name
      { wch: 25 }, // Department
      { wch: 20 }, // Working Branch
      { wch: 15 }, // Division
      { wch: 15 }, // Mobile
      { wch: 25 }, // Email
      { wch: 20 }, // Raffle Date
      { wch: 20 }  // Created At
    ];

    // Create combined workbook
    const combinedWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(combinedWb, combinedWs, 'All Sports Results');

    // Add overall summary sheet
    const overallSummaryData = [
      { 'Metric': 'Total Players (All Sports)', 'Value': allData.length },
      { 'Metric': 'Total Sports', 'Value': Object.keys(sportsData).length },
      { 'Metric': 'Sports List', 'Value': Object.keys(sportsData).map(sport => SPORT_NAMES[sport] || sport.toUpperCase()).join(', ') },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
    ];

    // Add sport-wise breakdown
    Object.entries(sportsData).forEach(([sportId, data]) => {
      overallSummaryData.push({
        'Metric': `${SPORT_NAMES[sportId] || sportId.toUpperCase()} Players`,
        'Value': data.length
      });
    });

    const overallSummaryWs = XLSX.utils.json_to_sheet(overallSummaryData);
    XLSX.utils.book_append_sheet(combinedWb, overallSummaryWs, 'Overall Summary');

    // Write combined file
    XLSX.writeFile(combinedWb, combinedFilePath);
    console.log(`\n✅ Created combined file: ${combinedFileName} (${allData.length} total players)`);

    console.log(`\n📂 All Excel files saved in: ${exportsDir}`);
    console.log(`\n📊 Summary by Sport:`);

    Object.entries(sportsData).forEach(([sportId, data]) => {
      const sportName = SPORT_NAMES[sportId] || sportId.toUpperCase();
      console.log(`   - ${sportName}: ${data.length} players`);
    });

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

// Run the export
exportRaffleResultsToExcel()
  .then(() => {
    console.log('\n✅ Excel export completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  });

