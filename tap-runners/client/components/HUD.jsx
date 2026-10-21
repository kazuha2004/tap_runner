"use client";

import { memo, useEffect, useRef, useState } from "react";
import { playTone, playToneSequence } from "../lib/audio";

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
  onUseItem,
  debugEnabled = false,
  itemBoxes = [],
  boostPads = [],
  debugConfig,
  debugConfigError,
}) {
  const hudRef = useRef(null);
  const mapRef = useRef(null);
  const packSheetRef = useRef(null);
  const tapPopupsRef = useRef([]);
  const tapAnimationsRef = useRef([]);
  const nextTapPopupRef = useRef(0);
  const lastCountdown = useRef(null);
  const tapDisabledRef = useRef(tapDisabled);
  const localStorageCheckedRef = useRef(false);
  const previousZoneRef = useRef(null);
  const previousOverheatedRef = useRef(false);
  const previousTapCountRef = useRef(0);
  const tutorialTimerRef = useRef(null);
  const packTimerRef = useRef(null);
  const previousItemRef = useRef(null);
  const itemRouletteUntilRef = useRef(0);
  const packSummaryRef = useRef(null);
  const overheatedRef = useRef(false);
  const itemAvailableRef = useRef(false);
  const onUseItemRef = useRef(onUseItem);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPack, setShowPack] = useState(false);
  const local = state?.players?.[me?.id];
  const ordered = state?.ranking?.map((id) => [id, state.players[id]]).filter(([, player]) => player) ||
    Object.entries(state?.players || {}).sort((a, b) => (b[1].distance || 0) - (a[1].distance || 0));
  const position = Math.max(1, ordered.findIndex(([id]) => id === me?.id) + 1);
  const speed = local?.speed || 0;
  const distanceLeft = Math.max(0, (state?.raceDistance || 400) - (local?.distance || 0));
  tapDisabledRef.current = tapDisabled;
  onUseItemRef.current = onUseItem;

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
      const progressBar = hudRef.current?.querySelector("[data-progress-fill]");
      const heatWidget = hudRef.current?.querySelector("[data-heat-widget]");
      const heatValue = Math.max(0, Math.min(100, localPlayer?.heat || 0));
      const overheated = Boolean(localPlayer?.overheated);
      overheatedRef.current = overheated;
      const zone = localPlayer?.zone || "cold";
      const tapButton = hudRef.current?.querySelector("[data-tap-button]");
      const itemButton = hudRef.current?.querySelector("[data-item-button]");
      const currentItem = localPlayer?.item || null;
      if (heatWidget) {
        heatWidget.dataset.zone = zone;
        heatWidget.dataset.overheated = String(overheated);
        heatWidget.dataset.warning = String(heatValue > 85);
        heatWidget.style.setProperty("--heat-level", `${heatValue}%`);
        const heatText = heatWidget.querySelector("[data-heat-value]");
        if (heatText) heatText.textContent = `${Math.round(heatValue)}%`;
        const coolingText = heatWidget.querySelector("[data-cooling-countdown]");
        const zoneBadge = heatWidget.querySelector("[data-zone-badge]");
        if (zoneBadge) zoneBadge.hidden = zone !== "sweet" || overheated;
        if (coolingText) {
          coolingText.textContent = overheated
            ? `${Math.max(0, (Number(localPlayer.overheatedRemaining) || 0)).toFixed(1)}s`
            : "";
        }
      }
      if (tapButton) {
        tapButton.disabled = tapDisabledRef.current || overheated;
        tapButton.dataset.overheated = String(overheated);
        tapButton.style.setProperty(
          "--cooldown-progress",
          `${Math.min(100, Math.max(0, (localPlayer?.overheatedRemaining || 0) / 1.5 * 100))}%`,
        );
      }
      itemAvailableRef.current = Boolean(localPlayer?.item) && !overheated;
      if (itemButton) {
        itemButton.disabled = tapDisabledRef.current || !itemAvailableRef.current;
        const changedItem = currentItem !== previousItemRef.current;
        itemButton.dataset.item = currentItem || "";
        if (changedItem && currentItem) {
          itemRouletteUntilRef.current = performance.now() + 800;
          itemButton.dataset.roulette = "true";
        }
        const itemName = itemButton.querySelector("[data-item-name]");
        if (itemName) {
          const remaining = itemRouletteUntilRef.current - performance.now();
          if (remaining > 0) {
            const roulette = ["TURBO", "SHIELD", "ROCKET", "MAGNET", "LIGHTNING", "COOL DOWN"];
            itemName.textContent = roulette[Math.floor(performance.now() / 85) % roulette.length];
          } else {
            itemButton.dataset.roulette = "false";
            itemName.textContent = currentItem ? currentItem.replaceAll("_", " ") : "EMPTY";
          }
        }
        itemButton.setAttribute("aria-label", localPlayer?.item
          ? `Use ${localPlayer.item.replaceAll("_", " ")}`
          : "No item held");
      }
      previousItemRef.current = currentItem;
      if (previousZoneRef.current !== zone && zone === "sweet" && !muted) {
        playTone(880, 0.12, "sine");
      }
      if (!previousOverheatedRef.current && overheated && !muted) {
        playTone(145, 0.35, "square");
      }
      if (zone === "sweet" && (localPlayer?.taps || 0) > previousTapCountRef.current && !muted) {
        playTone(660, 0.045, "sine", true);
      }
      previousZoneRef.current = zone;
      previousOverheatedRef.current = overheated;
      previousTapCountRef.current = localPlayer?.taps || 0;

      if (!localStorageCheckedRef.current && snapshot?.state === "racing") {
        localStorageCheckedRef.current = true;
        if (!window.localStorage.getItem("tap-runners-heat-tutorial-seen")) {
          window.localStorage.setItem("tap-runners-heat-tutorial-seen", "1");
          setShowTutorial(true);
          tutorialTimerRef.current =           window.setTimeout(() => setShowTutorial(false), 5000);
        }
      }
      if (distanceNode) {
        distanceNode.textContent = String(Math.ceil(Math.max(0, (snapshot?.raceDistance || 400) - (localPlayer?.distance || 0))));
      }
      if (positionNode) {
        positionNode.textContent = ordinal(Math.max(1, ranking.findIndex(([id]) => id === me?.id) + 1));
      }
      const localIndex = ranking.findIndex(([id]) => id === me?.id);
      const other = ranking[localIndex === 0 ? 1 : localIndex - 1]?.[1];
      const gap = other
        ? Math.abs((localPlayer?.distance || 0) - (other.distance || 0))
        : 0;
      if (packSummaryRef.current) {
        const currentRank = Math.max(1, localIndex + 1);
        packSummaryRef.current.textContent = currentRank === 1
          ? `${ordinal(currentRank).toLowerCase()} - +${gap.toFixed(1)}m ahead`
          : `${ordinal(currentRank).toLowerCase()} - ${gap.toFixed(1)}m back`;
      }
      if (countNode) countNode.textContent = `OF ${String(Math.max(players.length, ranking.length)).padStart(2, "0")}`;
      if (paceNode) paceNode.textContent = `${Math.round((localPlayer?.speed || 0) * 100)} SPD`;
      if (speedBar) speedBar.style.width = `${Math.min(100, (localPlayer?.speed || 0) / 1.4 * 100)}%`;
      if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, (localPlayer?.distance || 0) / (snapshot?.raceDistance || 200) * 100))}%`;
      }

      mapRef.current?.querySelectorAll("[data-runner-id]").forEach((dot) => {
        const player = snapshotPlayers[dot.dataset.runnerId];
        if (!player) return;
        dot.style.left = `${Math.min(100, Math.max(0, (player.distance || 0) / (snapshot?.raceDistance || 200) * 100))}%`;
        dot.dataset.holdsItem = String(Boolean(player.item));
      });
      const packSheet = packSheetRef.current;
      if (packSheet) {
        const rows = Array.from(packSheet.querySelectorAll("[data-runner-id]"));
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
          row.dataset.holdsItem = String(Boolean(player.item));
          packSheet.appendChild(row);
        });
      }
      if (debugEnabled) {
        const debugNode = hudRef.current?.querySelector("[data-debug-state]");
        if (debugNode) {
          debugNode.textContent = Object.entries(snapshotPlayers)
            .map(([id, player]) => `${player.name || id}: ${Math.round(player.heat || 0)} ${player.zone || "cold"}`)
            .join(" · ");
        }
      }
    }, 100);
    return () => {
      clearInterval(timer);
      clearTimeout(tutorialTimerRef.current);
    };
  }, [debugEnabled, me?.id, muted, players.length, stateSnapshotRef]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.key.toLowerCase() !== "e" && event.key !== "Enter") || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.target instanceof HTMLButtonElement && !event.target.hasAttribute("data-item-button")) return;
      if (tapDisabledRef.current || overheatedRef.current || !itemAvailableRef.current) return;
      event.preventDefault();
      onUseItemRef.current?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => () => clearTimeout(packTimerRef.current), []);

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
      if (tapDisabledRef.current || overheatedRef.current) return;
      onTap();
      if (!muted) playTone(190, 0.07, "square", true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [muted, onTap, tapDisabled]);

  function tap(event) {
    event.preventDefault();
    if (tapDisabledRef.current || overheatedRef.current || tapDisabled) return;
    onTap();
    const index = nextTapPopupRef.current;
    nextTapPopupRef.current = (index + 1) % tapPopupsRef.current.length;
    const popup = tapPopupsRef.current[index];
    if (popup && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tapAnimationsRef.current[index]?.cancel();
      const offset = (Math.random() - 0.5) * 52;
      tapAnimationsRef.current[index] = popup.animate([
        { opacity: 0, transform: `translate(calc(-50% + ${offset}px), 0) scale(.8)` },
        { opacity: 1, transform: `translate(calc(-50% + ${offset}px), -12px) scale(1)`, offset: 0.2 },
        { opacity: 0, transform: `translate(calc(-50% + ${offset + 12}px), -60px) scale(1.05)` },
      ], { duration: 400, easing: "ease-out" });
    }
    if (!muted) playTone(190, 0.07, "square", true);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function togglePack() {
    const next = !showPack;
    setShowPack(next);
    clearTimeout(packTimerRef.current);
    if (next) packTimerRef.current = window.setTimeout(() => setShowPack(false), 4000);
  }

  return (
    <div
      className="game-hud"
      ref={hudRef}
      data-pack-open={String(showPack)}
      data-countdown={String(countdown !== null)}
      data-race-started={String(state?.state === "racing" && countdown === null)}
    >
      <div className="race-stats">
        <div className="stat-panel position-panel"><span>PLACE</span><strong data-hud-position>{ordinal(position)}</strong><small data-hud-count>OF {String(Math.max(players.length, ordered.length)).padStart(2, "0")}</small></div>
        <div className="stat-panel distance-panel"><span>DISTANCE LEFT</span><strong><span data-hud-distance>{Math.ceil(distanceLeft)}</span><i> m</i></strong></div>
        <div className="stat-panel speed-panel"><span>SPEED</span><strong><span data-hud-pace>{Math.round(speed * 100)}</span></strong><div className="speed-track"><b data-hud-speed-bar style={{ width: `${Math.min(100, speed / 1.4 * 100)}%` }} /></div></div>
      </div>
      <div className="race-progress-track" aria-label="Race progress" ref={mapRef}>
        <div className="race-progress-fill" data-progress-fill />
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
      <button className="pack-pill" type="button" onClick={togglePack}>
        <b data-pack-summary ref={packSummaryRef}>{ordinal(position).toLowerCase()} - +0.0m ahead</b>
      </button>
      {debugEnabled && <aside className="race-debug-panel"><b>DEBUG</b><span data-debug-state>Heat waiting for race state</span><small>Boxes: {itemBoxes.map((box) => `${box.lane + 1}:${box.distance}m`).join(", ") || "not generated"}</small><small>Pads: {boostPads.map((pad) => `${pad.lane + 1}:${pad.distance}m`).join(", ") || "not generated"}</small><small>Odds: {JSON.stringify(debugConfig?.item_weights_last || "unavailable")}</small>{debugConfigError && <small>{debugConfigError}</small>}</aside>}
      {countdown !== null && <div className={`countdown-overlay ${countdown === "GO" ? "go" : ""}`}><div>{countdown}</div><span>{countdown === "GO" ? "MAKE YOUR MOVE" : "GET READY"}</span></div>}
      <div className="race-control-dock">
        <button className="item-button" data-item-button data-item="" onPointerDown={(event) => { event.preventDefault(); if (itemAvailableRef.current && !tapDisabledRef.current && !overheatedRef.current) onUseItemRef.current?.(); }} disabled aria-label="No item held"><svg viewBox="0 0 32 32" aria-hidden="true"><path className="item-icon-turbo" d="M18 2 7 18h7l-1 12 12-17h-8z" /><path className="item-icon-shield" d="M16 3 5 7v8c0 7 5 11 11 14 6-3 11-7 11-14V7z" /><path className="item-icon-rocket" d="M27 4c-7 0-13 3-17 9l-4 6 7 7 6-4c6-4 9-10 8-18zM10 22l-4 6 7-2m1-9h.01" /><path className="item-icon-trap" d="M5 20h22l-4 7H9zM8 16l4-5m4 5 4-5m1-4 3-3" /><path className="item-icon-cool" d="M16 3v26m-11-20 22 12m0-12L5 21m7-16 4 4 4-4m-8 20 4-4 4 4" /><path className="item-icon-magnet" d="M7 5v11a9 9 0 0 0 18 0V5h-6v11a3 3 0 0 1-6 0V5z" /><path className="item-icon-lightning" d="m18 2-12 17h8l-1 11 13-18h-8z" /><path className="item-icon-empty" d="M7 7h18v18H7zM11 11h10v10H11z" /></svg><span className="item-button-title">ITEM</span><strong data-item-name>EMPTY</strong><small>PRESS E</small></button>
        <div className="heat-widget" data-heat-widget data-zone={local?.zone || "cold"} data-overheated="false" aria-label="Runner heat">
          <div className="heat-heading"><b data-heat-label>HEAT</b><span data-heat-value>{Math.round(local?.heat || 0)}%</span><span className="heat-warning">▲</span></div>
          <div className="heat-track"><i className="heat-zone-cold" /><i className="heat-zone-sweet" /><i className="heat-zone-hot" /><b className="heat-marker" /></div>
          <strong className="zone-badge" data-zone-badge hidden>IN THE ZONE!</strong>
          <strong className="heat-message" data-cooling-countdown />
        </div>
        <button className="tap-button" data-tap-button onPointerDown={tap} aria-label="Tap to accelerate" disabled={tapDisabled}><span className="tap-rings" /><span className="overheat-label" aria-hidden="true">COOLING...</span><strong className="tap-touch-label">TAP!</strong><span className="tap-hint">OR PRESS SPACE</span>{Array.from({ length: 6 }, (_, index) => <span className="tap-popup" aria-hidden="true" key={index} ref={(element) => { tapPopupsRef.current[index] = element; }}>+1</span>)}</button>
      </div>
      {showPack && <div className="pack-sheet" ref={packSheetRef} aria-label="Race standings">{ordered.map(([id, player], index) => <div className={id === me?.id ? "is-you" : ""} key={id} data-runner-id={id}><b data-rank>{index + 1}</b><span style={{ color: player.color }}>{player.name}</span><small data-runner-speed>{id === me?.id ? "YOU" : `${Math.round(player.speed || 0)} SPD`}</small></div>)}</div>}
      {showTutorial && <div className="heat-tutorial" role="status">Tap in a steady rhythm. Don’t mash!<span aria-hidden="true">↓</span></div>}
      <div className="game-bottom-hint"><span>✳</span> KEEP YOUR RHYTHM TO BUILD A BONUS <span className="desktop-hint">· SPACE TO TAP</span></div>
    </div>
  );
}

export default memo(HUD);
