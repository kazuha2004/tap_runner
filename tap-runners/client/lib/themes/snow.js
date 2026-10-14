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

function mountainGeometry() {
  const geometry = new THREE.ConeGeometry(1, 1, 7, 5);
  const positions = geometry.attributes.position;
  const colors = [];
  const side = new THREE.Color("#718da0");
  const sunlit = new THREE.Color("#a9c0cc");
  const snow = new THREE.Color("#f4fbff");
  const normal = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    normal.fromBufferAttribute(geometry.attributes.normal, index);
    const y = positions.getY(index);
    const face = normal.x > -0.2 ? sunlit : side;
    const tint = y > 0.22 ? snow : face;
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function buildSnow(root, theme, trackLength, raceDistance) {
  const updates = [];
  const mountainEntries = [];
  for (let index = 0; index < 44; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const size = 28 + index % 5 * 11;
    mountainEntries.push({
      position: [side * (88 + index % 4 * 26), size * 0.43, -row * trackLength / 21],
      scale: [size * 1.2, size * 1.8, size],
    });
  }
  addInstances(root, mountainGeometry(), "#ffffff", mountainEntries, { vertexColors: true });

  const pinePositions = [];
  const pineTrunks = [];
  for (let index = 0; index < 240; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const x = side * (11 + (row % 5) * 6.2);
    const z = -row * trackLength / 120;
    const height = 4.5 + row % 4 * 0.55;
    pineTrunks.push({ position: [x, height / 2, z], scale: [1, height, 1] });
    for (let tier = 0; tier < 3; tier += 1) {
      const tierHeight = height * (0.55 + tier * 0.2);
      pinePositions.push({
        position: [x, tierHeight, z],
        scale: [1.45 - tier * 0.2, 1.8, 1.45 - tier * 0.2],
        color: tier === 2 ? "#f2f8f9" : (row % 2 ? "#337a75" : "#286d69"),
      });
    }
  }
  addInstances(root, new THREE.CylinderGeometry(0.18, 0.26, 1, 6), "#765e4c", pineTrunks);
  addInstances(root, new THREE.ConeGeometry(1, 1, 7), "#ffffff", pinePositions, { vertexColors: true });

  const snowbanks = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 80; index += 1) {
      const z = -index * trackLength / 80;
      snowbanks.push({
        position: [side * (TRACK_WIDTH / 2 + 1.65), 0.5, z],
        scale: [1.7, 0.85 + index % 3 * 0.15, 3.8],
        color: index % 2 ? "#f9fdff" : "#e5f3f7",
      });
    }
  }
  addInstances(root, new THREE.SphereGeometry(1, 8, 6), "#ffffff", snowbanks, { vertexColors: true });

  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    const x = side * (58 + row % 2 * 12);
    const z = -trackLength * 0.25 - row * trackLength * 0.2;
    addMesh(root, new THREE.BoxGeometry(12, 6.5, 9), "#9b684d", [x, 3.25, z]);
    addMesh(root, new THREE.ConeGeometry(9, 3.1, 4), "#613f37", [x, 7.9, z], { rotation: [0, Math.PI / 4, 0] });
    addMesh(root, new THREE.BoxGeometry(3.3, 3.8, 0.24), "#77abc0", [x, 2.8, z + 4.62]);
    addMesh(root, new THREE.BoxGeometry(1.1, 2.4, 0.22), "#694936", [x - 3, 1.2, z + 4.7]);
    const chimney = addMesh(root, new THREE.CylinderGeometry(0.4, 0.45, 3.4, 6), "#756b69", [x + 3.6, 8.4, z - 2.1]);
    const smokePositions = new Float32Array(90 * 3);
    for (let particle = 0; particle < 90; particle += 1) {
      smokePositions[particle * 3] = chimney.position.x + (Math.random() - 0.5) * 0.8;
      smokePositions[particle * 3 + 1] = 10 + Math.random() * 5;
      smokePositions[particle * 3 + 2] = chimney.position.z + (Math.random() - 0.5) * 0.8;
    }
    const smokeGeometry = new THREE.BufferGeometry();
    smokeGeometry.setAttribute("position", new THREE.BufferAttribute(smokePositions, 3));
    const smoke = new THREE.Points(
      smokeGeometry,
      new THREE.PointsMaterial({ color: "#e7edf0", size: 0.55, transparent: true, opacity: 0.65 }),
    );
    root.add(smoke);
    updates.push((time) => {
      const attr = smokeGeometry.attributes.position;
      for (let particle = 0; particle < attr.count; particle += 1) {
        attr.setY(particle, 10 + ((attr.getY(particle) - 10 + 0.018) % 5));
        attr.setX(particle, attr.getX(particle) + Math.sin(time + particle) * 0.001);
      }
      attr.needsUpdate = true;
    });
  }

  for (let index = 0; index < 8; index += 1) {
    const side = index % 2 ? 1 : -1;
    const x = side * (22 + index % 3 * 3);
    const z = -index * trackLength / 8 - 16;
    addMesh(root, new THREE.SphereGeometry(0.85, 10, 8), "#fffdf8", [x, 0.85, z]);
    addMesh(root, new THREE.SphereGeometry(0.63, 10, 8), "#fffdf8", [x, 2.15, z]);
    addMesh(root, new THREE.SphereGeometry(0.09, 6, 5), "#425b68", [x - 0.22, 2.22, z + 0.57]);
    addMesh(root, new THREE.SphereGeometry(0.09, 6, 5), "#425b68", [x + 0.22, 2.22, z + 0.57]);
    addMesh(root, new THREE.ConeGeometry(0.13, 0.55, 5), "#ed9b54", [x, 2.1, z + 0.69], { rotation: [Math.PI / 2, 0, 0] });
    for (let arm = -1; arm <= 1; arm += 2) {
      addMesh(root, new THREE.CylinderGeometry(0.055, 0.055, 0.85, 5), "#9b7256", [x + arm * 0.78, 1.35, z]);
    }
  }

  const iglooX = 49;
  const iglooZ = -trackLength * 0.62;
  addMesh(
    root,
    new THREE.SphereGeometry(5.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    "#eaf8fc",
    [iglooX, 0.08, iglooZ],
  );
  addMesh(root, new THREE.BoxGeometry(2.1, 2.5, 0.24), "#668b9c", [iglooX, 1.25, iglooZ + 5.05]);
  addMesh(root, new THREE.BoxGeometry(2.1, 0.2, 0.25), "#d5edf2", [iglooX, 2.55, iglooZ + 5.05]);

  const lake = addMesh(
    root,
    new THREE.PlaneGeometry(42, trackLength * 0.62),
    "#72b9d1",
    [-68, 0.04, -trackLength * 0.53],
    { rotation: [-Math.PI / 2, 0, 0], material: { transparent: true, opacity: 0.88 } },
  );
  lake.receiveShadow = true;

  const lift = new THREE.Group();
  const cableLength = trackLength * 0.9;
  for (const side of [-1, 1]) {
    addMesh(root, new THREE.CylinderGeometry(0.28, 0.38, 18, 7), "#766b61", [side * 35, 9, -cableLength / 2]);
    addMesh(root, new THREE.CylinderGeometry(0.28, 0.38, 18, 7), "#766b61", [side * 35, 9, -cableLength + 4]);
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, cableLength, 5),
      material("#8e9595"),
    );
    cable.rotation.x = Math.PI / 2;
    cable.position.set(side * 35, 17.5, -cableLength / 2);
    root.add(cable);
    for (let index = 0; index < 8; index += 1) {
      const chair = new THREE.Group();
      const z = -index * (cableLength / 8);
      addMesh(chair, new THREE.CylinderGeometry(0.045, 0.045, 1.4, 5), "#6f5a48", [0, -0.8, 0]);
      addMesh(chair, new THREE.BoxGeometry(1.7, 0.16, 0.55), "#dc6b65", [0, -1.45, 0]);
      addMesh(chair, new THREE.BoxGeometry(0.14, 0.75, 0.14), "#806d5e", [0, -1.05, 0]);
      lift.add(chair);
      chair.userData.side = side;
      chair.userData.index = index;
      chair.userData.cableLength = cableLength;
    }
  }
  root.add(lift);
  updates.push((time) => {
    lift.children.forEach((chair) => {
      const phase = (time * 0.012 + chair.userData.index / 8) % 1;
      chair.position.set(chair.userData.side * 35, 17, -phase * chair.userData.cableLength);
    });
  });

  const ropePosts = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 100; index += 1) {
      ropePosts.push({ position: [side * (TRACK_WIDTH / 2 + 2.5), 0.55, -index * trackLength / 100] });
    }
    addMesh(root, new THREE.BoxGeometry(0.07, 0.06, trackLength), "#bc514c", [
      side * (TRACK_WIDTH / 2 + 2.5), 0.75, -trackLength / 2,
    ]);
  }
  addInstances(root, new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5), "#94785f", ropePosts);

  const people = [];
  for (let index = 0; index < 92; index += 1) {
    const side = index % 2 ? 1 : -1;
    people.push({
      x: side * (TRACK_WIDTH / 2 + 2 + index % 3 * 0.4),
      y: 0.18,
      z: -Math.floor(index / 2) * trackLength / 46,
      scale: 0.8 + index % 3 * 0.08,
    });
  }
  const animatePeople = createCrowd(root, people, ["#e85e62", "#4f82b8", "#dbad4d", "#718b81"], {
    skinTones: ["#f4c7a1", "#d9996c", "#8f5e47", "#f0b9a2"],
  });
  updates.push((time, progress) => animatePeople(time, progress > 0.8 ? 0.12 : 0.035));

  const snowCount = 1200;
  const snowPositions = new Float32Array(snowCount * 3);
  for (let index = 0; index < snowCount; index += 1) {
    snowPositions[index * 3] = (Math.random() - 0.5) * 120;
    snowPositions[index * 3 + 1] = Math.random() * 36;
    snowPositions[index * 3 + 2] = -Math.random() * trackLength;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
  root.add(new THREE.Points(
    snowGeometry,
    new THREE.PointsMaterial({ color: "#ffffff", size: 0.28, transparent: true, opacity: 0.9 }),
  ));
  updates.push(() => {
    const attr = snowGeometry.attributes.position;
    for (let index = 0; index < attr.count; index += 1) {
      const y = attr.getY(index) - 0.095;
      attr.setY(index, y < 0 ? 36 : y);
    }
    attr.needsUpdate = true;
  });

  addDistanceSigns(root, trackLength, { shape: "ice", pole: "#9cbec9", board: "#8ac8dc", ink: "#8ac8dc", text: "#f6fcff" });
  const startArch = addThemeArch(root, theme, "snow", 0, "START");
  const finishArch = addThemeArch(root, theme, "snow", -raceDistance, "FINISH");
  return {
    finishArch,
    update(time, progress, raceTime, countdown) {
      updates.forEach((update) => update(time, progress));
      startArch.userData.startLamps?.forEach(({ bulb, light, goLamp }, index) => {
        const active = countdown === "GO" ? goLamp : typeof countdown === "number" && !goLamp && index < countdown;
        bulb.material.emissiveIntensity = active ? 1.2 + Math.sin(time * 10) * 0.15 : 0.05;
        light.intensity = active ? 0.8 : 0.02;
      });
    },
  };
}
