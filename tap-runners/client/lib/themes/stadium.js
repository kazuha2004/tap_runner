import * as THREE from "three";
import { TRACK_WIDTH } from "./constants";
import {
  addDistanceSigns,
  addInstances,
  addMesh,
  addThemeArch,
  addWavingFlags,
  createCrowd,
  makeSignTexture,
  material,
} from "./shared";

export function buildStadium(root, theme, trackLength, raceDistance) {
  const callbacks = [];
  const stands = new THREE.Group();
  const tierMaterial = material("#f3eee0");
  const seatMaterial = material("#5d8ca4");
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 7; tier += 1) {
      const width = 1.35;
      const tierBox = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.55, trackLength + 5),
        tier % 2 ? seatMaterial : tierMaterial,
      );
      tierBox.position.set(side * (TRACK_WIDTH / 2 + 3.1 + tier * 0.68), 1.2 + tier * 0.72, -trackLength / 2);
      tierBox.castShadow = true;
      tierBox.receiveShadow = true;
      stands.add(tierBox);
    }
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 7.5, trackLength + 12),
      material("#cbd7d0"),
    );
    wall.position.set(side * (TRACK_WIDTH / 2 + 8.7), 3.75, -trackLength / 2);
    stands.add(wall);
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.65, trackLength + 18),
      material("#e9e4d3"),
    );
    canopy.position.set(side * (TRACK_WIDTH / 2 + 7.1), 7.1, -trackLength / 2);
    canopy.castShadow = true;
    stands.add(canopy);
    for (const railY of [4.1, 6.1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, trackLength + 10),
        material("#efad43"),
      );
      rail.position.set(side * (TRACK_WIDTH / 2 + 2.25), railY, -trackLength / 2);
      stands.add(rail);
    }
  }
  for (const endZ of [8, -raceDistance - 8]) {
    if (endZ < 0) {
      const rearStand = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH + 20, 5.6, 3.2),
        material("#e5e3d4"),
      );
      rearStand.position.set(0, 3.3, endZ);
      rearStand.castShadow = true;
      stands.add(rearStand);
    }
    for (let tier = 0; tier < 4; tier += 1) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH + 15 - tier * 1.4, 0.52, 1.4),
        tier % 2 ? material("#72a8ba") : tierMaterial,
      );
      step.position.set(0, 1.6 + tier * 0.8, endZ + (endZ > 0 ? -2.8 : 2.8));
      stands.add(step);
    }
  }
  root.add(stands);

  const spectators = [];
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 6; tier += 1) {
      for (let index = 0; index < 44; index += 1) {
        spectators.push({
          x: side * (TRACK_WIDTH / 2 + 2.65 + tier * 0.68),
          y: 1.62 + tier * 0.72,
          z: -6 - index * ((trackLength - 12) / 43),
          scale: 0.72 + Math.random() * 0.18,
          rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        });
      }
    }
  }
  const crowdColors = ["#e85d63", "#ffd36b", "#4d9fd0", "#f1f2e6", "#8d68bd", "#54ac7d", "#ed8b50"];
  const animateCrowd = createCrowd(root, spectators, crowdColors);
  callbacks.push((time, progress) => animateCrowd(time, progress > 0.82 ? 0.19 : 0.055));

  const towerPositions = [
    [-30, 0, -22],
    [30, 0, -22],
    [-30, 0, -raceDistance + 18],
    [30, 0, -raceDistance + 18],
  ];
  for (const [index, [x, , z]] of towerPositions.entries()) {
    addMesh(root, new THREE.BoxGeometry(0.38, 16, 0.38), "#becdce", [x, 8, z]);
    addMesh(root, new THREE.BoxGeometry(2.5, 0.3, 0.55), "#e8e5d9", [x, 16.15, z]);
    for (let lamp = 0; lamp < 3; lamp += 1) {
      const light = new THREE.PointLight(index % 2 ? "#fff2ca" : "#fff8df", 0.9, 55);
      light.position.set(x + (lamp - 1) * 0.66, 15.9, z);
      root.add(light);
    }
  }

  const skyline = [];
  for (let index = 0; index < 40; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    skyline.push({
      position: [side * (105 + (index % 5) * 10), 5 + (index % 6) * 2, -row * (trackLength / 19)],
      scale: [8 + index % 4, 10 + (index % 6) * 4, 8 + index % 3],
      color: ["#90b8c9", "#e9cf91", "#a2c8b2", "#d6ab97"][index % 4],
    });
  }
  addInstances(root, new THREE.BoxGeometry(1, 1, 1), "#ffffff", skyline, { vertexColors: true });

  const potEntries = [];
  const shrubEntries = [];
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 ? 1 : -1;
    const z = -24 - Math.floor(index / 2) * (trackLength / 6);
    const x = side * (TRACK_WIDTH / 2 + 10);
    potEntries.push({ position: [x, 0.5, z], scale: [1.2, 0.9, 1.2] });
    shrubEntries.push({
      position: [x, 1.55, z],
      scale: [1.1, 1.25, 1.1],
      color: index % 2 ? "#59a65c" : "#78b76a",
    });
  }
  addInstances(root, new THREE.CylinderGeometry(0.8, 1, 1, 8), "#d88d52", potEntries);
  addInstances(root, new THREE.IcosahedronGeometry(1, 1), "#ffffff", shrubEntries, { vertexColors: true });

  const banners = [];
  for (let index = 0; index < 24; index += 1) {
    const side = index % 2 ? 1 : -1;
    banners.push({
      position: [side * (TRACK_WIDTH / 2 + 7.1), 6.1, -index * trackLength / 24],
      scale: [0.18, 1.5, 2.8],
      color: ["#e75e62", "#ffcf60", "#70b98a", "#68a5ce"][index % 4],
    });
  }
  addInstances(root, new THREE.BoxGeometry(1, 1, 1), "#ffffff", banners, { vertexColors: true, castShadow: false });

  const flags = [];
  for (let index = 0; index < 16; index += 1) {
    const theta = Math.PI * 2 * index / 16;
    flags.push([Math.cos(theta) * 19, 10, Math.sin(theta) * 19 - trackLength / 2]);
  }
  const animateFlags = addWavingFlags(root, flags, ["#f05c64", "#ffd45d", "#6bc7a0", "#6ba6dc", "#bd84c9"]);
  callbacks.push((time) => animateFlags(time));

  const scoreboard = new THREE.Group();
  scoreboard.position.set(0, 12, -trackLength * 0.16);
  const board = addMesh(
    scoreboard,
    new THREE.BoxGeometry(10, 5, 0.65),
    "#347e9c",
    [0, 0, 0],
  );
  board.material.color.set("#347e9c");
  const texture = makeSignTexture("00:00.0", "#347e9c", "#fff4b8", 512, 256);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(8.8, 3.6),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  face.position.z = 0.35;
  scoreboard.add(face);
  const context = texture && texture.image?.getContext?.("2d");
  callbacks.push((time, progress, raceTime) => {
    if (!texture || !context) return;
    const canvas = texture.image;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#347e9c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff4b8";
    ctx.font = "900 104px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const elapsed = Math.max(0, raceTime || 0);
    ctx.fillText(`${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toFixed(1).padStart(4, "0")}`, 256, 128);
    texture.needsUpdate = true;
  });
  root.add(scoreboard);
  addMesh(root, new THREE.BoxGeometry(4, 2.2, 2), "#e96459", [0, 14.5, -trackLength * 0.46]);

  const clouds = [];
  for (let index = 0; index < 7; index += 1) {
    const cloud = addMesh(
      root,
      new THREE.IcosahedronGeometry(1, 1),
      "#fffefa",
      [-85 + index * 27, 37 + index % 3 * 4, -index * trackLength / 7],
      { scale: [9, 2.6, 4] },
    );
    clouds.push({ object: cloud, baseX: cloud.position.x, phase: index * 0.9 });
  }
  callbacks.push((time) => clouds.forEach(({ object, baseX, phase }) => {
    object.position.x = baseX + Math.sin(time * 0.025 + phase) * 4;
  }));
  addDistanceSigns(root, trackLength, { pole: "#d8d5c9", board: "#e85d63", ink: "#e85d63", text: "#fffdf5" });
  const startArch = addThemeArch(root, theme, "stadium", 0, "START");
  const finishArch = addThemeArch(root, theme, "stadium", -raceDistance, "FINISH");
  return {
    finishArch,
    update(time, progress, raceTime, countdown) {
      callbacks.forEach((callback) => callback(time, progress, raceTime, countdown));
      updateLamps(startArch, countdown, time);
    },
  };
}

function updateLamps(arch, countdown, time) {
  arch.userData.startLamps?.forEach(({ bulb, light, goLamp }, index) => {
    const active = countdown === "GO"
      ? goLamp
      : typeof countdown === "number" && !goLamp && index < countdown;
    const glow = active ? 1.5 + Math.sin(time * 10) * 0.15 : 0.08;
    bulb.material.emissiveIntensity = glow;
    light.intensity = active ? glow : 0.02;
  });
}
