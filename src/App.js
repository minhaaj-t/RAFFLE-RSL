import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import './App.css';

// Banner images from public folder
const getBannerImage = (phase) => {
  return phase === 'mode-selection' ? '/banner.png' : '/sports_banner.png';
};

// Teams will be loaded from database - using empty array as fallback
const TEAM_CARDS_DEFAULT = [];

const SPORTS_CONFIG = [
  { id: 'cricket', name: 'Cricket', needed: 11, emoji: '🏏' },
  { id: 'football', name: 'Football', needed: 11, emoji: '⚽' },
  { id: 'badminton', name: 'Badminton', needed: 2, emoji: '🏸' },
  { id: 'volleyball', name: 'Volleyball', needed: 6, emoji: '🏐' },
  { id: 'tug', name: 'Tug of War', needed: 8, emoji: '🪢' },
  { id: 'race', name: '100 Meter Race', needed: 1, emoji: '🏃' },
  { id: 'relay', name: 'Relay', needed: 4, emoji: '🏃‍♂️' },
];

const shuffleArray = (array) => {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

// Balanced distribution function that ensures equal totals and equal interest distribution
const distributePlayersBalanced = (playersByInterest, playersWithoutInterest, totalTeams, teamArrays, teams) => {
  // Guard against undefined or empty teams
  if (!teams || teams.length === 0) {
    console.error('⚠️ Teams array is empty or undefined in distributePlayersBalanced');
    return teamArrays;
  }
  
  // Track interest category for each player
  const playerInterestMap = new Map();
  
  // First, distribute each interest category using round-robin for perfect balance
  // Round-robin ensures each team gets equal (or nearly equal) number from each category
  Object.keys(playersByInterest).forEach(interestKey => {
    const interestPlayers = shuffleArray(playersByInterest[interestKey]);
    
    // Round-robin distribution: each team gets players in rotation
    // This ensures each team gets equal number from each interest category
    interestPlayers.forEach((player, index) => {
      const teamIndex = index % totalTeams;
      const teamId = teams[teamIndex].id;
      teamArrays[teamId].push(player);
      playerInterestMap.set(player.id, interestKey);
    });
  });
  
  // Distribute players without interest using round-robin
  if (playersWithoutInterest.length > 0) {
    const shuffledNoInterest = shuffleArray(playersWithoutInterest);
    shuffledNoInterest.forEach((player, index) => {
      const teamIndex = index % totalTeams;
      const teamId = teams[teamIndex].id;
      teamArrays[teamId].push(player);
      playerInterestMap.set(player.id, 'no-interest');
    });
  }
  
  // Calculate team counts and interest category counts per team
  const teamCounts = teams.map(team => ({
    teamId: team.id,
    count: teamArrays[team.id].length
  }));
  
  const totalPlayers = teamCounts.reduce((sum, t) => sum + t.count, 0);
  const targetPerTeam = Math.floor(totalPlayers / totalTeams);
  const remainder = totalPlayers % totalTeams;
  
  // Track interest counts per team
  const teamInterestCounts = {};
  teams.forEach(team => {
    teamInterestCounts[team.id] = {};
    Object.keys(playersByInterest).forEach(interestKey => {
      teamInterestCounts[team.id][interestKey] = 0;
    });
    teamInterestCounts[team.id]['no-interest'] = 0;
    
    // Count interests in this team
    teamArrays[team.id].forEach(player => {
      const interest = playerInterestMap.get(player.id) || 'no-interest';
      teamInterestCounts[team.id][interest] = (teamInterestCounts[team.id][interest] || 0) + 1;
    });
  });
  
  // Balance totals while preserving interest category distribution
  const minCount = Math.min(...teamCounts.map(t => t.count));
  const maxCount = Math.max(...teamCounts.map(t => t.count));
  
  // Calculate correct target: remainder teams get targetPerTeam + 1, others get targetPerTeam
  if (maxCount - minCount > 1 || (remainder > 0 && maxCount !== minCount + 1)) {
    // Need to balance - find teams that need players and teams with excess
    const teamsNeeding = [];
    const teamsWithExcess = [];
    
    // Randomly select which teams get the remainder (for randomization each raffle)
    const shuffledTeamIds = shuffleArray([...teams.map(t => t.id)]);
    const teamsGettingRemainder = shuffledTeamIds.slice(0, remainder);
    
    teamCounts.forEach(({ teamId, count }) => {
      // Determine target for this team: randomly selected teams get +1
      const target = targetPerTeam + (teamsGettingRemainder.includes(teamId) ? 1 : 0);
      
      if (count < target) {
        teamsNeeding.push({ teamId, needed: target - count, currentCount: count });
      } else if (count > target) {
        teamsWithExcess.push({ teamId, excess: count - target, currentCount: count });
      }
    });
    
    // Redistribute while maintaining interest balance
    // For each team needing players, find players from teams with excess
    teamsNeeding.forEach(({ teamId, needed }) => {
      for (let i = 0; i < needed; i++) {
        // Find a team with excess
        const excessTeam = teamsWithExcess.find(t => t.excess > 0);
        if (excessTeam) {
          // Get a player from the excess team
          const excessPlayers = teamArrays[excessTeam.teamId];
          if (excessPlayers.length > 0) {
            const player = excessPlayers.pop();
            teamArrays[teamId].push(player);
            excessTeam.excess--;
            
            // Update interest counts
            const interest = playerInterestMap.get(player.id) || 'no-interest';
            teamInterestCounts[excessTeam.teamId][interest]--;
            teamInterestCounts[teamId][interest] = (teamInterestCounts[teamId][interest] || 0) + 1;
          }
        }
      }
    });
  }
  
  return teamArrays;
};

// Sound effects using Web Audio API
let audioContext = null;

const initAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

const resumeAudioContext = async () => {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
};

const playSound = (frequency, duration, type = 'sine', volume = 0.3) => {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') {
    return;
  }
  
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
};

const playRaffleStartSound = () => {
  playSound(440, 0.2, 'sine', 0.5);
  setTimeout(() => playSound(554, 0.2, 'sine', 0.5), 100);
  setTimeout(() => playSound(659, 0.3, 'sine', 0.5), 200);
};

const playTickerSound = () => {
  playSound(300 + Math.random() * 200, 0.05, 'sine', 0.1);
};

const playCompletionSound = () => {
  [440, 554, 659, 880].forEach((freq, index) => {
    setTimeout(() => playSound(freq, 0.2, 'sine', 0.4), index * 100);
  });
};

