import * as THREE from "three";
import { TRACK_WIDTH } from "./constants";
import {
  addDistanceSigns,
  addInstances,
  addMesh,
  addThemeArch,
  createCrowd,
  material,
} from "./shared";

export function buildDesert(root, theme, trackLength, raceDistance) {
  const updates = [];
  const duneEntries = [];
  for (let index = 0; index < 64; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const size = 14 + index % 6 * 6;
    duneEntries.push({
      position: [side * (31 + index % 5 * 15), size * 0.24, -row * trackLength / 30],
      scale: [size * 2.1, size * 0.58, size * 1.35],
      color: index % 3 ? "#e1b86f" : "#efc77c",
    });
  }
  addInstances(root, new THREE.SphereGeometry(1, 12, 8), "#ffffff", duneEntries, { vertexColors: true });

  const mesaEntries = [];
  for (let index = 0; index < 24; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const width = 12 + index % 4 * 4;
    mesaEntries.push({
      position: [side * (88 + index % 5 * 14), 9 + index % 4 * 2, -row * trackLength / 11],
      scale: [width * 1.3, 11 + index % 5 * 2, width],
      color: ["#bd7253", "#d18861", "#a95f4c"][index % 3],
    });
  }
  addInstances(root, new THREE.DodecahedronGeometry(1, 0), "#ffffff", mesaEntries, { vertexColors: true });

  const cactusTrunks = [];
  const cactusArms = [];
  for (let index = 0; index < 92; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const x = side * (14 + index % 7 * 6);
    const z = -row * trackLength / 45;
    const height = 2.2 + index % 5 * 0.7;
    const radius = 0.3 + index % 3 * 0.12;
    cactusTrunks.push({ position: [x, height / 2, z], scale: [radius, height, radius] });
    if (index % 3 !== 0) {
      cactusArms.push({
        position: [x + (side > 0 ? 0.58 : -0.58), height * 0.63, z],
        scale: [0.2, 0.85, 0.2],
        rotation: [0, 0, Math.PI / 2],
      });
      cactusArms.push({
        position: [x + (side > 0 ? 0.92 : -0.92), height * 0.78, z],
        scale: [0.16, 0.68, 0.18],
      });
    }
  }
  addInstances(root, new THREE.CylinderGeometry(0.8, 1, 1, 7), "#47875c", cactusTrunks);
  addInstances(root, new THREE.CylinderGeometry(0.5, 0.5, 1, 7), "#47875c", cactusArms);

  const dryBushes = [];
  for (let index = 0; index < 120; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const size = 0.45 + index % 4 * 0.16;
    dryBushes.push({
      position: [side * (8.5 + index % 5 * 0.75), size * 0.55, -row * trackLength / 60],
      scale: [size * 1.6, size, size * 1.3],
      color: index % 2 ? "#a7824d" : "#bd995c",
    });
  }
  addInstances(root, new THREE.IcosahedronGeometry(1, 0), "#ffffff", dryBushes, { vertexColors: true });

  const fenceMaterial = material("#9c7148");
  const fencePosts = [];
  for (const side of [-1, 1]) {
    for (let meters = 0; meters <= trackLength; meters += 8) {
      fencePosts.push({ position: [side * (TRACK_WIDTH / 2 + 1.3), 0.65, -meters] });
    }
    for (const y of [0.45, 1.05]) {
      addMesh(
        root,
        new THREE.BoxGeometry(0.16, 0.14, trackLength),
        "#b48a5b",
        [side * (TRACK_WIDTH / 2 + 1.3), y, -trackLength / 2],
      );
    }
  }
  addInstances(root, new THREE.BoxGeometry(0.14, 1.3, 0.14), "#9c7148", fencePosts);

  const rocks = [];
  for (let index = 0; index < 4; index += 1) {
    const z = -trackLength * (0.22 + index * 0.17);
    const side = index % 2 ? 1 : -1;
    const x = side * 48;
    addMesh(root, new THREE.DodecahedronGeometry(7 + index % 2 * 2, 0), "#c77b55", [x - 10, 4, z]);
    addMesh(root, new THREE.DodecahedronGeometry(8, 0), "#b96c4e", [x + 9, 4, z - 3]);
    const lintel = addMesh(root, new THREE.DodecahedronGeometry(8, 0), "#d18a5e", [x, 13, z], {
      scale: [2, 0.4, 0.7],
    });
    rocks.push(lintel);
  }

  const village = [];
  for (let index = 0; index < 9; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const x = side * (92 + row % 3 * 9);
    const z = -trackLength * 0.52 - row * 13;
    addMesh(root, new THREE.BoxGeometry(9, 5, 7), ["#d9ad76", "#c89568", "#e6c18b"][index % 3], [x, 2.5, z]);
    addMesh(root, new THREE.ConeGeometry(7, 2, 4), "#a8674f", [x, 6, z], { rotation: [0, Math.PI / 4, 0] });
    village.push([x, z]);
  }

  const pyramidEntries = [];
  for (let index = 0; index < 6; index += 1) {
    const side = index % 2 ? 1 : -1;
    pyramidEntries.push({
      position: [side * (140 + index % 3 * 30), 11 + index % 2 * 5, -trackLength * 0.15 - Math.floor(index / 2) * trackLength * 0.35],
      scale: [17 + index % 3 * 4, 22 + index % 2 * 8, 17 + index % 3 * 4],
      color: index % 2 ? "#d0a96b" : "#c49a60",
    });
  }
  addInstances(root, new THREE.ConeGeometry(1, 1, 4), "#ffffff", pyramidEntries, { vertexColors: true });

  const tumbleweeds = [];
  const tumbleGeometry = new THREE.IcosahedronGeometry(0.72, 1);
  for (let index = 0; index < 12; index += 1) {
    const weed = addMesh(root, tumbleGeometry, "#b58d55", [
      -14 + index % 4 * 9,
      0.75,
      -index * trackLength / 12,
    ]);
    weed.userData.dynamic = true;
    tumbleweeds.push({ weed, baseX: weed.position.x, phase: index });
  }
  updates.push((time) => tumbleweeds.forEach(({ weed, baseX, phase }) => {
    weed.rotation.x = time * 0.3 + phase;
    weed.position.x = baseX + Math.sin(time * 0.12 + phase) * 2.5;
  }));

  const birds = [];
  for (let index = 0; index < 7; index += 1) {
    const bird = addMesh(root, new THREE.ConeGeometry(0.38, 1.2, 3), "#655b4e", [
      -52 + index * 17, 24 + index % 3 * 3, -index * trackLength / 7,
    ], { rotation: [0, 0, Math.PI / 2] });
    bird.userData.dynamic = true;
    birds.push({
      bird,
      centerX: bird.position.x,
      centerZ: bird.position.z,
      phase: index * Math.PI / 3,
      radius: 7 + index % 3 * 2,
    });
  }
  updates.push((time) => birds.forEach(({ bird, centerX, centerZ, phase, radius }) => {
    const angle = time * 0.16 + phase;
    bird.position.x = centerX + Math.cos(angle) * radius;
    bird.position.z = centerZ + Math.sin(angle) * radius;
    bird.rotation.z = Math.sin(time * 1.2 + phase) * 0.06;
  }));

  const bleacher = new THREE.Mesh(
    new THREE.BoxGeometry(7, 2.1, 12),
    material("#aa7a4d"),
  );
  bleacher.position.set(TRACK_WIDTH / 2 + 4.5, 1.2, -trackLength + 8);
  root.add(bleacher);
  const camelPositions = [];
  const camelBody = [];
  const camelNeck = [];
  const camelHeads = [];
  for (let index = 0; index < 5; index += 1) {
    const side = index % 2 ? 1 : -1;
    const x = side * (TRACK_WIDTH / 2 + 4 + index % 2 * 1.8);
    const z = -trackLength + 5 + index * 1.8;
    camelBody.push({ position: [x, 1.1, z], scale: [1.35, 0.76, 0.72] });
    camelNeck.push({ position: [x + side * 0.85, 1.78, z], scale: [0.28, 1.5, 0.3], rotation: [0, 0, -side * 0.32] });
    camelHeads.push({ position: [x + side * 0.98, 2.45, z], scale: [0.38, 0.36, 0.4] });
    camelPositions.push({
      x,
      y: 2.15,
      z,
      scale: 0.8,
      rotation: side > 0 ? Math.PI / 2 : -Math.PI / 2,
    });
  }
  addInstances(root, new THREE.SphereGeometry(1, 10, 8), "#b98754", camelBody);
  addInstances(root, new THREE.CylinderGeometry(0.5, 0.5, 1, 8), "#b98754", camelNeck);
  addInstances(root, new THREE.SphereGeometry(1, 8, 6), "#c99a61", camelHeads);
  const animateSpectators = createCrowd(root, camelPositions, ["#dc7655", "#397b9d", "#ecd092", "#73538c"]);
  updates.push((time, progress) => animateSpectators(time, progress > 0.8 ? 0.12 : 0.035));

  addDistanceSigns(root, trackLength, { pole: "#9b7148", board: "#e5bd68", ink: "#ab684c", text: "#fff3ce" });
  const startArch = addThemeArch(root, theme, "desert", 0, "START");
  const finishArch = addThemeArch(root, theme, "desert", -raceDistance, "FINISH");
  return {
    finishArch,
    update(time, progress, raceTime, countdown) {
      updates.forEach((update) => update(time, progress));
      startArch.userData.startLamps?.forEach(({ bulb, light, goLamp }, index) => {
        const active = countdown === "GO" ? goLamp : typeof countdown === "number" && !goLamp && index < countdown;
        bulb.material.emissiveIntensity = active ? 1.2 + Math.sin(time * 8) * 0.15 : 0.05;
        if (light) light.intensity = active ? 0.8 : 0.02;
      });
    },
  };
}
