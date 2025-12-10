const mysql = require('mysql2/promise');
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

async function checkUnmatchedUsers() {
  let connection;
  try {
    console.log('🔍 Starting deep check of employee_registrations and raffle_results tables...\n');
    
    connection = await db.getConnection();
    
    // Get all employees from employee_registrations
    const [employees] = await connection.query(`
      SELECT 
        reg_id,
        employee_code,
        employee_name,
        designation,
        working_branch,
        division,
        mobile,
        email
      FROM employee_registrations
      ORDER BY employee_code
    `);
    
    console.log(`📊 Total employees in employee_registrations: ${employees.length}`);
    
    // Get all unique employee codes from raffle_results
    const [raffleResults] = await connection.query(`
      SELECT DISTINCT
        player_code,
        player_id,
        player_name,
        player_department,
        COUNT(*) as raffle_count,
        GROUP_CONCAT(DISTINCT sport_id ORDER BY sport_id) as sports,
        GROUP_CONCAT(DISTINCT team_id ORDER BY team_id) as teams,
        MIN(raffle_date) as first_raffle_date,
        MAX(raffle_date) as last_raffle_date
      FROM raffle_results
      WHERE player_code IS NOT NULL AND player_code != ''
      GROUP BY player_code, player_id, player_name, player_department
      ORDER BY player_code
    `);
    
    console.log(`📊 Total unique employee codes in raffle_results: ${raffleResults.length}`);
    
    // Create maps for quick lookup
    const employeeCodeMap = new Map();
    const employeeIdMap = new Map();
    
    employees.forEach(emp => {
      const code = (emp.employee_code || '').trim().toUpperCase();
      if (code) {
        if (!employeeCodeMap.has(code)) {
          employeeCodeMap.set(code, []);
        }
        employeeCodeMap.get(code).push(emp);
      }
      employeeIdMap.set(emp.reg_id, emp);
    });
    
    const raffledCodeMap = new Map();
    const raffledIdMap = new Map();
    
    raffleResults.forEach(result => {
      const code = (result.player_code || '').trim().toUpperCase();
      if (code) {
        if (!raffledCodeMap.has(code)) {
          raffledCodeMap.set(code, []);
        }
        raffledCodeMap.get(code).push(result);
      }
      if (result.player_id) {
        raffledIdMap.set(result.player_id, result);
      }
    });
    
    // Find unmatched users
    const unmatchedByCode = [];
    const unmatchedById = [];
    const matchedUsers = [];
    const codeMismatches = [];
    
    // Check employees not in raffle_results (by code)
    employeeCodeMap.forEach((empList, code) => {
      if (!raffledCodeMap.has(code)) {
        empList.forEach(emp => {
          unmatchedByCode.push({
            type: 'Not Raffled',
            employee_code: emp.employee_code,
            reg_id: emp.reg_id,
            employee_name: emp.employee_name,
            designation: emp.designation,
            working_branch: emp.working_branch,
            division: emp.division,
            reason: 'Employee code exists in employee_registrations but not in raffle_results'
          });
        });
      } else {
        // Check if IDs match
        empList.forEach(emp => {
          const raffledList = raffledCodeMap.get(code);
          const matched = raffledList.some(r => r.player_id === emp.reg_id);
          if (matched) {
            matchedUsers.push({
              employee_code: emp.employee_code,
              reg_id: emp.reg_id,
              employee_name: emp.employee_name,
              raffle_count: raffledList.find(r => r.player_id === emp.reg_id)?.raffle_count || 0
            });
          } else {
            codeMismatches.push({
              employee_code: emp.employee_code,
              reg_id: emp.reg_id,
              employee_name: emp.employee_name,
              raffled_player_ids: raffledList.map(r => r.player_id).join(', '),
              reason: 'Employee code matches but reg_id does not match'
            });
          }
        });
      }
    });
    
    // Check raffle_results not in employee_registrations (by code)
    raffledCodeMap.forEach((raffledList, code) => {
      if (!employeeCodeMap.has(code)) {
        raffledList.forEach(result => {
          unmatchedByCode.push({
            type: 'Orphaned Raffle',
            employee_code: result.player_code,
            player_id: result.player_id,
            player_name: result.player_name,
            raffle_count: result.raffle_count,
            sports: result.sports,
            teams: result.teams,
            reason: 'Employee code exists in raffle_results but not in employee_registrations'
          });
        });
      }
    });
    
    // Check by ID
    employeeIdMap.forEach((emp, id) => {
      if (!raffledIdMap.has(id)) {
        unmatchedById.push({
          type: 'Not Raffled (by ID)',
          reg_id: id,
          employee_code: emp.employee_code,
          employee_name: emp.employee_name,
          reason: 'reg_id exists in employee_registrations but not in raffle_results'
        });
      }
    });
    
    raffledIdMap.forEach((result, id) => {
      if (!employeeIdMap.has(id)) {
        unmatchedById.push({
          type: 'Orphaned Raffle (by ID)',
          player_id: id,
          player_code: result.player_code,
          player_name: result.player_name,
          reason: 'player_id exists in raffle_results but not in employee_registrations'
        });
      }
    });
    
    // Generate markdown report
    const report = generateMarkdownReport({
      totalEmployees: employees.length,
      totalRaffledCodes: raffleResults.length,
      unmatchedByCode,
      unmatchedById,
      matchedUsers,
      codeMismatches
    });
    
    // Save to file
    const reportPath = path.join(__dirname, 'UNMATCHED_USERS_REPORT.md');
    fs.writeFileSync(reportPath, report, 'utf8');
    
    console.log('\n✅ Analysis complete!');
    console.log(`📄 Report saved to: ${reportPath}`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Total employees: ${employees.length}`);
    console.log(`   - Total raffled codes: ${raffleResults.length}`);
    console.log(`   - Unmatched by code: ${unmatchedByCode.length}`);
    console.log(`   - Unmatched by ID: ${unmatchedById.length}`);
    console.log(`   - Matched users: ${matchedUsers.length}`);
    console.log(`   - Code mismatches: ${codeMismatches.length}`);
    
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

function generateMarkdownReport(data) {
  const {
    totalEmployees,
    totalRaffledCodes,
    unmatchedByCode,
    unmatchedById,
    matchedUsers,
    codeMismatches
  } = data;
  
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toLocaleString();
  
  let report = `# Unmatched Users Report\n\n`;
  report += `**Generated:** ${dateStr}\n`;
  report += `**Timestamp:** ${timestamp}\n\n`;
  report += `---\n\n`;
  
  // Summary
  report += `## 📊 Summary\n\n`;
  report += `| Metric | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Employees in employee_registrations | ${totalEmployees} |\n`;
  report += `| Total Unique Employee Codes in raffle_results | ${totalRaffledCodes} |\n`;
  report += `| **Unmatched by Code** | **${unmatchedByCode.length}** |\n`;
  report += `| **Unmatched by ID** | **${unmatchedById.length}** |\n`;
  report += `| Matched Users | ${matchedUsers.length} |\n`;
  report += `| Code Mismatches (code matches, ID doesn't) | ${codeMismatches.length} |\n`;
  report += `\n---\n\n`;
  
  // Unmatched by Code
  if (unmatchedByCode.length > 0) {
    report += `## 🚫 Unmatched Users (By Employee Code)\n\n`;
    report += `**Total:** ${unmatchedByCode.length} users\n\n`;
    
    const notRaffled = unmatchedByCode.filter(u => u.type === 'Not Raffled');
    const orphaned = unmatchedByCode.filter(u => u.type === 'Orphaned Raffle');
    
    if (notRaffled.length > 0) {
      report += `### Employees Not Raffled (${notRaffled.length})\n\n`;
      report += `These employees exist in \`employee_registrations\` but have NOT been raffled:\n\n`;
      report += `| Employee Code | Reg ID | Name | Designation | Branch | Division |\n`;
      report += `|---------------|--------|------|-------------|--------|----------|\n`;
      
      notRaffled.forEach(user => {
        report += `| ${user.employee_code || 'N/A'} | ${user.reg_id || 'N/A'} | ${user.employee_name || 'N/A'} | ${user.designation || 'N/A'} | ${user.working_branch || 'N/A'} | ${user.division || 'N/A'} |\n`;
      });
      report += `\n`;
    }
    
    if (orphaned.length > 0) {
      report += `### Orphaned Raffle Records (${orphaned.length})\n\n`;
      report += `These employee codes exist in \`raffle_results\` but NOT in \`employee_registrations\`:\n\n`;
      report += `| Employee Code | Player ID | Name | Raffle Count | Sports | Teams |\n`;
      report += `|---------------|-----------|------|--------------|--------|-------|\n`;
      
      orphaned.forEach(user => {
        report += `| ${user.employee_code || 'N/A'} | ${user.player_id || 'N/A'} | ${user.player_name || 'N/A'} | ${user.raffle_count || 0} | ${user.sports || 'N/A'} | ${user.teams || 'N/A'} |\n`;
      });
      report += `\n`;
    }
    
    report += `---\n\n`;
  }
  
  // Unmatched by ID
  if (unmatchedById.length > 0) {
    report += `## 🔍 Unmatched Users (By ID)\n\n`;
    report += `**Total:** ${unmatchedById.length} users\n\n`;
    report += `| Type | ID | Employee Code | Name | Reason |\n`;
    report += `|------|----|---------------|------|--------|\n`;
    
    unmatchedById.forEach(user => {
      const id = user.reg_id || user.player_id || 'N/A';
      const code = user.employee_code || user.player_code || 'N/A';
      const name = user.employee_name || user.player_name || 'N/A';
      report += `| ${user.type} | ${id} | ${code} | ${name} | ${user.reason} |\n`;
    });
    
    report += `\n---\n\n`;
  }
  
  // Code Mismatches
  if (codeMismatches.length > 0) {
    report += `## ⚠️ Code Mismatches\n\n`;
    report += `**Total:** ${codeMismatches.length} mismatches\n\n`;
    report += `These employees have matching employee codes but different reg_id/player_id:\n\n`;
    report += `| Employee Code | Reg ID | Name | Raffled Player IDs | Reason |\n`;
    report += `|---------------|--------|------|-------------------|--------|\n`;
    
    codeMismatches.forEach(mismatch => {
      report += `| ${mismatch.employee_code || 'N/A'} | ${mismatch.reg_id || 'N/A'} | ${mismatch.employee_name || 'N/A'} | ${mismatch.raffled_player_ids || 'N/A'} | ${mismatch.reason} |\n`;
    });
    
    report += `\n---\n\n`;
  }
  
  // Matched Users Summary
  if (matchedUsers.length > 0) {
    report += `## ✅ Matched Users Summary\n\n`;
    report += `**Total:** ${matchedUsers.length} users successfully matched\n\n`;
    report += `These users exist in both tables with matching employee codes and IDs:\n\n`;
    
    const raffleCounts = {};
    matchedUsers.forEach(user => {
      const count = user.raffle_count || 0;
      raffleCounts[count] = (raffleCounts[count] || 0) + 1;
    });
    
    report += `### Raffle Count Distribution\n\n`;
    report += `| Raffle Count | Number of Users |\n`;
    report += `|--------------|-----------------|\n`;
    Object.keys(raffleCounts).sort((a, b) => b - a).forEach(count => {
      report += `| ${count} | ${raffleCounts[count]} |\n`;
    });
    
    report += `\n---\n\n`;
  }
  
  // Detailed Matched Users (first 100)
  if (matchedUsers.length > 0) {
    report += `## 📋 Matched Users Details (First 100)\n\n`;
    report += `| Employee Code | Reg ID | Name | Raffle Count |\n`;
    report += `|---------------|--------|------|--------------|\n`;
    
    matchedUsers.slice(0, 100).forEach(user => {
      report += `| ${user.employee_code || 'N/A'} | ${user.reg_id || 'N/A'} | ${user.employee_name || 'N/A'} | ${user.raffle_count || 0} |\n`;
    });
    
    if (matchedUsers.length > 100) {
      report += `\n*... and ${matchedUsers.length - 100} more matched users*\n`;
    }
  }
  
  report += `\n---\n\n`;
  report += `## 📝 Notes\n\n`;
  report += `- This report compares \`employee_registrations\` and \`raffle_results\` tables\n`;
  report += `- Matching is done by both \`employee_code\` and \`reg_id\`/\`player_id\`\n`;
  report += `- Unmatched users may indicate:\n`;
  report += `  - Employees who haven't been raffled yet\n`;
  report += `  - Data inconsistencies between tables\n`;
  report += `  - Deleted employees with remaining raffle records\n`;
  report += `- Code mismatches indicate potential data quality issues\n`;
  
  return report;
}

// Run the check
checkUnmatchedUsers()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

