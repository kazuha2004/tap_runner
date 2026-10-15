export const QUALITY = {
  HIGH: {
    id: "HIGH",
    pixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    crowdScale: 1,
    crowdAnimationInterval: 1,
    fogScale: 1,
    cameraFar: 3000,
    targetFps: 60,
  },
  MEDIUM: {
    id: "MEDIUM",
    pixelRatio: 1.5,
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    crowdScale: 0.35,
    crowdAnimationInterval: 2,
    fogScale: 0.68,
    cameraFar: 650,
    targetFps: 60,
  },
  LOW: {
    id: "LOW",
    pixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    crowdScale: 0.1,
    crowdAnimationInterval: 0,
    fogScale: 0.48,
    cameraFar: 400,
    targetFps: 30,
  },
};

let activeQuality = QUALITY.HIGH;

export function setSceneQuality(id) {
  activeQuality = QUALITY[id] || QUALITY.HIGH;
}

export function getSceneQuality() {
  return activeQuality;
}

export function detectQualityPreset() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "HIGH";

  const mobileUserAgent = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const narrowScreen = window.innerWidth < 900;
  const mobile = mobileUserAgent || coarsePointer || narrowScreen;
  if (!mobile) return "HIGH";

  const cores = navigator.hardwareConcurrency || 0;
  const memory = navigator.deviceMemory || 0;
  if ((cores > 0 && cores <= 2) || (memory > 0 && memory <= 2)) return "LOW";
  if (narrowScreen && (cores > 0 && cores <= 4) && (memory > 0 && memory <= 4)) return "LOW";
  return "MEDIUM";
}
