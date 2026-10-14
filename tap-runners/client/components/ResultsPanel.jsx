"use client";

import { useEffect, useState } from "react";

const MEDALS = ["🥇", "🥈", "🥉"];
const suffix = (value) => {
  const digit = value % 10;
  const tens = value % 100;
  return `${value}${digit === 1 && tens !== 11 ? "ST" : digit === 2 && tens !== 12 ? "ND" : digit === 3 && tens !== 13 ? "RD" : "TH"}`;
};

function AnimatedMetric({ value, digits = 1, suffix: unit = "" }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const duration = 650;
    const timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / duration);
      const ease = 1 - (1 - progress) ** 3;
      setShown(target * ease);
      if (progress >= 1) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [target]);
  return <>{shown.toFixed(digits)}{unit}</>;
}

export default function ResultsPanel({
  results,
  me,
  isHost,
  personalBest,
  isNewBest,
  onPlayAgain,
  onBackToLobby,
  onShare,
  onExit,
}) {
  const placed = results.players.filter((player) => player.place);
  const podium = [1, 0, 2].map((index) => placed[index]).filter(Boolean);
  return (
    <div className="results-overlay">
      <section className="results-card results-panel">
        <div className="card-kicker">THE CHECKERED FLAG · {results.distance} METERS</div>
        <h1>RACE RESULTS</h1>
        {isNewBest && <p className="personal-best">NEW PERSONAL BEST!</p>}
        {personalBest !== null && !isNewBest && <p className="personal-best-note">Your best: {personalBest.toFixed(2)}s</p>}

        <div className="podium">
          {podium.map((player, index) => (
            <div className={`podium-runner podium-place-${player.place}`} key={player.id} style={{ "--row-delay": `${index * 110}ms` }}>
              <div className="podium-avatar" style={{ "--avatar-color": player.color }}>
                {player.name.slice(0, 1).toUpperCase()}
                <span>{MEDALS[player.place - 1]}</span>
              </div>
              <b>{player.name}</b>
              <small>{player.time === null ? "DNF" : `${player.time.toFixed(2)}s`}</small>
              <div className="podium-block"><span>{suffix(player.place)}</span></div>
            </div>
          ))}
        </div>

        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr><th>PLACE</th><th>RUNNER</th><th>TIME</th><th>AVG</th><th>TOP</th><th>TAPS</th></tr>
            </thead>
            <tbody>
              {results.players.map((player, index) => (
                <tr className={player.id === me?.id ? "local-result" : ""} key={player.id} style={{ "--row-delay": `${index * 90}ms` }}>
                  <td>{player.dnf ? "DNF" : suffix(player.place)}</td>
                  <td><i style={{ background: player.color }} />{player.name}{player.id === me?.id ? " (YOU)" : ""}</td>
                  <td>{player.time === null ? "—" : <AnimatedMetric value={player.time} digits={2} unit="s" />}</td>
                  <td><AnimatedMetric value={player.avgSpeed * 3.6} unit=" km/h" /></td>
                  <td><AnimatedMetric value={player.topSpeed * 3.6} unit=" km/h" /></td>
                  <td><AnimatedMetric value={player.taps} digits={0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="results-actions">
          {isHost
            ? <button className="primary-button" onClick={onPlayAgain}>PLAY AGAIN</button>
            : <span className="waiting-host">Waiting for host…</span>}
          <button className="secondary-button" onClick={onBackToLobby} disabled={!isHost}>BACK TO LOBBY</button>
          <button className="secondary-button" onClick={onShare}>SHARE RESULT</button>
          <button className="exit-inline-button" onClick={onExit}>EXIT</button>
        </div>
      </section>
    </div>
  );
}
