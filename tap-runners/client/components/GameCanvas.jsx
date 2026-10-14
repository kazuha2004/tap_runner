"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  createTrackWorld,
  disposeTrackWorld,
  LANE_COUNT,
  LANE_WIDTH,
} from "../lib/trackWorld";
import { getTheme } from "../lib/themes";

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

function playFinishFanfare() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    [523, 659, 784, 1047].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "triangle";
      gain.gain.setValueAtTime(0.05, context.currentTime + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + index * 0.11 + 0.42,
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.11);
      oscillator.stop(context.currentTime + index * 0.11 + 0.42);
    });
    setTimeout(() => context.close(), 1100);
  } catch {
    // Audio is optional; the finish screen and race continue without it.
  }
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

  stateRef.current = state;
  meRef.current = me;
  mutedRef.current = muted;
  themeRef.current = theme;
  countdownRef.current = countdown;
  raceDistanceRef.current = raceDistance;
  slowMotionRef.current = slowMotion;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer;
    let frameId = 0;
    let resizeObserver;
    const scene = new THREE.Scene();
    const activeTheme = getTheme(themeRef.current);
    scene.background = new THREE.Color(activeTheme.fog);
    scene.fog = new THREE.Fog(activeTheme.fog, activeTheme.fogNear, activeTheme.fogFar);

    const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 3000);
    camera.position.set(0, 10, 25);
    camera.lookAt(0, 1, -25);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      mount.innerHTML = '<div class="graphics-fallback">Your browser could not start the 3D race view.</div>';
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1536, 1536);
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
    scene.add(fillLight);

    let world = createTrackWorld(themeRef.current, raceDistanceRef.current);
    scene.add(world.root);
    let activeThemeId = themeRef.current;
    let finishSoundPlayed = false;
    let previousFrameTime = performance.now() / 1000;
    let animationTime = 0;
    const runners = new Map();

    function buildRunner(id, data) {
      const group = new THREE.Group();
      const runnerColor = new THREE.Color(data.color || "#e94767");
      const suitMaterial = new THREE.MeshLambertMaterial({ color: runnerColor });
      const skinMaterial = new THREE.MeshLambertMaterial({ color: "#f2bd91" });

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.2, 0.48, 3, 7),
        suitMaterial,
      );
      body.position.y = 0.55;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skinMaterial);
      head.position.set(0, 1.03, 0);
      head.castShadow = true;
      group.add(head);

      const arms = [-1, 1].map((side) => {
        const arm = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.075, 0.32, 2, 5),
          suitMaterial,
        );
        arm.position.set(side * 0.27, 0.64, 0);
        arm.rotation.z = side * -0.25;
        arm.castShadow = true;
        group.add(arm);
        return arm;
      });

      const legs = [-1, 1].map((side) => {
        const leg = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.09, 0.31, 2, 5),
          new THREE.MeshLambertMaterial({ color: "#263b4c" }),
        );
        leg.position.set(side * 0.11, 0.2, 0);
        leg.castShadow = true;
        group.add(leg);
        return leg;
      });

      const localRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.055, 8, 32),
        new THREE.MeshBasicMaterial({ color: "#fff071" }),
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
        new THREE.BoxGeometry(0.16, 0.12, 1.6),
        new THREE.MeshBasicMaterial({
          color: runnerColor,
          transparent: true,
          opacity: 0.3,
        }),
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
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = width < height ? 64 : 49;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const frameTime = performance.now() / 1000;
      animationTime += (frameTime - previousFrameTime) * (slowMotionRef.current ? 0.32 : 1);
      previousFrameTime = frameTime;
      const now = animationTime;
      const currentState = stateRef.current;
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
        scene.fog = new THREE.Fog(nextTheme.fog, nextTheme.fogNear, nextTheme.fogFar);
        hemisphere.color.set(nextTheme.hemiSky);
        hemisphere.groundColor.set(nextTheme.hemiGround);
        sunlight.color.set(nextTheme.keyLight);
        sunlight.position.set(...nextTheme.sunDirection);
        sunlight.intensity = nextTheme.sunIntensity;
        fillLight.color.set(nextTheme.hemiSky);
        fillLight.position.set(-nextTheme.sunDirection[0], 48, -nextTheme.sunDirection[2]);
        world = createTrackWorld(activeThemeId, currentRaceDistance);
        scene.add(world.root);
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
          runner.group.traverse((object) => {
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
          runner.trail.geometry.dispose();
          runner.trail.material.dispose();
          runners.delete(id);
          continue;
        }

        const isLocal = id === meRef.current?.id;
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
        runner.trail.material.opacity = 0.08 + stride * 0.23;
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
      } else {
        camera.lookAt(0, 1, -30);
      }

      if (currentState?.state === "finished" && !finishSoundPlayed) {
        finishSoundPlayed = true;
        if (!mutedRef.current) playFinishFanfare();
      }
      if (countdownRef.current === 3) finishSoundPlayed = false;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
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
    };
  }, [raceDistance, theme]);

  return (
    <div
      className={`game-canvas-wrap ${previewOnly ? "preview-canvas" : ""}`}
      ref={mountRef}
      aria-label="Themed straight sprint track"
    />
  );
}
