const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
// Increase body parser limit to handle large raffle results (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Test connection and create raffle_results table if it doesn't exist
db.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    return;
  }
  console.log('Connected to MySQL database');
  
  // Create raffle_results table if it doesn't exist
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS raffle_results (
      raffle_id INT AUTO_INCREMENT PRIMARY KEY,
      sport_id VARCHAR(50) NOT NULL COMMENT 'Sport identifier (cricket, football, badminton, etc.)',
      team_id VARCHAR(50) NOT NULL COMMENT 'Team identifier - numeric team_id from teams table (1, 2, 3, 4)',
      player_id INT NOT NULL COMMENT 'Employee registration ID from employee_registrations table',
      player_name VARCHAR(255) NOT NULL COMMENT 'Player name',
      player_department VARCHAR(255) COMMENT 'Player department/designation',
      player_code VARCHAR(50) COMMENT 'Employee code',
      player_working_branch VARCHAR(255) COMMENT 'Working branch',
      player_division VARCHAR(255) COMMENT 'Division',
      raffle_date DATETIME NOT NULL COMMENT 'Date and time of raffle',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Record creation timestamp',
      INDEX idx_sport (sport_id),
      INDEX idx_team (team_id),
      INDEX idx_player (player_id),
      INDEX idx_raffle_date (raffle_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores raffle results for each sport and team'
  `;
  
  connection.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating raffle_results table:', err);
    } else {
      console.log('✅ raffle_results table ready');
    }
    connection.release();
  });
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
  // Set headers to prevent caching and ensure fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Select all columns from employee_registrations table
  // Fetch ALL employees regardless of played_season_two to get complete data
  const query = `
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
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching employees:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      return res.status(500).json({ 
        error: 'Failed to fetch employees',
        details: err.message,
        code: err.code
      });
    }
    processResults(results, res);
  });
  
  function processResults(results, res) {
    if (!results || results.length === 0) {
      console.log('No employees found in database');
      return res.json([]);
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
    
    // Count cricket players specifically
    const cricketPlayers = employees.filter(emp => {
      const cricketPref = emp.sportsPreferences?.cricket;
      return cricketPref && (cricketPref.priority > 0 || 
        (cricketPref.interest && cricketPref.interest.toLowerCase() !== 'not specified'));
    });
    
    console.log(`📊 Total employees: ${employees.length}`);
    console.log(`🏏 Cricket players: ${cricketPlayers.length}`);
    
    // Add timestamp to response to indicate when data was fetched
    res.json({
      employees: employees,
      timestamp: new Date().toISOString(),
      count: employees.length,
      cricketCount: cricketPlayers.length
    });
  }
});

// API endpoint to get complete employee data with all columns
app.get('/api/employees/full', (req, res) => {
  // Fetch ALL employees without filter
  const query = `SELECT * FROM employee_registrations`;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching full employee data:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch employee data',
        details: err.message,
        code: err.code
      });
    }
    
      res.json(results);
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

// API endpoint to save raffle results
app.post('/api/raffle-results', (req, res) => {
  const { sportId, raffleResults, raffleDate } = req.body;
  
  if (!sportId || !raffleResults) {
    return res.status(400).json({ 
      error: 'Missing required fields: sportId and raffleResults are required' 
    });
  }
  
  // raffleResults structure: { teamId: [players] }
  // Each player has: id, name, department, employeeCode, workingBranch, division
  
  const raffleDateTime = raffleDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const insertQueries = [];
  const values = [];
  
  // Prepare insert statements for each team and player
  // teamId is now numeric team_id from teams table
  Object.keys(raffleResults).forEach(teamId => {
    const players = raffleResults[teamId];
    if (Array.isArray(players)) {
      players.forEach(player => {
        // Convert teamId to string (database column is VARCHAR, but stores numeric team_id)
        const teamIdValue = String(teamId);
        values.push([
          sportId,
          teamIdValue,
          player.id || player.player_id,
          player.name || player.player_name || '',
          player.department || player.player_department || '',
          player.employeeCode || player.player_code || '',
          player.workingBranch || player.player_working_branch || '',
          player.division || player.player_division || '',
          raffleDateTime
        ]);
      });
    }
  });
  
  if (values.length === 0) {
    return res.status(400).json({ 
      error: 'No players to save in raffle results' 
    });
  }
  
  // Insert all raffle results in a single transaction
  const insertQuery = `
    INSERT INTO raffle_results 
    (sport_id, team_id, player_id, player_name, player_department, player_code, player_working_branch, player_division, raffle_date)
    VALUES ?
  `;
  
  db.query(insertQuery, [values], (err, results) => {
    if (err) {
      console.error('Error saving raffle results:', err);
      return res.status(500).json({ 
        error: 'Failed to save raffle results',
        details: err.message,
        code: err.code
      });
    }
    
    console.log(`✅ Saved ${results.affectedRows} raffle results for sport: ${sportId}`);
    res.json({ 
      success: true,
      message: `Successfully saved ${results.affectedRows} raffle results`,
      insertedRows: results.affectedRows,
      sportId: sportId
    });
  });
});

// API endpoint to get raffle results
app.get('/api/raffle-results', (req, res) => {
  const { sportId, teamId, raffleDate } = req.query;
  
  let query = 'SELECT * FROM raffle_results WHERE 1=1';
  const queryParams = [];
  
  if (sportId) {
    query += ' AND sport_id = ?';
    queryParams.push(sportId);
  }
  
  if (teamId) {
    query += ' AND team_id = ?';
    queryParams.push(teamId);
  }
  
  if (raffleDate) {
    query += ' AND DATE(raffle_date) = ?';
    queryParams.push(raffleDate);
  }
  
  query += ' ORDER BY raffle_date DESC, team_id, player_name';
  
  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching raffle results:', err);
      return res.status(500).json({ 
        error: 'Failed to fetch raffle results',
        details: err.message,
        code: err.code
      });
    }
    
    res.json({
      results: results,
      count: results.length
    });
  });
});

// API endpoint to get all teams
app.get('/api/teams', (req, res) => {
  // Set headers to prevent caching and ensure fresh data
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  const query = `
    SELECT 
      team_id,
      team_name,
      team_code,
      team_lead_employee_code,
      team_lead_name,
      color_code,
      description
    FROM teams
    ORDER BY team_id ASC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching teams:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      return res.status(500).json({ 
        error: 'Failed to fetch teams',
        details: err.message,
        code: err.code
      });
    }
    
    // Transform results to match frontend format
    const teams = results.map(row => {
      const teamCode = (row.team_code || '').toLowerCase();
      const teamLeadName = row.team_lead_name || '';
      const teamCodeUpper = (row.team_code || '').toUpperCase();
      
      return {
        id: teamCode, // Use lowercase team_code as id for compatibility
        teamId: row.team_id, // Keep database team_id
        name: row.team_name || '',
        code: teamCodeUpper,
        teamLead: teamLeadName,
        teamLeadEmployeeCode: row.team_lead_employee_code || '',
        color: row.color_code || '#FFFFFF',
        description: row.description || '',
        tagline: teamLeadName ? `Lead ${teamLeadName} · Code ${teamCodeUpper}` : `Code ${teamCodeUpper}`
      };
    });
    
    res.json({
      teams: teams,
      count: teams.length,
      timestamp: new Date().toISOString()
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
