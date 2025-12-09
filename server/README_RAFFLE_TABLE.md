# Raffle Results Database Table

## Table Creation

The `raffle_results` table is automatically created when the server starts. If you need to create it manually, you can run the SQL file:

```sql
-- Run this SQL in your MySQL database
SOURCE create_raffle_table.sql;
```

Or execute the SQL directly in your MySQL client.

## Table Structure

The `raffle_results` table stores raffle results with the following columns:

- `raffle_id` - Auto-increment primary key
- `sport_id` - Sport identifier (cricket, football, badminton, etc.)
- `team_id` - Team identifier (royals, sparks, kings, stars)
- `player_id` - Employee registration ID (references employee_registrations.reg_id)
- `player_name` - Player name
- `player_department` - Player department/designation
- `player_code` - Employee code
- `player_working_branch` - Working branch
- `player_division` - Division
- `raffle_date` - Date and time of raffle
- `created_at` - Record creation timestamp

## API Endpoints

### Save Raffle Results
**POST** `/api/raffle-results`

Request body:
```json
{
  "sportId": "cricket",
  "raffleResults": {
    "royals": [/* array of player objects */],
    "sparks": [/* array of player objects */],
    "kings": [/* array of player objects */],
    "stars": [/* array of player objects */]
  },
  "raffleDate": "2024-01-15 10:30:00"
}
```

### Get Raffle Results
**GET** `/api/raffle-results?sportId=cricket&teamId=royals&raffleDate=2024-01-15`

Query parameters (all optional):
- `sportId` - Filter by sport
- `teamId` - Filter by team
- `raffleDate` - Filter by date (YYYY-MM-DD format)

## Automatic Saving

The raffle results are automatically saved to the database after each raffle:
- **All Sports Raffle**: Saves results for all sports
- **Sport-by-Sport Raffle**: Saves results for the selected sport

