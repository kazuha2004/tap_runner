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
      <div className="home-cloud home-cloud-one" aria-hidden="true" />
      <div className="home-cloud home-cloud-two" aria-hidden="true" />
      <div className="home-cloud home-cloud-three" aria-hidden="true" />
      <div className="home-landscape" aria-hidden="true">
        <div className="home-hill home-hill-back" />
        <div className="home-hill home-hill-front" />
        <div className="home-track" />
      </div>
      <nav className="topbar">
        <a className="brand" href="/" aria-label="Tap Runners home">
          <span className="brand-mark" aria-hidden="true">↗</span>
          <span className="brand-name">TAP RUNNERS</span>
        </a>
        <span className="top-note"><i className="live-dot" /> MULTIPLAYER ARCADE</span>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> YOUR THUMBS. YOUR RHYTHM. YOUR RACE.</div>
          <h1><span className="headline-navy">RUN THE</span><span className="headline-orange">RHYTHM.</span></h1>
          <p className="hero-description">
            Tap to build speed. Find your flow. Leave everyone else in your dust.
          </p>
          <div className="feature-row">
            <span><b>1</b> Tap to accelerate</span>
            <span><b>2</b> Hold your rhythm</span>
            <span><b>3</b> Take the win</span>
          </div>
        </div>
        <section className="join-card">
          <div className="join-card-banner">READY, RUNNER?</div>
          <div className="join-card-content">
          <h2>Get in the race!</h2>
          <label className="field-label" htmlFor="player-name">Your runner name</label>
          <input
            id="player-name"
            className="text-field"
            maxLength={18}
            placeholder="e.g. Sunny Sprinter"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && createRoom()}
          />
          <button className="primary-button" onClick={createRoom} disabled={busy}>
            {busy ? "Making your room…" : "CREATE A ROOM"} <span>↗</span>
          </button>
          <div className="or-divider"><span /> OR JOIN A FRIEND <span /></div>
          <form className="join-row" onSubmit={joinRoom}>
            <input
              className="text-field code-input"
              aria-label="Room code"
              maxLength={4}
              placeholder="CODE"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button className="join-button" type="submit" aria-label="Join room">JOIN ↗</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="card-foot"><span aria-hidden="true">●</span> Up to 8 runners · 100–800m sprints · one winner</div>
          </div>
        </section>
      </section>
      <div className="home-bottom">
        <span>THE RACE IS BETTER TOGETHER</span>
        <span className="bottom-right">No download. Just go.</span>
      </div>
      {leftToast && <div className="home-toast" role="status">{leftToast}</div>}
    </main>
  );
}
