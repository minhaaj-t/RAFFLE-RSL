const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const { jsPDF } = require('jspdf');
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

// Team definitions (using real team names from database)
const TEAM_CARDS = [
  { id: 1, name: 'RAWABI ROYALS', code: 'ROYALS', color: '#FF6B6B' },
  { id: 2, name: 'RAWABI CHALLANGERS', code: 'SPARKS', color: '#4ECDC4' },
  { id: 3, name: 'RAWABI KINGS', code: 'KINGS', color: '#45B7D1' },
  { id: 4, name: 'RAWABI STARS', code: 'STARS', color: '#96CEB4' }
];

async function exportTeamFormatExcelAndPDF() {
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

    // Group data by sport and then by team
    const sportsData = {};
    raffleResults.forEach(result => {
      const sportId = result.sport_id;
      const teamId = result.team_id;

      if (!sportsData[sportId]) {
        sportsData[sportId] = {};
      }
      if (!sportsData[sportId][teamId]) {
        sportsData[sportId][teamId] = [];
      }

      sportsData[sportId][teamId].push({
        raffle_id: result.raffle_id,
        player_id: result.player_id,
        player_name: result.player_name || result.reg_employee_name || '',
        player_code: result.player_code || result.reg_employee_code || '',
        department: result.player_department || result.designation || '',
        working_branch: result.player_working_branch || result.reg_working_branch || '',
        division: result.player_division || result.reg_division || '',
        mobile: result.mobile || '',
        email: result.email || '',
        raffle_date: result.raffle_date,
        created_at: result.created_at
      });
    });

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(__dirname, 'team_format_exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir);
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    console.log('\n📁 Creating Excel and PDF files...\n');

    // Create Excel and PDF files for each sport
    for (const [sportId, teamData] of Object.entries(sportsData)) {
      const sportName = SPORT_NAMES[sportId] || sportId.toUpperCase();

      // Find maximum number of players in any team for this sport
      let maxPlayers = 0;
      TEAM_CARDS.forEach(team => {
        const teamPlayers = teamData[team.id] || [];
        maxPlayers = Math.max(maxPlayers, teamPlayers.length);
      });

      if (maxPlayers === 0) continue;

      // Prepare Excel data - team columns format
      const excelData = [];

      // Create header row
      const headerRow = {};
      TEAM_CARDS.forEach(team => {
        headerRow[`${team.name} (${team.code})`] = `${team.name} (${team.code})`;
      });
      excelData.push(headerRow);

      // Create player rows
      for (let i = 0; i < maxPlayers; i++) {
        const playerRow = {};
        TEAM_CARDS.forEach(team => {
          const teamPlayers = teamData[team.id] || [];
          if (i < teamPlayers.length) {
            const player = teamPlayers[i];
            const empCode = player.player_code ? ` [${player.player_code}]` : '';
            playerRow[`${team.name} (${team.code})`] = `${i + 1}. ${player.player_name}${empCode}`;
          } else {
            playerRow[`${team.name} (${team.code})`] = '';
          }
        });
        excelData.push(playerRow);
      }

      // Create Excel file
      const excelWs = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const colWidths = TEAM_CARDS.map(() => ({ wch: 35 })); // Equal width for all team columns
      excelWs['!cols'] = colWidths;

      // Create workbook
      const excelWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(excelWb, excelWs, `${sportName} Teams`);

      // Add summary sheet
      const summaryData = [
        { 'Metric': 'Sport', 'Value': sportName },
        { 'Metric': 'Total Players', 'Value': Object.values(teamData).flat().length },
        { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
      ];

      TEAM_CARDS.forEach(team => {
        const teamPlayers = teamData[team.id] || [];
        summaryData.push({
          'Metric': `${team.name} (${team.code}) Players`,
          'Value': teamPlayers.length
        });
      });

      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(excelWb, summaryWs, 'Summary');

      // Write Excel file
      const excelFileName = `${sportName}_Team_Format_${timestamp}.xlsx`;
      const excelFilePath = path.join(exportsDir, excelFileName);
      XLSX.writeFile(excelWb, excelFilePath);

      // Create PDF file (matching the existing format)
      const pdfFileName = `${sportName}_Team_Format_${timestamp}.pdf`;
      const pdfFilePath = path.join(exportsDir, pdfFileName);

      createTeamFormatPDF(sportName, teamData, maxPlayers, timestamp, pdfFilePath);

      console.log(`✅ Created: ${excelFileName} and ${pdfFileName} (${Object.values(teamData).flat().length} players)`);
    }

    // Create combined Excel file
    const combinedExcelFileName = `ALL_SPORTS_Team_Format_${timestamp}.xlsx`;
    const combinedExcelFilePath = path.join(exportsDir, combinedExcelFileName);

    const combinedWb = XLSX.utils.book_new();

    for (const [sportId, teamData] of Object.entries(sportsData)) {
      const sportName = SPORT_NAMES[sportId] || sportId.toUpperCase();

      // Find maximum number of players in any team for this sport
      let maxPlayers = 0;
      TEAM_CARDS.forEach(team => {
        const teamPlayers = teamData[team.id] || [];
        maxPlayers = Math.max(maxPlayers, teamPlayers.length);
      });

      if (maxPlayers === 0) continue;

      // Prepare data for this sport sheet
      const sportData = [];

      // Create header row
      const headerRow = {};
      TEAM_CARDS.forEach(team => {
        headerRow[`${team.name} (${team.code})`] = `${team.name} (${team.code})`;
      });
      sportData.push(headerRow);

      // Create player rows
      for (let i = 0; i < maxPlayers; i++) {
        const playerRow = {};
        TEAM_CARDS.forEach(team => {
          const teamPlayers = teamData[team.id] || [];
          if (i < teamPlayers.length) {
            const player = teamPlayers[i];
            const empCode = player.player_code ? ` [${player.player_code}]` : '';
            playerRow[`${team.name} (${team.code})`] = `${i + 1}. ${player.player_name}${empCode}`;
          } else {
            playerRow[`${team.name} (${team.code})`] = '';
          }
        });
        sportData.push(playerRow);
      }

      const ws = XLSX.utils.json_to_sheet(sportData);
      const colWidths = TEAM_CARDS.map(() => ({ wch: 35 }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(combinedWb, ws, sportName);
    }

    // Write combined Excel file
    XLSX.writeFile(combinedWb, combinedExcelFilePath);

    console.log(`\n✅ Created combined Excel file: ${combinedExcelFileName}`);

    console.log(`\n📂 All files saved in: ${exportsDir}`);
    console.log(`\n📊 Summary by Sport and Team:`);

    Object.entries(sportsData).forEach(([sportId, teamData]) => {
      const sportName = SPORT_NAMES[sportId] || sportId.toUpperCase();
      console.log(`\n🏆 ${sportName}:`);
      TEAM_CARDS.forEach(team => {
        const teamPlayers = teamData[team.id] || [];
        console.log(`   - ${team.name} (${team.code}): ${teamPlayers.length} players`);
      });
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

function createTeamFormatPDF(sportName, teamData, maxPlayers, timestamp, filePath) {
  const pdf = new jsPDF('landscape', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const cellPadding = 3;
  const lineHeight = 6;

  let yPosition = margin;

  // Header
  pdf.setFillColor(182, 203, 47); // #B6CB2F
  pdf.rect(0, 0, pageWidth, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.text('RSL RAFFLE SYSTEM', pageWidth / 2, 11, { align: 'center' });
  pdf.setFontSize(13);
  pdf.text(`Team Format Report - ${sportName}`, pageWidth / 2, 18, { align: 'center' });

  yPosition = 30;

  // Document info
  pdf.setTextColor(0, 0, 0);
  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, yPosition - 3, pageWidth - (margin * 2), 20, 'F');
  pdf.setDrawColor(200, 200, 200);
  pdf.rect(margin, yPosition - 3, pageWidth - (margin * 2), 20, 'S');

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DOCUMENT INFORMATION', margin + 5, yPosition);

  yPosition += lineHeight + 2;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');

  const dateStr = new Date().toLocaleDateString();
  const timeStr = new Date().toLocaleTimeString();
  const docId = `TF-${sportName.toUpperCase().replace(/\s+/g, '')}-${timestamp.split('T')[0]}`;

  const infoStartX = margin + 10;
  const infoCol2X = pageWidth / 2;

  pdf.text(`Sport:`, infoStartX, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(sportName, infoStartX + 20, yPosition);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date:`, infoCol2X, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(dateStr, infoCol2X + 20, yPosition);

  yPosition += lineHeight;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Teams:`, infoStartX, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text('All Teams (1-4)', infoStartX + 20, yPosition);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Time:`, infoCol2X, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(timeStr, infoCol2X + 20, yPosition);

  yPosition += lineHeight;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Document ID:`, infoStartX, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(docId, infoStartX + 30, yPosition);

  yPosition += lineHeight + 8;

  // Team table header
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'F');
  pdf.setDrawColor(150, 150, 150);
  pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'S');

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TEAM SELECTION RESULTS', margin + 5, yPosition);

  yPosition += lineHeight + 4;

  // Calculate column width - equal distribution
  const availableWidth = pageWidth - (margin * 2);
  const colSpacing = 2;
  const colWidth = (availableWidth - (colSpacing * (TEAM_CARDS.length - 1))) / TEAM_CARDS.length;

  // Draw team headers
  let startX = margin;
  TEAM_CARDS.forEach((team) => {
    const teamColor = team.color.replace('#', '');
    const r = parseInt(teamColor.substring(0, 2), 16);
    const g = parseInt(teamColor.substring(2, 4), 16);
    const b = parseInt(teamColor.substring(4, 6), 16);
    pdf.setFillColor(r, g, b);
    pdf.rect(startX, yPosition - 3, colWidth, 6, 'F');
    pdf.setDrawColor(150, 150, 150);
    pdf.rect(startX, yPosition - 3, colWidth, 6, 'S');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        const teamText = `${team.name}\n(${team.code})`;
        const lines = pdf.splitTextToSize(teamText, colWidth - 4);
        const textY = yPosition - 1;
        lines.forEach((line, index) => {
          pdf.text(line, startX + colWidth / 2, textY + (index * 3), { align: 'center' });
        });
    pdf.setTextColor(0, 0, 0);
    startX += colWidth + colSpacing;
  });

  yPosition += lineHeight + 2;

  // Draw players row by row
  for (let playerIndex = 0; playerIndex < maxPlayers; playerIndex++) {
    // Check if we need a new page
    if (yPosition + 8 > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin + 5;
    }

    let currentX = margin;
    const currentYPosition = yPosition;

    TEAM_CARDS.forEach((team) => {
      const teamPlayers = teamData[team.id] || [];

      // Draw cell border
      pdf.setDrawColor(220, 220, 220);
      pdf.rect(currentX, currentYPosition - 4, colWidth, 8, 'S');

      if (playerIndex < teamPlayers.length) {
        const player = teamPlayers[playerIndex];
        const empCode = player.player_code ? ` [${player.player_code}]` : '';
        const playerText = `${playerIndex + 1}. ${player.player_name}${empCode}`;
        const deptText = player.department || '';

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');

        // Wrap text if too long
        const maxWidth = colWidth - (cellPadding * 2);
        const lines = pdf.splitTextToSize(playerText, maxWidth);
        pdf.text(lines[0], currentX + cellPadding, currentYPosition);

        if (deptText) {
          pdf.setFontSize(7);
          pdf.setTextColor(100, 100, 100);
          const deptLines = pdf.splitTextToSize(deptText, maxWidth);
          pdf.text(deptLines[0], currentX + cellPadding, currentYPosition + 3.5);
          pdf.setTextColor(0, 0, 0);
        }
      }

      currentX += colWidth + colSpacing;
    });

    yPosition += lineHeight + 2;
  }

  // Summary section
  yPosition += lineHeight;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'F');
  pdf.setDrawColor(150, 150, 150);
  pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'S');

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SUMMARY', margin + 5, yPosition);

  yPosition += lineHeight + 4;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');

  const totalPlayers = Object.values(teamData).flat().length;
  pdf.text(`Total Players Selected:`, margin + 5, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${totalPlayers}`, margin + 55, yPosition);

  yPosition += lineHeight;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Selection Method:`, margin + 5, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Random Raffle by Teams`, margin + 45, yPosition);

  yPosition += lineHeight;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Sport:`, margin + 5, yPosition);
  pdf.setFont('helvetica', 'bold');
  pdf.text(sportName, margin + 20, yPosition);

  // Save PDF
  pdf.save(filePath);
}

// Run the export
exportTeamFormatExcelAndPDF()
  .then(() => {
    console.log('\n✅ Team format Excel and PDF export completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  });
