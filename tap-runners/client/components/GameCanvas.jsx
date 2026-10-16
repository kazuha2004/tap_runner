"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  cullTrackWorld,
  createTrackWorld,
  disposeTrackWorld,
  LANE_COUNT,
  LANE_WIDTH,
} from "../lib/trackWorld";
import { getTheme } from "../lib/themes";
import { detectQualityPreset, QUALITY, setSceneQuality } from "../lib/quality";
import { playTone, playToneSequence } from "../lib/audio";

function makeNameLabel(name, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 88;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "rgba(255, 255, 255, 0.93)";
  context.beginPath();
  context.roundRect(10, 10, 300, 68, 18);
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = "#233448";
  context.font = "700 29px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, 160, 45, 272);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  label.scale.set(2.15, 0.6, 1);
  return label;
}

function makeRunnerStatusLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 52;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  }));
  sprite.scale.set(0.9, 0.29, 1);
  sprite.position.y = 1.92;
  sprite.visible = false;
  let previousLabel = "";
  sprite.userData.updateLabel = (item, effects = [], incoming = false, stunned = false) => {
    const codes = {
      TURBO: "T",
      BOOST: "BOOST",
      SHIELD: "S",
      ROCKET: "RKT",
      SLOW_TRAP: "ICE",
      COOL_DOWN: "COOL",
      MAGNET: "MAG",
      LIGHTNING: "L",
      PAD: "PAD",
    };
    let label = stunned ? "STUNNED" : incoming ? "INCOMING" : item ? codes[item] || "" : "";
    for (let index = 0; index < effects.length && label.split("  ").length < 2; index += 1) {
      const code = codes[effects[index].name];
      if (code && !label.includes(code)) label += `${label ? "  " : ""}${code}`;
    }
    if (label === previousLabel) return;
    previousLabel = label;
    sprite.visible = Boolean(label);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (label) {
      context.fillStyle = incoming || stunned ? "rgba(255,232,228,.98)" : "rgba(255,255,255,.96)";
      context.beginPath();
      context.roundRect(5, 4, 150, 44, 15);
      context.fill();
      context.strokeStyle = incoming || stunned ? "#db514b" : "#d6e7e9";
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = incoming || stunned ? "#a52f34" : "#1b2a49";
      context.font = "bold 25px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, 80, 26);
    }
    texture.needsUpdate = true;
  };
  return sprite;
}

