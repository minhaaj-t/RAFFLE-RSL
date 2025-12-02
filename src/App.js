import { useEffect, useMemo, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import logoImage from './assets/images/logo.png';
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
  { id: 'tug', name: 'Tug of War', needed: 8, emoji: '🪢' },
  { id: 'race', name: '100 Meter Race', needed: 1, emoji: '🏃' },
  { id: 'relay', name: 'Relay', needed: 4, emoji: '🏃‍♂️' },
];

const PLAYER_POOL = Array.from({ length: 500 }, (_, index) => ({
  id: index + 1,
  name: `Player ${index + 1}`,
  department: ['Ops', 'Tech', 'HR', 'Design', 'QA'][index % 5],
}));

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
  if (!audioContext && (window.AudioContext || window.webkitAudioContext)) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Audio context initialization failed:', error);
    }
  }
  return audioContext;
};

const resumeAudioContext = async () => {
  if (!audioContext) {
    initAudioContext();
  }
  if (audioContext && audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('Failed to resume audio context:', error);
    }
  }
  return audioContext;
};

const playSound = async (frequency, duration, type = 'sine', volume = 0.3) => {
  try {
    const ctx = await resumeAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (error) {
    // Silently fail if audio is not available
    console.warn('Sound playback failed:', error);
  }
};

const playRaffleStartSound = () => {
  playSound(440, 0.2, 'sine', 0.6);
  setTimeout(() => playSound(523.25, 0.2, 'sine', 0.6), 100);
  setTimeout(() => playSound(659.25, 0.3, 'sine', 0.6), 200);
};

let tickerSoundCounter = 0;
const playTickerSound = () => {
  // Only play every 3rd tick to reduce frequency
  tickerSoundCounter += 1;
  if (tickerSoundCounter % 3 === 0) {
    playSound(800, 0.08, 'square', 0.3);
  }
};

const playCompletionSound = () => {
  // Celebration fanfare
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
  notes.forEach((freq, index) => {
    setTimeout(() => {
      playSound(freq, 0.4, 'sine', 0.6);
    }, index * 120);
  });
};

function App() {
  const [phase] = useState('raffle'); // Start directly with raffle
  const [countdown, setCountdown] = useState(0);
  const [shuffledPlayers, setShuffledPlayers] = useState(PLAYER_POOL);
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
  const pdfButtonRef = useRef(null);
  const resultRefs = useRef({}); // Store refs for each player card

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
    if (phase === 'raffle' && hasStartedRaffle && countdown > 0) {
      // Play countdown tick sound
      if (countdown <= 3) {
        playSound(300 + (countdown * 50), 0.15, 'sine', 0.5);
      }
      const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }

    if (phase === 'raffle' && hasStartedRaffle && countdown === 0 && isRaffling) {
      // Play start animation sound
      playSound(600, 0.2, 'sine', 0.5);
      
      // Distribute total players across all teams and all sports randomly without duplicates
      const totalPlayers = PLAYER_POOL.length; // 500 players
      const totalTeams = TEAM_CARDS.length; // 4 teams
      const totalSports = SPORTS_CONFIG.length; // 6 sports
      const playersPerSportPerTeam = Math.floor(totalPlayers / (totalTeams * totalSports));
      
      // Shuffle all players randomly
      const shuffled = [...PLAYER_POOL];
      shuffleArray(shuffled);
      
      // Create a completely random distribution by shuffling player indices multiple times
      const availablePlayers = [...shuffled];
      shuffleArray(availablePlayers); // Extra shuffle for more randomness
      
      const results = {};
      const revealed = {};
      let playerIndex = 0;
      
      // Randomly distribute players across teams and sports
      // Shuffle teams and sports order for more randomness
      const shuffledTeams = [...TEAM_CARDS];
      shuffleArray(shuffledTeams);
      const shuffledSports = [...SPORTS_CONFIG];
      shuffleArray(shuffledSports);
      
      shuffledTeams.forEach((team) => {
        results[team.id] = {};
        revealed[team.id] = {};
        shuffledSports.forEach((sport) => {
          const sportPlayers = [];
          for (let i = 0; i < playersPerSportPerTeam && playerIndex < availablePlayers.length; i++) {
            sportPlayers.push(availablePlayers[playerIndex]);
            playerIndex++;
          }
          // Shuffle the players within each sport for more randomness
          shuffleArray(sportPlayers);
          results[team.id][sport.id] = sportPlayers;
          revealed[team.id][sport.id] = 0; // Start with 0 revealed
        });
      });
      
      setRaffleResults(results);
      setRevealedPlayers(revealed);
      setIsRaffling(false);
    }
  }, [phase, hasStartedRaffle, countdown, isRaffling]);

  useEffect(() => {
    if (!isRaffling) {
      return undefined;
    }
    const interval = setInterval(() => {
      setTickerIndex((prev) => {
        const total = shuffledPlayers.length || PLAYER_POOL.length;
        return (prev + 1) % total;
      });
      // Play ticker sound during animation
      playTickerSound();
    }, 60);
    return () => clearInterval(interval);
  }, [isRaffling, shuffledPlayers.length]);

  // Reveal players one by one after raffle completes
  useEffect(() => {
    const hasResults = Object.keys(raffleResults).length > 0;
    if (!hasResults || !hasStartedRaffle || isRaffling) {
      return undefined;
    }
    
    // Find the next team/sport that needs to reveal a player
    let nextTeamId = null;
    let nextSportId = null;
    
    for (const team of TEAM_CARDS) {
      const teamSports = raffleResults[team.id] || {};
      const teamRevealed = revealedPlayers[team.id] || {};
      
      for (const sport of SPORTS_CONFIG) {
        const sportPlayers = teamSports[sport.id] || [];
        const revealedCount = teamRevealed[sport.id] || 0;
        
        if (revealedCount < sportPlayers.length) {
          nextTeamId = team.id;
          nextSportId = sport.id;
          break;
        }
      }
      if (nextTeamId) break;
    }
    
    if (!nextTeamId || !nextSportId) {
      return undefined; // All players revealed
    }
    
    // Play selection sound when revealing each player (every 5th player)
    const teamRevealed = revealedPlayers[nextTeamId] || {};
    const currentCount = teamRevealed[nextSportId] || 0;
    if (currentCount % 5 === 0) {
      playSound(600, 0.1, 'sine', 0.3);
    }
    
    const revealTimer = setTimeout(() => {
      setRevealedPlayers((prev) => {
        const newCount = (prev[nextTeamId]?.[nextSportId] || 0) + 1;
        return {
          ...prev,
          [nextTeamId]: {
            ...prev[nextTeamId],
            [nextSportId]: newCount
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


  const handleStartRaffle = async () => {
    // Initialize and resume audio context before playing sounds
    await resumeAudioContext();
    playRaffleStartSound();
    setHasStartedRaffle(true);
    setCountdown(5); // 5 seconds countdown
    setIsRaffling(true);
    setRaffleResults({});
    setRevealedPlayers({});
    setShuffledPlayers(shuffleArray(PLAYER_POOL));
    setTickerIndex(0);
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

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Standard margins with consistent spacing
    const marginLeft = 20;
    const marginRight = 20;
    const marginTop = 25;
    const marginBottom = 25;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const sectionPadding = 5;
    
    // Colors
    const black = [0, 0, 0];
    const darkGray = [60, 60, 60];
    const mediumGray = [120, 120, 120];
    const veryLightGray = [245, 245, 245];

    let yPos = marginTop;

    // ========== HEADER SECTION ==========
    // Add Logo
    try {
      const logoWidth = 40;
      const logoHeight = 30;
      const logoX = pageWidth / 2 - logoWidth / 2;
      doc.addImage(logoImage, 'PNG', logoX, yPos, logoWidth, logoHeight);
      yPos += logoHeight + 5;
    } catch (error) {
      console.warn('Logo not loaded, continuing without logo');
    }

    // Top border line
    doc.setDrawColor(...black);
    doc.setLineWidth(0.8);
    doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
    yPos += 8;

    // Organization Name - Centered
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('RSL RAFFLE SYSTEM', pageWidth / 2, yPos, { align: 'center' });
    
    // Document Title - Centered with text wrapping
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const titleText = 'Official Team Member Selection Report - All Sports';
    const titleLines = doc.splitTextToSize(titleText, contentWidth);
    doc.text(titleLines, pageWidth / 2, yPos + 7, { align: 'center' });
    yPos += 7 * titleLines.length;
    
    yPos += 8;
    
    // Header bottom border
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
    yPos += 12;

    // ========== DOCUMENT INFORMATION SECTION ==========
    const infoSectionY = yPos;
    
    // Two-column layout for information
    const infoCol1X = marginLeft + sectionPadding;
    const infoCol2X = marginLeft + contentWidth / 2 + sectionPadding;
    const lineHeight = 7;
    const labelWidth = 45;
    
    // Calculate all text wrapping first to determine section height
    doc.setFontSize(9);
    const teamNameLines = doc.splitTextToSize('All Teams', contentWidth / 2 - labelWidth - sectionPadding);
    const sportNameLines = doc.splitTextToSize('All Sports', contentWidth / 2 - labelWidth - sectionPadding);
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const dateLines = doc.splitTextToSize(dateStr, contentWidth / 2 - labelWidth - sectionPadding);
    const docId = `RSL-AllTeams-AllSports-${Date.now().toString().slice(-6)}`;
    const docIdLines = doc.splitTextToSize(docId, contentWidth / 2 - labelWidth - sectionPadding);
    
    // Calculate section height
    const titleHeight = 10;
    const leftColHeight = (lineHeight * teamNameLines.length) + (lineHeight * sportNameLines.length) + lineHeight;
    const rightColHeight = (lineHeight * dateLines.length) + lineHeight + (lineHeight * docIdLines.length);
    const contentHeight = Math.max(leftColHeight, rightColHeight);
    const infoSectionHeight = titleHeight + contentHeight + (sectionPadding * 2) + 5;
    
    // Draw section background box FIRST
    doc.setFillColor(...veryLightGray);
    doc.rect(marginLeft, infoSectionY, contentWidth, infoSectionHeight, 'F');
    
    // Draw section border
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, infoSectionY, contentWidth, infoSectionHeight);
    
    yPos = infoSectionY + sectionPadding + 5;
    
    // Section title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('DOCUMENT INFORMATION', marginLeft + sectionPadding, yPos);
    
    yPos += 10;
    
    // Left Column
    let currentY = yPos;
    
    // Teams - with text wrapping
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Teams:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(teamNameLines, infoCol1X + labelWidth, currentY);
    currentY += lineHeight * teamNameLines.length;
    
    // Sport - with text wrapping
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Sports:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(sportNameLines, infoCol1X + labelWidth, currentY);
    currentY += lineHeight * sportNameLines.length;
    
    // Players Required per Sport per Team
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Players per Sport/Team:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    const playersPerSportPerTeamPDF = Math.floor(PLAYER_POOL.length / (TEAM_CARDS.length * SPORTS_CONFIG.length));
    doc.text(`${playersPerSportPerTeamPDF}`, infoCol1X + labelWidth, currentY);
    
    // Right Column
    currentY = yPos;
    
    // Date - with text wrapping
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Date:', infoCol2X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(dateLines, infoCol2X + labelWidth, currentY);
    currentY += lineHeight * dateLines.length;
    
    // Time
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Time:', infoCol2X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    const timeStr = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    doc.text(timeStr, infoCol2X + labelWidth, currentY);
    currentY += lineHeight;
    
    // Document ID - with text wrapping
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Document ID:', infoCol2X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(docIdLines, infoCol2X + labelWidth, currentY);
    
    yPos = infoSectionY + infoSectionHeight + 12;

    // ========== SELECTED PLAYERS SECTION ==========
    // Section title with underline
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('SELECTED PLAYERS', marginLeft, yPos);
    
    // Underline
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    const titleWidth = doc.getTextWidth('SELECTED PLAYERS');
    doc.line(marginLeft, yPos + 2, marginLeft + titleWidth, yPos + 2);
    
    yPos += 10;

    // Generate results for all teams and sports
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      if (Object.keys(teamSports).length === 0) return;
      
      const teamData = TEAM_CARDS.find(t => t.id === team.id);
      const teamName = teamData ? teamData.name : team.id;
      
      // Team header
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...black);
      doc.text(`${teamName} (${teamData?.code || ''})`, marginLeft, yPos);
      yPos += 8;
      
      // For each sport in this team
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        if (sportPlayers.length === 0) return;
        
        // Sport header
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...darkGray);
        doc.text(`${sport.emoji} ${sport.name}`, marginLeft + 5, yPos);
        yPos += 6;
        
        // List players for this sport
        sportPlayers.forEach((player, index) => {
          if (yPos > pageHeight - marginBottom - 10) {
            doc.addPage();
            yPos = marginTop;
          }
          
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...black);
          doc.text(`${index + 1}. ${player.name} (${player.department})`, marginLeft + 10, yPos);
          yPos += 6;
        });
        
        yPos += 4; // Space between sports
      });
      
      yPos += 8; // Extra space between teams
    });

    // ========== SUMMARY SECTION ==========
    const summarySectionHeight = 25;
    
    // Check if we need a new page
    if (yPos > pageHeight - marginBottom - summarySectionHeight) {
      doc.addPage();
      yPos = marginTop;
    }
    
    // Section background box
    doc.setFillColor(...veryLightGray);
    doc.rect(marginLeft, yPos, contentWidth, summarySectionHeight, 'F');
    
    // Section border
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, yPos, contentWidth, summarySectionHeight);
    
    yPos += sectionPadding + 5;
    
    // Summary title
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('SUMMARY', marginLeft + sectionPadding, yPos);
    
    yPos += 8;
    
    // Summary content
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    
    const summaryLabelWidth = 50;
    const summaryX = marginLeft + sectionPadding;
    
    // Calculate total players across all teams and sports
    let totalPlayers = 0;
    TEAM_CARDS.forEach((team) => {
      const teamSports = raffleResults[team.id] || {};
      SPORTS_CONFIG.forEach((sport) => {
        const sportPlayers = teamSports[sport.id] || [];
        totalPlayers += sportPlayers.length;
      });
    });
    
    doc.setFont('helvetica', 'bold');
    doc.text('Total Players Selected:', summaryX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalPlayers}`, summaryX + summaryLabelWidth, yPos);
    
    yPos += 6;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Selection Method:', summaryX, yPos);
    doc.setFont('helvetica', 'normal');
    const methodText = 'Random Raffle from 500 Participants';
    const methodLines = doc.splitTextToSize(methodText, contentWidth - summaryLabelWidth - (sectionPadding * 2));
    doc.text(methodLines, summaryX + summaryLabelWidth, yPos);

    // ========== FOOTER ON ALL PAGES ==========
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Footer separator line
      doc.setDrawColor(...black);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, pageHeight - marginBottom + 5, pageWidth - marginRight, pageHeight - marginBottom + 5);
      
      // Footer text - properly aligned
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...mediumGray);
      
      // Left aligned - Page number
      doc.text(
        `Page ${i} of ${totalPages}`,
        marginLeft,
        pageHeight - marginBottom + 12,
        { align: 'left' }
      );
      
      // Right aligned - Generation time
      doc.text(
        `Generated on ${new Date().toLocaleString()}`,
        pageWidth - marginRight,
        pageHeight - marginBottom + 12,
        { align: 'right' }
      );
      
      // Center aligned - Document ID (on first page only)
      if (i === 1) {
        doc.text(
          `Doc ID: ${docId}`,
          pageWidth / 2,
          pageHeight - marginBottom + 12,
          { align: 'center' }
        );
      }
    }

    // Generate filename
    const filename = `RSL_Raffle_AllTeams_AllSports_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
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
              <p>
                Ready to spin {PLAYER_POOL.length} names and distribute them across all teams and all sports. Click start to begin the raffle.
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
                  <h4 className="results-title">Raffle Results - All Teams & Sports</h4>
                  {TEAM_CARDS.map((team) => {
                    const teamSports = raffleResults[team.id] || {};
                    const hasResults = Object.keys(teamSports).length > 0;
                    
                    if (!hasResults) return null;
                    
                    return (
                      <div key={team.id} className="team-results-section">
                        <h5 className="team-results-header" style={{ color: team.color }}>
                          {team.name} ({team.code})
                        </h5>
                        {SPORTS_CONFIG.map((sport) => {
                          const sportPlayers = teamSports[sport.id] || [];
                          if (sportPlayers.length === 0) return null;
                          
                          const teamRevealed = revealedPlayers[team.id] || {};
                          const revealedCount = teamRevealed[sport.id] || 0;
                          const visiblePlayers = sportPlayers.slice(0, revealedCount);
                          
                          return (
                            <div key={sport.id} className="sport-results-subsection">
                              <h6 className="sport-results-header">
                                <span className="sport-emoji-small">{sport.emoji}</span>
                                {sport.name} {revealedCount < sportPlayers.length && `(${revealedCount}/${sportPlayers.length})`}
                              </h6>
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
                                      whileHover={{ scale: 1.02, x: 5 }}
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
                    );
                  })}
                  {Object.keys(raffleResults).length > 0 && (
                    <div className="pdf-download-section" ref={pdfButtonRef}>
                      <button type="button" className="pdf-download-btn" onClick={handleDownloadPDF}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download PDF
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
            🏁 RSL Raffle • 500 participants
          </p>
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Team Member Sports Raffle
          </motion.h1>
          <p className="lede">
            Click start to randomly distribute 500 players across all teams and all sports.
          </p>
        </header>

        {phase === 'raffle' && (
          <>
            {renderRaffle()}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
