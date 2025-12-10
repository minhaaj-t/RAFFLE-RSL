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
    
    const [results] = await db.query(query);
    
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
    
    console.log(`✅ Fetched ${teams.length} teams from database`);
    
    res.status(200).json({
      teams: teams,
      count: teams.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to fetch teams',
      details: error.message,
      code: error.code
    });
  }
};

