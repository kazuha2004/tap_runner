"use client";

const socketUrl =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001";

export function getServerHttpUrl() {
  return socketUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

export class GameSocket {
  constructor({ onMessage, onStatus }) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.closedByUser = false;
    this.reconnectDelay = 500;
    this.timer = null;
    this.joinDetails = null;
  }

  connect(code, name) {
    this.joinDetails = { type: "join", code, name };
    this.closedByUser = false;
    this.open();
  }

  open() {
    if (this.closedByUser) return;
    this.onStatus?.(this.reconnectDelay === 500 ? "connecting" : "reconnecting");
    const socket = new WebSocket(`${socketUrl}/ws`);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectDelay = 500;
      this.onStatus?.("connected");
      socket.send(JSON.stringify(this.joinDetails));
    };
    socket.onmessage = (event) => {
      try {
        this.onMessage?.(JSON.parse(event.data));
      } catch {
        this.onStatus?.("error");
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      if (this.closedByUser) {
        this.onStatus?.("disconnected");
        return;
      }
      if (event.code === 1008) {
        this.closedByUser = true;
        this.onStatus?.("error");
        return;
      }
      this.onStatus?.("reconnecting");
      this.timer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.7, 8000);
        this.open();
      }, this.reconnectDelay);
    };
  }

  send(type, data = {}) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...data }));
    }
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  leave() {
    this.closedByUser = true;
    clearTimeout(this.timer);
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave" }));
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "Player left the room");
    }
  }
}
