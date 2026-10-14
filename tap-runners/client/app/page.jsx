"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getServerHttpUrl } from "../lib/socket";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leftToast, setLeftToast] = useState("");

  useEffect(() => {
    try {
      const message = window.sessionStorage.getItem("tap-runners-toast");
      if (!message) return;
      window.sessionStorage.removeItem("tap-runners-toast");
      setLeftToast(message);
      const timer = setTimeout(() => setLeftToast(""), 2500);
      return () => clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, []);

  const enterRoom = (roomCode) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Add your runner name first.");
      return false;
    }
    router.push(`/room/${roomCode}?name=${encodeURIComponent(cleanName)}`);
    return true;
  };

  async function createRoom() {
    if (!name.trim()) {
      setError("Add your runner name first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${getServerHttpUrl()}/rooms`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create a room.");
      enterRoom(data.code);
    } catch (issue) {
      setError(issue.message || "Could not reach the race server.");
    } finally {
      setBusy(false);
    }
  }

  function joinRoom(event) {
    event.preventDefault();
    if (!/^[a-zA-Z]{4}$/.test(code.trim())) {
      setError("Room codes have 4 letters.");
      return;
    }
    enterRoom(code.trim().toUpperCase());
  }

  return (
    <main className="home-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <nav className="topbar">
        <a className="brand" href="/" aria-label="Tap Runners home">
          <span className="brand-mark">↗</span> TAP<span>RUNNERS</span>
        </a>
        <span className="top-note"><i className="live-dot" /> MULTIPLAYER ARCADE</span>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> YOUR THUMBS. YOUR RHYTHM. YOUR RACE.</div>
          <h1>RUN THE<br /><span>RHYTHM.</span></h1>
          <p className="hero-description">
            Tap to build speed. Find your flow. Leave everyone else in your dust.
          </p>
          <div className="feature-row">
            <span><b>01</b> TAP TO ACCELERATE</span>
            <span><b>02</b> HOLD YOUR RHYTHM</span>
            <span><b>03</b> TAKE THE WIN</span>
          </div>
        </div>
        <section className="join-card">
          <div className="card-kicker">READY, RUNNER?</div>
          <h2>Get in the race.</h2>
          <label className="field-label" htmlFor="player-name">YOUR RUNNER NAME</label>
          <input
            id="player-name"
            className="text-field"
            maxLength={18}
            placeholder="e.g. Neon Nova"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && createRoom()}
          />
          <button className="primary-button" onClick={createRoom} disabled={busy}>
            {busy ? "MAKING YOUR ROOM..." : "CREATE A ROOM"} <span>↗</span>
          </button>
          <div className="or-divider"><span /> OR JOIN A FRIEND <span /></div>
          <form className="join-row" onSubmit={joinRoom}>
            <input
              className="text-field code-input"
              aria-label="Room code"
              maxLength={4}
              placeholder="ROOM CODE"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button className="join-button" type="submit" aria-label="Join room">JOIN ↗</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="card-foot"><span>◎</span> UP TO 8 RUNNERS · 100–800M SPRINTS · ONE WINNER</div>
        </section>
      </section>
      <div className="home-bottom">
        <div className="track-decoration"><span /><span /><span /></div>
        <span>THE RACE IS BETTER TOGETHER</span>
        <span className="bottom-right">NO DOWNLOAD. JUST GO.</span>
      </div>
      {leftToast && <div className="home-toast" role="status">{leftToast}</div>}
    </main>
  );
}
