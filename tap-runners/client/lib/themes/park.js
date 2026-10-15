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

export function buildPark(root, theme, trackLength, raceDistance) {
  const updates = [];
  const treeEntries = [];
  const trunkEntries = [];
  const colors = ["#f47aa3", "#f59c55", "#b18be2", "#f3c45e", "#79bd82"];
  for (let index = 0; index < 112; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const x = side * (11 + (row % 3) * 7);
    const z = -row * trackLength / 56;
    trunkEntries.push({ position: [x, 1.75, z], scale: [1, 3.5, 1] });
    treeEntries.push({
      position: [x, 4.1 + (row % 3) * 0.3, z],
      scale: [1.9, 1.8 + row % 3 * 0.28, 1.75],
      color: colors[row % colors.length],
    });
  }
  addInstances(root, new THREE.CylinderGeometry(0.2, 0.35, 1, 7), "#9a6749", trunkEntries);
  addInstances(root, new THREE.IcosahedronGeometry(1, 1), "#ffffff", treeEntries, { vertexColors: true });

  const lollipops = [];
  for (let index = 0; index < 24; index += 1) {
    const side = index % 2 ? 1 : -1;
    const z = -10 - Math.floor(index / 2) * trackLength / 13;
    const x = side * (26 + index % 4 * 3);
    addMesh(root, new THREE.CylinderGeometry(0.11, 0.13, 4.8, 7), "#f6e7bd", [x, 2.4, z]);
    const candy = addMesh(root, new THREE.SphereGeometry(1.7, 12, 10), colors[index % colors.length], [x, 5.1, z]);
    lollipops.push(candy);
  }

  for (let index = 0; index < 26; index += 1) {
    const side = index % 2 ? 1 : -1;
    const z = -index * trackLength / 25;
    const bed = addMesh(
      root,
      new THREE.CylinderGeometry(1.15, 1.35, 0.36, 10),
      "#6b9a53",
      [side * (7.6 + index % 3 * 0.4), 0.12, z],
    );
    bed.rotation.x = Math.PI / 2;
    for (let flower = 0; flower < 4; flower += 1) {
      addMesh(
        root,
        new THREE.SphereGeometry(0.22, 7, 5),
        colors[(index + flower) % colors.length],
        [side * (7.4 + (flower % 2) * 0.5), 0.42, z + (flower < 2 ? -0.45 : 0.45)],
      );
    }
  }

  for (let index = 0; index < 14; index += 1) {
    const z = -index * trackLength / 14 - 8;
    const x = index % 2 ? 14 : -14;
    addMesh(root, new THREE.BoxGeometry(3.4, 0.18, 1.8), "#b7784c", [x, 0.75, z]);
    for (const side of [-1, 1]) {
      addMesh(root, new THREE.BoxGeometry(0.16, 0.75, 0.16), "#855634", [x + side * 1.35, 0.38, z]);
      addMesh(root, new THREE.BoxGeometry(3.2, 0.12, 0.25), "#a9774e", [x + side * 1.35, 0.42, z + 1.05]);
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const z = -trackLength * 0.18 - index * 18;
    const x = (index % 2 ? 1 : -1) * 38;
    addMesh(root, new THREE.BoxGeometry(7, 2.8, 5), ["#f2c16e", "#e88e85", "#9a83c8"][index % 3], [x, 1.4, z]);
    for (let stripe = 0; stripe < 5; stripe += 1) {
      addMesh(root, new THREE.BoxGeometry(1.2, 2.85, 5.1), stripe % 2 ? "#fff1d2" : "#e45f7d", [x - 2.4 + stripe * 1.2, 1.4, z]);
    }
  }

  const hillEntries = [];
  for (let index = 0; index < 54; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const size = 20 + index % 5 * 9;
    hillEntries.push({
      position: [side * (78 + index % 4 * 24), size * 0.36, -row * trackLength / 26],
      scale: [size * 1.8, size * 0.8, size],
      color: index % 2 ? theme.hillFar : theme.hill,
    });
  }
  addInstances(root, new THREE.DodecahedronGeometry(1, 0), "#ffffff", hillEntries, { vertexColors: true });

  const wheel = new THREE.Group();
  wheel.position.set(58, 15, -trackLength * 0.48);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9, 0.28, 8, 36), material("#f3a4b9"));
  wheel.add(rim);
  const hub = addMesh(wheel, new THREE.SphereGeometry(0.65, 10, 8), "#f8dc84", [0, 0, 0]);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI / 5;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 18, 0.18), material("#f8e4c1"));
    spoke.rotation.z = angle;
    wheel.add(spoke);
    addMesh(wheel, new THREE.BoxGeometry(1.2, 1, 1.1), colors[index % colors.length], [
      Math.sin(angle) * 9,
      Math.cos(angle) * 9,
      0,
    ]);
  }
  addMesh(root, new THREE.BoxGeometry(1, 13, 1), "#c58777", [55, 6.5, -trackLength * 0.48]);
  addMesh(root, new THREE.BoxGeometry(1, 13, 1), "#c58777", [61, 6.5, -trackLength * 0.48]);
  root.add(wheel);
  updates.push((time) => { wheel.rotation.z = time * 0.045; });

  const carousel = new THREE.Group();
  carousel.position.set(-57, 1.3, -trackLength * 0.7);
  addMesh(carousel, new THREE.CylinderGeometry(5.5, 6.3, 0.55, 16), "#edb452", [0, 0, 0]);
  addMesh(carousel, new THREE.ConeGeometry(6.4, 2.2, 12), "#e78092", [0, 2, 0]);
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    addMesh(carousel, new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6), "#fff0ce", [
      Math.cos(angle) * 4.7, 1.2, Math.sin(angle) * 4.7,
    ]);
    addMesh(carousel, new THREE.BoxGeometry(1.1, 0.9, 0.8), colors[index % colors.length], [
      Math.cos(angle) * 4.7, 0.5, Math.sin(angle) * 4.7,
    ]);
  }
  root.add(carousel);
  updates.push((time) => { carousel.rotation.y = time * 0.16; });

  const balloons = [];
  for (let index = 0; index < 8; index += 1) {
    const balloon = addMesh(
      root,
      new THREE.SphereGeometry(1, 12, 10),
      colors[index % colors.length],
      [-88 + index * 22, 22 + index % 4 * 5, -index * trackLength / 8],
      { scale: [2.1, 2.7, 1.9] },
    );
    addMesh(root, new THREE.ConeGeometry(0.38, 0.8, 6), "#c99d72", [
      balloon.position.x, balloon.position.y - 3.1, balloon.position.z,
    ], { rotation: [Math.PI, 0, 0] });
    balloons.push({ balloon, baseX: balloon.position.x, baseY: balloon.position.y, phase: index });
  }
  updates.push((time) => balloons.forEach(({ balloon, baseX, baseY, phase }) => {
    balloon.position.y = baseY + Math.sin(time * 0.22 + phase) * 1.5;
    balloon.position.x = baseX + Math.sin(time * 0.025 + phase) * 5;
  }));

  const lightPoints = [];
  for (let index = 0; index < 60; index += 1) {
    const side = index % 2 ? 1 : -1;
    lightPoints.push({
      position: [side * 20, 9 + Math.sin(index * 0.6) * 0.7, -index * trackLength / 60],
      color: ["#ffeaa1", "#fff1d5", "#f6aacb"][index % 3],
    });
  }
  addInstances(root, new THREE.SphereGeometry(0.13, 6, 5), "#ffffff", lightPoints, { vertexColors: true, castShadow: false });
  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 ? 1 : -1;
    const z = -index * trackLength / 8;
    addMesh(root, new THREE.CylinderGeometry(0.08, 0.12, 8.5, 6), "#a77d56", [side * 20, 4.25, z]);
  }
  for (let index = 0; index < 7; index += 1) {
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.LineCurve3(
          new THREE.Vector3(-20, 8.3, -index * trackLength / 7),
          new THREE.Vector3(20, 8.3, -(index + 1) * trackLength / 7),
        ),
        16,
        0.045,
        5,
        false,
      ),
      material("#eacb89"),
    );
    root.add(line);
  }

  const clouds = [];
  for (let index = 0; index < 9; index += 1) {
    const cloud = addMesh(
      root,
      new THREE.IcosahedronGeometry(1, 1),
      "#fff4ed",
      [-80 + index * 20, 35 + index % 3 * 3, -index * trackLength / 9],
      { scale: [8, 2.5, 4] },
    );
    clouds.push({ cloud, baseX: cloud.position.x, phase: index });
  }
  updates.push((time) => clouds.forEach(({ cloud, baseX, phase }) => {
    cloud.position.x = baseX + Math.sin(time * 0.03 + phase) * 3.5;
  }));

  const spectators = [];
  for (let index = 0; index < 80; index += 1) {
    const side = index % 2 ? 1 : -1;
    spectators.push({
      x: side * (TRACK_WIDTH / 2 + 2 + index % 3 * 0.35),
      y: 0.2,
      z: -Math.floor(index / 2) * trackLength / 40,
      scale: 0.85,
      rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    });
  }
  const updateCrowd = createCrowd(root, spectators, ["#ed7d85", "#73a7dd", "#f1bd57", "#9b78c4", "#71b68a"]);
  updates.push((time, progress) => updateCrowd(time, progress > 0.8 ? 0.13 : 0.035));

  addDistanceSigns(root, trackLength, { shape: "round", pole: "#b98765", board: "#f3bc66", ink: "#f3bc66", text: "#fff9e9" });
  const startArch = addThemeArch(root, theme, "park", 0, "START");
  const finishArch = addThemeArch(root, theme, "park", -raceDistance, "FINISH");
  return {
    finishArch,
    update(time, progress, raceTime, countdown) {
      updates.forEach((update) => update(time, progress));
      startArch.userData.startLamps?.forEach(({ bulb, light, goLamp }, index) => {
        const active = countdown === "GO" ? goLamp : typeof countdown === "number" && !goLamp && index < countdown;
        bulb.material.emissiveIntensity = active ? 1.2 + Math.sin(time * 9) * 0.2 : 0.05;
        light.intensity = active ? 1 : 0.02;
      });
    },
  };
}
