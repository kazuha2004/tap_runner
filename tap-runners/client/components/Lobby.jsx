"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_LIST } from "../lib/themes";

export default function Lobby({
  code,
  players,
  host,
  me,
  isHost,
  selectedTheme,
  onSelectTheme,
  raceDistance,
  onSelectDistance,
  onStart,
  onCopy,
}) {
  const [copied, setCopied] = useState(false);
  const [distancePending, setDistancePending] = useState(false);
  const distanceTimer = useRef(null);
  useEffect(() => {
    setDistancePending(false);
    clearTimeout(distanceTimer.current);
    return () => clearTimeout(distanceTimer.current);
  }, [raceDistance]);

  function selectDistance(meters) {
    if (distancePending || meters === raceDistance) return;
    setDistancePending(true);
    onSelectDistance?.(meters);
    distanceTimer.current = setTimeout(() => setDistancePending(false), 2500);
  }
  async function copyLink() {
    try {
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="lobby-layout">
      <aside className="lobby-room-pill">
        <span>ROOM CODE</span>
        <b>{code}</b>
        <button type="button" onClick={copyLink}>{copied ? "COPIED ✓" : "COPY LINK ↗"}</button>
      </aside>
      <div className="lobby-card">
        <div className="lobby-card-head">
          <h2>Race lobby</h2>
          <span className="player-count">{players.length}<small> / 8</small></span>
        </div>
        <section className="runner-section">
          <div className="roster-head"><span>RUNNERS</span><span>{players.length} / 8</span></div>
          <div className="player-list">
            {players.map((player) => (
              <div className="player-row" key={player.id} title={player.name}>
                <div className="runner-avatar" style={{ "--runner-color": player.color }} aria-label={player.name} role="img">{player.name.charAt(0).toUpperCase()}</div>
                <div className="player-details">
                  <b>{player.name}</b>
                  <div className="player-badges">
                    {player.id === me?.id && <span className="you-badge">YOU</span>}
                    {player.id === host && <span className="host-badge">HOST</span>}
                  </div>
                </div>
              </div>
            ))}
            {players.length < 8 && (
              <div className="player-row empty-slot" title="Waiting for runner...">
                <div className="runner-avatar" aria-label="Waiting for runner" role="img">+</div>
                <div className="player-details"><b>Waiting for runner...</b></div>
              </div>
            )}
          </div>
          {players.length < 7 && <p className="spots-remaining">+{7 - players.length} more spots</p>}
        </section>
        <section className="theme-picker">
          <div className="theme-picker-heading">
            <span>RACE THEME</span>
            {!isHost && <small>HOST PICKS</small>}
          </div>
          <div className="theme-card-grid">
            {THEME_LIST.map((theme) => (
              <button
                className={`theme-card ${selectedTheme === theme.id ? "selected" : ""}`}
                type="button"
                key={theme.id}
                disabled={!isHost}
                aria-pressed={selectedTheme === theme.id}
                onClick={() => onSelectTheme?.(theme.id)}
              >
                <span
                  className="theme-preview"
                  style={{
                    "--theme-sky": theme.preview[0],
                    "--theme-ground": theme.preview[1],
                    "--theme-track": theme.preview[2],
                  }}
                >
                  <i />
                </span>
                <span className="theme-card-name">{theme.name}</span>
                {selectedTheme === theme.id && <span className="theme-selected-mark" aria-label="Selected">✓</span>}
              </button>
            ))}
          </div>
        </section>
        <section className="distance-picker">
          <div className="distance-picker-heading">
            <span>RACE DISTANCE</span>
            {!isHost && <small>HOST CHOOSES</small>}
          </div>
          <div className="distance-chip-row">
            {[100, 200, 400, 800].map((meters) => (
              <button
                className={`distance-chip ${raceDistance === meters ? "selected" : ""}`}
                key={meters}
                type="button"
                disabled={!isHost || distancePending}
                aria-pressed={raceDistance === meters}
                onClick={() => selectDistance(meters)}
              >
                {meters}m
              </button>
            ))}
          </div>
          <p className="distance-estimate">About 30 sec</p>
        </section>
        {isHost
          ? <button className="primary-button start-button" onClick={onStart}>START THE RACE <span>↗</span></button>
          : <button className="primary-button start-button host-wait" type="button" disabled>Waiting for host...</button>}
      </div>
    </section>
  );
}
