import { useEffect, useMemo, useState, useRef } from 'react';
import jsPDF from 'jspdf';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
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

const playSelectionSound = () => {
  playSound(600, 0.15, 'sine', 0.5);
  setTimeout(() => playSound(700, 0.15, 'sine', 0.5), 80);
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
  const [phase, setPhase] = useState('teamSelect');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedSport, setSelectedSport] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [shuffledPlayers, setShuffledPlayers] = useState(PLAYER_POOL);
  const [raffleResults, setRaffleResults] = useState([]);
  const [isRaffling, setIsRaffling] = useState(false);
  const [hasStartedRaffle, setHasStartedRaffle] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('raffle-theme');
    return savedTheme || 'dark';
  });
  const resultsListRef = useRef(null);
  const pdfButtonRef = useRef(null);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem('raffle-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const selectedTeamName = useMemo(() => {
    const found = TEAM_CARDS.find((team) => team.id === selectedTeam);
    return found ? found.name : '';
  }, [selectedTeam]);

  const selectedSportConfig = useMemo(
    () => SPORTS_CONFIG.find((sport) => sport.id === selectedSport),
    [selectedSport]
  );

  const visibleResults = useMemo(
    () => raffleResults.slice(0, revealedCount),
    [raffleResults, revealedCount]
  );

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

    if (phase === 'raffle' && hasStartedRaffle && countdown === 0 && isRaffling && selectedSportConfig) {
      // Play start animation sound
      playSound(600, 0.2, 'sine', 0.5);
      const winners = shuffledPlayers.slice(0, selectedSportConfig.needed);
      setRaffleResults(winners);
      setIsRaffling(false);
      setRevealedCount(0);
    }
  }, [phase, hasStartedRaffle, countdown, isRaffling, shuffledPlayers, selectedSportConfig]);

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

  useEffect(() => {
    if (!raffleResults.length) {
      return undefined;
    }
    if (revealedCount >= raffleResults.length) {
      return undefined;
    }
    // Play selection sound when revealing each player
    playSelectionSound();
    const revealTimer = setTimeout(() => setRevealedCount((prev) => prev + 1), 450);
    return () => clearTimeout(revealTimer);
  }, [raffleResults, revealedCount]);

  // Confetti effect when raffle is complete
  useEffect(() => {
    const isComplete =
      raffleResults.length > 0 &&
      revealedCount === raffleResults.length &&
      raffleResults.length === (selectedSportConfig?.needed || 0) &&
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
  }, [raffleResults, revealedCount, selectedSportConfig, isRaffling, hasStartedRaffle]);

  // Auto-scroll to results list and PDF button
  useEffect(() => {
    if (!raffleResults.length || !hasStartedRaffle) {
      return;
    }

    // If all players are revealed, scroll to PDF button
    if (revealedCount === raffleResults.length && raffleResults.length === (selectedSportConfig?.needed || 0)) {
      setTimeout(() => {
        if (pdfButtonRef.current) {
          pdfButtonRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'end',
            inline: 'nearest'
          });
        }
      }, 500);
      return;
    }

    // Otherwise, scroll to the bottom of the results list as players are revealed
    if (revealedCount > 0 && resultsListRef.current) {
      setTimeout(() => {
        if (resultsListRef.current) {
          const lastChild = resultsListRef.current.lastElementChild;
          if (lastChild) {
            lastChild.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'end',
              inline: 'nearest'
            });
          }
        }
      }, 100);
    }
  }, [revealedCount, raffleResults.length, selectedSportConfig, hasStartedRaffle]);

  const handleReset = () => {
    setPhase('teamSelect');
    setSelectedTeam(null);
    setSelectedSport(null);
    setRaffleResults([]);
    setCountdown(0);
    setIsRaffling(false);
    setHasStartedRaffle(false);
    setRevealedCount(0);
    setTickerIndex(0);
  };

  const handleTeamSelect = (teamId) => {
    // Initialize audio context on first user interaction
    resumeAudioContext();
    setSelectedTeam(teamId);
    setPhase('sportSelect');
    setSelectedSport(null);
    setRaffleResults([]);
    setHasStartedRaffle(false);
    setCountdown(0);
    setIsRaffling(false);
    setRevealedCount(0);
    setTickerIndex(0);
  };

  const handleSportSelect = (sportId) => {
    setSelectedSport(sportId);
    setPhase('raffle');
    setHasStartedRaffle(false);
    setCountdown(0);
    setIsRaffling(false);
    setRaffleResults([]);
    setRevealedCount(0);
    setShuffledPlayers(PLAYER_POOL);
    setTickerIndex(0);
  };

  const handleStartRaffle = async () => {
    // Initialize and resume audio context before playing sounds
    await resumeAudioContext();
    playRaffleStartSound();
    setHasStartedRaffle(true);
    setCountdown(5);
    setIsRaffling(true);
    setRaffleResults([]);
    setRevealedCount(0);
    setShuffledPlayers(shuffleArray(PLAYER_POOL));
    setTickerIndex(0);
  };

  const handleAnotherSport = () => {
    setPhase('sportSelect');
    setSelectedSport(null);
    setRaffleResults([]);
    setCountdown(0);
    setIsRaffling(false);
    setHasStartedRaffle(false);
    setRevealedCount(0);
    setTickerIndex(0);
  };

  const handleDownloadPDF = () => {
    if (!raffleResults.length || !selectedTeamName || !selectedSportConfig) {
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
    const lightGray = [230, 230, 230];
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
    const titleText = 'Official Team Member Selection Report';
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
    const teamNameLines = doc.splitTextToSize(selectedTeamName, contentWidth / 2 - labelWidth - sectionPadding);
    const sportNameLines = doc.splitTextToSize(selectedSportConfig.name, contentWidth / 2 - labelWidth - sectionPadding);
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const dateLines = doc.splitTextToSize(dateStr, contentWidth / 2 - labelWidth - sectionPadding);
    const docId = `RSL-${selectedTeamName.replace(/\s+/g, '')}-${selectedSportConfig.name}-${Date.now().toString().slice(-6)}`;
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
    
    // Team - with text wrapping
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Team:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(teamNameLines, infoCol1X + labelWidth, currentY);
    currentY += lineHeight * teamNameLines.length;
    
    // Sport - with text wrapping
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Sport:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(sportNameLines, infoCol1X + labelWidth, currentY);
    currentY += lineHeight * sportNameLines.length;
    
    // Players Required
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...black);
    doc.text('Players Required:', infoCol1X, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkGray);
    doc.text(`${selectedSportConfig.needed}`, infoCol1X + labelWidth, currentY);
    
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

    // Table with proper column widths
    const headerHeight = 9;
    const rowHeight = 8;
    const colPadding = 4;
    
    // Column positions (aligned)
    const col1X = marginLeft + colPadding; // S.No
    const col1Width = 18;
    const col2X = col1X + col1Width + colPadding; // Player Name
    const col2Width = 100;
    const col3X = col2X + col2Width + colPadding; // Department
    
    // Table Header
    doc.setFillColor(...darkGray);
    doc.rect(marginLeft, yPos, contentWidth, headerHeight, 'F');
    
    // Header text - properly aligned
    doc.setTextColor(...[255, 255, 255]);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('S.No', col1X, yPos + 6, { align: 'left' });
    doc.text('Player Name', col2X, yPos + 6, { align: 'left' });
    doc.text('Department', col3X, yPos + 6, { align: 'left' });
    
    // Vertical separators in header
    doc.setDrawColor(...[255, 255, 255]);
    doc.setLineWidth(0.3);
    doc.line(col2X - colPadding / 2, yPos, col2X - colPadding / 2, yPos + headerHeight);
    doc.line(col3X - colPadding / 2, yPos, col3X - colPadding / 2, yPos + headerHeight);
    
    yPos += headerHeight;

    // Table Rows
    raffleResults.forEach((player, index) => {
      // Check text wrapping to estimate row height
      doc.setFontSize(9);
      const checkPlayerLines = doc.splitTextToSize(player.name, col2Width - colPadding);
      const checkDeptWidth = contentWidth - col1Width - col2Width - (colPadding * 4);
      const checkDeptLines = doc.splitTextToSize(player.department, checkDeptWidth - colPadding);
      const checkMaxLines = Math.max(checkPlayerLines.length, checkDeptLines.length, 1);
      const checkRowHeight = Math.max(rowHeight, checkMaxLines * 6);
      
      if (yPos > pageHeight - marginBottom - checkRowHeight - 15) {
        doc.addPage();
        yPos = marginTop;
        
        // Redraw header on new page
        doc.setFillColor(...darkGray);
        doc.rect(marginLeft, yPos, contentWidth, headerHeight, 'F');
        doc.setTextColor(...[255, 255, 255]);
        doc.setFont('helvetica', 'bold');
        doc.text('S.No', col1X, yPos + 6, { align: 'left' });
        doc.text('Player Name', col2X, yPos + 6, { align: 'left' });
        doc.text('Department', col3X, yPos + 6, { align: 'left' });
        doc.setDrawColor(...[255, 255, 255]);
        doc.line(col2X - colPadding / 2, yPos, col2X - colPadding / 2, yPos + headerHeight);
        doc.line(col3X - colPadding / 2, yPos, col3X - colPadding / 2, yPos + headerHeight);
        yPos += headerHeight;
      }

      // Calculate text wrapping first to determine row height
      doc.setFontSize(9);
      const playerNameLines = doc.splitTextToSize(player.name, col2Width - colPadding);
      const deptWidth = contentWidth - col1Width - col2Width - (colPadding * 4);
      const deptLines = doc.splitTextToSize(player.department, deptWidth - colPadding);
      const maxLines = Math.max(playerNameLines.length, deptLines.length, 1);
      const adjustedRowHeight = Math.max(rowHeight, maxLines * 6);

      // Alternating row background
      if (index % 2 === 0) {
        doc.setFillColor(...lightGray);
        doc.rect(marginLeft, yPos, contentWidth, adjustedRowHeight, 'F');
      }

      // Row border
      doc.setDrawColor(...black);
      doc.setLineWidth(0.1);
      doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);

      // Vertical separators
      doc.setDrawColor(...mediumGray);
      doc.setLineWidth(0.2);
      doc.line(col2X - colPadding / 2, yPos, col2X - colPadding / 2, yPos + adjustedRowHeight);
      doc.line(col3X - colPadding / 2, yPos, col3X - colPadding / 2, yPos + adjustedRowHeight);

      // Row content - properly aligned with text wrapping
      doc.setTextColor(...black);
      doc.setFont('helvetica', 'normal');
      
      // S.No - right aligned in column
      doc.text(`${index + 1}.`, col1X + col1Width - 2, yPos + 6, { align: 'right' });
      
      // Player Name - left aligned with wrapping
      doc.text(playerNameLines, col2X, yPos + 6, { align: 'left' });
      
      // Department - left aligned with wrapping
      doc.text(deptLines, col3X, yPos + 6, { align: 'left' });

      yPos += adjustedRowHeight;
    });

    // Table bottom border
    doc.setDrawColor(...black);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, yPos, pageWidth - marginRight, yPos);
    yPos += 12;

    // ========== SUMMARY SECTION ==========
    const summarySectionHeight = 25;
    
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
    
    doc.setFont('helvetica', 'bold');
    doc.text('Total Players Selected:', summaryX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`${raffleResults.length}`, summaryX + summaryLabelWidth, yPos);
    
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
    const filename = `RSL_Raffle_${selectedTeamName.replace(/\s+/g, '_')}_${selectedSportConfig.name}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
  };

  const renderTeamCards = () => (
    <div className="card-grid">
      {TEAM_CARDS.map((team) => (
        <button
          key={team.id}
          type="button"
          className="card team-card team-color-card"
          style={{
            '--team-color': team.color,
            borderColor: team.color,
            background: `linear-gradient(135deg, ${team.color} 0%, ${team.color}dd 100%)`,
            boxShadow: `0 8px 24px ${team.color}40, inset 0 1px 0 ${team.color}80`,
          }}
          onClick={() => handleTeamSelect(team.id)}
        >
          <span className="eyebrow">Team</span>
          <h3>{team.name}</h3>
          <p>{team.tagline}</p>
          <div className="team-meta">
            <span className="team-code-chip" style={{ background: `${team.color}cc`, color: '#0f172a' }}>
              {team.code}
            </span>
            <span className="team-lead">Lead: {team.teamLead}</span>
          </div>
        </button>
      ))}
    </div>
  );

  const renderSportCards = () => {
    return (
      <div className="card-grid sports-grid">
        <AnimatePresence>
          {SPORTS_CONFIG.map((sport, index) => (
            <motion.button
              key={sport.id}
              type="button"
              className="card sport-card"
              onClick={() => handleSportSelect(sport.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div 
                className="sport-emoji-wrapper"
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 1
                }}
              >
                <span className="sport-emoji">{sport.emoji}</span>
              </motion.div>
              <h3>{sport.name}</h3>
              <p>
                👥 {sport.needed} players needed
              </p>
              <span className="eyebrow">for {selectedTeamName || 'team'}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
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
          <motion.div 
            className="raffle-header"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {selectedSportConfig?.emoji && (
              <motion.span 
                className="raffle-sport-emoji"
                animate={{ 
                  rotate: [0, 15, -15, 0],
                  scale: [1, 1.2, 1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 0.5
                }}
              >
                {selectedSportConfig.emoji}
              </motion.span>
            )}
            <h3>
              {selectedSportConfig?.name} • {selectedSportConfig?.needed} spots for{' '}
              {selectedTeamName}
            </h3>
          </motion.div>
        {!hasStartedRaffle && (
          <div className="start-panel">
            <p>
              Ready to spin 500 names and assign{' '}
              <strong>{selectedSportConfig?.needed}</strong> players for{' '}
              {selectedSportConfig?.name}. Click start to begin the fast raffle.
            </p>
            <motion.button 
              type="button" 
              className="primary-btn" 
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
            {isRaffling || !raffleResults.length ? (
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
                <h4 className="results-title">Selected Players</h4>
                <ol className="results-list" ref={resultsListRef}>
                  <AnimatePresence>
                    {visibleResults.map((player, index) => {
                      const isActive =
                        index === visibleResults.length - 1 &&
                        visibleResults.length !== (selectedSportConfig?.needed || 0);
                      return (
                        <motion.li 
                          key={player.id} 
                          className={`result-card ${isActive ? 'result-card-active' : ''}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ 
                            duration: 0.4,
                            delay: index * 0.1
                          }}
                          whileHover={{ scale: 1.02, x: 5 }}
                        >
                          <motion.span 
                            className="result-rank-badge"
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ 
                              duration: 0.5,
                              delay: index * 0.1 + 0.2,
                              type: "spring",
                              stiffness: 200
                            }}
                          >
                            {index + 1}
                          </motion.span>
                          <div className="result-meta">
                            <strong>{player.name}</strong>
                            <span>{player.department} Dept.</span>
                          </div>
                          <span className="result-dot" />
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ol>
                {visibleResults.length < (selectedSportConfig?.needed || 0) && (
                  <p className="results-hint">Drawing in progress…</p>
                )}
                {raffleResults.length > 0 && visibleResults.length === raffleResults.length && (
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
            Pick a team, choose the sport, and we will randomly seat the exact number of players needed out of 500
            available teammates.
          </p>
        </header>

        {phase === 'teamSelect' && (
          <>
            <h2>Select a team</h2>
            {renderTeamCards()}
          </>
        )}

        {phase === 'sportSelect' && (
          <>
            <div className="section-header">
              <h2>Select a sport for {selectedTeamName}</h2>
              <button type="button" className="text-btn" onClick={handleReset}>
                Change team
              </button>
            </div>
            {renderSportCards()}
          </>
        )}

        {phase === 'raffle' && (
          <>
            <div className="section-header">
              <button type="button" className="text-btn" onClick={handleAnotherSport}>
                Back to sports
              </button>
              <button type="button" className="text-btn" onClick={handleReset}>
                Change team
              </button>
            </div>
            {renderRaffle()}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
