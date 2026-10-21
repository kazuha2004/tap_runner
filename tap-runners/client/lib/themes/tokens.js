const fogNear = 90;
const fogFar = 150;

export const THEME_TOKENS = Object.freeze({
  "sunny-stadium": {
    skyGradient: ["#2783d1", "#c8f3ff"],
    fogColor: "#c8f3ff",
    fogNear,
    fogFar,
    groundColor: "#65ad59",
    trackColor: "#b94243",
    laneLineColor: "#fffdf5",
    accentColor: "#f2bd45",
    propPalette: ["#527e55", "#789768", "#328a50", "#65ad54"],
    light: {
      sun: "#fff2a3",
      key: "#fff6dd",
      hemiSky: "#c9edff",
      hemiGround: "#6a8e52",
      direction: [-85, 145, 65],
      position: [-85, 92, -140],
      intensity: 2.55,
      fillIntensity: 0.72,
      exposure: 1.18,
    },
    particleType: "dust",
  },
  "candy-sunset": {
    skyGradient: ["#704caa", "#ffbd91"],
    fogColor: "#ffbd91",
    fogNear,
    fogFar,
    groundColor: "#78ac67",
    trackColor: "#a83d58",
    laneLineColor: "#fffdf5",
    accentColor: "#73d3df",
    propPalette: ["#6f4698", "#97639e", "#507456", "#8b8065"],
    light: {
      sun: "#fff0b0",
      key: "#ffd0ad",
      hemiSky: "#ffb9a6",
      hemiGround: "#71507d",
      direction: [110, 64, -120],
      position: [110, 54, -330],
      intensity: 2.2,
      fillIntensity: 0.72,
      exposure: 1.12,
    },
    particleType: "petals",
  },
  "desert-run": {
    skyGradient: ["#d58b2f", "#ffe5a2"],
    fogColor: "#ffe5a2",
    fogNear,
    fogFar,
    groundColor: "#e4c17b",
    trackColor: "#963f34",
    laneLineColor: "#fffdf5",
    accentColor: "#58c6dd",
    propPalette: ["#ba9253", "#d1ad6a", "#547747", "#77904e"],
    light: {
      sun: "#fff0bc",
      key: "#ffe3ad",
      hemiSky: "#ffdf94",
      hemiGround: "#987d50",
      direction: [-125, 112, 115],
      position: [-125, 95, -150],
      intensity: 2.45,
      fillIntensity: 0.8,
      exposure: 1.12,
    },
    particleType: "sand",
  },
  "snow-peak": {
    skyGradient: ["#4e8db8", "#d8efff"],
    fogColor: "#d8efff",
    fogNear,
    fogFar,
    groundColor: "#e7f0f0",
    trackColor: "#485861",
    laneLineColor: "#fffdf5",
    accentColor: "#f0a94b",
    propPalette: ["#8fa9b2", "#c5d7dc", "#2b716c", "#448985"],
    light: {
      sun: "#fff8db",
      key: "#ecf7ff",
      hemiSky: "#e0f4ff",
      hemiGround: "#8298a1",
      direction: [80, 115, 145],
      position: [80, 68, -220],
      intensity: 2.25,
      fillIntensity: 0.78,
      exposure: 1.16,
    },
    particleType: "snow",
  },
});

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function validateThemeTokens(tokens = THEME_TOKENS) {
  return Object.entries(tokens).flatMap(([id, theme]) => {
    const issues = [];
    const trackLuminance = luminance(theme.trackColor);
    const groundLuminance = luminance(theme.groundColor);
    const contrast = (Math.max(trackLuminance, groundLuminance) + 0.05)
      / (Math.min(trackLuminance, groundLuminance) + 0.05);
    if (contrast < 1.5) issues.push(`track/ground contrast is ${contrast.toFixed(2)}:1`);
    if (theme.fogNear < 60) issues.push("fog begins closer than 60m");
    if (theme.fogColor.toLowerCase() !== theme.skyGradient[1].toLowerCase()) {
      issues.push("fog color does not match the sky horizon");
    }
    if (issues.length) console.warn(`[Tap Runners] Theme "${id}" is hard to read: ${issues.join("; ")}.`);
    return issues.map((message) => ({ theme: id, message }));
  });
}

if (process.env.NODE_ENV !== "production") validateThemeTokens();
