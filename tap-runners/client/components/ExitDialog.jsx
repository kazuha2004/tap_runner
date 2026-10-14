"use client";

import { useEffect, useRef, useState } from "react";

export default function ExitDialog({ open, title, message, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const stayRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) {
      if (!mounted) return undefined;
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        previousFocusRef.current?.focus?.();
      }, 150);
      return () => clearTimeout(timer);
    }
    setMounted(true);
    setClosing(false);
    previousFocusRef.current = document.activeElement;
    stayRef.current?.focus();
    function trapFocus(event) {
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll("button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <div
      className={`exit-backdrop ${closing ? "closing" : ""}`}
      onMouseDown={(event) => {
        if (!closing && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        aria-describedby="exit-message"
        ref={dialogRef}
      >
        <div className="runner-face" aria-hidden="true">🏃</div>
        <h2 id="exit-title">{title}</h2>
        <p id="exit-message">{message}</p>
        <div className="exit-dialog-actions">
          <button className="stay-button" ref={stayRef} disabled={closing} onClick={onClose}>STAY</button>
          <button className="leave-button" disabled={closing} onClick={onConfirm}>LEAVE</button>
        </div>
      </section>
    </div>
  );
}
