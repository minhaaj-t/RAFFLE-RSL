# RSL Raffle Server API

## Database Connection
- **Host**: db.fr-pari1.bengt.wasmernet.com
- **Port**: 10272
- **Database**: rsl_server
- **Table**: employee_registrations
- **Filter**: Only employees with `played_season_two = 1`

## API Endpoints

### 1. Get Employees with Sports Preferences
**GET** `/api/employees`

Returns all employees from `employee_registrations` table (where `played_season_two = 1`) with their sports preferences.

**Response Format:**
```json
[
  {
    "id": 1,
    "name": "Employee Name",
    "department": "Designation",
    "sportsJson": {...},
    "sportsPreferences": {
      "cricket": {
        "priority": 1,
        "interest": "High"
      },
      "football": {
        "priority": 2,
        "interest": "Medium"
      },
      "badminton": {
        "priority": 0,
        "interest": "Not specified"
      },
      "volleyball": {
        "priority": 1,
        "interest": "High"
      },
      "tug": {
        "priority": 0,
        "interest": "Not specified"
      },
      "race": {
        "priority": 0,
        "interest": "Not specified"
      },
      "relay": {
        "priority": 0,
        "interest": "Not specified"
      }
    },
    "rawData": {...}
  }
]
```

### 2. Get Complete Employee Data
**GET** `/api/employees/full`

Returns all columns from `employee_registrations` table (where `played_season_two = 1`) without transformation.

### 3. Get Table Structure
**GET** `/api/table-structure`

Returns the structure/columns of the `employee_registrations` table.

### 4. Health Check
**GET** `/api/health`

Returns server status.

## Database Columns in employee_registrations

The following columns are used:
- `reg_id` (Primary key, auto increment)
- `employee_code` (Employee code, varchar(64))
- `employee_name` (Employee name, varchar(255))
- `designation` (Job designation, varchar(255))
- `working_branch` (Working branch, varchar(255))
- `division` (Division, varchar(255))
- `mobile`, `whatsapp`, `email` (Contact info)
- `team_id` (Team ID, int)
- `code_number` (Code number, varchar(10))
- `nationality` (Nationality, varchar(128))
- `played_season_two` (tinyint(1), Filter: must be 1)
- `sports_json` (JSON column with sports data)
- `cricket_priority` (tinyint) - Priority level 0-3
- `cricket_interest` (varchar(255)) - Interest level
- `football_priority` (tinyint)
- `football_interest` (varchar(255))
- `badminton_priority` (tinyint)
- `badminton_interest` (varchar(255))
- `volleyball_priority` (tinyint)
- `volleyball_interest` (varchar(255))
- `tag_of_war_priority` (tinyint)
- `tag_of_war_interest` (varchar(255))
- `hundred_meter_priority` (tinyint)
- `hundred_meter_interest` (varchar(255))
- `relay_priority` (tinyint)
- `relay_interest` (varchar(255))
- `created_at` (timestamp)
- `cricket_priority` (tinyint)
- `cricket_interest` (varchar)
- `football_priority` (tinyint)
- `football_interest` (varchar)
- `badminton_priority` (tinyint)
- `badminton_interest` (varchar)
- `volleyball_priority` (tinyint)
- `volleyball_interest` (varchar)
- `tag_of_war_priority` (tinyint)
- `tag_of_war_interest` (varchar)
- `hundred_meter_priority` (tinyint)
- `hundred_meter_interest` (varchar)
- `relay_priority` (tinyint)
- `relay_interest` (varchar)

## Sports Mapping

- `cricket` → Cricket 🏏
- `football` → Football ⚽
- `badminton` → Badminton 🏸
- `volleyball` → Volleyball 🏐
- `tug` (from `tag_of_war`) → Tug of War 🪢
- `race` (from `hundred_meter`) → 100 Meter Race 🏃
- `relay` → Relay 🏃‍♂️
