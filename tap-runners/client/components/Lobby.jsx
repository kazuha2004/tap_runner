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
      <div className="lobby-intro">
        <div className="eyebrow"><span /> LOBBY · WAITING FOR THE GREEN LIGHT</div>
        <h1>THE GRID<br /><span>IS YOURS.</span></h1>
        <p>Bring your crew. Pick your rhythm.<br />First to the finish takes the crown.</p>
        <div className="lobby-steps"><span><b>01</b> GET IN THE GRID</span><span><b>02</b> FIND YOUR FLOW</span><span><b>03</b> TAKE THE FLAG</span></div>
        <div className="loop-art"><div className="loop-track"><i /><i /><i /></div><span className="loop-caption">SPRINT<br />TO GLORY</span></div>
      </div>
      <div className="lobby-card">
        <div className="lobby-card-head"><div><div className="card-kicker">YOUR PRIVATE ROOM</div><h2>Race lobby</h2></div><span className="player-count">{players.length}<small> / 8</small></span></div>
        <div className="room-share"><div><span>ROOM CODE</span><b>{code}</b></div><button onClick={copyLink}>{copied ? "COPIED ✓" : "COPY LINK ↗"}</button></div>
        <div className="roster-head"><span>RUNNERS ON THE GRID</span><span>{players.length} / 8</span></div>
        <div className="player-list">
          {players.map((player, index) => (
            <div className="player-row" key={player.id}>
              <div className="runner-avatar" style={{ "--runner-color": player.color }}>{player.name.charAt(0).toUpperCase()}</div>
              <div className="player-details"><b>{player.name}{player.id === me?.id ? <small> YOU</small> : null}</b><span>{player.id === host ? "RACE HOST" : `RUNNER ${String(index + 1).padStart(2, "0")}`}</span></div>
              {player.id === host && <span className="host-star">✦</span>}
              <i className="ready-dot" />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 3 - players.length) }).map((_, index) => <div className="player-row empty-slot" key={`empty-${index}`}><div className="runner-avatar">+</div><div className="player-details"><b>Waiting for runner…</b><span>SHARE YOUR ROOM LINK</span></div><span className="ready-dot" /></div>)}
        </div>
        <div className="theme-picker">
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
                {selectedTheme === theme.id && <span className="theme-selected-mark">✓</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="distance-picker">
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
          <p className="distance-estimate">A good rhythm takes about {Math.round(raceDistance * 0.15)} sec</p>
        </div>
        {isHost ? <button className="primary-button start-button" onClick={onStart}>START THE RACE <span>↗</span></button> : <div className="host-wait">✦ <span>Waiting for {players.find((player) => player.id === host)?.name || "the host"} to start…</span></div>}
        <div className="lobby-tip"><span>✳</span> PRO TIP <i /> Keep a steady rhythm for a speed bonus.</div>
      </div>
    </section>
  );
}
