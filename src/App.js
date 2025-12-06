import { useEffect, useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import bannerImage from './assets/images/banner.png';
import './App.css';

const TEAM_CARDS = [
  {
    id: 'royals',
    name: 'Rawabi Royals',
    code: 'ROYALS',
    teamLead: 'Reneesh',
    color: '#F9FCD9',
    tagline: 'Lead Reneesh · Code ROYALS',
  },
  {
    id: 'sparks',
    name: 'Rawabi Sparks',
    code: 'SPARKS',
    teamLead: 'Noushad KTK',
    color: '#FFF3E0',
    tagline: 'Lead Noushad KTK · Code SPARKS',
  },
  {
    id: 'kings',
    name: 'Rawabi Kings',
    code: 'KINGS',
    teamLead: 'Firos',
    color: '#E3F2FD',
    tagline: 'Lead Firos · Code KINGS',
  },
  {
    id: 'stars',
    name: 'Rawabi Stars',
    code: 'STARS',
    teamLead: 'Ansar',
    color: '#E8F5E9',
    tagline: 'Lead Ansar · Code STARS',
  },
];

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
  const pdfButtonRef = useRef(null);
  const resultRefs = useRef({}); // Store refs for each player card

  // Fetch players from API
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        setLoadingPlayers(true);
        const response = await fetch('http://localhost:5000/api/employees');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || `Server error: ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          // Log sample data to check sports preferences
          console.log('Fetched players:', data.length);
          if (data.length > 0) {
            console.log('Sample player:', {
              name: data[0].name,
              sportsPreferences: data[0].sportsPreferences,
              registeredSportsCount: data[0].registeredSportsCount
            });
            
            // Count players with sports registrations
            const withRegistrations = data.filter(p => p.registeredSportsCount > 0).length;
            console.log(`Players with sports registrations: ${withRegistrations} out of ${data.length}`);
          }
          
          setPlayerPool(data);
          setShuffledPlayers(data);
        } else {
          console.warn('No employees found in database');
          setPlayerPool([]);
          setShuffledPlayers([]);
        }
        setLoadingPlayers(false);
      } catch (error) {
        console.error('Error fetching players:', error);
        setLoadingPlayers(false);
        // Fallback to empty array if API fails
        setPlayerPool([]);
        setShuffledPlayers([]);
      }
    };

    fetchPlayers();
  }, []);

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
      // Play start animation sound
      playSound(600, 0.2, 'sine', 0.5);
      
      if (phase === 'raffle') {
        // All Sports Raffle - Distribute ALL registered players across all sports (each player in one sport only)
        const totalTeams = TEAM_CARDS.length; // 4 teams
        const totalSports = SPORTS_CONFIG.length; // 7 sports
        
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
        
        // Create a map of all players with their preferences for all sports
        const allPlayersWithPreferences = playerPool.map(player => {
          const prefs = player.sportsPreferences || {};
          const sportScores = {};
          
          SPORTS_CONFIG.forEach((sport) => {
            const sportKey = sportKeyMap[sport.id] || sport.id;
            const sportPrefs = prefs[sportKey] || {};
            const priority = sportPrefs.priority || 0;
            const interest = sportPrefs.interest || 'Not specified';
            
            // Check if player has registered for this sport
            const hasRegistered = priority > 0 || 
                                 (interest && 
                                  interest.trim() !== '' &&
                                  interest.toLowerCase() !== 'not specified' &&
                                  interest.toLowerCase() !== 'none' &&
                                  interest.toLowerCase() !== 'null');
            
            // Calculate score: priority (0-3) + interest bonus
            // Only calculate score if player has registered
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
        
        // Assign each player to their best sport (highest score, only if they registered)
        const playersBySport = {};
        SPORTS_CONFIG.forEach((sport) => {
          playersBySport[sport.id] = [];
        });
        
        allPlayersWithPreferences.forEach(player => {
          // Find the sport with highest score for this player (only registered sports)
          let bestSport = null;
          let bestScore = -999;
          
          SPORTS_CONFIG.forEach((sport) => {
            const sportData = player.sportScores[sport.id];
            if (sportData && sportData.hasRegistered && sportData.score > bestScore) {
              bestScore = sportData.score;
              bestSport = sport.id;
            }
          });
          
          // If player has registered for at least one sport, assign them
          // Otherwise, assign to first sport as fallback
          if (bestSport) {
            playersBySport[bestSport].push(player);
          } else {
            // If no registration found, assign to first sport (fallback)
            playersBySport[SPORTS_CONFIG[0].id].push(player);
          }
        });
        
        // Now distribute players for each sport across teams
        SPORTS_CONFIG.forEach((sport) => {
          const sportPlayers = playersBySport[sport.id];
          
          // Shuffle players for this sport
          shuffleArray(sportPlayers);
          
          // Calculate equal distribution for this sport
          const totalPlayers = sportPlayers.length;
          const basePlayersPerTeam = Math.floor(totalPlayers / totalTeams);
          const remainder = totalPlayers % totalTeams; // 0, 1, 2, or 3 extra players
          
          let playerIndex = 0;
          
          // Shuffle teams for random distribution of remainder
          const shuffledTeams = [...TEAM_CARDS];
          shuffleArray(shuffledTeams);
          
          // Distribute players for this sport equally across teams
          shuffledTeams.forEach((team, teamIndex) => {
            if (!results[team.id]) {
              results[team.id] = {};
              revealed[team.id] = {};
            }
            
            // Calculate players for this team: base + (1 if this team gets a remainder player)
            const playersForThisTeam = basePlayersPerTeam + (teamIndex < remainder ? 1 : 0);
            
            const teamSportPlayers = [];
            for (let i = 0; i < playersForThisTeam && playerIndex < sportPlayers.length; i++) {
              teamSportPlayers.push(sportPlayers[playerIndex]);
              playerIndex++;
            }
            
            // Shuffle players within this team for more randomness
            shuffleArray(teamSportPlayers);
            results[team.id][sport.id] = teamSportPlayers;
            revealed[team.id][sport.id] = 0; // Start with 0 revealed
          });
        });
        
        setRaffleResults(results);
        setRevealedPlayers(revealed);
        setIsRaffling(false);
      } else if (phase === 'sport-raffle' && selectedSport) {
        // Sport-by-Sport Raffle - Only use players who have registered/expressed interest in this sport
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
        
        // Filter players who have registered interest in this sport (priority > 0 OR interest is not "Not specified")
        const playersWithPreferences = playerPool
          .map(player => {
            const prefs = player.sportsPreferences || {};
            const sportPrefs = prefs[sportKey] || {};
            const priority = sportPrefs.priority || 0;
            const interest = sportPrefs.interest || 'Not specified';
            
            // Calculate score: priority (0-3) + interest bonus
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
          // Only include players who have registered interest
          // Check: priority > 0 OR interest is not empty/not specified
          .filter(player => {
            const hasPriority = player.sportPriority > 0;
            const hasInterest = player.sportInterest && 
                               player.sportInterest.trim() !== '' &&
                               player.sportInterest.toLowerCase() !== 'not specified' &&
                               player.sportInterest.toLowerCase() !== 'none' &&
                               player.sportInterest.toLowerCase() !== 'null';
            return hasPriority || hasInterest;
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
        
        // Calculate equal distribution
        const totalPlayers = playersWithPreferences.length;
        const basePlayersPerTeam = Math.floor(totalPlayers / totalTeams);
        const remainder = totalPlayers % totalTeams; // 0, 1, 2, or 3 extra players
        
        const results = {};
        const revealed = {};
        let playerIndex = 0;
        
        // Shuffle teams for random distribution of remainder
        const shuffledTeams = [...TEAM_CARDS];
        shuffleArray(shuffledTeams);
        
        // Distribute players equally across teams
        shuffledTeams.forEach((team, teamIndex) => {
          if (!results[team.id]) {
            results[team.id] = {};
            revealed[team.id] = {};
          }
          
          // Calculate players for this team: base + (1 if this team gets a remainder player)
          const playersForThisTeam = basePlayersPerTeam + (teamIndex < remainder ? 1 : 0);
          
          const sportPlayers = [];
          for (let i = 0; i < playersForThisTeam && playerIndex < playersWithPreferences.length; i++) {
            sportPlayers.push(playersWithPreferences[playerIndex]);
            playerIndex++;
          }
          
          // Shuffle players within this team for more randomness
          shuffleArray(sportPlayers);
          results[team.id][selectedSport.id] = sportPlayers;
          revealed[team.id][selectedSport.id] = 0; // Start with 0 revealed
        });
        
        setRaffleResults(results);
        setRevealedPlayers(revealed);
        setIsRaffling(false);
      }
    }
  }, [phase, hasStartedRaffle, countdown, isRaffling, selectedSport, playerPool]);

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
  }, [raffleResults, revealedPlayers, hasStartedRaffle, isRaffling]);

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
  }, [raffleResults, revealedPlayers, isRaffling, hasStartedRaffle]);

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
  }, [revealedPlayers, raffleResults, hasStartedRaffle, isRaffling]);

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
  }, [raffleResults, revealedPlayers, hasStartedRaffle, isRaffling]);


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
  };

  const handleBackToSportSelection = () => {
    setPhase('sport-selection');
    setSelectedSport(null);
    setRaffleResults({});
    setRevealedPlayers({});
    setHasStartedRaffle(false);
    setIsRaffling(false);
    setCountdown(0);
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
    // Initialize and resume audio context before playing sounds
    await resumeAudioContext();
    playRaffleStartSound();
    setHasStartedRaffle(true);
    setCountdown(5); // 5 seconds countdown
    setIsRaffling(true);
    setRaffleResults({});
    setRevealedPlayers({});
    setShuffledPlayers(shuffleArray([...playerPool]));
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
            playerRow.push(`${playerIndex + 1}. ${player.name} (${player.department})`);
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
                  Distribute all players across all teams and all sports in one raffle
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
                    Ready to spin {playerPool.length} names and distribute them across all teams and all sports. Click start to begin the raffle.
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
                          <span>{player?.department} Dept.</span>
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
                                            <span>{player.department} Dept.</span>
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
                  {Object.keys(raffleResults).length > 0 && (
                    <div className="pdf-download-section" ref={pdfButtonRef}>
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
        <img src={bannerImage} alt="RSL Raffle Banner" className="banner-image" />
        <div className="banner-lighting" />
      </div>
      <main className="content">
        <header>
          <motion.div 
            className="header-decoration"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            <motion.span 
              className="header-emoji header-emoji-center"
              animate={{ 
                y: [0, -15, 0],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              🏆
            </motion.span>
          </motion.div>
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
            Click start to randomly distribute {loadingPlayers ? 'players' : `${playerPool.length} players`} across all teams and all sports.
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
