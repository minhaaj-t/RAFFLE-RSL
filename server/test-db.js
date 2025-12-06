// Test script to check database connection and data
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'db.fr-pari1.bengt.wasmernet.com',
  port: 10272,
  database: 'rsl_server',
  user: '418c9eb47ee7800084034406d140',
  password: '0692418c-9eb5-7020-8000-ba0e5bfb530d',
});

console.log('Connecting to database...');

db.connect((err) => {
  if (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
  
  console.log('Connected successfully!\n');
  
  // Test 1: Check table exists
  console.log('Test 1: Checking if employee_registrations table exists...');
  db.query('SHOW TABLES LIKE "employee_registrations"', (err, results) => {
    if (err) {
      console.error('Error:', err.message);
    } else {
      console.log('Table exists:', results.length > 0);
    }
    
    // Test 2: Get table structure
    console.log('\nTest 2: Getting table structure...');
    db.query('DESCRIBE employee_registrations', (err, results) => {
      if (err) {
        console.error('Error:', err.message);
      } else {
        console.log('Columns:', results.map(r => r.Field).join(', '));
      }
      
      // Test 3: Count total records
      console.log('\nTest 3: Counting total records...');
      db.query('SELECT COUNT(*) as count FROM employee_registrations', (err, results) => {
        if (err) {
          console.error('Error:', err.message);
        } else {
          console.log('Total records:', results[0].count);
        }
        
        // Test 4: Count season 2 players
        console.log('\nTest 4: Counting season 2 players...');
        db.query('SELECT COUNT(*) as count FROM employee_registrations WHERE played_season_two = 1', (err, results) => {
          if (err) {
            console.error('Error:', err.message);
          } else {
            console.log('Season 2 players:', results[0].count);
          }
          
          // Test 5: Get sample data
          console.log('\nTest 5: Getting sample data (first 3 records)...');
          db.query('SELECT reg_id, employee_name, designation, played_season_two, cricket_priority, cricket_interest FROM employee_registrations LIMIT 3', (err, results) => {
            if (err) {
              console.error('Error:', err.message);
            } else {
              console.log('Sample records:');
              results.forEach((row, i) => {
                console.log(`\nRecord ${i + 1}:`);
                console.log('  ID:', row.reg_id);
                console.log('  Name:', row.employee_name);
                console.log('  Designation:', row.designation);
                console.log('  Played Season 2:', row.played_season_two);
                console.log('  Cricket Priority:', row.cricket_priority);
                console.log('  Cricket Interest:', row.cricket_interest);
              });
            }
            
            // Test 6: Check sports data
            console.log('\nTest 6: Checking sports registration data...');
            db.query(`
              SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN cricket_priority > 0 OR cricket_interest IS NOT NULL THEN 1 ELSE 0 END) as cricket_reg,
                SUM(CASE WHEN football_priority > 0 OR football_interest IS NOT NULL THEN 1 ELSE 0 END) as football_reg,
                SUM(CASE WHEN badminton_priority > 0 OR badminton_interest IS NOT NULL THEN 1 ELSE 0 END) as badminton_reg
              FROM employee_registrations
              WHERE played_season_two = 1
            `, (err, results) => {
              if (err) {
                console.error('Error:', err.message);
              } else {
                const stats = results[0];
                console.log('Sports Registration Stats:');
                console.log('  Total Season 2 Players:', stats.total);
                console.log('  Cricket Registrations:', stats.cricket_reg);
                console.log('  Football Registrations:', stats.football_reg);
                console.log('  Badminton Registrations:', stats.badminton_reg);
              }
              
              // Test 7: Get players with sports data
              console.log('\nTest 7: Getting players with cricket registration...');
              db.query(`
                SELECT reg_id, employee_name, cricket_priority, cricket_interest, football_priority, football_interest
                FROM employee_registrations
                WHERE played_season_two = 1 
                  AND (cricket_priority > 0 OR cricket_interest IS NOT NULL)
                LIMIT 5
              `, (err, results) => {
                if (err) {
                  console.error('Error:', err.message);
                } else {
                  console.log(`Found ${results.length} players with cricket registration:`);
                  results.forEach((row, i) => {
                    console.log(`\n  Player ${i + 1}: ${row.employee_name}`);
                    console.log(`    Cricket: Priority=${row.cricket_priority}, Interest=${row.cricket_interest}`);
                    console.log(`    Football: Priority=${row.football_priority}, Interest=${row.football_interest}`);
                  });
                }
                
                console.log('\n\nTest completed!');
                db.end();
              });
            });
          });
        });
      });
    });
  });
});
