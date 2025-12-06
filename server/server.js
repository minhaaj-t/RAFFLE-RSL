const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection Pool (better for handling connections)
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

// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    return;
  }
  console.log('Connected to MySQL database');
  connection.release();
});

// API endpoint to get table structure
app.get('/api/table-structure', (req, res) => {
  const query = 'DESCRIBE employee_registrations';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching table structure:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch table structure',
        details: err.message 
      });
    }
    
    res.json(results);
  });
});

// API endpoint to get all employees with sports preferences
app.get('/api/employees', (req, res) => {
  // Select all columns from employee_registrations table
  // Try multiple approaches to get the data
  // First, try with played_season_two filter
  let query = `
    SELECT 
      reg_id,
      employee_code,
      employee_name,
      designation,
      working_branch,
      division,
      mobile,
      email,
      played_season_two,
      sports_json,
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
  
  db.query(query, (err, results) => {
    // If no results with filter, try without filter
    if ((!results || results.length === 0) && !err) {
      console.log('No results with played_season_two = 1, trying without filter...');
      query = `
        SELECT 
          reg_id,
          employee_code,
          employee_name,
          designation,
          working_branch,
          division,
          mobile,
          email,
          played_season_two,
          sports_json,
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
      `;
      
      db.query(query, (err2, results2) => {
        if (err2) {
          console.error('Error fetching employees (without filter):', err2);
          return res.status(500).json({ 
            error: 'Failed to fetch employees',
            details: err2.message,
            code: err2.code
          });
        }
        processResults(results2, res);
      });
    } else if (err) {
      console.error('Error fetching employees:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      return res.status(500).json({ 
        error: 'Failed to fetch employees',
        details: err.message,
        code: err.code
      });
    } else {
      processResults(results, res);
    }
  });
  
  function processResults(results, res) {
    if (!results || results.length === 0) {
      console.log('No employees found in database');
      return res.json([]);
    }
    
    // Log first row to see available columns
    if (results.length > 0) {
      console.log('Sample row columns:', Object.keys(results[0]));
      console.log('Sample row data:', JSON.stringify(results[0], null, 2));
    }
    
    // Transform results to match frontend format with sports preferences
    const employees = results.map((row, index) => {
      // Use correct column names from employee_registrations table
      const employeeName = row.employee_name || `Employee ${index + 1}`;
      const designation = row.designation || 'Unknown';
      const employeeCode = row.employee_code || '';
      const workingBranch = row.working_branch || '';
      const division = row.division || '';
      
      // Parse sports_json if it exists
      let sportsJsonData = null;
      if (row.sports_json) {
        try {
          sportsJsonData = typeof row.sports_json === 'string' 
            ? JSON.parse(row.sports_json) 
            : row.sports_json;
        } catch (e) {
          console.warn(`Failed to parse sports_json for ${employeeName}:`, e);
        }
      }
      
      // Helper function to safely get priority and interest
      const getSportPref = (priority, interest) => {
        // Check if priority is a valid number (0-3)
        const prio = (priority !== null && priority !== undefined && !isNaN(priority)) ? parseInt(priority) : 0;
        // Check if interest is a valid string
        const intr = (interest && typeof interest === 'string' && interest.trim() !== '') 
          ? interest.trim() 
          : 'Not specified';
        return { priority: prio, interest: intr };
      };
      
      // Map sports preferences (handle null/undefined values properly)
      const sportsPreferences = {
        cricket: getSportPref(row.cricket_priority, row.cricket_interest),
        football: getSportPref(row.football_priority, row.football_interest),
        badminton: getSportPref(row.badminton_priority, row.badminton_interest),
        volleyball: getSportPref(row.volleyball_priority, row.volleyball_interest),
        tug: getSportPref(row.tag_of_war_priority, row.tag_of_war_interest),
        race: getSportPref(row.hundred_meter_priority, row.hundred_meter_interest),
        relay: getSportPref(row.relay_priority, row.relay_interest)
      };
      
      // Count how many sports this player has registered for
      const registeredSportsCount = Object.values(sportsPreferences).filter(
        pref => pref.priority > 0 || (pref.interest && pref.interest.toLowerCase() !== 'not specified')
      ).length;
      
      return {
        id: row.reg_id || index + 1,
        name: employeeName,
        department: designation,
        employeeCode: employeeCode,
        workingBranch: workingBranch,
        division: division,
        mobile: row.mobile || '',
        email: row.email || '',
        playedSeasonTwo: row.played_season_two || 0,
        sportsJson: sportsJsonData,
        sportsPreferences: sportsPreferences,
        registeredSportsCount: registeredSportsCount,
        // Include all raw data for debugging
        rawData: row
      };
    });
    
    // Log statistics
    const withSportsReg = employees.filter(emp => emp.registeredSportsCount > 0).length;
    console.log(`Fetched ${employees.length} employees from employee_registrations table`);
    console.log(`Employees with sports registration: ${withSportsReg}`);
    console.log(`Employees without sports registration: ${employees.length - withSportsReg}`);
    
    res.json(employees);
  }
});

// API endpoint to get complete employee data with all columns
app.get('/api/employees/full', (req, res) => {
  // Try with filter first
  let query = `SELECT * FROM employee_registrations WHERE played_season_two = 1`;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching full employee data:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch employee data',
        details: err.message,
        code: err.code
      });
    }
    
    // If no results, try without filter
    if (!results || results.length === 0) {
      console.log('No results with filter, trying without filter...');
      query = `SELECT * FROM employee_registrations`;
      
      db.query(query, (err2, results2) => {
        if (err2) {
          return res.status(500).json({ 
            error: 'Failed to fetch employee data',
            details: err2.message,
            code: err2.code
          });
        }
        console.log(`Fetched ${results2.length} complete employee records (without filter)`);
        res.json(results2);
      });
    } else {
      console.log(`Fetched ${results.length} complete employee records (with filter)`);
      res.json(results);
    }
  });
});

// Test endpoint to check database data
app.get('/api/test-data', (req, res) => {
  // Test query to see what data exists
  const testResults = {
    timestamp: new Date().toISOString(),
    tests: {}
  };
  
  // Test 1: Total employees
  db.query('SELECT COUNT(*) as count FROM employee_registrations', (err, results) => {
    if (err) {
      testResults.tests.totalEmployees = { error: err.message, code: err.code };
    } else {
      testResults.tests.totalEmployees = results[0];
    }
    
    // Test 2: Season 2 employees
    db.query('SELECT COUNT(*) as count FROM employee_registrations WHERE played_season_two = 1', (err, results) => {
      if (err) {
        testResults.tests.seasonTwoEmployees = { error: err.message, code: err.code };
      } else {
        testResults.tests.seasonTwoEmployees = results[0];
      }
      
      // Test 3: Sample data
      db.query('SELECT reg_id, employee_name, designation, played_season_two, cricket_priority, cricket_interest, football_priority FROM employee_registrations LIMIT 5', (err, results) => {
        if (err) {
          testResults.tests.sampleData = { error: err.message, code: err.code };
        } else {
          testResults.tests.sampleData = results;
        }
        
        // Test 4: Sports registration stats
        db.query(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN cricket_priority > 0 OR (cricket_interest IS NOT NULL AND cricket_interest != '') THEN 1 ELSE 0 END) as cricket_reg,
            SUM(CASE WHEN football_priority > 0 OR (football_interest IS NOT NULL AND football_interest != '') THEN 1 ELSE 0 END) as football_reg,
            SUM(CASE WHEN badminton_priority > 0 OR (badminton_interest IS NOT NULL AND badminton_interest != '') THEN 1 ELSE 0 END) as badminton_reg
          FROM employee_registrations
          WHERE played_season_two = 1
        `, (err, results) => {
          if (err) {
            testResults.tests.sportsStats = { error: err.message, code: err.code };
          } else {
            testResults.tests.sportsStats = results[0];
          }
          
          // Test 5: Players with cricket registration
          db.query(`
            SELECT reg_id, employee_name, cricket_priority, cricket_interest, football_priority, football_interest
            FROM employee_registrations
            WHERE played_season_two = 1 
              AND (cricket_priority > 0 OR (cricket_interest IS NOT NULL AND cricket_interest != '' AND cricket_interest != 'Not specified'))
            LIMIT 10
          `, (err, results) => {
            if (err) {
              testResults.tests.cricketPlayers = { error: err.message, code: err.code };
            } else {
              testResults.tests.cricketPlayers = results;
            }
            
            res.json(testResults);
          });
        });
      });
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
