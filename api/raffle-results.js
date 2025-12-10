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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle GET request - fetch raffle results
  if (req.method === 'GET') {
    try {
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
      
      const [results] = await db.query(query, queryParams);
      
      res.status(200).json({
        results: results,
        count: results.length
      });
    } catch (error) {
      console.error('Error fetching raffle results:', error);
      res.status(500).json({ 
        error: 'Failed to fetch raffle results',
        details: error.message,
        code: error.code
      });
    }
    return;
  }

  // Handle POST request - save raffle results
  if (req.method === 'POST') {
    try {
      const { sportId, raffleResults, raffleDate } = req.body;
      
      if (!sportId || !raffleResults) {
        return res.status(400).json({ 
          error: 'Missing required fields: sportId and raffleResults are required' 
        });
      }
      
      // raffleResults structure: { teamId: [players] }
      // Each player has: id, name, department, employeeCode, workingBranch, division
      
      const raffleDateTime = raffleDate || new Date().toISOString().slice(0, 19).replace('T', ' ');
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
      
      const [result] = await db.query(insertQuery, [values]);
      
      console.log(`✅ Saved ${values.length} raffle results for sport: ${sportId}`);
      
      res.status(200).json({
        success: true,
        message: `Successfully saved ${values.length} raffle results`,
        insertedRows: result.affectedRows,
        sportId: sportId
      });
    } catch (error) {
      console.error('Error saving raffle results:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      res.status(500).json({ 
        error: 'Failed to save raffle results',
        details: error.message,
        code: error.code
      });
    }
    return;
  }

  // Method not allowed
  res.status(405).json({ error: 'Method not allowed' });
};

