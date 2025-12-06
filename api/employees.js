const mysql = require('mysql2/promise');

// MySQL Connection Pool (better for serverless)
// Use environment variables for Vercel, fallback to hardcoded values for local dev
const db = mysql.createPool({
  host: process.env.DB_HOST || 'db.fr-pari1.bengt.wasmernet.com',
  port: parseInt(process.env.DB_PORT) || 10272,
  database: process.env.DB_NAME || 'rsl_server',
  user: process.env.DB_USER || '418c9eb47ee7800084034406d140',
  password: process.env.DB_PASSWORD || '0692418c-9eb5-7020-8000-ba0e5bfb530d',
  waitForConnections: true,
  connectionLimit: 5, // Reduced for serverless
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: false // Set to true if your database requires SSL
});

// Helper function to safely get priority and interest
const getSportPref = (priority, interest) => {
  const prio = (priority !== null && priority !== undefined && !isNaN(priority)) ? parseInt(priority) : 0;
  const intr = (interest && typeof interest === 'string' && interest.trim() !== '') 
    ? interest.trim() 
    : 'Not specified';
  return { priority: prio, interest: intr };
};

// Process results function
function processResults(results) {
  if (!results || results.length === 0) {
    console.log('No employees found in database');
    return [];
  }
  
  // Transform results to match frontend format with sports preferences
  const employees = results.map((row, index) => {
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
    
    // Map sports preferences
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
      rawData: row
    };
  });
  
  return employees;
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
    
    let [results] = await db.query(query);
    
    // If no results with filter, try without filter
    if (!results || results.length === 0) {
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
      
      [results] = await db.query(query);
    }
    
    const employees = processResults(results);
    
    // Log statistics
    const withSportsReg = employees.filter(emp => emp.registeredSportsCount > 0).length;
    console.log(`Fetched ${employees.length} employees from employee_registrations table`);
    console.log(`Employees with sports registration: ${withSportsReg}`);
    
    res.status(200).json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to fetch employees',
      details: error.message,
      code: error.code
    });
  }
};
