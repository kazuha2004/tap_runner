"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  cullTrackWorld,
  createTrackWorld,
  disposeTrackWorld,
  LANE_COUNT,
  LANE_WIDTH,
} from "../lib/trackWorld";
import { getTheme } from "../lib/themes";
import { detectQualityPreset, QUALITY, setSceneQuality } from "../lib/quality";
import { playToneSequence } from "../lib/audio";

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

    let world = createTrackWorld(themeRef.current, raceDistanceRef.current);
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
      camera.far = nextQuality.cameraFar;
      camera.updateProjectionMatrix();
      scene.fog = new THREE.Fog(
        getTheme(themeRef.current).fog,
        getTheme(themeRef.current).fogNear * nextQuality.fogScale,
        getTheme(themeRef.current).fogFar * nextQuality.fogScale,
      );
      disposeTrackWorld(world);
      world = createTrackWorld(themeRef.current, raceDistanceRef.current);
      scene.add(world.root);
      applyWorldShadowPolicy(world, nextId);
      renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight), false);
    }
    let activeThemeId = themeRef.current;
    let finishSoundPlayed = false;
    let previousFrameTime = performance.now();
    let animationTime = 0;
    let observedSnapshot = null;
    const snapshotHistory = [];
    const runners = new Map();
    const suitMaterials = new Map();
    const trailMaterials = new Map();
    const sharedRunnerGeometries = {
      body: new THREE.CapsuleGeometry(0.2, 0.48, 2, qualityRef.current === "HIGH" ? 7 : 5),
      head: new THREE.SphereGeometry(0.18, qualityRef.current === "HIGH" ? 10 : 7, qualityRef.current === "HIGH" ? 8 : 5),
      arm: new THREE.CapsuleGeometry(0.075, 0.32, 2, qualityRef.current === "HIGH" ? 5 : 4),
      leg: new THREE.CapsuleGeometry(0.09, 0.31, 2, qualityRef.current === "HIGH" ? 5 : 4),
      ring: new THREE.TorusGeometry(0.45, 0.055, 6, qualityRef.current === "HIGH" ? 24 : 12),
      trail: new THREE.BoxGeometry(0.16, 0.12, 1.6),
    };
    const skinMaterial = new THREE.MeshLambertMaterial({ color: "#f2bd91" });
    const pantsMaterial = new THREE.MeshLambertMaterial({ color: "#263b4c" });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: "#fff071" });

    function buildRunner(id, data) {
      const group = new THREE.Group();
      const color = data.color || "#e94767";
      if (!suitMaterials.has(color)) suitMaterials.set(color, new THREE.MeshLambertMaterial({ color }));
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

      const head = new THREE.Mesh(sharedRunnerGeometries.head, skinMaterial);
      head.position.set(0, 1.03, 0);
      head.castShadow = true;
      group.add(head);

      const arms = [-1, 1].map((side) => {
        const arm = new THREE.Mesh(sharedRunnerGeometries.arm, suitMaterial);
        arm.position.set(side * 0.27, 0.64, 0);
        arm.rotation.z = side * -0.25;
        arm.castShadow = true;
        group.add(arm);
        return arm;
      });

      const legs = [-1, 1].map((side) => {
        const leg = new THREE.Mesh(
          sharedRunnerGeometries.leg,
          pantsMaterial,
        );
        leg.position.set(side * 0.11, 0.2, 0);
        leg.castShadow = true;
        group.add(leg);
        return leg;
      });

      const localRing = new THREE.Mesh(
        sharedRunnerGeometries.ring,
        ringMaterial,
      );
      localRing.rotation.x = -Math.PI / 2;
      localRing.position.y = 0.06;
      localRing.visible = id === meRef.current?.id;
      group.add(localRing);

      const nameLabel = makeNameLabel(data.name || "Runner", data.color || "#e94767");
      if (nameLabel) {
        nameLabel.position.y = 1.55;
        group.add(nameLabel);
      }

      const trail = new THREE.Mesh(
        sharedRunnerGeometries.trail,
        trailMaterials.get(color),
      );
      scene.add(trail);
      scene.add(group);
      runners.set(id, {
        group,
        trail,
        arms,
        legs,
        distance: data.distance || 0,
        targetDistance: data.distance || 0,
        speed: data.speed || 0,
        lane: data.lane || 0,
        finished: Boolean(data.finished),
        finishPlace: data.finishPlace,
      });
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 64 : 49;
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
        world = createTrackWorld(activeThemeId, currentRaceDistance);
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
      });

      for (const [id, runner] of runners) {
        if (!currentPlayers[id]) {
          scene.remove(runner.group);
          scene.remove(runner.trail);
          runner.group.traverse((object) => object.material?.map?.dispose());
          runners.delete(id);
          continue;
        }

        const isLocal = id === meRef.current?.id;
        const inView = Math.abs(runner.group.position.z - camera.position.z) <= 200;
        runner.group.visible = inView;
        runner.trail.visible = inView;
        if (!inView) continue;
        runner.group.traverse((object) => {
          if (object.isMesh) object.castShadow = qualityRef.current === "HIGH" || (qualityRef.current === "MEDIUM" && isLocal);
        });
        const predictedDistance = isLocal
          ? runner.targetDistance + runner.speed * 0.18
          : runner.targetDistance;
        runner.distance += (predictedDistance - runner.distance) * (isLocal ? 0.28 : 0.2);
        const x = (runner.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        const z = -runner.distance;
        runner.group.position.set(x, 0.035, z);
        runner.group.rotation.y = Math.PI;
        runner.group.rotation.x = countdownRef.current === 1 ? -0.18 : 0;
        const stride = Math.min(1, runner.speed / 9);
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
        runner.trail.scale.z = 0.8 + stride * 1.2;
      }

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
        const desired = new THREE.Vector3(
          runnerX * 0.38,
          portrait ? 10.4 : 8.2,
          runnerZ + (portrait ? 23 : 18),
        );
        camera.position.lerp(desired, 0.065);
        camera.fov += ((portrait ? 64 : 49) + Math.min(local.speed, 20) * 0.23 - camera.fov) * 0.035;
        camera.updateProjectionMatrix();
        camera.lookAt(runnerX * 0.25, 1.15, runnerZ - (portrait ? 24 : 30));
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