function App() {
  const [phase, setPhase] = useState('mode-selection'); // Start with mode selection
  // eslint-disable-next-line no-unused-vars
  const [raffleMode, setRaffleMode] = useState(null); // 'all-sports' or 'sport-by-sport' (stored for future use)
  const [selectedSport, setSelectedSport] = useState(null); // For sport-by-sport mode
  const [countdown, setCountdown] = useState(0);
  const [playerPool, setPlayerPool] = useState([]); // Players from database
  const [shuffledPlayers, setShuffledPlayers] = useState([]);
  // Results structure: { teamId: { sportId: [players] } }
  const [raffleResults, setRaffleResults] = useState({});
  const [revealedPlayers, setRevealedPlayers] = useState({}); // Track which players are revealed: { teamId: { sportId: count } }
  const [isRaffling, setIsRaffling] = useState(false);
  const [hasStartedRaffle, setHasStartedRaffle] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('raffle-theme');
    return savedTheme || 'dark';
  });
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [resultsSaved, setResultsSaved] = useState(false); // Track if results are saved to database
  const [savingResults, setSavingResults] = useState(false); // Track if currently saving
  // eslint-disable-next-line no-unused-vars
  const [assignedPlayersBySport, setAssignedPlayersBySport] = useState({}); // Track which players are assigned to which sport
  const [raffledEmployeeCodes, setRaffledEmployeeCodes] = useState(new Set()); // Track already raffled employee codes
  const [teams, setTeams] = useState(TEAM_CARDS_DEFAULT); // Teams loaded from database
  // eslint-disable-next-line no-unused-vars
  const [loadingTeams, setLoadingTeams] = useState(true); // Track teams loading state
  const pdfButtonRef = useRef(null);
  const resultRefs = useRef({}); // Store refs for each player card
  
  // Use teams from state, fallback to default if not loaded
  const TEAM_CARDS = teams.length > 0 ? teams : TEAM_CARDS_DEFAULT;

  // Calculate registered players per sport (unique - based on highest priority)
  const registeredPlayersBySport = useMemo(() => {
    const sportKeyMap = {
      'cricket': 'cricket',
      'football': 'football',
      'badminton': 'badminton',
      'volleyball': 'volleyball',
      'tug': 'tug',
      'race': 'race',
      'relay': 'relay'
    };
    
    // First, assign each player to their best sport (highest priority)
    const playerBestSport = {};
    
    playerPool.forEach(player => {
      const prefs = player.sportsPreferences || {};
      let bestSport = null;
      let bestScore = -999;
      let bestPriority = -1;
      
      SPORTS_CONFIG.forEach((sport) => {
        const sportKey = sportKeyMap[sport.id] || sport.id;
        const sportPrefs = prefs[sportKey] || {};
        const priority = sportPrefs.priority || 0;
        const interest = sportPrefs.interest || '';
        
        const hasRegistered = priority > 0 || 
                             (interest && 
                              interest.trim() !== '' &&
                              interest.toLowerCase() !== 'not specified' &&
                              interest.toLowerCase() !== 'none' &&
                              interest.toLowerCase() !== 'null');
        
        if (hasRegistered) {
          let score = priority;
          if (interest && typeof interest === 'string') {
            const interestLower = interest.toLowerCase();
            if (interestLower.includes('high') || interestLower.includes('very')) {
              score += 2;
            } else if (interestLower.includes('medium') || interestLower.includes('moderate')) {
              score += 1;
            }
          }
          
          if (score > bestScore || (score === bestScore && priority > bestPriority)) {
            bestScore = score;
            bestPriority = priority;
            bestSport = sport.id;
          }
        }
      });
      
      if (bestSport) {
        playerBestSport[player.id] = bestSport;
      }
    });
    
    // Now count players per sport (unique assignment)
    const counts = {};
    SPORTS_CONFIG.forEach((sport) => {
      counts[sport.id] = playerPool.filter(player => playerBestSport[player.id] === sport.id);
    });
    
    return counts;
  }, [playerPool]);

  // Fetch teams from API
  const fetchTeams = useCallback(async (retryCount = 0) => {
    const maxRetries = 3;
    try {
      setLoadingTeams(true);
      const apiUrl = process.env.REACT_APP_API_URL || 
        (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');
      const timestamp = new Date().getTime();
      console.log(`🔄 Fetching teams from ${apiUrl}/teams (attempt ${retryCount + 1}/${maxRetries + 1})`);
      
      const response = await fetch(`${apiUrl}/teams?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.details || errorData.error || `Server error: ${response.status}`;
        console.error(`❌ Error fetching teams (${response.status}):`, errorMessage);
        
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying teams fetch in 2 seconds... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => fetchTeams(retryCount + 1), 2000);
          return;
        }
        throw new Error(errorMessage);
      }
      
      const responseData = await response.json();
      const teamsData = responseData.teams || [];
      
      if (Array.isArray(teamsData) && teamsData.length > 0) {
        console.log(`✅ Fetched ${teamsData.length} teams from database`);
        setTeams(teamsData);
        setLoadingTeams(false);
      } else {
        console.warn('⚠️ No teams found in database');
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying teams fetch in 2 seconds... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => fetchTeams(retryCount + 1), 2000);
          return;
        }
        console.error('❌ Failed to fetch teams after all retries');
        setLoadingTeams(false);
        // Use default teams as fallback
        setTeams(TEAM_CARDS_DEFAULT);
      }
    } catch (error) {
      console.error('❌ Error fetching teams:', error);
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying teams fetch in 3 seconds... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => fetchTeams(retryCount + 1), 3000);
        return;
      }
      console.error('❌ Failed to fetch teams after all retries, using default');
      setLoadingTeams(false);
      // Use default teams as fallback
      setTeams(TEAM_CARDS_DEFAULT);
    }
  }, []); // Empty deps: setState functions are stable

  // Fetch players from API - extracted to allow manual refresh
  const fetchPlayers = useCallback(async () => {
    try {
      setLoadingPlayers(true);
      // Use environment variable for API URL, fallback based on environment
      // In production (Vercel), use relative path /api
      // In development, use localhost:5000
      const apiUrl = process.env.REACT_APP_API_URL || 
        (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');
      // Add timestamp to prevent caching and ensure fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(`${apiUrl}/employees?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || `Server error: ${response.status}`);
      }
      const responseData = await response.json();
      // Handle both old format (array) and new format (object with employees array)
      const data = Array.isArray(responseData) ? responseData : (responseData.employees || []);
      if (Array.isArray(data) && data.length > 0) {
        // Log fetch info with timestamp
        const fetchTime = responseData.timestamp || new Date().toISOString();
        console.log(`✅ Fetched ${data.length} players at ${new Date(fetchTime).toLocaleString()}`);
        
        // Count players with sports registrations
        const withRegistrations = data.filter(p => p.registeredSportsCount > 0).length;
        console.log(`📊 Players with sports registrations: ${withRegistrations} out of ${data.length}`);
        
        // Count cricket players specifically
        const cricketPlayers = data.filter(p => {
          const cricketPref = p.sportsPreferences?.cricket;
          return cricketPref && (cricketPref.priority > 0 || 
            (cricketPref.interest && cricketPref.interest.toLowerCase() !== 'not specified'));
        });
        console.log(`🏏 Cricket players found: ${cricketPlayers.length}`);
        if (responseData.cricketCount) {
          console.log(`🏏 Server reported cricket count: ${responseData.cricketCount}`);
        }
        
        setPlayerPool(data);
        setShuffledPlayers(data);
      } else {
        console.warn('⚠️ No employees found in database');
        setPlayerPool([]);
        setShuffledPlayers([]);
      }
      setLoadingPlayers(false);
    } catch (error) {
      console.error('❌ Error fetching players:', error);
      setLoadingPlayers(false);
      // Fallback to empty array if API fails
      setPlayerPool([]);
      setShuffledPlayers([]);
    }
  }, []); // Empty deps: setState functions are stable

  // Fetch already raffled employee codes from database
  const fetchRaffledEmployeeCodes = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 
        (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');
      
      const response = await fetch(`${apiUrl}/raffle-results`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      const results = data.results || [];
      
      // Extract unique employee codes from raffle results
      const raffledEmployeeCodes = new Set();
      results.forEach(result => {
        if (result.player_code && result.player_code.trim() !== '') {
          raffledEmployeeCodes.add(result.player_code.trim());
        }
      });
      
      console.log(`📋 Found ${raffledEmployeeCodes.size} already raffled employee codes`);
      return raffledEmployeeCodes;
    } catch (error) {
      console.error('❌ Error fetching raffled employee codes:', error);
      // Return empty set on error so raffle can still proceed
      return new Set();
    }
  };

  // Save raffle results to database
  const saveRaffleResults = async (sportId, results) => {
    try {
      setSavingResults(true);
      const apiUrl = process.env.REACT_APP_API_URL || 
        (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');
      
      // Map team codes to team_id from teams table
      const teamCodeToIdMap = {};
      teams.forEach(team => {
        teamCodeToIdMap[team.id] = team.teamId; // team.id is code, team.teamId is numeric ID
      });
      
      // Convert results with team codes to results with team_id
      const resultsWithTeamId = {};
      Object.keys(results).forEach(teamCode => {
        const teamId = teamCodeToIdMap[teamCode];
        if (teamId) {
          resultsWithTeamId[teamId] = results[teamCode];
        } else {
          console.warn(`⚠️ Team code ${teamCode} not found in teams, skipping...`);
        }
      });
      
      const response = await fetch(`${apiUrl}/raffle-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sportId: sportId,
          raffleResults: resultsWithTeamId,
          raffleDate: new Date().toISOString().slice(0, 19).replace('T', ' ')
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ Saved raffle results for ${sportId}:`, data.message);
      setSavingResults(false);
      return data;
    } catch (error) {
      console.error(`❌ Error saving raffle results for ${sportId}:`, error);
      setSavingResults(false);
      alert(`Error saving raffle results: ${error.message}`);
      return null;
    }
  };

  // Handle Fix button click - Save all raffle results to database
  const handleFixResults = async () => {
    if (Object.keys(raffleResults).length === 0) {
      alert('No raffle results to save');
      return;
    }

    setSavingResults(true);
    
    if (phase === 'sport-raffle' && selectedSport) {
      // Save single sport results
      const sportResults = {};
      TEAM_CARDS.forEach((team) => {
        if (raffleResults[team.id] && raffleResults[team.id][selectedSport.id]) {
          sportResults[team.id] = raffleResults[team.id][selectedSport.id];
        }
      });
      
      if (Object.keys(sportResults).length > 0) {
        const result = await saveRaffleResults(selectedSport.id, sportResults);
        if (result) {
          setResultsSaved(true);
          alert(`✅ Raffle results for ${selectedSport.name} have been saved successfully!`);
        }
      }
    } else {
      // Save all sports results
      let savedCount = 0;
      let failedCount = 0;
      
      for (const sport of SPORTS_CONFIG) {
        const sportResults = {};
        TEAM_CARDS.forEach((team) => {
          if (raffleResults[team.id] && raffleResults[team.id][sport.id]) {
            sportResults[team.id] = raffleResults[team.id][sport.id];
          }
        });
        
        if (Object.keys(sportResults).length > 0) {
          const result = await saveRaffleResults(sport.id, sportResults);
          if (result) {
            savedCount++;
          } else {
            failedCount++;
          }
        }
      }
      
      if (savedCount > 0 && failedCount === 0) {
        setResultsSaved(true);
        alert(`✅ All raffle results (${savedCount} sports) have been saved successfully!`);
      } else if (savedCount > 0) {
        alert(`⚠️ Saved ${savedCount} sports, but ${failedCount} failed. Please try again.`);
      } else {
        alert('❌ Failed to save raffle results. Please try again.');
      }
    }
    
    setSavingResults(false);
  };

  // Fetch teams and players on component mount
  useEffect(() => {
    fetchTeams();
    fetchPlayers();
  }, [fetchTeams, fetchPlayers]);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('raffle-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };


  const tickerPlayers = useMemo(() => {
    const windowSize = 5;
    if (!shuffledPlayers.length) {
      return [];
    }
    return Array.from({ length: windowSize }, (_, offset) => {
      const idx = (tickerIndex + offset) % shuffledPlayers.length;
      return shuffledPlayers[idx];
    });
  }, [tickerIndex, shuffledPlayers]);

  useEffect(() => {
    if ((phase === 'raffle' || phase === 'sport-raffle') && hasStartedRaffle && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase, hasStartedRaffle, countdown]);

  useEffect(() => {
    if ((phase === 'raffle' || phase === 'sport-raffle') && hasStartedRaffle && countdown === 0 && isRaffling) {
      // Check if teams are loaded
      if (!TEAM_CARDS || TEAM_CARDS.length === 0) {
        console.warn('⚠️ Teams not loaded yet, waiting...');
        setIsRaffling(false);
        return;
      }
      
      // Play start animation sound
      playSound(600, 0.2, 'sine', 0.5);
      
      // Filter out already raffled players
      const availablePlayers = playerPool.filter(player => {
        const employeeCode = player.employeeCode?.trim() || '';
        return !raffledEmployeeCodes.has(employeeCode);
      });
      
      if (availablePlayers.length === 0) {
        console.warn('⚠️ No available players after filtering raffled codes');
        setIsRaffling(false);
        return;
      }
      
      if (phase === 'raffle') {
        // All Sports Raffle - Assign each player to ONLY ONE sport based on highest priority
        const totalTeams = TEAM_CARDS.length; // 4 teams
        
        const results = {};
        const revealed = {};
        
        // Sport key mapping
        const sportKeyMap = {
          'cricket': 'cricket',
          'football': 'football',
          'badminton': 'badminton',
          'volleyball': 'volleyball',
          'tug': 'tug',
          'race': 'race',
          'relay': 'relay'
        };
        
        // First, assign each player to their BEST sport (highest priority) - UNIQUE ASSIGNMENT
        const playerSportAssignments = {}; // { playerId: { sportId, priority, score } }
        const assignedPlayerIds = new Set(); // Track which players have been assigned
        
        // Get all players with their sport preferences and scores (using filtered players)
        const playersWithAllPreferences = availablePlayers.map(player => {
          const prefs = player.sportsPreferences || {};
          const sportScores = {};
          
          SPORTS_CONFIG.forEach((sport) => {
            const sportKey = sportKeyMap[sport.id] || sport.id;
            const sportPrefs = prefs[sportKey] || {};
            const priority = sportPrefs.priority || 0;
            const interest = sportPrefs.interest || '';
            
            // Check if player has registered for this sport
            const hasRegistered = priority > 0 || 
                                 (interest && 
                                  interest.trim() !== '' &&
                                  interest.toLowerCase() !== 'not specified' &&
                                  interest.toLowerCase() !== 'none' &&
                                  interest.toLowerCase() !== 'null');
            
            // Calculate score: priority (0-3) + interest bonus
            let score = hasRegistered ? priority : -999;
            if (hasRegistered && interest && typeof interest === 'string') {
              const interestLower = interest.toLowerCase();
              if (interestLower.includes('high') || interestLower.includes('very')) {
                score += 2;
              } else if (interestLower.includes('medium') || interestLower.includes('moderate')) {
                score += 1;
              } else if (interestLower.includes('low') || interestLower.includes('no')) {
                score -= 1;
              }
            }
            
            sportScores[sport.id] = {
              score: score,
              priority: priority,
              interest: interest,
              hasRegistered: hasRegistered
            };
          });
          
          return {
            ...player,
            sportScores: sportScores
          };
        });
        
        // Sort players by their best sport score (to prioritize players with higher preferences)
        playersWithAllPreferences.sort((a, b) => {
          const aMaxScore = Math.max(...Object.values(a.sportScores).map(s => s.score));
          const bMaxScore = Math.max(...Object.values(b.sportScores).map(s => s.score));
          return bMaxScore - aMaxScore;
        });
        
        // Assign each player to their best available sport (only if they registered)
        playersWithAllPreferences.forEach(player => {
          // Find the sport with highest score for this player (only registered sports)
          let bestSport = null;
          let bestScore = -999;
          
          SPORTS_CONFIG.forEach((sport) => {
            const sportData = player.sportScores[sport.id];
            if (sportData && sportData.hasRegistered && sportData.score > bestScore) {
              // Check if this sport still needs players (not all teams full)
              // For now, assign based on priority only
              bestScore = sportData.score;
              bestSport = sport.id;
            }
          });
          
          // If player has registered for at least one sport, assign them
          if (bestSport) {
            playerSportAssignments[player.id] = {
              sportId: bestSport,
              priority: player.sportScores[bestSport].priority,
              score: player.sportScores[bestSport].score
            };
            assignedPlayerIds.add(player.id);
          }
        });
        
        // Now group players by their assigned sport (UNIQUE - each player in only one sport)
        const playersBySport = {};
        SPORTS_CONFIG.forEach((sport) => {
          playersBySport[sport.id] = [];
        });
        
        Object.keys(playerSportAssignments).forEach(playerId => {
          const assignment = playerSportAssignments[playerId];
          const player = availablePlayers.find(p => p.id === parseInt(playerId));
          if (player) {
            playersBySport[assignment.sportId].push(player);
          }
        });
        
        // Now distribute players for each sport across teams, balancing interest categories
        SPORTS_CONFIG.forEach((sport) => {
          const sportPlayers = playersBySport[sport.id];
          const sportKey = sportKeyMap[sport.id] || sport.id;
          
          // Group players by their interest for this sport
          const playersByInterest = {};
          const playersWithoutInterest = [];
          
          sportPlayers.forEach((player) => {
            const sportPrefs = player.sportsPreferences?.[sportKey];
            const interest = sportPrefs?.interest?.trim() || '';
            
            if (interest && 
                interest !== 'Not specified' && 
                interest !== 'None' && 
                interest !== 'null' &&
                interest !== '') {
              const interestKey = interest.toLowerCase();
              if (!playersByInterest[interestKey]) {
                playersByInterest[interestKey] = [];
              }
              playersByInterest[interestKey].push(player);
            } else {
              playersWithoutInterest.push(player);
            }
          });
          
          // Shuffle each interest group
          Object.keys(playersByInterest).forEach(interestKey => {
            playersByInterest[interestKey] = shuffleArray(playersByInterest[interestKey]);
          });
          const shuffledNoInterest = shuffleArray(playersWithoutInterest);
          
          // Initialize team arrays for this sport
          const teamSportArrays = {};
          TEAM_CARDS.forEach((team) => {
            if (!results[team.id]) {
              results[team.id] = {};
              revealed[team.id] = {};
            }
            teamSportArrays[team.id] = [];
          });
          
          // Use balanced distribution to ensure equal totals and equal interest distribution
          distributePlayersBalanced(playersByInterest, shuffledNoInterest, totalTeams, teamSportArrays, TEAM_CARDS);
          
          // Shuffle players within each team for more randomness
          TEAM_CARDS.forEach((team) => {
            results[team.id][sport.id] = shuffleArray(teamSportArrays[team.id]);
            revealed[team.id][sport.id] = 0; // Start with 0 revealed
          });
        });
        
        setRaffleResults(results);
        setRevealedPlayers(revealed);
        setIsRaffling(false);
        setResultsSaved(false); // Reset saved status when new raffle starts
      } else if (phase === 'sport-raffle' && selectedSport) {
        // Sport-by-Sport Raffle - Only use players who have registered/expressed interest in this sport
        // AND who haven't been assigned to a previous sport (based on priority)
        const totalTeams = TEAM_CARDS.length; // 4 teams
        
        // Filter and sort players by their interest and priority for this sport
        const sportId = selectedSport.id;
        const sportKeyMap = {
          'cricket': 'cricket',
          'football': 'football',
          'badminton': 'badminton',
          'volleyball': 'volleyball',
          'tug': 'tug',
          'race': 'race',
          'relay': 'relay'
        };
        
        const sportKey = sportKeyMap[sportId] || sportId;
        
        // Filter players who have registered interest in this sport AND haven't been assigned to THIS sport yet
        // Note: In sport-by-sport mode, players CAN be in multiple sports (unlike All Sports mode)
        // In sport-by-sport mode, allow players to be in multiple sports (not just best sport)
        const playersWithPreferences = availablePlayers
          .map(player => {
            const prefs = player.sportsPreferences || {};
            const sportPrefs = prefs[sportKey] || {};
            const priority = sportPrefs.priority || 0;
            const interest = sportPrefs.interest || 'Not specified';
            
            // Calculate score for this sport
            let score = priority;
            if (interest && typeof interest === 'string') {
              const interestLower = interest.toLowerCase();
              if (interestLower.includes('high') || interestLower.includes('very')) {
                score += 2;
              } else if (interestLower.includes('medium') || interestLower.includes('moderate')) {
                score += 1;
              } else if (interestLower.includes('low') || interestLower.includes('no')) {
                score -= 1;
              }
            }
            
            return {
              ...player,
              sportScore: score,
              sportPriority: priority,
              sportInterest: interest
            };
          })
          // Only include players who have registered for this sport
          // AND haven't been assigned to THIS specific sport yet (check raffleResults for this sport)
          .filter(player => {
            const hasPriority = player.sportPriority > 0;
            const hasInterest = player.sportInterest && 
                               player.sportInterest.trim() !== '' &&
                               player.sportInterest.toLowerCase() !== 'not specified' &&
                               player.sportInterest.toLowerCase() !== 'none' &&
                               player.sportInterest.toLowerCase() !== 'null';
            
            if (!(hasPriority || hasInterest)) {
              return false; // Not registered for this sport
            }
            
            // Check if player is already assigned to THIS sport (not other sports)
            let alreadyInThisSport = false;
            Object.keys(raffleResults).forEach(teamId => {
              if (raffleResults[teamId][sportId]) {
                const playersInThisSport = raffleResults[teamId][sportId];
                if (playersInThisSport.some(p => p.id === player.id)) {
                  alreadyInThisSport = true;
                }
              }
            });
            
            return !alreadyInThisSport; // Include if not already in this sport
          });
        
        // If no players registered for this sport, show empty results
        if (playersWithPreferences.length === 0) {
          const results = {};
          const revealed = {};
          TEAM_CARDS.forEach((team) => {
            results[team.id] = {};
            revealed[team.id] = {};
            results[team.id][selectedSport.id] = [];
            revealed[team.id][selectedSport.id] = 0;
          });
          setRaffleResults(results);
          setRevealedPlayers(revealed);
          setIsRaffling(false);
          return;
        }
        
        // Sort by score (highest first), then by priority, then randomize within same score
        playersWithPreferences.sort((a, b) => {
          if (b.sportScore !== a.sportScore) {
            return b.sportScore - a.sportScore;
          }
          if (b.sportPriority !== a.sportPriority) {
            return b.sportPriority - a.sportPriority;
          }
          return Math.random() - 0.5; // Randomize within same score/priority
        });
        
        // Group players by their interest for this sport
        const playersByInterest = {};
        const playersWithoutInterest = [];
        
        playersWithPreferences.forEach((player) => {
          const interest = player.sportInterest?.trim() || '';
          
          if (interest && 
              interest !== 'Not specified' && 
              interest !== 'None' && 
              interest !== 'null' &&
              interest !== '') {
            const interestKey = interest.toLowerCase();
            if (!playersByInterest[interestKey]) {
              playersByInterest[interestKey] = [];
            }
            playersByInterest[interestKey].push(player);
          } else {
            playersWithoutInterest.push(player);
          }
        });
        
        // Shuffle each interest group
        Object.keys(playersByInterest).forEach(interestKey => {
          playersByInterest[interestKey] = shuffleArray(playersByInterest[interestKey]);
        });
        const shuffledNoInterest = shuffleArray(playersWithoutInterest);
        
        const results = {};
        const revealed = {};
        
        // Initialize team arrays for this sport
        const teamSportArrays = {};
        TEAM_CARDS.forEach((team) => {
          results[team.id] = {};
          revealed[team.id] = {};
          teamSportArrays[team.id] = [];
        });
        
        // Use balanced distribution to ensure equal totals and equal interest distribution
        distributePlayersBalanced(playersByInterest, shuffledNoInterest, totalTeams, teamSportArrays, TEAM_CARDS);
        
        // Shuffle players within each team for more randomness
        TEAM_CARDS.forEach((team) => {
          results[team.id][selectedSport.id] = shuffleArray(teamSportArrays[team.id]);
          revealed[team.id][selectedSport.id] = 0; // Start with 0 revealed
        });
        
        setRaffleResults(results);
        setRevealedPlayers(revealed);
        setIsRaffling(false);
        setResultsSaved(false); // Reset saved status when new raffle starts
      }
    }
  }, [phase, hasStartedRaffle, countdown, isRaffling, selectedSport, playerPool, raffledEmployeeCodes, TEAM_CARDS, raffleResults]);

  useEffect(() => {
    if (!isRaffling) {
      return undefined;
    }
    const interval = setInterval(() => {
      setTickerIndex((prev) => {
        const total = shuffledPlayers.length || playerPool.length;
        return (prev + 1) % total;
      });
      // Play ticker sound during animation
      playTickerSound();
    }, 60);
    return () => clearInterval(interval);
  }, [isRaffling, shuffledPlayers.length, playerPool.length]);

  // Reveal players one by one SPORT BY SPORT in order after raffle completes
  useEffect(() => {
    const hasResults = Object.keys(raffleResults).length > 0;
    if (!hasResults || !hasStartedRaffle || isRaffling) {
      return undefined;
    }
    
    // Find the current sport being revealed (in order: Cricket first, then next sport, etc.)
    let currentSportId = null;
    let allSportsComplete = true;
    
    // Check each sport in order to find which one is currently being revealed
    for (let sportIndex = 0; sportIndex < SPORTS_CONFIG.length; sportIndex++) {
      const sport = SPORTS_CONFIG[sportIndex];
      let sportHasUnrevealed = false;
      
      // Use a local variable to avoid unsafe reference in forEach
      let isComplete = allSportsComplete;
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const teamRevealed = revealedPlayers[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        const revealedCount = teamRevealed[sport.id] || 0;
        
        if (sportPlayers.length > 0 && revealedCount < sportPlayers.length) {
          sportHasUnrevealed = true;
          isComplete = false;
        }
      });
      allSportsComplete = isComplete;
      
      // If this sport has unrevealed players, this is the current sport
      if (sportHasUnrevealed) {
        currentSportId = sport.id;
        break;
      }
    }
    
    if (!currentSportId || allSportsComplete) {
      return undefined; // All players revealed
    }
    
    // Find all teams that have unrevealed players for the current sport
    const availableTeams = [];
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      const teamRevealed = revealedPlayers[team.id] || {};
      const sportPlayers = teamSports[currentSportId] || [];
      const revealedCount = teamRevealed[currentSportId] || 0;
      
      if (revealedCount < sportPlayers.length) {
        availableTeams.push({ teamId: team.id, revealedCount, totalCount: sportPlayers.length });
      }
    });
    
    if (availableTeams.length === 0) {
      return undefined;
    }
    
    // Randomly select which team to reveal next for the current sport
    const randomIndex = Math.floor(Math.random() * availableTeams.length);
    const { teamId: nextTeamId } = availableTeams[randomIndex];
    
    // Play selection sound when revealing each player (every 5th player)
    const teamRevealed = revealedPlayers[nextTeamId] || {};
    const currentCount = teamRevealed[currentSportId] || 0;
    if (currentCount % 5 === 0) {
      playSound(600, 0.1, 'sine', 0.3);
    }
    
    const revealTimer = setTimeout(() => {
      setRevealedPlayers((prev) => {
        const newCount = (prev[nextTeamId]?.[currentSportId] || 0) + 1;
        return {
          ...prev,
          [nextTeamId]: {
            ...prev[nextTeamId],
            [currentSportId]: newCount
          }
        };
      });
      
    }, 100); // Reveal one player every 100ms
    
    return () => clearTimeout(revealTimer);
  }, [raffleResults, revealedPlayers, hasStartedRaffle, isRaffling, TEAM_CARDS]);

  // Confetti effect when raffle is complete and all players are revealed
  useEffect(() => {
    const hasResults = Object.keys(raffleResults).length > 0;
    if (!hasResults) {
      return;
    }
    
    // Check if all players are revealed
    let allRevealed = true;
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      const teamRevealed = revealedPlayers[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        const revealedCount = teamRevealed[sport.id] || 0;
        if (revealedCount < sportPlayers.length) {
          allRevealed = false;
        }
      });
    });
    
    // Check if raffle is complete
    const isComplete =
      hasResults &&
      allRevealed &&
      !isRaffling &&
      hasStartedRaffle;

    if (isComplete) {
      // Play completion sound
      playCompletionSound();
      
      // Trigger confetti celebration
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);

        // Launch confetti from left
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });

        // Launch confetti from right
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });

        // Launch confetti from center
        confetti({
          ...defaults,
          particleCount: particleCount * 0.5,
          origin: { x: 0.5, y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [raffleResults, revealedPlayers, isRaffling, hasStartedRaffle, TEAM_CARDS]);

  // Auto-scroll to newly revealed player
  useEffect(() => {
    const hasResults = Object.keys(raffleResults).length > 0;
    if (!hasResults || !hasStartedRaffle || isRaffling) {
      return;
    }

    // Find the last revealed player and scroll to it
    let lastTeamId = null;
    let lastSportId = null;
    let lastIndex = -1;
    
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      const teamRevealed = revealedPlayers[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        const revealedCount = teamRevealed[sport.id] || 0;
        if (revealedCount > 0 && revealedCount <= sportPlayers.length) {
          lastTeamId = team.id;
          lastSportId = sport.id;
          lastIndex = revealedCount - 1;
        }
      });
    });

    // Scroll to the last revealed player
    if (lastTeamId && lastSportId && lastIndex >= 0) {
      setTimeout(() => {
        const refKey = `${lastTeamId}-${lastSportId}-${lastIndex}`;
        const elementRef = resultRefs.current[refKey];
        if (elementRef) {
          elementRef.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 150); // Wait a bit for the DOM to update
    }
  }, [revealedPlayers, raffleResults, hasStartedRaffle, isRaffling, TEAM_CARDS]);

  // Auto-scroll to PDF button when all players are revealed
  useEffect(() => {
    const hasResults = Object.keys(raffleResults).length > 0;
    if (!hasResults || !hasStartedRaffle || isRaffling) {
      return;
    }

    // Check if all players are revealed
    let allRevealed = true;
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      const teamRevealed = revealedPlayers[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        const revealedCount = teamRevealed[sport.id] || 0;
        if (revealedCount < sportPlayers.length) {
          allRevealed = false;
        }
      });
    });

    // Scroll to PDF button when all players are revealed
    if (allRevealed) {
      setTimeout(() => {
        if (pdfButtonRef.current) {
          pdfButtonRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'end',
            inline: 'nearest'
          });
        }
      }, 500);
    }
  }, [raffleResults, revealedPlayers, hasStartedRaffle, isRaffling, TEAM_CARDS]);


  const handleModeSelection = (mode) => {
    setRaffleMode(mode);
    if (mode === 'all-sports') {
      setPhase('raffle');
    } else {
      setPhase('sport-selection');
    }
  };

  const handleSportSelect = (sport) => {
    setSelectedSport(sport);
    setPhase('sport-raffle');
  };

  const handleBackToModeSelection = () => {
    setPhase('mode-selection');
    setRaffleMode(null);
    setSelectedSport(null);
    setRaffleResults({});
    setRevealedPlayers({});
    setHasStartedRaffle(false);
    setIsRaffling(false);
    setCountdown(0);
    setResultsSaved(false);
  };

  const handleBackToSportSelection = () => {
    setPhase('sport-selection');
    setSelectedSport(null);
    setRaffleResults({});
    setRevealedPlayers({});
    setHasStartedRaffle(false);
    setIsRaffling(false);
    setCountdown(0);
    setResultsSaved(false);
  };

  const handleNextSport = () => {
    const currentIndex = SPORTS_CONFIG.findIndex(s => s.id === selectedSport.id);
    if (currentIndex < SPORTS_CONFIG.length - 1) {
      const nextSport = SPORTS_CONFIG[currentIndex + 1];
      handleSportSelect(nextSport);
      setRaffleResults({});
      setRevealedPlayers({});
      setHasStartedRaffle(false);
      setIsRaffling(false);
      setCountdown(0);
    }
  };

  const handleStartRaffle = async () => {
    // Check if teams are loaded
    if (!teams || teams.length === 0) {
      if (loadingTeams) {
        alert('⚠️ Teams are loading. Please wait a moment and try again.');
      } else {
        alert('⚠️ Teams are not loaded. Attempting to fetch teams...');
        await fetchTeams();
        // Wait a bit and check again
        setTimeout(() => {
          if (!teams || teams.length === 0) {
            alert('⚠️ Unable to load teams from database. Please refresh the page or check your connection.');
          }
        }, 2000);
      }
      return;
    }
    
    // Initialize and resume audio context before playing sounds
    await resumeAudioContext();
    
    // Fetch already raffled employee codes
    const raffledCodes = await fetchRaffledEmployeeCodes();
    setRaffledEmployeeCodes(raffledCodes);
    
    // Filter out players who are already in raffle_results
    const availablePlayers = playerPool.filter(player => {
      const employeeCode = player.employeeCode?.trim() || '';
      return !raffledCodes.has(employeeCode);
    });
    
    if (availablePlayers.length === 0) {
      alert('⚠️ No available players found. All players have already been raffled.');
      return;
    }
    
    const excludedCount = playerPool.length - availablePlayers.length;
    if (excludedCount > 0) {
      console.log(`🚫 Excluded ${excludedCount} already raffled players. ${availablePlayers.length} players available for raffle.`);
    }
    
    playRaffleStartSound();
    setHasStartedRaffle(true);
    setCountdown(5); // 5 seconds countdown
    setIsRaffling(true);
    setRaffleResults({});
    setRevealedPlayers({});
    setShuffledPlayers(shuffleArray([...availablePlayers]));
    setTickerIndex(0);
  };

  const handleDownloadExcel = () => {
    if (Object.keys(raffleResults).length === 0) {
      return;
    }
    
    // Check if all teams have results
    const hasAllResults = TEAM_CARDS.every(team => 
      raffleResults[team.id] && Object.keys(raffleResults[team.id]).length > 0
    );
    
    if (!hasAllResults) {
      return;
    }

    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // Create worksheet data array
    const worksheetData = [];
    
    // Header row with organization info
    worksheetData.push(['RSL RAFFLE SYSTEM']);
    worksheetData.push(['Official Team Member Selection Report - All Sports']);
    worksheetData.push([]);
    
    // Document Information
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    const docId = `RSL-AllTeams-AllSports-${Date.now().toString().slice(-6)}`;
    
    worksheetData.push(['DOCUMENT INFORMATION']);
    worksheetData.push(['Teams:', 'All Teams']);
    worksheetData.push(['Sports:', 'All Sports']);
    worksheetData.push(['Players per Sport/Team:', Math.floor(playerPool.length / (TEAM_CARDS.length * SPORTS_CONFIG.length))]);
    worksheetData.push(['Date:', dateStr]);
    worksheetData.push(['Time:', timeStr]);
    worksheetData.push(['Document ID:', docId]);
    worksheetData.push([]);
    
    // SELECTED PLAYERS SECTION
    worksheetData.push(['SELECTED PLAYERS']);
    worksheetData.push([]);
    
    // Team Headers Row
    const teamHeaders = ['Team/Sport'];
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      const hasResults = Object.keys(teamSports).length > 0;
      if (hasResults) {
        teamHeaders.push(`${team.name} (${team.code})`);
      }
    });
    worksheetData.push(teamHeaders);
    
    // For each sport, add headers and players
    SPORTS_CONFIG.forEach((sport) => {
      // Check if any team has players for this sport
      const hasSportData = TEAM_CARDS.some(team => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        return sportPlayers.length > 0;
      });
      
      if (!hasSportData) return;
      
      // Sport Header Row
      const sportHeaderRow = [`${sport.emoji} ${sport.name}`];
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        if (sportPlayers.length > 0) {
          sportHeaderRow.push(''); // Empty cell for alignment
        }
      });
      worksheetData.push(sportHeaderRow);
      
      // Find max players count for this sport across all teams
      let maxPlayers = 0;
      const teamPlayerLists = [];
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        if (sportPlayers.length > 0) {
          teamPlayerLists.push(sportPlayers);
          maxPlayers = Math.max(maxPlayers, sportPlayers.length);
        } else {
          teamPlayerLists.push([]);
        }
      });
      
      // Add players row by row
      for (let playerIndex = 0; playerIndex < maxPlayers; playerIndex++) {
        const playerRow = [playerIndex === 0 ? 'Players:' : ''];
        teamPlayerLists.forEach((sportPlayers) => {
          if (playerIndex < sportPlayers.length) {
            const player = sportPlayers[playerIndex];
            const empCode = player.employeeCode ? ` [${player.employeeCode}]` : '';
            playerRow.push(`${playerIndex + 1}. ${player.name}${empCode} - ${player.department}`);
          } else {
            playerRow.push(''); // Empty cell
          }
        });
        worksheetData.push(playerRow);
      }
      
      // Empty row between sports
      worksheetData.push([]);
    });
    
    // Summary Section
    worksheetData.push([]);
    worksheetData.push(['SUMMARY']);
    
    // Calculate total players
    let totalPlayers = 0;
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        totalPlayers += sportPlayers.length;
      });
    });
    
    worksheetData.push(['Total Players Selected:', totalPlayers]);
    worksheetData.push(['Selection Method:', `Random Raffle from ${playerPool.length} Participants`]);
    
    // Create worksheet from data
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    const colWidths = [{ wch: 25 }]; // First column for labels
    TEAM_CARDS.forEach(() => {
      colWidths.push({ wch: 30 }); // Team columns
    });
    worksheet['!cols'] = colWidths;
    
    // Color definitions based on UI
    const accentColor = { rgb: 'B6CB2F' }; // #B6CB2F
    const accentColorLight = { rgb: 'E8F0A0' }; // Lighter version
    const white = { rgb: 'FFFFFF' };
    const darkGray = { rgb: '3C3C3C' };
    const lightGray = { rgb: 'F5F5F5' };
    const veryLightGray = { rgb: 'FAFAFA' };
    
    // Helper function to convert hex to RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };
    
    // Convert team colors to RGB
    const teamColors = TEAM_CARDS.map(team => {
      const rgb = hexToRgb(team.color);
      return rgb ? { rgb: `${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`.toUpperCase() } : accentColorLight;
    });
    
    // Style all cells by iterating through worksheet
    worksheet['!merges'] = worksheet['!merges'] || [];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    
    // Style header row (row 0)
    for (let c = 0; c <= range.e.c; c++) {
      const cell = XLSX.utils.encode_cell({ r: 0, c });
      if (worksheet[cell]) {
        worksheet[cell].s = {
          font: { bold: true, sz: 18, color: { rgb: white.rgb } },
          fill: { fgColor: { rgb: accentColor.rgb } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }
    worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: range.e.c } });
    
    // Style subtitle row (row 1)
    for (let c = 0; c <= range.e.c; c++) {
      const cell = XLSX.utils.encode_cell({ r: 1, c });
      if (worksheet[cell]) {
        worksheet[cell].s = {
          font: { bold: true, sz: 12, color: { rgb: darkGray.rgb } },
          fill: { fgColor: { rgb: accentColorLight.rgb } },
          alignment: { horizontal: 'center', vertical: 'center' }
        };
      }
    }
    worksheet['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: range.e.c } });
    
    // Find and style DOCUMENT INFORMATION section (row 3)
    for (let r = 0; r <= range.e.r; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 0 });
      if (worksheet[cell] && worksheet[cell].v === 'DOCUMENT INFORMATION') {
        worksheet[cell].s = {
          font: { bold: true, sz: 11, color: { rgb: darkGray.rgb } },
          fill: { fgColor: { rgb: veryLightGray.rgb } },
          border: {
            top: { style: 'thin', color: { rgb: darkGray.rgb } },
            bottom: { style: 'thin', color: { rgb: darkGray.rgb } },
            left: { style: 'thin', color: { rgb: darkGray.rgb } },
            right: { style: 'thin', color: { rgb: darkGray.rgb } }
          }
        };
        // Style document info rows (next 6 rows)
        for (let i = 1; i <= 6; i++) {
          const labelCell = XLSX.utils.encode_cell({ r: r + i, c: 0 });
          const valueCell = XLSX.utils.encode_cell({ r: r + i, c: 1 });
          if (worksheet[labelCell]) {
            worksheet[labelCell].s = {
              font: { bold: true, sz: 10, color: { rgb: darkGray.rgb } },
              fill: { fgColor: { rgb: lightGray.rgb } }
            };
          }
          if (worksheet[valueCell]) {
            worksheet[valueCell].s = {
              font: { sz: 10, color: { rgb: darkGray.rgb } },
              fill: { fgColor: { rgb: white.rgb } }
            };
          }
        }
        break;
      }
    }
    
    // Find and style SELECTED PLAYERS header
    for (let r = 0; r <= range.e.r; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 0 });
      if (worksheet[cell] && worksheet[cell].v === 'SELECTED PLAYERS') {
        for (let c = 0; c <= range.e.c; c++) {
          const headerCell = XLSX.utils.encode_cell({ r, c });
          if (worksheet[headerCell]) {
            worksheet[headerCell].s = {
              font: { bold: true, sz: 12, color: { rgb: white.rgb } },
              fill: { fgColor: { rgb: accentColor.rgb } },
              alignment: { horizontal: 'center', vertical: 'center' },
              border: {
                top: { style: 'medium', color: { rgb: darkGray.rgb } },
                bottom: { style: 'medium', color: { rgb: darkGray.rgb } },
                left: { style: 'medium', color: { rgb: darkGray.rgb } },
                right: { style: 'medium', color: { rgb: darkGray.rgb } }
              }
            };
          }
        }
        worksheet['!merges'].push({ s: { r, c: 0 }, e: { r, c: range.e.c } });
        
        // Find team headers row (2 rows after SELECTED PLAYERS)
        const teamHeadersRow = r + 2;
        let colIndex = 1;
        TEAM_CARDS.forEach((team, teamIndex) => {
          const teamSports = raffleResults[team.id] || {};
          const hasResults = Object.keys(teamSports).length > 0;
          if (hasResults) {
            const teamHeaderCell = XLSX.utils.encode_cell({ r: teamHeadersRow, c: colIndex });
            if (worksheet[teamHeaderCell]) {
              worksheet[teamHeaderCell].s = {
                font: { bold: true, sz: 11, color: { rgb: darkGray.rgb } },
                fill: { fgColor: teamColors[teamIndex] },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: {
                  top: { style: 'thin', color: { rgb: darkGray.rgb } },
                  bottom: { style: 'thin', color: { rgb: darkGray.rgb } },
                  left: { style: 'thin', color: { rgb: darkGray.rgb } },
                  right: { style: 'thin', color: { rgb: darkGray.rgb } }
                }
              };
            }
            colIndex++;
          }
        });
        break;
      }
    }
    
    // Style sport headers and player cells
    for (let r = 0; r <= range.e.r; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 0 });
      if (worksheet[cell] && worksheet[cell].v && typeof worksheet[cell].v === 'string') {
        // Check if it's a sport header (contains emoji)
        const cellValue = worksheet[cell].v;
        if (cellValue.match(/[\u{1F300}-\u{1F9FF}]/u) && cellValue.length > 2) {
          // This is a sport header row
          let colIndex = 1;
          TEAM_CARDS.forEach((team) => {
            const teamSports = raffleResults[team.id] || {};
            const sportPlayers = teamSports[SPORTS_CONFIG.find(s => cellValue.includes(s.emoji))?.id || ''] || [];
            if (sportPlayers.length > 0) {
              const sportHeaderCell = XLSX.utils.encode_cell({ r, c: colIndex });
              if (worksheet[sportHeaderCell]) {
                worksheet[sportHeaderCell].s = {
                  font: { bold: true, sz: 10, color: { rgb: darkGray.rgb } },
                  fill: { fgColor: { rgb: accentColorLight.rgb } },
                  alignment: { horizontal: 'center', vertical: 'center' },
                  border: {
                    top: { style: 'thin', color: { rgb: accentColor.rgb } },
                    bottom: { style: 'thin', color: { rgb: accentColor.rgb } },
                    left: { style: 'thin', color: { rgb: darkGray.rgb } },
                    right: { style: 'thin', color: { rgb: darkGray.rgb } }
                  }
                };
              }
              colIndex++;
            }
          });
          
          // Style player rows below this sport header
          let playerRow = r + 1;
          let maxPlayers = 0;
          const teamPlayerLists = [];
          TEAM_CARDS.forEach((team) => {
            const teamSports = raffleResults[team.id] || {};
            const sportId = SPORTS_CONFIG.find(s => cellValue.includes(s.emoji))?.id || '';
            const sportPlayers = teamSports[sportId] || [];
            if (sportPlayers.length > 0) {
              teamPlayerLists.push(sportPlayers);
              maxPlayers = Math.max(maxPlayers, sportPlayers.length);
            } else {
              teamPlayerLists.push([]);
            }
          });
          
          for (let playerIndex = 0; playerIndex < maxPlayers; playerIndex++) {
            let currentColIndex = 1;
            const currentPlayerRow = playerRow;
            teamPlayerLists.forEach((sportPlayers) => {
              if (playerIndex < sportPlayers.length) {
                const playerCell = XLSX.utils.encode_cell({ r: currentPlayerRow, c: currentColIndex });
                if (worksheet[playerCell]) {
                  worksheet[playerCell].s = {
                    font: { sz: 9, color: { rgb: darkGray.rgb } },
                    fill: { fgColor: { rgb: white.rgb } },
                    alignment: { vertical: 'center' },
                    border: {
                      left: { style: 'thin', color: { rgb: lightGray.rgb } },
                      right: { style: 'thin', color: { rgb: lightGray.rgb } }
                    }
                  };
                }
              }
              currentColIndex++;
            });
            playerRow++;
          }
        }
      }
    }
    
    // Find and style SUMMARY section
    for (let r = 0; r <= range.e.r; r++) {
      const cell = XLSX.utils.encode_cell({ r, c: 0 });
      if (worksheet[cell] && worksheet[cell].v === 'SUMMARY') {
        worksheet[cell].s = {
          font: { bold: true, sz: 11, color: { rgb: white.rgb } },
          fill: { fgColor: { rgb: accentColor.rgb } },
          border: {
            top: { style: 'medium', color: { rgb: darkGray.rgb } },
            bottom: { style: 'thin', color: { rgb: darkGray.rgb } },
            left: { style: 'thin', color: { rgb: darkGray.rgb } },
            right: { style: 'thin', color: { rgb: darkGray.rgb } }
          }
        };
        // Style summary content rows (next 2 rows)
        for (let i = 1; i <= 2; i++) {
          const labelCell = XLSX.utils.encode_cell({ r: r + i, c: 0 });
          const valueCell = XLSX.utils.encode_cell({ r: r + i, c: 1 });
          if (worksheet[labelCell]) {
            worksheet[labelCell].s = {
              font: { bold: true, sz: 10, color: { rgb: darkGray.rgb } },
              fill: { fgColor: { rgb: veryLightGray.rgb } }
            };
          }
          if (worksheet[valueCell]) {
            worksheet[valueCell].s = {
              font: { sz: 10, color: { rgb: darkGray.rgb } },
              fill: { fgColor: { rgb: white.rgb } }
            };
          }
        }
        break;
      }
    }
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Raffle Results');
    
    // Generate filename and download
    const filename = `RSL_Raffle_AllTeams_AllSports_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const handleDownloadPDF = () => {
    if (Object.keys(raffleResults).length === 0) {
      return;
    }
    
    // Check if all teams have results
    const hasAllResults = TEAM_CARDS.every(team => 
      raffleResults[team.id] && Object.keys(raffleResults[team.id]).length > 0
    );
    
    if (!hasAllResults) {
      return;
    }

    // Create PDF document
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 10;
    const margin = 10;
    const lineHeight = 6;
    const sectionSpacing = 8;
    const cellPadding = 3;

    // Helper function to add new page if needed
    const checkNewPage = (requiredSpace = 20) => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
        return true;
      }
      return false;
    };

    // Header with better styling
    pdf.setFillColor(182, 203, 47); // #B6CB2F
    pdf.rect(0, 0, pageWidth, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RSL RAFFLE SYSTEM', pageWidth / 2, 11, { align: 'center' });
    pdf.setFontSize(13);
    pdf.text('Official Team Member Selection Report - All Sports', pageWidth / 2, 18, { align: 'center' });
    
    yPosition = 28;
    pdf.setTextColor(0, 0, 0);

    // Document Information - Better formatted in two columns
    pdf.setFillColor(245, 245, 245);
    pdf.rect(margin, yPosition - 3, pageWidth - (margin * 2), 20, 'F');
    pdf.setDrawColor(200, 200, 200);
    pdf.rect(margin, yPosition - 3, pageWidth - (margin * 2), 20, 'S');
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DOCUMENT INFORMATION', margin + 5, yPosition);
    yPosition += lineHeight + 2;
    
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    const docId = `RSL-AllTeams-AllSports-${Date.now().toString().slice(-6)}`;
    
    const infoStartX = margin + 5;
    const infoCol2X = pageWidth / 2;
    
    pdf.text(`Teams:`, infoStartX, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`All Teams`, infoStartX + 20, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date:`, infoCol2X, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(dateStr, infoCol2X + 20, yPosition);
    yPosition += lineHeight;
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Sports:`, infoStartX, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`All Sports`, infoStartX + 20, yPosition);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Time:`, infoCol2X, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(timeStr, infoCol2X + 20, yPosition);
    yPosition += lineHeight;
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Document ID:`, infoStartX, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(docId, infoStartX + 30, yPosition);
    
    yPosition += sectionSpacing + 5;

    // Selected Players Section
    checkNewPage(30);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SELECTED PLAYERS', margin, yPosition);
    yPosition += lineHeight + 3;

    // For each sport
    SPORTS_CONFIG.forEach((sport) => {
      // Check if any team has players for this sport
      const hasSportData = TEAM_CARDS.some(team => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        return sportPlayers.length > 0;
      });
      
      if (!hasSportData) return;

      checkNewPage(35);
      
      // Sport Header with better styling (remove emoji to avoid encoding issues)
      pdf.setFillColor(232, 240, 160); // Light accent color
      pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'F');
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'S');
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${sport.name}`, margin + 5, yPosition);
      yPosition += lineHeight + 4;

      // Calculate column width - equal distribution with spacing
      const availableWidth = pageWidth - (margin * 2);
      const colSpacing = 2;
      const colWidth = (availableWidth - (colSpacing * (TEAM_CARDS.length - 1))) / TEAM_CARDS.length;
      let startX = margin;
      let maxPlayerY = yPosition; // Track maximum player Y position across all teams
      
      // First, find the maximum number of players for this sport across all teams
      let maxPlayersCount = 0;
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        maxPlayersCount = Math.max(maxPlayersCount, sportPlayers.length);
      });
      
      // Draw team headers first (all aligned)
      TEAM_CARDS.forEach((team, teamIndex) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        
        if (sportPlayers.length === 0) {
          startX += colWidth + colSpacing;
          return;
        }

        // Team header with border
        const teamColor = team.color.replace('#', '');
        const r = parseInt(teamColor.substring(0, 2), 16);
        const g = parseInt(teamColor.substring(2, 4), 16);
        const b = parseInt(teamColor.substring(4, 6), 16);
        pdf.setFillColor(r, g, b);
        pdf.rect(startX, yPosition - 3, colWidth, 6, 'F');
        pdf.setDrawColor(150, 150, 150);
        pdf.rect(startX, yPosition - 3, colWidth, 6, 'S');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        const teamText = `${team.name} (${team.code})`;
        pdf.text(teamText, startX + colWidth / 2, yPosition, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        
        startX += colWidth + colSpacing;
      });
      
      yPosition += lineHeight + 2;
      
      // Now draw players row by row, ensuring alignment
      startX = margin;
      for (let playerIndex = 0; playerIndex < maxPlayersCount; playerIndex++) {
        checkNewPage(10);
        if (yPosition + 8 > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin + 5;
        }
        
        let currentX = margin;
        const currentYPosition = yPosition; // Capture for loop
        
        TEAM_CARDS.forEach((team) => {
          const teamSports = raffleResults[team.id] || {};
          const sportPlayers = teamSports[sport.id] || [];
          
          if (sportPlayers.length === 0) {
            currentX += colWidth + colSpacing;
            return;
          }
          
          // Draw cell border
          pdf.setDrawColor(220, 220, 220);
          pdf.rect(currentX, currentYPosition - 4, colWidth, 8, 'S');
          
          if (playerIndex < sportPlayers.length) {
            const player = sportPlayers[playerIndex];
            const empCode = player.employeeCode ? ` [${player.employeeCode}]` : '';
            const playerText = `${playerIndex + 1}. ${player.name}${empCode}`;
            const deptText = player.department || '';
            
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'normal');
            
            // Wrap text if too long
            const maxWidth = colWidth - (cellPadding * 2);
            const lines = pdf.splitTextToSize(playerText, maxWidth);
            pdf.text(lines[0], currentX + cellPadding, currentYPosition);
            
            if (deptText) {
              pdf.setFontSize(7);
              pdf.setTextColor(100, 100, 100);
              const deptLines = pdf.splitTextToSize(deptText, maxWidth);
              pdf.text(deptLines[0], currentX + cellPadding, currentYPosition + 3.5);
              pdf.setTextColor(0, 0, 0);
            }
          }
          
          currentX += colWidth + colSpacing;
        });
        
        yPosition += 8;
        maxPlayerY = Math.max(maxPlayerY, yPosition);
      }
      
      yPosition = maxPlayerY + sectionSpacing + 3;
    });

    // Summary with better styling
    checkNewPage(25);
    yPosition += 3;
    pdf.setFillColor(182, 203, 47); // Accent color
    pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'F');
    pdf.setDrawColor(150, 150, 150);
    pdf.rect(margin, yPosition - 4, pageWidth - (margin * 2), 7, 'S');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SUMMARY', margin + 5, yPosition);
    yPosition += lineHeight + 4;
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    // Calculate total players
    let totalPlayers = 0;
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        totalPlayers += sportPlayers.length;
      });
    });
    
    pdf.text(`Total Players Selected:`, margin + 5, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${totalPlayers}`, margin + 55, yPosition);
    yPosition += lineHeight;
    
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Selection Method:`, margin + 5, yPosition);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Random Raffle from ${playerPool.length} Participants`, margin + 45, yPosition);

    // Generate separate PDF for each sport (not combined)
    SPORTS_CONFIG.forEach((sport) => {
      const hasSportData = TEAM_CARDS.some(team => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        return sportPlayers.length > 0;
      });
      
      if (!hasSportData) return;
      
      // Create new PDF for this sport
      const sportPdf = new jsPDF('landscape', 'mm', 'a4');
      const sportPageWidth = sportPdf.internal.pageSize.getWidth();
      const sportPageHeight = sportPdf.internal.pageSize.getHeight();
      let sportYPosition = 10;
      const sportMargin = 10;
      const sportLineHeight = 6;
      const sportSectionSpacing = 8;
      const sportCellPadding = 3;

      const checkSportNewPage = (requiredSpace = 20) => {
        if (sportYPosition + requiredSpace > sportPageHeight - sportMargin) {
          sportPdf.addPage();
          sportYPosition = sportMargin;
          return true;
        }
        return false;
      };

      // Header
      sportPdf.setFillColor(182, 203, 47);
      sportPdf.rect(0, 0, sportPageWidth, 22, 'F');
      sportPdf.setTextColor(255, 255, 255);
      sportPdf.setFontSize(22);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text('RSL RAFFLE SYSTEM', sportPageWidth / 2, 11, { align: 'center' });
      sportPdf.setFontSize(13);
      sportPdf.text(`Team Member Selection - ${sport.name}`, sportPageWidth / 2, 18, { align: 'center' });
      
      sportYPosition = 28;
      sportPdf.setTextColor(0, 0, 0);

      // Document Information
      sportPdf.setFillColor(245, 245, 245);
      sportPdf.rect(sportMargin, sportYPosition - 3, sportPageWidth - (sportMargin * 2), 20, 'F');
      sportPdf.setDrawColor(200, 200, 200);
      sportPdf.rect(sportMargin, sportYPosition - 3, sportPageWidth - (sportMargin * 2), 20, 'S');
      
      sportPdf.setFontSize(11);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text('DOCUMENT INFORMATION', sportMargin + 5, sportYPosition);
      sportYPosition += sportLineHeight + 2;
      
      sportPdf.setFontSize(9);
      sportPdf.setFont('helvetica', 'normal');
      const sportInfoStartX = sportMargin + 5;
      const sportInfoCol2X = sportPageWidth / 2;
      
      sportPdf.text(`Sport:`, sportInfoStartX, sportYPosition);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text(sport.name, sportInfoStartX + 20, sportYPosition);
      sportPdf.setFont('helvetica', 'normal');
      sportPdf.text(`Date:`, sportInfoCol2X, sportYPosition);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text(dateStr, sportInfoCol2X + 20, sportYPosition);
      sportYPosition += sportLineHeight;
      
      sportPdf.setFont('helvetica', 'normal');
      sportPdf.text(`Teams:`, sportInfoStartX, sportYPosition);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text('All Teams', sportInfoStartX + 20, sportYPosition);
      sportPdf.setFont('helvetica', 'normal');
      sportPdf.text(`Time:`, sportInfoCol2X, sportYPosition);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text(timeStr, sportInfoCol2X + 20, sportYPosition);
      
      sportYPosition += sportSectionSpacing + 5;

      // Sport Header
      checkSportNewPage(35);
      sportPdf.setFillColor(232, 240, 160);
      sportPdf.rect(sportMargin, sportYPosition - 4, sportPageWidth - (sportMargin * 2), 7, 'F');
      sportPdf.setDrawColor(200, 200, 200);
      sportPdf.rect(sportMargin, sportYPosition - 4, sportPageWidth - (sportMargin * 2), 7, 'S');
      sportPdf.setFontSize(12);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text(`${sport.name} - Selected Players`, sportMargin + 5, sportYPosition);
      sportYPosition += sportLineHeight + 4;

      // Calculate column width
      const sportAvailableWidth = sportPageWidth - (sportMargin * 2);
      const sportColSpacing = 2;
      const sportColWidth = (sportAvailableWidth - (sportColSpacing * (TEAM_CARDS.length - 1))) / TEAM_CARDS.length;
      let sportStartX = sportMargin;
      let sportMaxPlayerY = sportYPosition;

      // Draw team headers
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        
        if (sportPlayers.length === 0) {
          sportStartX += sportColWidth + sportColSpacing;
          return;
        }

        const teamColor = team.color.replace('#', '');
        const r = parseInt(teamColor.substring(0, 2), 16);
        const g = parseInt(teamColor.substring(2, 4), 16);
        const b = parseInt(teamColor.substring(4, 6), 16);
        sportPdf.setFillColor(r, g, b);
        sportPdf.rect(sportStartX, sportYPosition - 3, sportColWidth, 6, 'F');
        sportPdf.setDrawColor(150, 150, 150);
        sportPdf.rect(sportStartX, sportYPosition - 3, sportColWidth, 6, 'S');
        sportPdf.setTextColor(255, 255, 255);
        sportPdf.setFontSize(9);
        sportPdf.setFont('helvetica', 'bold');
        const teamText = `${team.name} (${team.code})`;
        sportPdf.text(teamText, sportStartX + sportColWidth / 2, sportYPosition, { align: 'center' });
        sportPdf.setTextColor(0, 0, 0);
        
        sportStartX += sportColWidth + sportColSpacing;
      });
      
      sportYPosition += sportLineHeight + 2;

      // Draw players
      const sportMaxPlayersCount = Math.max(...TEAM_CARDS.map(team => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        return sportPlayers.length;
      }));

      for (let playerIndex = 0; playerIndex < sportMaxPlayersCount; playerIndex++) {
        checkSportNewPage(10);
        if (sportYPosition + 8 > sportPageHeight - sportMargin) {
          sportPdf.addPage();
          sportYPosition = sportMargin + 5;
        }
        
        let currentX = sportMargin;
        const currentSportYPosition = sportYPosition; // Capture for loop
        
        TEAM_CARDS.forEach((team) => {
          const teamSports = raffleResults[team.id] || {};
          const sportPlayers = teamSports[sport.id] || [];
          
          if (sportPlayers.length === 0) {
            currentX += sportColWidth + sportColSpacing;
            return;
          }
          
          sportPdf.setDrawColor(220, 220, 220);
          sportPdf.rect(currentX, currentSportYPosition - 4, sportColWidth, 8, 'S');
          
          if (playerIndex < sportPlayers.length) {
            const player = sportPlayers[playerIndex];
            const empCode = player.employeeCode ? ` [${player.employeeCode}]` : '';
            const playerText = `${playerIndex + 1}. ${player.name}${empCode}`;
            const deptText = player.department || '';
            
            sportPdf.setFontSize(8);
            sportPdf.setFont('helvetica', 'normal');
            
            const maxWidth = sportColWidth - (sportCellPadding * 2);
            const lines = sportPdf.splitTextToSize(playerText, maxWidth);
            sportPdf.text(lines[0], currentX + sportCellPadding, currentSportYPosition);
            
            if (deptText) {
              sportPdf.setFontSize(7);
              sportPdf.setTextColor(100, 100, 100);
              const deptLines = sportPdf.splitTextToSize(deptText, maxWidth);
              sportPdf.text(deptLines[0], currentX + sportCellPadding, currentSportYPosition + 3.5);
              sportPdf.setTextColor(0, 0, 0);
            }
          }
          
          currentX += sportColWidth + sportColSpacing;
        });
        
        sportYPosition += 8;
        sportMaxPlayerY = Math.max(sportMaxPlayerY, sportYPosition);
      }

      // Summary for this sport
      checkSportNewPage(25);
      sportYPosition += 3;
      sportPdf.setFillColor(182, 203, 47);
      sportPdf.rect(sportMargin, sportYPosition - 4, sportPageWidth - (sportMargin * 2), 7, 'F');
      sportPdf.setDrawColor(150, 150, 150);
      sportPdf.rect(sportMargin, sportYPosition - 4, sportPageWidth - (sportMargin * 2), 7, 'S');
      sportPdf.setTextColor(255, 255, 255);
      sportPdf.setFontSize(11);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text('SUMMARY', sportMargin + 5, sportYPosition);
      sportYPosition += sportLineHeight + 4;
      
      sportPdf.setTextColor(0, 0, 0);
      sportPdf.setFontSize(10);
      sportPdf.setFont('helvetica', 'normal');
      
      let sportTotalPlayers = 0;
      TEAM_CARDS.forEach((team) => {
        const teamSports = raffleResults[team.id] || {};
        const sportPlayers = teamSports[sport.id] || [];
        sportTotalPlayers += sportPlayers.length;
      });
      
      sportPdf.text(`Total Players Selected:`, sportMargin + 5, sportYPosition);
      sportPdf.setFont('helvetica', 'bold');
      sportPdf.text(`${sportTotalPlayers}`, sportMargin + 55, sportYPosition);

      // Save sport-specific PDF
      const sportFilename = `RSL_Raffle_${sport.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      sportPdf.save(sportFilename);
    });
  };

  const renderModeSelection = () => {
    return (
      <motion.div 
        className="raffle-wrapper"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="raffle-panel">
          <div className="start-panel">
            <h3 style={{ marginBottom: '20px', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)' }}>
              Select Raffle Mode
            </h3>
            <div className="mode-selection-grid">
              <motion.button 
                type="button" 
                className="mode-card mode-card-primary" 
                onClick={() => handleModeSelection('all-sports')}
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <h4 className="mode-card-title">All Sports Raffle</h4>
                <p className="mode-card-description">
                  Distribute all registered players across all teams and all sports in one raffle
                </p>
                <div className="mode-card-arrow">→</div>
              </motion.button>
              
              <motion.button 
                type="button" 
                className="mode-card mode-card-secondary" 
                onClick={() => handleModeSelection('sport-by-sport')}
                whileHover={{ scale: 1.02, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <h4 className="mode-card-title">Sport-by-Sport Raffle</h4>
                <p className="mode-card-description">
                  Raffle one sport at a time, selecting players for each sport separately
                </p>
                <div className="mode-card-arrow">→</div>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderSportSelection = () => {
    return (
      <motion.div 
        className="raffle-wrapper"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="raffle-panel">
          <div className="start-panel">
            <button 
              type="button" 
              className="nav-button nav-button-back"
              onClick={handleBackToModeSelection}
              style={{ marginBottom: '20px' }}
            >
              ← Back to Mode Selection
            </button>
            <h3 style={{ marginBottom: '20px', fontSize: 'clamp(1rem, 2.5vw, 1.25rem)' }}>
              Select a Sport to Raffle
            </h3>
            <div className="sport-selection-grid">
              {SPORTS_CONFIG.map((sport) => (
                <motion.button
                  key={sport.id}
                  type="button"
                  className="sport-card"
                  onClick={() => handleSportSelect(sport)}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="sport-card-emoji">{sport.emoji}</div>
                  <div className="sport-card-name">{sport.name}</div>
                  <div className="sport-card-count">
                    {registeredPlayersBySport[sport.id]?.length || 0} registered
                  </div>
                  <div className="sport-card-arrow">→</div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderRaffle = () => {
    return (
      <motion.div 
        className="raffle-wrapper"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="raffle-panel">
          {!hasStartedRaffle && (
            <div className="start-panel">
              {loadingPlayers ? (
                <p>Loading players from database...</p>
              ) : playerPool.length === 0 ? (
                <div>
                  <p style={{ color: '#f97316', marginBottom: '10px' }}>
                    ⚠️ No players found. Please check:
                  </p>
                  <ul style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.9rem', paddingLeft: '20px' }}>
                    <li>Server is running on port 5000</li>
                    <li>Database connection is active</li>
                    <li>employee_registrations table exists</li>
                    <li>Table contains data with played_season_two = 1</li>
                    <li>Check employee_name and designation columns</li>
                  </ul>
                </div>
              ) : (
                <>
                  <p>
                    {phase === 'raffle' ? (
                      <>
                        Ready to distribute registered players across all teams and all sports.
                        <br />
                        <small style={{ fontSize: '0.9em', opacity: 0.8, marginTop: '0.5em', display: 'block' }}>
                          {Object.entries(registeredPlayersBySport).map(([sportId, players]) => {
                            const sport = SPORTS_CONFIG.find(s => s.id === sportId);
                            return players.length > 0 ? (
                              <span key={sportId} style={{ marginRight: '1em' }}>
                                {sport?.emoji} {sport?.name}: {players.length} players
                              </span>
                            ) : null;
                          })}
                        </small>
                      </>
                    ) : selectedSport ? (
                      <>
                        Ready to raffle <strong>{selectedSport.name}</strong> with{' '}
                        <strong>{registeredPlayersBySport[selectedSport.id]?.length || 0} registered players</strong>.
                        <br />
                        Click start to distribute them across all teams.
                      </>
                    ) : (
                      `Ready to spin ${playerPool.length} names and distribute them across all teams and all sports.`
                    )}
                  </p>
                  <motion.button 
                    type="button" 
                    className="primary-btn start-raffle-btn" 
                    onClick={handleStartRaffle}
                whileHover={{ scale: 1.05, boxShadow: "0 15px 35px rgba(182, 203, 47, 0.5)" }}
                whileTap={{ scale: 0.95 }}
                animate={{ 
                  boxShadow: [
                    "0 10px 25px rgba(182, 203, 47, 0.35)",
                    "0 15px 40px rgba(182, 203, 47, 0.5)",
                    "0 10px 25px rgba(182, 203, 47, 0.35)"
                  ]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                🎲 Start Raffle
              </motion.button>
                </>
              )}
            </div>
          )}
          {hasStartedRaffle && (
            <>
              <p className={`countdown ${countdown <= 2 && countdown > 0 ? 'countdown-warn' : ''}`}>
                {countdown > 0 ? `Raffling in ${countdown}s` : isRaffling ? 'Lottery rolling…' : 'Raffle complete'}
              </p>
              {isRaffling || Object.keys(raffleResults).length === 0 ? (
                <div className="ticker-shell">
                  <div className="ticker-list">
                    {tickerPlayers.map((player, index) => (
                      <div
                        key={`${player.id}-${tickerIndex + index}`}
                        className={`result-card ticker-card ${
                          index === tickerPlayers.length - 1 ? 'ticker-card-active' : ''
                        }`}
                      >
                        <span className="result-rank-badge">
                          {((tickerIndex + index) % shuffledPlayers.length) + 1}
                        </span>
                        <div className="result-meta">
                          <strong>{player?.name}</strong>
                          {player?.employeeCode && (
                            <span className="employee-code">Code: {player.employeeCode}</span>
                          )}
                          <span>{player?.department}</span>
                          {player?.sportsPreferences && (
                            <div className="result-sport-prefs">
                              <span className="sport-prefs-label">Sports: {player.registeredSportsCount || 0}</span>
                            </div>
                          )}
                        </div>
                        <span className="result-dot" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <h4 className="results-title">
                    {phase === 'sport-raffle' && selectedSport 
                      ? `Raffle Results - ${selectedSport.emoji} ${selectedSport.name}` 
                      : 'Raffle Results - All Teams & Sports'}
                  </h4>
                  {phase === 'sport-raffle' && selectedSport && (
                    <div className="sport-navigation-buttons">
                      <button 
                        type="button" 
                        className="nav-button nav-button-back"
                        onClick={handleBackToSportSelection}
                      >
                        ← Back to Sports
                      </button>
                      {SPORTS_CONFIG.findIndex(s => s.id === selectedSport.id) < SPORTS_CONFIG.length - 1 && (
                        <button 
                          type="button" 
                          className="nav-button nav-button-next"
                          onClick={handleNextSport}
                        >
                          Next Sport →
                        </button>
                      )}
                    </div>
                  )}
                  <div className="results-grid-container">
                    {/* Team Headers Row */}
                    <div className="results-grid-row team-headers-row">
                      {TEAM_CARDS.map((team) => {
                        const teamSports = raffleResults[team.id] || {};
                        const hasResults = Object.keys(teamSports).length > 0;
                        if (!hasResults) return null;
                        
                        return (
                          <div key={team.id} className="results-grid-column team-header-column">
                            <h5 className="team-results-header" style={{ color: team.color }}>
                              {team.name} ({team.code})
                            </h5>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Sports Rows - Each sport is a row */}
                    {(phase === 'sport-raffle' && selectedSport 
                      ? [selectedSport] 
                      : SPORTS_CONFIG
                    ).map((sport) => {
                      // Check if any team has players for this sport
                      const hasSportData = TEAM_CARDS.some(team => {
                        const teamSports = raffleResults[team.id] || {};
                        const sportPlayers = teamSports[sport.id] || [];
                        return sportPlayers.length > 0;
                      });
                      
                      if (!hasSportData) return null;
                      
                      return (
                        <div key={sport.id} className="sport-row-container">
                          {/* Sport Header Row */}
                          <div className="results-grid-row sport-headers-row">
                            {TEAM_CARDS.map((team) => {
                              const teamSports = raffleResults[team.id] || {};
                              const sportPlayers = teamSports[sport.id] || [];
                              if (sportPlayers.length === 0) return null;
                              
                              return (
                                <div key={team.id} className="results-grid-column sport-header-column">
                                  <h6 className="sport-results-header">
                                    <span className="sport-emoji-small">{sport.emoji}</span>
                                    {sport.name}
                                  </h6>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Players Row */}
                          <div className="results-grid-row players-row">
                            {TEAM_CARDS.map((team) => {
                              const teamSports = raffleResults[team.id] || {};
                              const sportPlayers = teamSports[sport.id] || [];
                              if (sportPlayers.length === 0) return null;
                              
                              const teamRevealed = revealedPlayers[team.id] || {};
                              const revealedCount = teamRevealed[sport.id] || 0;
                              const visiblePlayers = sportPlayers.slice(0, revealedCount);
                              
                              return (
                                <div key={team.id} className="results-grid-column players-column">
                                  <ul className="results-list">
                                    {visiblePlayers.map((player, index) => {
                                      const refKey = `${team.id}-${sport.id}-${index}`;
                                      const isNewlyRevealed = index === visiblePlayers.length - 1 && revealedCount === visiblePlayers.length;
                                      
                                      // Get sport preferences for this specific sport
                                      const sportPrefs = player.sportsPreferences?.[sport.id];
                                      const hasSportPrefs = sportPrefs && (sportPrefs.priority > 0 || (sportPrefs.interest && sportPrefs.interest !== 'Not specified'));
                                      
                                      return (
                                        <motion.li 
                                          key={player.id}
                                          ref={(el) => {
                                            if (el) {
                                              resultRefs.current[refKey] = el;
                                            }
                                          }}
                                          className={`result-card ${isNewlyRevealed ? 'result-card-active' : ''}`}
                                          initial={{ opacity: 0, x: -20 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ 
                                            duration: 0.3,
                                            delay: 0
                                          }}
                                          whileHover={{ scale: 1.01 }}
                                        >
                                          <span className="result-rank-badge">{index + 1}</span>
                                          <div className="result-meta">
                                            <strong>{player.name}</strong>
                                            {player.employeeCode && (
                                              <span className="employee-code">Code: {player.employeeCode}</span>
                                            )}
                                            <span>{player.department}</span>
                                            {hasSportPrefs && (
                                              <div className="result-sport-prefs">
                                                <span className="sport-priority-badge">
                                                  P: {sportPrefs.priority || 0}
                                                </span>
                                                <span className="sport-interest-badge" title={sportPrefs.interest}>
                                                  {sportPrefs.interest || 'Not specified'}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                          <span className="result-dot" />
                                        </motion.li>
                                      );
                                    })}
                                    {revealedCount < sportPlayers.length && (
                                      <li className="result-card result-card-loading">
                                        <span className="result-rank-badge">...</span>
                                        <div className="result-meta">
                                          <strong>Revealing...</strong>
                                        </div>
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Team Interest Summary - Show after all players are revealed */}
                  {Object.keys(raffleResults).length > 0 && (() => {
                    // Check if all players are revealed
                    let allRevealed = true;
                    TEAM_CARDS.forEach((team) => {
                      const teamSports = raffleResults[team.id] || {};
                      const teamRevealed = revealedPlayers[team.id] || {};
                      SPORTS_CONFIG.forEach((sport) => {
                        const sportPlayers = teamSports[sport.id] || [];
                        const revealedCount = teamRevealed[sport.id] || 0;
                        if (revealedCount < sportPlayers.length) {
                          allRevealed = false;
                        }
                      });
                    });
                    
                    if (!allRevealed || isRaffling) return null;
                    
                    // Calculate interest summaries for each team
                    const teamInterestSummaries = {};
                    const sportKeyMap = {
                      'cricket': 'cricket',
                      'football': 'football',
                      'badminton': 'badminton',
                      'volleyball': 'volleyball',
                      'tug': 'tug',
                      'race': 'race',
                      'relay': 'relay'
                    };
                    
                    // Determine which sports to include in summary
                    const sportsToInclude = phase === 'sport-raffle' && selectedSport 
                      ? [selectedSport] 
                      : SPORTS_CONFIG;
                    
                    TEAM_CARDS.forEach((team) => {
                      const teamSports = raffleResults[team.id] || {};
                      const interestCounts = {};
                      
                      // Count interests for relevant sports
                      sportsToInclude.forEach((sport) => {
                        const sportPlayers = teamSports[sport.id] || [];
                        const sportKey = sportKeyMap[sport.id] || sport.id;
                        
                        sportPlayers.forEach((player) => {
                          const sportPrefs = player.sportsPreferences?.[sportKey];
                          if (sportPrefs && sportPrefs.interest) {
                            const interest = sportPrefs.interest.trim();
                            if (interest && interest !== 'Not specified' && interest !== 'None' && interest !== 'null') {
                              // Aggregate by interest name (case-insensitive)
                              const interestKey = interest.toLowerCase();
                              interestCounts[interestKey] = (interestCounts[interestKey] || 0) + 1;
                            }
                          }
                        });
                      });
                      
                      teamInterestSummaries[team.id] = interestCounts;
                    });
                    
                    return (
                      <div className="team-interest-summary-section">
                        <h4 className="summary-title">Team Interest Summary</h4>
                        <div className="team-summary-grid">
                          {TEAM_CARDS.map((team) => {
                            const interestCounts = teamInterestSummaries[team.id] || {};
                            const interests = Object.keys(interestCounts).sort();
                            
                            if (interests.length === 0) return null;
                            
                            // Calculate total players for this team
                            let totalPlayers = 0;
                            const teamSports = raffleResults[team.id] || {};
                            SPORTS_CONFIG.forEach((sport) => {
                              const sportPlayers = teamSports[sport.id] || [];
                              totalPlayers += sportPlayers.length;
                            });
                            
                            return (
                              <div key={team.id} className="team-summary-card">
                                <h5 className="team-summary-header" style={{ color: team.color }}>
                                  {team.name} ({team.code})
                                </h5>
                                <div className="interest-list">
                                  {interests.map((interest) => {
                                    // Capitalize first letter of each word
                                    const displayInterest = interest
                                      .split(' ')
                                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                      .join(' ');
                                    
                                    return (
                                      <div key={interest} className="interest-item">
                                        <span className="interest-name">{displayInterest}</span>
                                        <span className="interest-count">{interestCounts[interest]}</span>
                                      </div>
                                    );
                                  })}
                                  <div className="interest-item interest-total">
                                    <span className="interest-name">Total Players</span>
                                    <span className="interest-count">{totalPlayers}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {Object.keys(raffleResults).length > 0 && (
                    <div className="pdf-download-section" ref={pdfButtonRef}>
                      <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                        <button 
                          type="button" 
                          className="pdf-download-btn" 
                          onClick={handleFixResults}
                          disabled={resultsSaved || savingResults || Object.keys(raffleResults).length === 0}
                          style={{ 
                            opacity: (resultsSaved || savingResults || Object.keys(raffleResults).length === 0) ? 0.6 : 1,
                            cursor: (resultsSaved || savingResults || Object.keys(raffleResults).length === 0) ? 'not-allowed' : 'pointer',
                            backgroundColor: resultsSaved ? '#4caf50' : '#b6cb2f',
                            color: '#1a1a1a',
                            fontWeight: '600'
                          }}
                        >
                          <span style={{ fontSize: '20px', marginRight: '8px' }}>
                            {resultsSaved ? '✅' : savingResults ? '⏳' : '🔒'}
                          </span>
                          {resultsSaved ? 'Results Saved' : savingResults ? 'Saving...' : 'Fix & Save Results'}
                        </button>
                        <button type="button" className="pdf-download-btn" onClick={handleDownloadPDF}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          Download PDF
                        </button>
                        <button type="button" className="pdf-download-btn" onClick={handleDownloadExcel}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                          Download Excel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className={`app-shell theme-${theme}`}>
      <button 
        type="button" 
        className="theme-toggle-btn"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
        <div className="banner-container">
          <img src={getBannerImage(phase)} alt="RSL Raffle Banner" className="banner-image" />
          <div className="banner-lighting" />
        </div>
      <main className="content">
        <header>
          <p className="eyebrow">
            🏁 RSL Raffle • {loadingPlayers ? 'Loading...' : `${playerPool.length} participants`}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Team Member Sports Raffle
          </motion.h1>
          <p className="lede">
            {loadingPlayers ? (
              'Loading players...'
            ) : (
              <>
                Click start to randomly distribute registered players across all teams and all sports.
                <br />
                <small style={{ fontSize: '0.85em', opacity: 0.8, marginTop: '0.5em', display: 'block' }}>
                  {Object.entries(registeredPlayersBySport).map(([sportId, players]) => {
                    const sport = SPORTS_CONFIG.find(s => s.id === sportId);
                    return players.length > 0 ? (
                      <span key={sportId} style={{ marginRight: '1em' }}>
                        {sport?.emoji} {sport?.name}: {players.length}
                      </span>
                    ) : null;
                  })}
                </small>
              </>
            )}
          </p>
        </header>

        {phase === 'mode-selection' && renderModeSelection()}
        {phase === 'sport-selection' && renderSportSelection()}
        {(phase === 'raffle' || phase === 'sport-raffle') && (
          <>
            {renderRaffle()}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
