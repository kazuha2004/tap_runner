"use client";

import { useEffect, useRef, useState } from "react";

const ordinal = (value) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return `${value}${mod10 === 1 && mod100 !== 11 ? "ST" : mod10 === 2 && mod100 !== 12 ? "ND" : mod10 === 3 && mod100 !== 13 ? "RD" : "TH"}`;
};

function playTone(frequency, duration = 0.12, type = "sine") {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    oscillator.onended = () => context.close();
  } catch {
    // Audio is optional; unsupported browsers still get full game feedback.
  }
}

export default function HUD({ state, me, players, countdown, onTap, muted, tapDisabled = false }) {
  const [tapPulse, setTapPulse] = useState(0);
  const lastCountdown = useRef(null);
  const local = state?.players?.[me?.id];
  const ordered = state?.ranking?.map((id) => [id, state.players[id]]).filter(([, player]) => player) ||
    Object.entries(state?.players || {}).sort((a, b) => (b[1].distance || 0) - (a[1].distance || 0));
  const position = Math.max(1, ordered.findIndex(([id]) => id === me?.id) + 1);
  const speed = local?.speed || 0;
  const distanceLeft = Math.max(0, (state?.raceDistance || 400) - (local?.distance || 0));

  useEffect(() => {
    if (countdown !== null && countdown !== lastCountdown.current && !muted) {
      playTone(countdown === "GO" ? 880 : 440 + Number(countdown) * 80, countdown === "GO" ? 0.3 : 0.12, "triangle");
    }
    lastCountdown.current = countdown;
  }, [countdown, muted]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.code !== "Space" || event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (tapDisabled) return;
      onTap();
      setTapPulse((value) => value + 1);
      if (!muted) playTone(190, 0.07, "square");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [muted, onTap, tapDisabled]);

  function tap(event) {
    event.preventDefault();
    if (tapDisabled) return;
    onTap();
    setTapPulse((value) => value + 1);
    if (!muted) playTone(190, 0.07, "square");
    if (navigator.vibrate) navigator.vibrate(12);
  }

  return (
    <div className="game-hud">
      <div className="race-stats">
        <div className="stat-panel distance-panel"><span>DISTANCE LEFT</span><strong>{Math.ceil(distanceLeft)}<i> m</i></strong></div>
        <div className="stat-panel position-panel"><span>POSITION</span><strong>{ordinal(position)}</strong><small>OF {String(Math.max(players.length, ordered.length)).padStart(2, "0")}</small></div>
        <div className="stat-panel speed-panel"><span>PACE</span><strong>{Math.round(speed * 100)}<i> SPD</i></strong><div className="speed-track"><b style={{ width: `${Math.min(100, speed / 1.4 * 100)}%` }} /></div></div>
      </div>
      <div className="race-map" aria-label="Race progress">
        <div className="race-map-track" />
        {ordered.map(([id, player]) => (
          <span
            className={`race-map-dot ${id === me?.id ? "local" : ""}`}
            key={id}
            style={{
              "--runner-color": player.color,
              left: `${Math.min(100, Math.max(0, (player.distance || 0) / (state?.raceDistance || 200) * 100))}%`,
            }}
            title={player.name}
          />
        ))}
      </div>
      <div className="leaderboard">
        <div className="leaderboard-title"><span>THE PACK</span><i>LIVE</i></div>
        {ordered.slice(0, 5).map(([id, player], index) => <div className={`leader-row ${id === me?.id ? "is-you" : ""}`} key={id}><b>{String(index + 1).padStart(2, "0")}</b><i style={{ background: player.color }} /><span>{player.name}</span><small>{id === me?.id ? "YOU" : `${Math.round(player.speed * 100)} SPD`}</small></div>)}
      </div>
      {countdown !== null && <div className={`countdown-overlay ${countdown === "GO" ? "go" : ""}`}><div>{countdown}</div><span>{countdown === "GO" ? "MAKE YOUR MOVE" : "GET READY"}</span></div>}
      <button className="tap-button" onPointerDown={tap} aria-label="Tap to accelerate" disabled={tapDisabled}><span className="tap-rings" /><span className="tap-caption">TAP TO</span><strong>TAP</strong><span className="tap-hint">OR PRESS SPACE</span></button>
      <div className="game-bottom-hint"><span>✳</span> KEEP YOUR RHYTHM TO BUILD A BONUS <span className="desktop-hint">· SPACE TO TAP</span></div>
    </div>
  );
}
