"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_LIST } from "../lib/themes";
import { playTone } from "../lib/audio";

const TIPS = [
  { icon: "♫", text: "Tap in a steady rhythm, don't mash." },
  { icon: "↗", text: "Hit boost pads while you're in the green zone." },
  { icon: "?", text: "Grab lucky boxes for rockets and shields." },
];

function Icon({ name, className = "" }) {
  const paths = {
    share: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function ThemeIllustration({ theme }) {
  const [sky, ground, track] = theme.preview;
  const candy = theme.id === "candy-sunset";
  const desert = theme.id === "desert-run";
  const snow = theme.id === "snow-peak";
  return (
    <svg className="theme-art" viewBox="0 0 120 66" role="img" aria-label={`${theme.name} preview`}>
      <rect width="120" height="66" rx="10" fill={sky} />
      <circle cx="99" cy="13" r="7" fill="#fff4bf" opacity=".95" />
      <path d={snow ? "M0 42 23 17l17 21 18-26 27 30 17-17 18 15v14H0Z" : candy ? "M0 42 20 26l17 12 19-21 26 20 15-12 23 20v10H0Z" : "M0 43 20 30l19 8 22-19 24 20 16-13 19 14v14H0Z"} fill={ground} />
      {desert && <path d="M0 49q25-13 49-2t71-3v22H0Z" fill="#d7a857" opacity=".8" />}
      {candy && <><circle cx="19" cy="31" r="5" fill="#ffe19b" /><circle cx="40" cy="36" r="4" fill="#ff8fa3" /></>}
      {snow && <path d="m13 29 7-8 6 8m28-3 6-9 6 9" fill="#fff" opacity=".95" />}
      <path d="M49 66 57 38h9l8 28Z" fill={track} />
      <path d="M60 65 62 42" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 3" opacity=".85" />
      <path d="M55 51h13" stroke="#fff" strokeWidth="2" opacity=".9" />
    </svg>
  );
}

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
  const [shareMessage, setShareMessage] = useState("");
  const [distancePending, setDistancePending] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const distanceTimer = useRef(null);
  const copyTimer = useRef(null);
  const previousPlayerIds = useRef(null);
  const selected = THEME_LIST.find((theme) => theme.id === selectedTheme) || THEME_LIST[0];
  const spotsLeft = Math.max(0, 8 - players.length);
  const estimatedSeconds = Math.round((raceDistance / 200) * 30);

  useEffect(() => {
    setDistancePending(false);
    clearTimeout(distanceTimer.current);
    return () => clearTimeout(distanceTimer.current);
  }, [raceDistance]);

  useEffect(() => {
    if (previousPlayerIds.current === null) {
      previousPlayerIds.current = new Set(players.map((player) => player.id));
      return;
    }
    const previous = previousPlayerIds.current;
    const newPlayerJoined = players.some((player) => player.id !== me?.id && !previous.has(player.id));
    if (newPlayerJoined) playTone(740, 0.07, "triangle");
    previousPlayerIds.current = new Set(players.map((player) => player.id));
  }, [players, me?.id]);

  useEffect(() => {
    const timer = setInterval(() => setTipIndex((index) => (index + 1) % TIPS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    clearTimeout(distanceTimer.current);
    clearTimeout(copyTimer.current);
  }, []);

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
      setShareMessage("Invite link copied.");
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        setShareMessage("");
      }, 1800);
    } catch {
      setCopied(false);
      setShareMessage("Could not copy the invite link.");
    }
  }

  async function inviteFriends() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my Tap Runners race",
          text: `Join my Tap Runners race in room ${code}!`,
          url: window.location.href,
        });
        setShareMessage("Invite shared.");
        clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setShareMessage(""), 1800);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        setShareMessage("Sharing failed. Copying your invite link instead.");
      }
    }
    await copyLink();
  }

  return (
    <section
      className="lobby-layout"
      style={{
        "--lobby-accent": selected.preview[0],
        "--lobby-accent-shadow": selected.preview[1],
        "--lobby-sky": selected.preview[0],
      }}
    >
      <aside className="lobby-room-pill" aria-label={`Room ${code}`}>
        <span>ROOM CODE</span>
        <b>{code}</b>
        <button type="button" onClick={copyLink} aria-label="Copy invite link">
          {copied ? "COPIED ✓" : "COPY"}
        </button>
      </aside>
      <aside className="lobby-preview-count" aria-label={`${players.length} of 8 runners`}>
        <b>{players.length}<span> / 8</span></b>
        <small>RUNNERS</small>
      </aside>

      <div className="lobby-card">
        <div className="lobby-sheet-handle" aria-hidden="true"><i /></div>
        <div className="lobby-card-head">
          <h2>Race lobby</h2>
          <span className="player-count lobby-desktop-count">{players.length}<small> / 8</small></span>
          <button className="invite-button" type="button" onClick={inviteFriends}>
            <Icon name="share" />
            Invite friends
          </button>
          <span className="invite-status" aria-live="polite">{shareMessage}</span>
        </div>
        <section className="runner-section" aria-labelledby="runner-heading">
          <div className="roster-head">
            <h3 id="runner-heading">Runners</h3>
            <span className="lobby-waiting" aria-live="polite">
              {spotsLeft ? <>Waiting for players<span className="waiting-dots" aria-hidden="true"><i /><i /><i /></span></> : "All runners ready!"}
            </span>
            <span className="roster-count">{players.length} / 8</span>
          </div>
          <div className="player-list">
            {players.map((player) => (
              <div className={`player-row ${player.id === me?.id ? "is-you" : ""}`} key={player.id} title={player.name}>
                <span className="runner-avatar-wrap">
                  <span
                    className="runner-avatar"
                    style={{ "--runner-color": player.color }}
                    aria-label={player.name}
                    role="img"
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  {player.id === host && <span className="host-crown" aria-label="Host">♛</span>}
                </span>
                <b className="runner-display-name" title={player.name}>{player.name}</b>
                {player.id === me?.id && <span className="you-badge">YOU</span>}
              </div>
            ))}
            {players.length < 8 && (
              <div className="player-row empty-slot" title="Waiting for runner">
                <span className="runner-avatar-wrap">
                  <span className="runner-avatar" aria-label="Open runner spot" role="img">+</span>
                </span>
                <b className="runner-display-name">Open spot</b>
              </div>
            )}
          </div>
        </section>
        <section className="theme-picker" aria-labelledby="theme-heading">
          <div className="theme-picker-heading">
            <h3 id="theme-heading">Race theme</h3>
            {!isHost && <small className="host-picks"><Icon name="lock" /> Host picks</small>}
          </div>
          <div className="theme-card-grid">
            {THEME_LIST.map((theme) => (
              <button
                className={`theme-card ${selectedTheme === theme.id ? "selected" : ""}`}
                style={{ "--theme-accent": theme.preview[2] }}
                type="button"
                key={theme.id}
                disabled={!isHost}
                aria-pressed={selectedTheme === theme.id}
                onClick={() => onSelectTheme?.(theme.id)}
              >
                <span className="theme-preview"><ThemeIllustration theme={theme} /></span>
                <span className="theme-card-name">{theme.name}</span>
                {selectedTheme === theme.id && <span className="theme-selected-mark" aria-label="Selected">✓</span>}
                {!isHost && <Icon name="lock" className="theme-lock" />}
              </button>
            ))}
          </div>
        </section>
        <section className="distance-picker" aria-labelledby="distance-heading">
          <div className="distance-picker-heading">
            <h3 id="distance-heading">Race distance</h3>
            {!isHost && <small className="host-picks"><Icon name="lock" /> Host picks</small>}
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
          <p className="distance-estimate" key={raceDistance}>
            <Icon name="clock" />
            <span>About {estimatedSeconds} sec</span>
          </p>
        </section>
        <div className="lobby-tip" aria-live="off">
          <span className="tip-icon" key={`icon-${tipIndex}`}>{TIPS[tipIndex].icon}</span>
          <span className="tip-text" key={`text-${tipIndex}`}>{TIPS[tipIndex].text}</span>
        </div>
        <div className="lobby-start-wrap">
          {isHost
            ? <button className="primary-button start-button" onClick={onStart}>
              <span className="start-copy"><b>START THE RACE</b>{players.length === 1 && <small>Race solo or wait for friends</small>}</span>
              <b className="start-arrow" aria-hidden="true">↗</b>
            </button>
            : <button className="primary-button start-button host-wait" type="button" disabled>Waiting for host...</button>}
        </div>
      </div>
    </section>
  );
}
