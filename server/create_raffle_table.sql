-- Create raffle_results table to store raffle data
CREATE TABLE IF NOT EXISTS raffle_results (
  raffle_id INT AUTO_INCREMENT PRIMARY KEY,
  sport_id VARCHAR(50) NOT NULL COMMENT 'Sport identifier (cricket, football, badminton, etc.)',
  team_id VARCHAR(50) NOT NULL COMMENT 'Team identifier (royals, sparks, kings, stars)',
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
  INDEX idx_raffle_date (raffle_date),
  FOREIGN KEY (player_id) REFERENCES employee_registrations(reg_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores raffle results for each sport and team';

