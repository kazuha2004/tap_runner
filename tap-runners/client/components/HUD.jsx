"use client";

import { memo, useEffect, useRef } from "react";
import { playTone } from "../lib/audio";

const ordinal = (value) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return `${value}${mod10 === 1 && mod100 !== 11 ? "ST" : mod10 === 2 && mod100 !== 12 ? "ND" : mod10 === 3 && mod100 !== 13 ? "RD" : "TH"}`;
};

function HUD({
  state,
  stateSnapshotRef,
  me,
  players,
  countdown,
  onTap,
  muted,
  tapDisabled = false,
}) {
  const hudRef = useRef(null);
  const mapRef = useRef(null);
  const leaderboardRef = useRef(null);
  const tapPopupsRef = useRef([]);
  const tapAnimationsRef = useRef([]);
  const nextTapPopupRef = useRef(0);
  const lastCountdown = useRef(null);
  const local = state?.players?.[me?.id];
  const ordered = state?.ranking?.map((id) => [id, state.players[id]]).filter(([, player]) => player) ||
    Object.entries(state?.players || {}).sort((a, b) => (b[1].distance || 0) - (a[1].distance || 0));
  const position = Math.max(1, ordered.findIndex(([id]) => id === me?.id) + 1);
  const speed = local?.speed || 0;
  const distanceLeft = Math.max(0, (state?.raceDistance || 400) - (local?.distance || 0));

  useEffect(() => {
    if (!stateSnapshotRef) return undefined;
    const timer = setInterval(() => {
      const snapshot = stateSnapshotRef.current;
      const snapshotPlayers = snapshot?.players || {};
      const ranking = snapshot?.ranking
        ?.map((id) => [id, snapshotPlayers[id]])
        .filter(([, player]) => player)
        || Object.entries(snapshotPlayers).sort((a, b) => (b[1].distance || 0) - (a[1].distance || 0));
      const localPlayer = snapshotPlayers[me?.id];
      const distanceNode = hudRef.current?.querySelector("[data-hud-distance]");
      const positionNode = hudRef.current?.querySelector("[data-hud-position]");
      const countNode = hudRef.current?.querySelector("[data-hud-count]");
      const paceNode = hudRef.current?.querySelector("[data-hud-pace]");
      const speedBar = hudRef.current?.querySelector("[data-hud-speed-bar]");
      if (distanceNode) {
        distanceNode.textContent = String(Math.ceil(Math.max(0, (snapshot?.raceDistance || 400) - (localPlayer?.distance || 0))));
      }
      if (positionNode) {
        positionNode.textContent = ordinal(Math.max(1, ranking.findIndex(([id]) => id === me?.id) + 1));
      }
      if (countNode) countNode.textContent = `OF ${String(Math.max(players.length, ranking.length)).padStart(2, "0")}`;
      if (paceNode) paceNode.textContent = `${Math.round((localPlayer?.speed || 0) * 100)} SPD`;
      if (speedBar) speedBar.style.width = `${Math.min(100, (localPlayer?.speed || 0) / 1.4 * 100)}%`;

      mapRef.current?.querySelectorAll("[data-runner-id]").forEach((dot) => {
        const player = snapshotPlayers[dot.dataset.runnerId];
        if (!player) return;
        dot.style.left = `${Math.min(100, Math.max(0, (player.distance || 0) / (snapshot?.raceDistance || 200) * 100))}%`;
      });
      const leaderboard = leaderboardRef.current;
      if (leaderboard) {
        const rows = Array.from(leaderboard.querySelectorAll("[data-runner-id]"));
        rows.sort((a, b) => {
          const aPlayer = snapshotPlayers[a.dataset.runnerId];
          const bPlayer = snapshotPlayers[b.dataset.runnerId];
          return (bPlayer?.distance || 0) - (aPlayer?.distance || 0);
        });
        rows.forEach((row, index) => {
          const player = snapshotPlayers[row.dataset.runnerId];
          if (!player) return;
          const rankNode = row.querySelector("[data-rank]");
          const speedNode = row.querySelector("[data-runner-speed]");
          if (rankNode) rankNode.textContent = String(index + 1).padStart(2, "0");
          if (speedNode) speedNode.textContent = player.id === me?.id ? "YOU" : `${Math.round((player.speed || 0) * 100)} SPD`;
          leaderboard.appendChild(row);
        });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [me?.id, players.length, stateSnapshotRef]);

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
      if (!muted) playTone(190, 0.07, "square", true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [muted, onTap, tapDisabled]);

  function tap(event) {
    event.preventDefault();
    if (tapDisabled) return;
    onTap();
    const index = nextTapPopupRef.current;
    nextTapPopupRef.current = (index + 1) % tapPopupsRef.current.length;
    const popup = tapPopupsRef.current[index];
    if (popup && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tapAnimationsRef.current[index]?.cancel();
      const offset = (Math.random() - 0.5) * 52;
      tapAnimationsRef.current[index] = popup.animate([
        { opacity: 0, transform: `translate(calc(-50% + ${offset}px), 10px) scale(.65)` },
        { opacity: 1, transform: `translate(calc(-50% + ${offset}px), -8px) scale(1)`, offset: 0.2 },
        { opacity: 0, transform: `translate(calc(-50% + ${offset + 12}px), -54px) scale(1.05)` },
      ], { duration: 480, easing: "ease-out" });
    }
    if (!muted) playTone(190, 0.07, "square", true);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  return (
    <div className="game-hud" ref={hudRef}>
      <div className="race-stats">
        <div className="stat-panel distance-panel"><span>DISTANCE LEFT</span><strong><span data-hud-distance>{Math.ceil(distanceLeft)}</span><i> m</i></strong></div>
        <div className="stat-panel position-panel"><span>POSITION</span><strong data-hud-position>{ordinal(position)}</strong><small data-hud-count>OF {String(Math.max(players.length, ordered.length)).padStart(2, "0")}</small></div>
        <div className="stat-panel speed-panel"><span>PACE</span><strong><span data-hud-pace>{Math.round(speed * 100)} SPD</span></strong><div className="speed-track"><b data-hud-speed-bar style={{ width: `${Math.min(100, speed / 1.4 * 100)}%` }} /></div></div>
      </div>
      <div className="race-map" aria-label="Race progress" ref={mapRef}>
        <div className="race-map-track" />
        {(ordered.length ? ordered : players.map((player) => [player.id, player])).map(([id, player]) => (
          <span
            className={`race-map-dot ${id === me?.id ? "local" : ""}`}
            key={id}
          data-runner-id={id}
            style={{
              "--runner-color": player.color,
              left: `${Math.min(100, Math.max(0, (player.distance || 0) / (state?.raceDistance || 200) * 100))}%`,
            }}
            title={player.name}
          />
        ))}
      </div>
      <div className="leaderboard" ref={leaderboardRef}>
        <div className="leaderboard-title"><span>THE PACK</span><i>LIVE</i></div>
        {(ordered.length ? ordered : players.map((player) => [player.id, player])).slice(0, 5).map(([id, player], index) => <div className={`leader-row ${id === me?.id ? "is-you" : ""}`} key={id} data-runner-id={id}><b data-rank>{String(index + 1).padStart(2, "0")}</b><i style={{ background: player.color }} /><span>{player.name}</span><small data-runner-speed>{id === me?.id ? "YOU" : `${Math.round((player.speed || 0) * 100)} SPD`}</small></div>)}
      </div>
      {countdown !== null && <div className={`countdown-overlay ${countdown === "GO" ? "go" : ""}`}><div>{countdown}</div><span>{countdown === "GO" ? "MAKE YOUR MOVE" : "GET READY"}</span></div>}
      <button className="tap-button" onPointerDown={tap} aria-label="Tap to accelerate" disabled={tapDisabled}><span className="tap-rings" /><span className="tap-caption">TAP TO</span><strong>TAP</strong><span className="tap-hint">OR PRESS SPACE</span>{Array.from({ length: 6 }, (_, index) => <span className="tap-popup" aria-hidden="true" key={index} ref={(element) => { tapPopupsRef.current[index] = element; }}>+1</span>)}</button>
      <div className="game-bottom-hint"><span>✳</span> KEEP YOUR RHYTHM TO BUILD A BONUS <span className="desktop-hint">· SPACE TO TAP</span></div>
    </div>
  );
}

export default memo(HUD);
