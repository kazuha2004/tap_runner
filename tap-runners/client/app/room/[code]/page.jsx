"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import GameCanvas from "../../../components/GameCanvas";
import HUD from "../../../components/HUD";
import Lobby from "../../../components/Lobby";
import ExitDialog from "../../../components/ExitDialog";
import ResultsPanel from "../../../components/ResultsPanel";
import { GameSocket } from "../../../lib/socket";
import { DEFAULT_THEME } from "../../../lib/themes";

function playVictorySound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    [659, 784, 988, 1319].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, context.currentTime + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + index * 0.1 + 0.38);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.1);
      oscillator.stop(context.currentTime + index * 0.1 + 0.38);
    });
    setTimeout(() => context.close(), 900);
  } catch {
    // Browser audio is optional.
  }
}

export default function RoomPage() {
  const { code: routeCode } = useParams();
  const searchParams = useSearchParams();
  const initialNameFromUrl = (searchParams.get("name") || "").trim();
  const router = useRouter();
  const code = String(routeCode || "").toUpperCase();
  const [name, setName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [joined, setJoined] = useState(null);
  const [players, setPlayers] = useState([]);
  const [host, setHost] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState(DEFAULT_THEME);
  const [raceDistance, setRaceDistance] = useState(200);
  const [gameState, setGameState] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [results, setResults] = useState(null);
  const [personalBest, setPersonalBest] = useState(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [slowMotion, setSlowMotion] = useState(false);
  const [toasts, setToasts] = useState([]);
  const socketRef = useRef(null);
  const joinedIdRef = useRef(null);
  const leavingRef = useRef(false);
  const navigationTimerRef = useRef(null);
  const lastUiStateAtRef = useRef(0);
  const latestGameStateRef = useRef(null);
  const celebratedFinishRef = useRef(null);
  const recordedResultRef = useRef(null);
  const toastTimersRef = useRef(new Set());
  joinedIdRef.current = joined?.id || null;

  const showToast = useCallback((message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimersRef.current.delete(timer);
    }, 2500);
    toastTimersRef.current.add(timer);
  }, []);

  const handleMessage = useCallback((message) => {
    if (message.type === "joined") {
      setJoined(message.me);
      setName(message.me.name);
      setError("");
      return;
    }
    if (message.type === "lobby") {
      setPlayers(message.players || []);
      setHost(message.host);
      setSelectedTheme(message.theme || DEFAULT_THEME);
      setRaceDistance(message.raceDistance || 200);
      if (message.phase === "lobby") {
        latestGameStateRef.current = null;
        celebratedFinishRef.current = null;
        recordedResultRef.current = null;
        setGameState(null);
        setCountdown(null);
        setResults(null);
        setSlowMotion(false);
        setPersonalBest(null);
        setIsNewBest(false);
      }
      return;
    }
    if (message.type === "countdown") {
      setCountdown(message.n);
      return;
    }
    if (message.type === "state") {
      const localBefore = latestGameStateRef.current?.players?.[joinedIdRef.current];
      const localNow = message.players?.[joinedIdRef.current];
      const justFinished = localNow?.finishPlace && !localBefore?.finishPlace;
      latestGameStateRef.current = message;
      const now = performance.now();
      if (justFinished || now - lastUiStateAtRef.current >= 100 || message.state === "finished") {
        setGameState(message);
        lastUiStateAtRef.current = now;
      }
      setCountdown(null);
      return;
    }
    if (message.type === "results") {
      setResults(message);
      setExitOpen(false);
      return;
    }
    if (message.type === "playerLeft") {
      showToast(`${message.name} left the race`);
      return;
    }
    if (message.type === "error") setError(message.msg);
  }, [showToast]);

  const connect = useCallback((playerName) => {
    setError("");
    setName(playerName);
    leavingRef.current = false;
    const socket = new GameSocket({
      onMessage: handleMessage,
      onStatus: (status) => setConnection(status),
    });
    socketRef.current?.close();
    socketRef.current = socket;
    socket.connect(code, playerName);
  }, [code, handleMessage]);

  useEffect(() => {
    setNameInput(initialNameFromUrl);
    if (initialNameFromUrl) connect(initialNameFromUrl);
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      toastTimersRef.current.forEach(clearTimeout);
      toastTimersRef.current.clear();
      clearTimeout(navigationTimerRef.current);
    };
  }, [connect, initialNameFromUrl]);

  const send = useCallback((type, data) => socketRef.current?.send(type, data), []);
  const tap = useCallback(() => send("tap"), [send]);
  const isRacing = gameState?.state === "racing";
  const isFinished = Boolean(results || gameState?.state === "finished");
  const isHost = joined?.id === host;
  const countdownActive = countdown !== null;
  const localState = gameState?.players?.[joined?.id];
  const localFinishPlace = localState?.finishPlace;
  const localFinished = Boolean(localFinishPlace);
  const tapsDisabled = exitOpen || !isRacing || localFinished;

  useEffect(() => {
    if (!joined || leaving) return undefined;
    window.history.pushState({ tapRunnersRoom: true }, "", window.location.href);
    function onPopState() {
      setExitOpen(true);
      window.history.pushState({ tapRunnersRoom: true }, "", window.location.href);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [joined, leaving]);

  useEffect(() => {
    if (!joined) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExitOpen((open) => !open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [joined]);

  useEffect(() => {
    if (!isRacing && !countdownActive) return undefined;
    function warnBeforeLeave(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [isRacing, countdownActive]);

  useEffect(() => {
    if (!localFinishPlace || !joined) return undefined;
    const celebrationKey = `${joined.id}:${localFinishPlace}`;
    if (celebratedFinishRef.current === celebrationKey) return undefined;
    celebratedFinishRef.current = celebrationKey;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!muted && localFinishPlace === 1) playVictorySound();
    if (localFinishPlace === 1 && !reduced) {
      setSlowMotion(true);
      const timer = setTimeout(() => setSlowMotion(false), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [joined, localFinishPlace, muted]);

  useEffect(() => {
    if (!results || !joined) return;
    const runner = results.players.find((player) => player.id === joined.id);
    if (!runner || runner.time === null) return;
    const resultKey = `${code}:${results.distance}:${runner.time}`;
    if (recordedResultRef.current === resultKey) return;
    recordedResultRef.current = resultKey;
    const key = `tap-runners-best-${results.distance}`;
    let previous = null;
    try {
      const stored = Number(window.localStorage.getItem(key));
      if (Number.isFinite(stored) && stored > 0) previous = stored;
      const improved = previous === null || runner.time < previous;
      if (improved) window.localStorage.setItem(key, String(runner.time));
      setPersonalBest(improved ? runner.time : previous);
      setIsNewBest(improved);
    } catch {
      setPersonalBest(previous);
      setIsNewBest(false);
    }
  }, [code, joined, results]);

  const openExit = () => setExitOpen(true);
  const closeExit = () => setExitOpen(false);
  const confirmExit = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setExitOpen(false);
    socketRef.current?.leave();
    socketRef.current = null;
    try {
      window.sessionStorage.setItem("tap-runners-toast", "You left the room");
    } catch {
      // Navigation should still complete when storage is unavailable.
    }
    navigationTimerRef.current = setTimeout(() => router.push("/"), 200);
  };

  const exitTitle = results ? "Leave the room?" : isRacing || countdownActive ? "Leave the race?" : "Leave the lobby?";
  const exitMessage = players.length <= 1
    ? "The room will be closed."
    : isHost
      ? "You are the host. Leaving will pass host to another player."
      : isRacing || countdownActive
        ? "You will lose your spot and your progress."
        : "You can rejoin later using the room link.";

  const shareResult = async () => {
    const runner = results?.players.find((player) => player.id === joined?.id);
    const placeText = runner?.place === 1 ? "won" : runner?.place ? `placed ${runner.place}${runner.place === 2 ? "nd" : runner.place === 3 ? "rd" : "th"}` : "raced";
    const text = `I ${placeText} the ${results?.distance}m in ${runner?.time?.toFixed(2) || "—"}s on Tap Runners!`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Result copied to clipboard");
    } catch {
      setError("Could not copy your result. Please check clipboard permissions.");
    }
  };

  if (leaving) {
    return <main className="leave-transition" role="status">Leaving the race…</main>;
  }

  if (!joined && connection !== "reconnecting" && connection !== "error" && !name) {
    return (
      <main className="name-gate">
        <div className="gate-card">
          <a className="brand" href="/">↗ TAP<span>RUNNERS</span></a>
          <div className="card-kicker">YOU’RE INVITED TO</div>
          <h1>ROOM <span>{code}</span></h1>
          <p>Pick a runner name and jump into the race.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (nameInput.trim()) connect(nameInput.trim()); }}>
            <label className="field-label" htmlFor="join-name">YOUR RUNNER NAME</label>
            <input id="join-name" className="text-field" maxLength={18} value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="e.g. Neon Nova" autoFocus />
            <button className="primary-button">JOIN THE RACE <span>↗</span></button>
          </form>
          {error && <p className="form-error">{error}</p>}
        </div>
      </main>
    );
  }

  if (!joined && (connection === "error" || connection === "reconnecting")) {
    return (
      <main className="name-gate">
        <div className="gate-card">
          <a className="brand" href="/">↗ TAP<span>RUNNERS</span></a>
          <div className="card-kicker">ROOM {code}</div>
          <h1>{connection === "reconnecting" ? "RECONNECTING" : "CAN’T JOIN"}</h1>
          <p className={connection === "reconnecting" ? "" : "form-error"}>{error || "Trying to reach the race..."}</p>
          {connection === "error" && <form onSubmit={(event) => { event.preventDefault(); if (nameInput.trim()) connect(nameInput.trim()); }}><input className="text-field" value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="Runner name" /><button className="primary-button">TRY AGAIN ↗</button></form>}
        </div>
      </main>
    );
  }

  const showRaceView = isRacing || countdownActive || isFinished;
  return (
    <main className={`room-page ${!showRaceView ? "in-lobby" : ""} ${isRacing ? "racing" : ""} ${leaving ? "leaving-room" : ""}`}>
      <header className="room-topbar">
        <button className="room-exit-button" onClick={openExit} aria-label="Leave room">×</button>
        <a className="brand" href="/">↗ TAP<span>RUNNERS</span></a>
        <div className="room-code-pill"><span>ROOM</span>{code}</div>
        <div className="room-actions">
          <span className={`connection-badge ${connection === "connected" ? "" : "warning"}`}>
            <i /> {connection === "connected" ? "LIVE" : connection === "error" ? "OFFLINE" : "RECONNECTING"}
          </span>
          <button className="icon-button sound-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute sound" : "Mute sound"}>{muted ? "◌" : "♫"}</button>
        </div>
      </header>
      {connection === "reconnecting" && <div className="reconnect-banner">Connection lost — reconnecting to the race…</div>}
      {error && <div className="room-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}

      {!showRaceView ? (
        <>
          <Lobby
            code={code}
            players={players}
            host={host}
            me={joined}
            isHost={isHost}
            selectedTheme={selectedTheme}
            raceDistance={raceDistance}
            onSelectDistance={(meters) => send("setDistance", { meters })}
            onSelectTheme={(selected) => send("setTheme", { theme: selected })}
            onStart={() => send("start")}
            onCopy={() => navigator.clipboard.writeText(`${window.location.origin}/room/${code}`)}
          />
          <GameCanvas state={null} me={joined} muted={muted} countdown={null} theme={selectedTheme} raceDistance={raceDistance} previewOnly />
        </>
      ) : (
        <>
          <GameCanvas
            state={gameState}
            me={joined}
            muted={muted}
            countdown={countdown}
            theme={selectedTheme}
            raceDistance={raceDistance}
            slowMotion={slowMotion}
          />
          <HUD
            state={gameState}
            me={joined}
            players={players}
            countdown={countdown}
            onTap={tap}
            muted={muted}
            tapDisabled={tapsDisabled}
          />
          {localFinished && !results && (
            <section className={`finish-banner finish-place-${localFinishPlace}`} aria-live="assertive">
              {localFinishPlace === 1 && <div className="finish-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ left: `${4 + index * 7}%`, animationDelay: `${index * 22}ms` }} />)}</div>}
              <div className="finish-medal">{localFinishPlace <= 3 ? ["", "🥇", "🥈", "🥉"][localFinishPlace] : "🏁"}</div>
              <h1>{localFinishPlace === 1 ? "YOU WON!" : localFinishPlace === 2 ? "2ND PLACE!" : localFinishPlace === 3 ? "3RD PLACE!" : `FINISHED! ${localFinishPlace}TH`}</h1>
              <p>{localFinishPlace === 1 ? "What a run! You took the crown." : localFinishPlace <= 3 ? "Brilliant sprint. You made the podium!" : "Great effort — every tap counted."}</p>
              {isRacing && <small>Waiting for others… {Math.ceil(gameState?.dnfIn || 0)}s</small>}
            </section>
          )}
          {results && (
            <ResultsPanel
              results={results}
              me={joined}
              isHost={isHost}
              personalBest={personalBest}
              isNewBest={isNewBest}
              onPlayAgain={() => send("playAgain")}
              onBackToLobby={() => send("backToLobby")}
              onShare={shareResult}
              onExit={openExit}
            />
          )}
        </>
      )}

      {toasts.length > 0 && <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className="room-toast" key={toast.id}>{toast.message}</div>)}</div>}
      <ExitDialog open={exitOpen} title={exitTitle} message={exitMessage} onClose={closeExit} onConfirm={confirmExit} />
    </main>
  );
}
