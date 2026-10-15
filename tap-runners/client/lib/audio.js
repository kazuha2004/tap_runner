"use client";

let context;
let master;
let lastTapAt = 0;
const buffers = new Map();

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.7;
    master.connect(context.destination);
  }
  if (context.state === "suspended") context.resume();
  return context;
}

function getToneBuffer(audioContext, frequency, duration, type) {
  const key = `${frequency}:${duration}:${type}`;
  if (buffers.has(key)) return buffers.get(key);
  const sampleRate = audioContext.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const samples = buffer.getChannelData(0);
  const harmonics = type === "square" ? 8 : type === "triangle" ? 12 : 1;
  for (let index = 0; index < length; index += 1) {
    const progress = index / length;
    const envelope = Math.min(1, progress * 35, (1 - progress) * 18);
    let sample = 0;
    for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
      if ((type === "square" || type === "triangle") && harmonic % 2 === 0) continue;
      const weight = type === "square"
        ? 1 / harmonic
        : type === "triangle"
          ? ((harmonic % 4 === 1 ? 1 : -1) / (harmonic * harmonic))
          : 1;
      sample += Math.sin(2 * Math.PI * frequency * harmonic * progress * duration) * weight;
    }
    samples[index] = sample * envelope * (type === "sine" ? 1 : 0.75);
  }
  buffers.set(key, buffer);
  return buffer;
}

export function playTone(frequency, duration = 0.12, type = "sine", isTap = false, when = 0) {
  const now = performance.now();
  if (isTap && now - lastTapAt < 60) return;
  if (isTap) lastTapAt = now;
  const audioContext = getAudioContext();
  if (!audioContext || !master) return;
  const source = audioContext.createBufferSource();
  source.buffer = getToneBuffer(audioContext, frequency, duration, type);
  source.connect(master);
  source.start(Math.max(audioContext.currentTime, audioContext.currentTime + when));
}

export function playToneSequence(notes) {
  notes.forEach(([frequency, delay, duration = 0.38, type = "triangle"]) => {
    playTone(frequency, duration, type, false, delay);
  });
}
