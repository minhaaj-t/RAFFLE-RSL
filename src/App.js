import { useEffect, useMemo, useState } from 'react';
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
  { id: 'cricket', name: 'Cricket', needed: 11 },
  { id: 'football', name: 'Football', needed: 11 },
  { id: 'badminton', name: 'Badminton', needed: 2 },
  { id: 'tug', name: 'Tug of War', needed: 8 },
  { id: 'race', name: '100 Meter Race', needed: 1 },
  { id: 'relay', name: 'Relay', needed: 4 },
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
      const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }

    if (phase === 'raffle' && hasStartedRaffle && countdown === 0 && isRaffling && selectedSportConfig) {
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
    const revealTimer = setTimeout(() => setRevealedCount((prev) => prev + 1), 450);
    return () => clearTimeout(revealTimer);
  }, [raffleResults, revealedCount]);

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

  const handleStartRaffle = () => {
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

  const renderSportCards = () => (
    <div className="card-grid sports-grid">
      {SPORTS_CONFIG.map((sport) => (
        <button
          key={sport.id}
          type="button"
          className="card sport-card"
          onClick={() => handleSportSelect(sport.id)}
        >
          <h3>{sport.name}</h3>
          <p>{sport.needed} players needed</p>
          <span className="eyebrow">for {selectedTeamName || 'team'}</span>
        </button>
      ))}
    </div>
  );

  const renderRaffle = () => (
    <div className="raffle-wrapper">
      <div className="raffle-panel">
        <h3>
          {selectedSportConfig?.name} • {selectedSportConfig?.needed} spots for{' '}
          {selectedTeamName}
        </h3>
        {!hasStartedRaffle && (
          <div className="start-panel">
            <p>
              Ready to spin 500 names and assign{' '}
              <strong>{selectedSportConfig?.needed}</strong> players for{' '}
              {selectedSportConfig?.name}. Click start to begin the fast raffle.
            </p>
            <button type="button" className="primary-btn" onClick={handleStartRaffle}>
              Start Raffle
            </button>
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
                <ol className="results-list">
                  {visibleResults.map((player, index) => {
                    const isActive =
                      index === visibleResults.length - 1 &&
                      visibleResults.length !== (selectedSportConfig?.needed || 0);
                    return (
                      <li key={player.id} className={`result-card ${isActive ? 'result-card-active' : ''}`}>
                        <span className="result-rank-badge">{index + 1}</span>
                        <div className="result-meta">
                          <strong>{player.name}</strong>
                          <span>{player.department} Dept.</span>
                        </div>
                        <span className="result-dot" />
                      </li>
                    );
                  })}
                </ol>
                {visibleResults.length < (selectedSportConfig?.needed || 0) && (
                  <p className="results-hint">Drawing in progress…</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <main className="content">
        <header>
          <p className="eyebrow">RSL Raffle • 500 participants</p>
          <h1>Team Member Sports Raffle</h1>
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