export default function GameCanvas({
  state,
  me,
  muted,
  countdown,
  theme = "sunny-stadium",
  raceDistance = 200,
  previewOnly = false,
  slowMotion = false,
  resultsOpen = false,
  stateSnapshotRef,
  itemBoxes = [],
  boostPads = [],
  itemEvents = [],
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(state);
  const meRef = useRef(me);
  const mutedRef = useRef(muted);
  const themeRef = useRef(theme);
  const countdownRef = useRef(countdown);
  const raceDistanceRef = useRef(raceDistance);
  const finishRef = useRef(false);
  const slowMotionRef = useRef(slowMotion);
  const reducedMotionRef = useRef(false);
  const resultsOpenRef = useRef(resultsOpen);
  const itemBoxesRef = useRef(itemBoxes);
  const boostPadsRef = useRef(boostPads);
  const itemEventsRef = useRef(itemEvents);
  const qualityRef = useRef("HIGH");
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({ fps: 0, calls: 0, triangles: 0, quality: "HIGH" });
  const showStatsRef = useRef(showStats);

  stateRef.current = state;
  meRef.current = me;
  mutedRef.current = muted;
  themeRef.current = theme;
  countdownRef.current = countdown;
  raceDistanceRef.current = raceDistance;
  slowMotionRef.current = slowMotion;
  resultsOpenRef.current = resultsOpen;
  itemBoxesRef.current = itemBoxes;
  boostPadsRef.current = boostPads;
  itemEventsRef.current = itemEvents;
  showStatsRef.current = showStats;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    let frameId = 0;
    let resizeObserver;
    let resizeTimer;
    let lastRenderAt = 0;
    let qualityWindowStart = performance.now();
    let qualityWindowFrames = 0;
    let statsWindowStart = performance.now();
    let statsWindowFrames = 0;
    let sceneFrame = 0;
    const scene = new THREE.Scene();
    qualityRef.current = detectQualityPreset();
    setSceneQuality(qualityRef.current);
    const activeTheme = getTheme(themeRef.current);
    scene.background = new THREE.Color(activeTheme.fog);
    const initialQuality = QUALITY[qualityRef.current];
    scene.fog = new THREE.Fog(
      activeTheme.fog,
      activeTheme.fogNear * initialQuality.fogScale,
      activeTheme.fogFar * initialQuality.fogScale,
    );

    const camera = new THREE.PerspectiveCamera(49, 1, 0.1, initialQuality.cameraFar);
    camera.position.set(0, 10, 25);
    camera.lookAt(0, 1, -25);
    const desiredCameraPosition = new THREE.Vector3();

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: initialQuality.antialias,
        alpha: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
    } catch {
      mount.innerHTML = '<div class="graphics-fallback">Your browser could not start the 3D race view.</div>';
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, initialQuality.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = initialQuality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = qualityRef.current === "HIGH";
    renderer.domElement.className = "race-canvas";
    mount.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(
      activeTheme.hemiSky,
      activeTheme.hemiGround,
      2.1,
    );
    scene.add(hemisphere);

    const sunlight = new THREE.DirectionalLight(activeTheme.keyLight, activeTheme.sunIntensity);
    sunlight.position.set(...activeTheme.sunDirection);
    sunlight.castShadow = initialQuality.shadows;
    sunlight.shadow.mapSize.set(initialQuality.shadowMapSize || 512, initialQuality.shadowMapSize || 512);
    sunlight.shadow.camera.left = -95;
    sunlight.shadow.camera.right = 95;
    sunlight.shadow.camera.top = 95;
    sunlight.shadow.camera.bottom = -95;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 520;
    sunlight.shadow.bias = -0.0003;
    scene.add(sunlight);

    const fillLight = new THREE.DirectionalLight(activeTheme.hemiSky, 0.72);
    fillLight.position.set(70, 48, -120);
    if (qualityRef.current === "HIGH") scene.add(fillLight);

    let world = createTrackWorld(
      themeRef.current,
      raceDistanceRef.current,
      itemBoxesRef.current,
      boostPadsRef.current,
    );
    scene.add(world.root);
    function applyWorldShadowPolicy(targetWorld, id) {
      targetWorld.root.traverse((object) => {
        if (object.isMesh || object.isInstancedMesh) {
          if (id !== "HIGH") object.castShadow = false;
        }
      });
    }
    applyWorldShadowPolicy(world, qualityRef.current);
    function applyQuality(nextId) {
      const nextQuality = QUALITY[nextId];
      if (!nextQuality || nextId === qualityRef.current) return;
      qualityRef.current = nextId;
      setSceneQuality(nextId);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nextQuality.pixelRatio));
      renderer.shadowMap.enabled = nextQuality.shadows;
      renderer.shadowMap.autoUpdate = nextId === "HIGH";
      renderer.shadowMap.needsUpdate = true;
      sunlight.castShadow = nextQuality.shadows;
      sunlight.shadow.map?.dispose();
      sunlight.shadow.map = null;
      sunlight.shadow.mapSize.set(nextQuality.shadowMapSize || 512, nextQuality.shadowMapSize || 512);
      if (nextId === "HIGH" && !fillLight.parent) scene.add(fillLight);
      if (nextId !== "HIGH" && fillLight.parent) scene.remove(fillLight);
      for (const [id, runner] of runners) {
        const shouldCastShadow = nextId === "HIGH"
          || (nextId === "MEDIUM" && id === meRef.current?.id);
        runner.group.traverse((object) => {
          if (object.isMesh) object.castShadow = shouldCastShadow;
        });
      }
      camera.far = nextQuality.cameraFar;
      camera.updateProjectionMatrix();
      scene.fog = new THREE.Fog(
        getTheme(themeRef.current).fog,
        getTheme(themeRef.current).fogNear * nextQuality.fogScale,
        getTheme(themeRef.current).fogFar * nextQuality.fogScale,
      );
      disposeTrackWorld(world);
      world = createTrackWorld(
        themeRef.current,
        raceDistanceRef.current,
        itemBoxesRef.current,
        boostPadsRef.current,
      );
      scene.add(world.root);
      applyWorldShadowPolicy(world, nextId);
      renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight), false);
    }
    let activeThemeId = themeRef.current;
    let finishSoundPlayed = false;
    let previousFrameTime = performance.now();
    let animationTime = 0;
    let cameraShakeUntil = 0;
    let observedSnapshot = null;
    let activeItemBoxes = itemBoxesRef.current;
    let activeBoostPads = boostPadsRef.current;
    const processedItemEvents = new Set();
    const snapshotHistory = [];
    const runners = new Map();
    const suitMaterials = new Map();
    const trailMaterials = new Map();
    const sharedRunnerGeometries = {
      body: new THREE.CapsuleGeometry(0.2, 0.48, 2, qualityRef.current === "HIGH" ? 7 : 5),
      head: new THREE.SphereGeometry(0.18, qualityRef.current === "HIGH" ? 10 : 7, qualityRef.current === "HIGH" ? 8 : 5),
      arm: null,
      leg: null,
      ring: new THREE.TorusGeometry(0.45, 0.055, 6, qualityRef.current === "HIGH" ? 24 : 12),
      trail: new THREE.BoxGeometry(0.16, 0.12, 1.6),
      shield: new THREE.SphereGeometry(1, qualityRef.current === "HIGH" ? 16 : 10, qualityRef.current === "HIGH" ? 12 : 8),
      puddle: new THREE.CylinderGeometry(1, 1, 0.045, qualityRef.current === "HIGH" ? 16 : 10),
    };
    function mergeParts(parts) {
      const geometries = parts.map(([geometry, x, y, z]) => {
        const copy = geometry.clone();
        copy.translate(x, y, z);
        geometry.dispose();
        return copy;
      });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error("Could not merge runner rig geometry.");
      merged.computeVertexNormals();
      return merged;
    }
    const limbSegments = qualityRef.current === "HIGH" ? 5 : 4;
    sharedRunnerGeometries.arm = mergeParts([
      [new THREE.SphereGeometry(0.09, limbSegments * 2, limbSegments), 0, 0, 0],
      [new THREE.CapsuleGeometry(0.075, 0.32, 2, limbSegments), 0, -0.19, 0],
      [new THREE.SphereGeometry(0.075, limbSegments * 2, limbSegments), 0, -0.39, 0],
    ]);
    sharedRunnerGeometries.leg = mergeParts([
      [new THREE.CapsuleGeometry(0.09, 0.31, 2, limbSegments), 0, -0.15, 0],
      [new THREE.SphereGeometry(0.065, limbSegments * 2, limbSegments), 0, -0.28, 0],
      [new THREE.BoxGeometry(0.16, 0.1, 0.28), 0, -0.35, 0.055],
    ]);
    const runnerMaterial = (color, roughness = 0.74) => qualityRef.current === "HIGH"
      ? new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.025 })
      : new THREE.MeshLambertMaterial({ color });
    const skinMaterial = runnerMaterial("#f2bd91", 0.8);
    const pantsMaterial = runnerMaterial("#263b4c");
    const ringMaterial = new THREE.MeshBasicMaterial({ color: "#fff071" });
    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: "#78bfe0",
      transparent: true,
      opacity: 0.27,
      depthWrite: false,
    });
    const shieldPatternMaterial = new THREE.MeshBasicMaterial({
      color: "#e9fbff",
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
    });
    const puddleMaterial = runnerMaterial("#8cae88");
    const rocketMaterial = qualityRef.current === "HIGH"
      ? new THREE.MeshStandardMaterial({ color: "#e34e45", roughness: 0.38, metalness: 0.18 })
      : new THREE.MeshLambertMaterial({ color: "#e34e45" });
    const rocketNoseMaterial = runnerMaterial("#f8dfb5", 0.42);
    const rocketFlameMaterial = new THREE.MeshBasicMaterial({ color: "#ff9a3c" });
    const rocketGeometry = {
      body: new THREE.CylinderGeometry(0.105, 0.105, 0.58, qualityRef.current === "HIGH" ? 12 : 7),
      nose: new THREE.ConeGeometry(0.15, 0.3, qualityRef.current === "HIGH" ? 12 : 7),
      fin: new THREE.BoxGeometry(0.08, 0.24, 0.22),
      flame: new THREE.ConeGeometry(0.11, 0.28, qualityRef.current === "HIGH" ? 10 : 6),
    };
    const rocketPool = Array.from(
      { length: qualityRef.current === "HIGH" ? 12 : qualityRef.current === "MEDIUM" ? 8 : 4 },
      () => {
        const group = new THREE.Group();
        const body = new THREE.Mesh(rocketGeometry.body, rocketMaterial);
        const nose = new THREE.Mesh(rocketGeometry.nose, rocketNoseMaterial);
        const flame = new THREE.Mesh(rocketGeometry.flame, rocketFlameMaterial);
        body.position.y = -0.02;
        nose.position.y = 0.4;
        flame.position.y = -0.45;
        flame.rotation.z = Math.PI;
        group.add(body, nose, flame);
        for (const side of [-1, 1]) {
          const fin = new THREE.Mesh(rocketGeometry.fin, rocketMaterial);
          fin.position.set(side * 0.13, -0.2, 0);
          group.add(fin);
        }
        group.visible = false;
        scene.add(group);
        return { group, id: null };
      },
    );
    const rocketSmokeCount = rocketPool.length * (qualityRef.current === "HIGH" ? 8 : 5);
    const rocketSmokePositions = new Float32Array(rocketSmokeCount * 3);
    const rocketSmokeGeometry = new THREE.BufferGeometry();
    rocketSmokeGeometry.setAttribute("position", new THREE.BufferAttribute(rocketSmokePositions, 3));
    const rocketSmokeMaterial = new THREE.PointsMaterial({
      color: "#d9e0e0",
      size: qualityRef.current === "LOW" ? 0.07 : 0.09,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const rocketSmoke = new THREE.Points(rocketSmokeGeometry, rocketSmokeMaterial);
    rocketSmoke.frustumCulled = false;
    rocketSmoke.visible = false;
    scene.add(rocketSmoke);
    const burstPools = Array.from({ length: 2 }, () => {
      const positions = new Float32Array(32 * 3);
      const velocities = new Float32Array(32 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: "#ffd166",
        size: qualityRef.current === "LOW" ? 0.12 : 0.16,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.visible = false;
      scene.add(points);
      return { points, positions, velocities, age: 2, count: 0 };
    });
    let burstPoolIndex = 0;

    function spawnBurst(x, y, z, color, count = 16) {
      const burst = burstPools[burstPoolIndex];
      burstPoolIndex = (burstPoolIndex + 1) % burstPools.length;
      burst.age = 0;
      burst.count = Math.min(32, count);
      burst.points.position.set(x, y, z);
      burst.points.material.color.set(color);
      burst.points.material.opacity = 1;
      burst.points.geometry.setDrawRange(0, burst.count);
      burst.points.visible = true;
      for (let index = 0; index < burst.count; index += 1) {
        const angle = (index / burst.count) * Math.PI * 2;
        const lift = 0.5 + ((index * 7) % 9) / 10;
        burst.positions[index * 3] = 0;
        burst.positions[index * 3 + 1] = 0;
        burst.positions[index * 3 + 2] = 0;
        burst.velocities[index * 3] = Math.cos(angle) * lift;
        burst.velocities[index * 3 + 1] = 0.5 + (index % 4) * 0.28;
        burst.velocities[index * 3 + 2] = Math.sin(angle) * lift;
      }
      burst.points.geometry.attributes.position.needsUpdate = true;
    }

    function buildRunner(id, data) {
      const group = new THREE.Group();
      const color = data.color || "#e94767";
      if (!suitMaterials.has(color)) suitMaterials.set(color, runnerMaterial(color));
      if (!trailMaterials.has(color)) {
        trailMaterials.set(color, new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.3,
        }));
      }
      const suitMaterial = suitMaterials.get(color);

      const body = new THREE.Mesh(sharedRunnerGeometries.body, suitMaterial);
      body.position.y = 0.55;
      body.castShadow = true;
      group.add(body);

      const faceMaterial = runnerMaterial("#f2bd91", 0.8);
      const head = new THREE.Mesh(sharedRunnerGeometries.head, faceMaterial);
      head.position.set(0, 1.03, 0);
      head.castShadow = true;
      group.add(head);

      const arms = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.23, 0.82, 0);
        const arm = new THREE.Mesh(sharedRunnerGeometries.arm, suitMaterial);
        arm.rotation.z = side * -0.12;
        pivot.add(arm);
        arm.castShadow = true;
        group.add(pivot);
        return pivot;
      });

      const legs = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.11, 0.34, 0);
        const leg = new THREE.Mesh(sharedRunnerGeometries.leg, pantsMaterial);
        pivot.add(leg);
        leg.castShadow = true;
        group.add(pivot);
        return pivot;
      });

      const hairMaterial = runnerMaterial("#253449");
      const hair = new THREE.Mesh(sharedRunnerGeometries.head, hairMaterial);
      hair.position.set(0, 1.16, 0.035);
      hair.scale.set(0.92, 0.48, 0.94);
      group.add(hair);

      const localRing = new THREE.Mesh(
        sharedRunnerGeometries.ring,
        ringMaterial,
      );
      localRing.rotation.x = -Math.PI / 2;
      localRing.position.y = 0.06;
      localRing.visible = id === meRef.current?.id;
      group.add(localRing);
      const puffPositions = new Float32Array(8 * 3);
      for (let index = 0; index < 8; index += 1) {
        puffPositions[index * 3] = Math.cos(index * Math.PI / 4) * 0.52;
        puffPositions[index * 3 + 1] = 0.16 + (index % 3) * 0.14;
        puffPositions[index * 3 + 2] = Math.sin(index * Math.PI / 4) * 0.52;
      }
      const puffGeometry = new THREE.BufferGeometry();
      puffGeometry.setAttribute("position", new THREE.BufferAttribute(puffPositions, 3));
      const puffMaterial = new THREE.PointsMaterial({
        color: "#59bd73",
        size: qualityRef.current === "LOW" ? 0.08 : 0.11,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const puffs = new THREE.Points(puffGeometry, puffMaterial);
      puffs.visible = false;
      group.add(puffs);
      const magnetPositions = new Float32Array(4 * 3);
      const magnetGeometry = new THREE.BufferGeometry();
      magnetGeometry.setAttribute("position", new THREE.BufferAttribute(magnetPositions, 3));
      const magnetMaterial = new THREE.PointsMaterial({
        color: "#f5b83d",
        size: 0.14,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const magnetArrows = new THREE.Points(magnetGeometry, magnetMaterial);
      magnetArrows.visible = false;
      group.add(magnetArrows);
      const shieldBubble = new THREE.Mesh(sharedRunnerGeometries.shield, shieldMaterial);
      shieldBubble.position.y = 0.7;
      shieldBubble.scale.setScalar(1.35);
      shieldBubble.visible = false;
      group.add(shieldBubble);
      const shieldPattern = new THREE.Mesh(sharedRunnerGeometries.shield, shieldPatternMaterial);
      shieldPattern.position.y = 0.7;
      shieldPattern.scale.setScalar(1.36);
      shieldPattern.visible = false;
      group.add(shieldPattern);
      const slowPuddle = new THREE.Mesh(sharedRunnerGeometries.puddle, puddleMaterial);
      slowPuddle.position.y = 0.06;
      slowPuddle.scale.set(1.25, 1, 1.5);
      slowPuddle.visible = false;
      group.add(slowPuddle);

      const nameLabel = makeNameLabel(data.name || "Runner", data.color || "#e94767");
      if (nameLabel) {
        nameLabel.position.y = 1.55;
        group.add(nameLabel);
      }
      const statusLabel = makeRunnerStatusLabel();
      if (statusLabel) group.add(statusLabel);

      const trail = new THREE.Mesh(
        sharedRunnerGeometries.trail,
        trailMaterials.get(color),
      );
      const shouldCastShadow = qualityRef.current === "HIGH"
        || (qualityRef.current === "MEDIUM" && id === meRef.current?.id);
      group.traverse((object) => {
        if (object.isMesh) object.castShadow = shouldCastShadow;
      });
      scene.add(trail);
      scene.add(group);
      runners.set(id, {
        group,
        head,
        faceMaterial,
        hairMaterial,
        puffs,
        puffGeometry,
        magnetArrows,
        magnetGeometry,
        magnetPositions,
        shieldBubble,
        shieldPattern,
        slowPuddle,
        statusLabel,
        trail,
        arms,
        legs,
        distance: data.distance || 0,
        targetDistance: data.distance || 0,
        speed: data.speed || 0,
        lane: data.lane || 0,
        finished: Boolean(data.finished),
        finishPlace: data.finishPlace,
        stunned: false,
        knockdownAt: 0,
        incomingUntil: 0,
      });
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 68 : 49;
      camera.updateProjectionMatrix();
    };
    const queueResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 100);
    };
    resizeObserver = new ResizeObserver(queueResize);
    resizeObserver.observe(mount);
    window.addEventListener("resize", queueResize);

    let touchTimes = [];
    function onCanvasPointerDown(event) {
      if (event.pointerType !== "touch") return;
      const now = performance.now();
      touchTimes = touchTimes.filter((time) => now - time < 700);
      touchTimes.push(now);
      if (touchTimes.length >= 3) {
        setShowStats((current) => !current);
        touchTimes = [];
      }
    }
    if (event.type === "incoming") {
      const target = runners.get(event.targetId);
      if (target) target.incomingUntil = animationTime + Math.max(0.2, event.eta || 1);
    }
    function onKeyDown(event) {
      if (event.key.toLowerCase() === "f" && !event.repeat) {
        setShowStats((current) => !current);
      }
    }
    window.addEventListener("pointerdown", onCanvasPointerDown, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    resize();

    const animate = () => {
      if (document.visibilityState === "hidden") {
        frameId = 0;
        return;
      }
      frameId = requestAnimationFrame(animate);
      const nowMs = performance.now();
      const requestedFps = resultsOpenRef.current ? 15 : QUALITY[qualityRef.current].targetFps;
      const frameInterval = 1000 / requestedFps;
      if (nowMs - lastRenderAt < frameInterval) return;
      const delta = Math.min(0.05, Math.max(0, (nowMs - previousFrameTime) / 1000));
      previousFrameTime = nowMs;
      lastRenderAt = nowMs;
      animationTime += delta * (slowMotionRef.current ? 0.32 : 1);
      sceneFrame += 1;
      const now = animationTime;
      const latestState = stateSnapshotRef?.current || stateRef.current;
      if (latestState && latestState !== observedSnapshot) {
        observedSnapshot = latestState;
        snapshotHistory.push({ time: nowMs, state: latestState });
        while (snapshotHistory.length > 1 && snapshotHistory[1].time < nowMs - 600) {
          snapshotHistory.shift();
        }
      }
      let currentState = latestState;
      if (latestState?.state === "racing" && snapshotHistory.length > 1) {
        const targetTime = nowMs - 100;
        const rightIndex = snapshotHistory.findIndex((snapshot) => snapshot.time >= targetTime);
        if (rightIndex > 0) {
          const left = snapshotHistory[rightIndex - 1];
          const right = snapshotHistory[rightIndex];
          if (left.state.state === "racing" && right.state.state === "racing") {
            const fraction = Math.min(1, (targetTime - left.time) / (right.time - left.time));
            const players = { ...left.state.players };
            Object.entries(right.state.players || {}).forEach(([id, next]) => {
              const previous = left.state.players?.[id] || next;
              players[id] = {
                ...next,
                distance: (previous.distance || 0) + ((next.distance || 0) - (previous.distance || 0)) * fraction,
                speed: (previous.speed || 0) + ((next.speed || 0) - (previous.speed || 0)) * fraction,
              };
            });
            currentState = { ...right.state, players };
          }
        }
      }
      const currentPlayers = currentState?.players || {};
      const currentRaceDistance = currentState?.raceDistance || raceDistanceRef.current;
      if (itemBoxesRef.current !== activeItemBoxes) {
        activeItemBoxes = itemBoxesRef.current;
        world.setItemBoxes(activeItemBoxes);
        processedItemEvents.clear();
      }
      if (boostPadsRef.current !== activeBoostPads) {
        activeBoostPads = boostPadsRef.current;
        world.setBoostPads(activeBoostPads);
        processedItemEvents.clear();
      }
      const maxProgress = Object.values(currentPlayers).reduce(
        (furthest, player) => Math.max(furthest, player.distance || 0),
        0,
      );

      if (themeRef.current !== activeThemeId) {
        disposeTrackWorld(world);
        activeThemeId = themeRef.current;
        const nextTheme = getTheme(activeThemeId);
        scene.background = new THREE.Color(nextTheme.fog);
        const nextQuality = QUALITY[qualityRef.current];
        scene.fog = new THREE.Fog(
          nextTheme.fog,
          nextTheme.fogNear * nextQuality.fogScale,
          nextTheme.fogFar * nextQuality.fogScale,
        );
        hemisphere.color.set(nextTheme.hemiSky);
        hemisphere.groundColor.set(nextTheme.hemiGround);
        sunlight.color.set(nextTheme.keyLight);
        sunlight.position.set(...nextTheme.sunDirection);
        sunlight.intensity = nextTheme.sunIntensity;
        fillLight.color.set(nextTheme.hemiSky);
        fillLight.position.set(-nextTheme.sunDirection[0], 48, -nextTheme.sunDirection[2]);
        world = createTrackWorld(
          activeThemeId,
          currentRaceDistance,
          itemBoxesRef.current,
          boostPadsRef.current,
        );
        scene.add(world.root);
        applyWorldShadowPolicy(world, qualityRef.current);
      }

      Object.entries(currentPlayers).forEach(([id, data]) => {
        let runner = runners.get(id);
        if (!runner) {
          buildRunner(id, data);
          runner = runners.get(id);
        }
        runner.targetDistance = data.distance || 0;
        runner.speed = data.speed || 0;
        runner.lane = data.lane || 0;
        runner.finished = Boolean(data.finished);
        runner.finishPlace = data.finishPlace;
        runner.item = data.item || null;
        runner.activeEffects = data.activeEffects || [];
        runner.stunRemaining = data.stunRemaining || 0;
        runner.getupRemaining = data.getupRemaining || 0;
        const stunnedNow = Boolean(data.stunned);
        if (stunnedNow && !runner.stunned) runner.knockdownAt = animationTime;
        runner.stunned = stunnedNow;
        if (data.incoming) runner.incomingUntil = animationTime + (data.incomingEta || 1);
      });

      for (const [id, runner] of runners) {
        if (!currentPlayers[id]) {
          scene.remove(runner.group);
          scene.remove(runner.trail);
          runner.group.traverse((object) => object.material?.map?.dispose());
          runner.faceMaterial.dispose();
          runner.hairMaterial.dispose();
          runner.puffGeometry.dispose();
          runner.puffs.material.dispose();
          runner.magnetGeometry.dispose();
          runner.magnetArrows.material.dispose();
          runners.delete(id);
          continue;
        }

        const isLocal = id === meRef.current?.id;
        const inView = Math.abs(runner.group.position.z - camera.position.z) <= 200;
        runner.group.visible = inView;
        runner.trail.visible = inView;
        if (!inView) continue;
        const predictedDistance = isLocal
          ? runner.targetDistance + runner.speed * 0.18
          : runner.targetDistance;
        runner.distance += (predictedDistance - runner.distance) * (isLocal ? 0.28 : 0.2);
        const x = (runner.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        const z = -runner.distance;
        const playerSnapshot = currentPlayers[id];
        const overheated = Boolean(playerSnapshot?.overheated);
        const inSweetZone = playerSnapshot?.zone === "sweet" && !overheated;
        const activeEffects = playerSnapshot?.activeEffects || [];
        let hasShield = false;
        let hasSlowEffect = false;
        let hasBoost = false;
        let hasMagnet = false;
        for (let effectIndex = 0; effectIndex < activeEffects.length; effectIndex += 1) {
          const effectName = activeEffects[effectIndex].name;
          if (effectName === "SHIELD") hasShield = true;
          if (effectName === "ROCKET" || effectName === "SLOW_TRAP" || effectName === "LIGHTNING") hasSlowEffect = true;
          if (effectName === "BOOST" || effectName === "TURBO" || effectName === "PAD") hasBoost = true;
          if (effectName === "MAGNET") hasMagnet = true;
        }
        runner.shieldBubble.visible = hasShield;
        runner.shieldPattern.visible = hasShield;
        runner.shieldPattern.rotation.y = animationTime * 0.22;
        runner.slowPuddle.visible = hasSlowEffect;
        runner.magnetArrows.visible = hasMagnet;
        let statusKey = playerSnapshot?.item || "";
        for (let effectIndex = 0; effectIndex < activeEffects.length; effectIndex += 1) {
          statusKey += `|${activeEffects[effectIndex].name}`;
        }
        const incoming = runner.incomingUntil > animationTime;
        statusKey += `|${incoming}|${runner.stunned}`;
        if (statusKey !== runner.statusKey) {
          runner.statusKey = statusKey;
          runner.statusLabel?.userData.updateLabel?.(
            playerSnapshot?.item,
            activeEffects,
            incoming,
            runner.stunned,
          );
        }
        runner.faceMaterial.color.set(overheated || runner.stunned ? "#d87972" : "#f2bd91");
        runner.head.rotation.y = Math.sin(animationTime * 0.7 + runner.lane) * 0.08;
        runner.puffs.visible = inSweetZone || overheated;
        runner.puffs.material.color.set(overheated ? "#a6aeb1" : "#58b873");
        if (runner.puffs.visible && sceneFrame % 3 === 0) {
          const positions = runner.puffGeometry.attributes.position;
          for (let puff = 0; puff < positions.count; puff += 1) {
            const phase = animationTime * 3 + puff * 0.9;
            positions.setY(puff, 0.15 + ((phase + puff * 0.23) % 1.1));
            positions.setX(puff, Math.cos(phase) * 0.52);
            positions.setZ(puff, Math.sin(phase) * 0.52);
          }
          positions.needsUpdate = true;
        }
        if (hasMagnet && sceneFrame % 3 === 0) {
          for (let arrow = 0; arrow < 4; arrow += 1) {
            const phase = animationTime * 4 + arrow * Math.PI / 2;
            runner.magnetPositions[arrow * 3] = Math.cos(phase) * 0.58;
            runner.magnetPositions[arrow * 3 + 1] = 0.7 + Math.sin(phase) * 0.12;
            runner.magnetPositions[arrow * 3 + 2] = Math.sin(phase) * 0.58;
          }
          runner.magnetGeometry.attributes.position.needsUpdate = true;
        }
        runner.group.position.set(x, 0.035, z);
        if (runner.recoilUntil > animationTime) {
          runner.group.position.z += Math.sin(
            ((runner.recoilUntil - animationTime) / 0.18) * Math.PI,
          ) * 0.16;
        }
        runner.group.rotation.y = Math.PI;
        runner.group.rotation.x = countdownRef.current === 1
          ? -0.18
          : -Math.min(0.2, runner.speed * 0.015);
        if (overheated) runner.group.rotation.x = -0.22;
        const getupProgress = runner.getupRemaining > 0
          ? 1 - Math.min(1, runner.getupRemaining / 0.5)
          : 0;
        if (runner.stunned) {
          const fallProgress = Math.min(1, (animationTime - runner.knockdownAt) / 0.34);
          runner.group.rotation.x = 1.42 * fallProgress;
          runner.group.rotation.z = Math.sin(animationTime * 16) * 0.045;
          runner.group.position.y += fallProgress < 1
            ? Math.sin(fallProgress * Math.PI) * 0.6
            : 0.015;
        } else if (runner.getupRemaining > 0) {
          runner.group.rotation.x = 1.42 * (1 - getupProgress);
          runner.group.rotation.z = 0;
          runner.group.position.y += 0.015 + getupProgress * 0.02;
        } else {
          runner.group.rotation.z = 0;
        }
        const stride = Math.min(1, runner.speed / 9)
          * (overheated ? 0.28 : runner.stunned ? 0 : 1);
        runner.group.position.y +=
          Math.abs(Math.sin(now * (5 + runner.speed * 1.8))) * 0.055 * stride;
        runner.legs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(now * (5 + runner.speed * 1.8) + index * Math.PI) * 0.62 * stride;
        });
        runner.arms.forEach((arm, index) => {
          arm.rotation.x = Math.sin(now * (5 + runner.speed * 1.8) + index * Math.PI + Math.PI) * 0.52 * stride;
        });
        if (runner.finished) {
          runner.legs.forEach((leg) => { leg.rotation.x *= 0.25; });
          runner.arms.forEach((arm, index) => {
            arm.rotation.z = (index ? 1 : -1) * (runner.finishPlace === 1 ? 1.2 : 0.7);
          });
          if (runner.finishPlace === 1) {
            runner.group.position.y += 0.12 + Math.abs(Math.sin(now * 5)) * 0.28;
          }
        }
        runner.trail.position.set(x, 0.14, z + 1.05);
        runner.trail.scale.z = (hasBoost ? 2.4 : 0.8)
          + stride * (hasBoost ? 2.1 : 1.2);
      }

      if (!itemEventsRef.current.length) processedItemEvents.clear();
      itemEventsRef.current.forEach((event) => {
        const key = `${event.type}:${event.id}:${event.boxIndex ?? event.padIndex ?? event.rocketId ?? event.item ?? event.targetId}`;
        if (processedItemEvents.has(key)) return;
        processedItemEvents.add(key);
        if (
          (event.type === "boxPickup" || event.type === "itemPickedUp")
          && event.id === meRef.current?.id
        ) {
          world.hitItemBox(event.boxIndex, animationTime);
          const box = activeItemBoxes.find((entry) => entry.index === event.boxIndex);
          if (box) {
            spawnBurst(
              (box.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
              0.85,
              -box.distance,
              "#ffd166",
              16,
            );
          }
          if (!mutedRef.current) playTone(740, 0.08, "sine");
        }
        if (event.type === "padHit" && event.id === meRef.current?.id) {
          world.hitBoostPad(event.padIndex, animationTime);
          const pad = activeBoostPads.find((entry) => entry.index === event.padIndex);
          if (pad) {
            spawnBurst(
              (pad.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
              0.08,
              -pad.distance,
              event.quality === "perfect" ? "#f3d75b" : "#77c9e7",
              12,
            );
          }
        }
        if (event.type === "itemUsed" && event.item === "ROCKET") {
          const owner = runners.get(event.id);
          if (owner) owner.recoilUntil = animationTime + 0.18;
          if (event.id === meRef.current?.id) cameraShakeUntil = animationTime + 0.22;
          if (!mutedRef.current) playTone(390, 0.16, "sawtooth");
        }
        if (event.type === "rocketHit" || event.type === "rocketBlocked") {
          const point = event.point;
          if (point) {
            spawnBurst(
              (point.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
              0.7,
              -point.distance,
              event.type === "rocketBlocked" ? "#8bd8f1" : "#ff914d",
              32,
            );
          }
          if (event.targetId === meRef.current?.id) cameraShakeUntil = animationTime + 0.28;
          if (!mutedRef.current) playTone(event.type === "rocketBlocked" ? 620 : 155, 0.24, "triangle");
        }
        if (event.type === "shieldPopped" && event.id === meRef.current?.id) {
          const target = runners.get(event.id);
          if (target) {
            spawnBurst(
              target.group.position.x,
              0.85,
              target.group.position.z,
              "#85d8ed",
              24,
            );
          }
        }
      });

      const activeRockets = currentState?.rockets || [];
      rocketSmoke.visible = activeRockets.length > 0;
      rocketPool.forEach((slot, index) => {
        const rocket = activeRockets[index];
        if (!rocket) {
          slot.id = null;
          slot.group.visible = false;
          return;
        }
        slot.id = rocket.id;
        slot.group.visible = true;
        let laneX = (rocket.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        let rocketDistance = rocket.distance;
        let rocketY = 0.95;
        if (rocket.age < 0.16) {
          const owner = currentPlayers[rocket.ownerId];
          if (owner) {
            const launchProgress = Math.min(1, rocket.age / 0.16);
            laneX = (owner.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH
              + (laneX - (owner.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH) * launchProgress;
            rocketDistance = owner.distance + 0.45
              + (rocket.distance - owner.distance - 0.45) * launchProgress;
            rocketY = 0.95 + 0.18 * launchProgress;
          }
        }
        const target = rocket.targetId ? currentPlayers[rocket.targetId] : null;
        const targetX = target
          ? (target.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH
          : laneX;
        slot.group.position.x += (laneX - slot.group.position.x) * 0.38;
        slot.group.position.y += (rocketY - slot.group.position.y) * 0.22;
        slot.group.position.z += (-rocketDistance - slot.group.position.z) * 0.4;
        slot.group.rotation.set(-Math.PI / 2, -Math.atan2(targetX - laneX, 5), 0);
        slot.group.children[2].scale.y = 0.72 + Math.sin(animationTime * 32 + index) * 0.2;
        const trailsPerRocket = qualityRef.current === "HIGH" ? 8 : 5;
        for (let trail = 0; trail < trailsPerRocket; trail += 1) {
          const particle = (index * trailsPerRocket + trail) * 3;
          rocketSmokePositions[particle] = slot.group.position.x;
          rocketSmokePositions[particle + 1] = slot.group.position.y - trail * 0.035;
          rocketSmokePositions[particle + 2] = slot.group.position.z + trail * 0.18;
        }
      });
      rocketSmokeGeometry.setDrawRange(
        0,
        Math.min(activeRockets.length, rocketPool.length) * (qualityRef.current === "HIGH" ? 8 : 5),
      );
      rocketSmokeGeometry.attributes.position.needsUpdate = true;
      burstPools.forEach((burst) => {
        if (burst.age >= 0.75) return;
        burst.age += delta;
        const life = Math.max(0, 1 - burst.age / 0.75);
        burst.points.material.opacity = life;
        for (let index = 0; index < burst.count; index += 1) {
          const offset = index * 3;
          burst.positions[offset] += burst.velocities[offset] * delta;
          burst.positions[offset + 1] += burst.velocities[offset + 1] * delta;
          burst.positions[offset + 2] += burst.velocities[offset + 2] * delta;
          burst.velocities[offset + 1] -= 3.5 * delta;
        }
        burst.points.geometry.attributes.position.needsUpdate = true;
        if (!life) burst.points.visible = false;
      });

      const countdownValue =
        currentState?.state === "racing" || currentState?.state === "finished"
          ? "GO"
          : countdownRef.current;
      world.update({
        time: now,
        countdown: countdownValue,
        raceDistance: currentRaceDistance,
        progress: Math.min(1, maxProgress / currentRaceDistance),
        raceTime: currentState?.t || 0,
      });
      cullTrackWorld(world, camera, sceneFrame);
      if (qualityRef.current === "MEDIUM" && sceneFrame % 4 === 0) renderer.shadowMap.needsUpdate = true;

      const local = runners.get(meRef.current?.id);
      if (local) {
        const runnerX = (local.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        const runnerZ = -local.distance;
        const portrait = mount.clientWidth < mount.clientHeight;
        desiredCameraPosition.set(
          runnerX * 0.38,
          portrait ? 4.8 : 8.2,
          runnerZ + (portrait ? 9 : 18),
        );
        camera.position.lerp(desiredCameraPosition, 0.065);
        if (animationTime < cameraShakeUntil) {
          camera.position.x += Math.sin(nowMs * 0.07) * 0.08;
          camera.position.y += Math.cos(nowMs * 0.09) * 0.04;
        }
        const speedFov = portrait
          ? Math.min(8, Math.max(0, local.speed * 0.5))
          : Math.min(8, Math.max(0, local.speed * 0.23));
        camera.fov += ((portrait ? 68 : 49) + speedFov - camera.fov) * 0.12;
        camera.updateProjectionMatrix();
        camera.lookAt(runnerX * 0.25, 0.9, runnerZ - (portrait ? 8 : 30));
      } else if (previewOnly) {
        const drift = now * 0.075;
        if (!reducedMotionRef.current) {
          camera.position.set(
            Math.sin(drift) * 2.1,
            10 + Math.sin(drift * 0.7) * 0.45,
            25 + Math.cos(drift) * 1.1,
          );
        }
        camera.lookAt(
          reducedMotionRef.current ? 0 : Math.sin(drift) * 1.2,
          1,
          -30,
        );
      } else {
        camera.lookAt(0, 1, -30);
      }

      if (currentState?.state === "finished" && !finishSoundPlayed) {
        finishSoundPlayed = true;
        if (!mutedRef.current) {
          playToneSequence([523, 659, 784, 1047].map((frequency, index) => [
            frequency,
            index * 0.11,
            0.42,
            "triangle",
          ]));
        }
      }
      if (countdownRef.current === 3) finishSoundPlayed = false;
      renderer.render(scene, camera);
      if (!resultsOpenRef.current) qualityWindowFrames += 1;
      statsWindowFrames += 1;
      if (resultsOpenRef.current) {
        qualityWindowStart = nowMs;
        qualityWindowFrames = 0;
      } else if (nowMs - qualityWindowStart >= 2000) {
        const averageFps = qualityWindowFrames * 1000 / (nowMs - qualityWindowStart);
        if (qualityRef.current === "HIGH" && averageFps < 45) applyQuality("MEDIUM");
        else if (qualityRef.current === "MEDIUM" && averageFps < 40) applyQuality("LOW");
        qualityWindowStart = nowMs;
        qualityWindowFrames = 0;
      }
      if (nowMs - statsWindowStart >= 1000) {
        if (showStatsRef.current) {
          setStats({
            fps: Math.round(statsWindowFrames * 1000 / (nowMs - statsWindowStart)),
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            quality: qualityRef.current,
          });
        }
        statsWindowStart = nowMs;
        statsWindowFrames = 0;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(frameId);
        frameId = 0;
        return;
      }
      previousFrameTime = performance.now();
      lastRenderAt = previousFrameTime;
      frameId = requestAnimationFrame(animate);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", queueResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onCanvasPointerDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      disposeTrackWorld(world);
      scene.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          material.map?.dispose();
          material.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
      Object.values(sharedRunnerGeometries).forEach((geometry) => geometry.dispose());
      suitMaterials.forEach((material) => material.dispose());
      trailMaterials.forEach((material) => material.dispose());
      skinMaterial.dispose();
      pantsMaterial.dispose();
      ringMaterial.dispose();
      shieldMaterial.dispose();
      shieldPatternMaterial.dispose();
      puddleMaterial.dispose();
    };
  }, [previewOnly, stateSnapshotRef]);

  return (
    <>
      <div
        className={`game-canvas-wrap ${previewOnly ? "preview-canvas" : ""}`}
        ref={mountRef}
        aria-label="Themed straight sprint track"
      />
      {showStats && (
        <output className="fps-overlay" aria-live="off">
          {stats.fps} FPS · {stats.calls} calls · {stats.triangles.toLocaleString()} tris · {stats.quality}
        </output>
      )}
    </>
  );
}
