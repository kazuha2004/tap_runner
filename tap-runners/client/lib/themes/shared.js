import * as THREE from "three";
import { LANE_COUNT, LANE_WIDTH, TRACK_WIDTH } from "./constants";

export function material(color, options = {}) {
  return new THREE.MeshToonMaterial({
    color,
    flatShading: true,
    ...options,
  });
}

export function addMesh(root, geometry, color, position, options = {}) {
  const mesh = new THREE.Mesh(geometry, material(color, options.material));
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.scale) mesh.scale.set(...options.scale);
  root.add(mesh);
  return mesh;
}

export function addInstances(root, geometry, color, entries, options = {}) {
  const mesh = new THREE.InstancedMesh(
    geometry,
    material(color, {
      vertexColors: Boolean(options.vertexColors && geometry.getAttribute("color")),
    }),
    entries.length,
  );
  const transform = new THREE.Object3D();
  entries.forEach((entry, index) => {
    transform.position.set(...entry.position);
    transform.scale.set(...(entry.scale || [1, 1, 1]));
    transform.rotation.set(...(entry.rotation || [0, 0, 0]));
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (entry.color) mesh.setColorAt(index, new THREE.Color(entry.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

export function makeSignTexture(label, fill, ink = "#fffdf5", width = 256, height = 112) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = ink;
  context.lineWidth = 7;
  context.strokeRect(5, 5, width - 10, height - 10);
  context.fillStyle = ink;
  context.font = `900 ${Math.round(height * 0.49)}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, width / 2, height / 2, width - 20);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function addDistanceSigns(root, distance, style) {
  const entries = [];
  const spacing = style.spacing || (distance <= 100 ? 10 : distance <= 200 ? 25 : 50);
  for (let meters = spacing; meters < distance; meters += spacing) {
    for (const side of [-1, 1]) {
      entries.push({ meters, side, z: -meters });
    }
  }
  const updateables = [];
  const poleMaterial = material(style.pole);
  const signGeometry = style.shape === "round"
    ? new THREE.CylinderGeometry(0.68, 0.68, 0.18, 12)
    : style.shape === "ice"
      ? new THREE.OctahedronGeometry(0.78, 0)
      : new THREE.BoxGeometry(1.35, 0.82, 0.18);
  for (const { meters, side, z } of entries) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.65, 6), poleMaterial);
    pole.position.set(side * (TRACK_WIDTH / 2 + 2.15), 0.82, z);
    pole.castShadow = true;
    root.add(pole);
    const board = addMesh(
      root,
      signGeometry,
      style.board,
      [side * (TRACK_WIDTH / 2 + 2.15), 1.78, z],
    );
    if (style.shape === "round") board.rotation.x = Math.PI / 2;
    if (style.shape === "ice") board.rotation.z = Math.PI / 4;
    const texture = makeSignTexture(`${meters}m`, style.ink, style.text, 256, 112);
    if (texture) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 0.49),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      );
      face.position.set(side * (TRACK_WIDTH / 2 + 2.15), 1.78, z + (side > 0 ? 0.11 : -0.11));
      face.rotation.y = side > 0 ? 0 : Math.PI;
      root.add(face);
      updateables.push(texture);
    }
  }
  return updateables;
}

export function addThemeArch(root, theme, style, z, label) {
  const arch = new THREE.Group();
  arch.position.z = z;
  const x = TRACK_WIDTH / 2 + 0.9;
  if (style === "park") {
    for (const side of [-1, 1]) {
      addMesh(arch, new THREE.CylinderGeometry(0.34, 0.42, 5.8, 10), theme.treeTrunk, [side * x, 2.9, 0]);
    }
    addMesh(arch, new THREE.TorusGeometry(x, 0.4, 8, 24, Math.PI), theme.trackAccent, [0, 5.7, 0]);
    const candyDots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      material("#ffffff"),
      10,
    );
    const transform = new THREE.Object3D();
    for (let index = 0; index < 10; index += 1) {
      const theta = Math.PI * index / 9;
      transform.position.set(Math.cos(theta) * x, 5.2 + Math.sin(theta) * x, 0.05);
      transform.updateMatrix();
      candyDots.setMatrixAt(index, transform.matrix);
      candyDots.setColorAt(index, new THREE.Color(theme.crowd[index % theme.crowd.length]));
    }
    candyDots.instanceMatrix.needsUpdate = true;
    candyDots.instanceColor.needsUpdate = true;
    arch.add(candyDots);
  } else if (style === "desert") {
    for (const side of [-1, 1]) {
      addMesh(arch, new THREE.DodecahedronGeometry(0.9, 0), "#b9784b", [side * x, 2.55, 0], {
        scale: [1, 3.2, 0.8],
      });
    }
    addMesh(arch, new THREE.BoxGeometry(x * 2, 0.9, 0.85), "#d39055", [0, 5.45, 0]);
  } else if (style === "snow") {
    for (const side of [-1, 1]) {
      addMesh(arch, new THREE.ConeGeometry(0.8, 5.8, 5), "#a9d8e8", [side * x, 2.9, 0]);
    }
    addMesh(arch, new THREE.ConeGeometry(x + 0.5, 1.4, 5), "#d9f1f5", [0, 6.15, 0], {
      rotation: [0, Math.PI / 5, 0],
    });
  } else {
    for (const side of [-1, 1]) {
      addMesh(arch, new THREE.BoxGeometry(0.58, 6, 0.7), "#f8f7e9", [side * x, 3, 0]);
    }
    addMesh(arch, new THREE.BoxGeometry(x * 2 + 0.6, 0.9, 0.8), "#e44f59", [0, 6.1, 0]);
    addMesh(arch, new THREE.BoxGeometry(x * 2 + 0.8, 0.16, 0.9), theme.trackAccent, [0, 5.55, 0]);
  }

  const texture = makeSignTexture(label, style === "desert" ? "#9c5638" : "#f7f0db", "#fffdf5", 512, 128);
  if (texture) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(0, 6.05, 0.52);
    arch.add(sign);
  }
  if (label === "FINISH") {
    const tiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.42, 0.035, 0.45),
      material("#ffffff", { vertexColors: true }),
      24,
    );
    const transform = new THREE.Object3D();
    for (let index = 0; index < 24; index += 1) {
      transform.position.set((index - 11.5) * 0.42, 0.03, 0);
      transform.updateMatrix();
      tiles.setMatrixAt(index, transform.matrix);
      tiles.setColorAt(index, new THREE.Color(index % 2 ? "#fffdf5" : "#7b8790"));
    }
    tiles.instanceMatrix.needsUpdate = true;
    tiles.instanceColor.needsUpdate = true;
    arch.add(tiles);
  }
  if (label === "START") {
    arch.userData.startLamps = [];
    for (let index = 0; index < 4; index += 1) {
      const goLamp = index === 3;
      const bulb = addMesh(
        arch,
        new THREE.SphereGeometry(0.22, 10, 8),
        goLamp ? "#63d990" : "#e86660",
        [(index - 1.5) * 0.68, 6.1, 0.5],
        { material: { emissive: goLamp ? "#25894b" : "#a93636", emissiveIntensity: 0.1 } },
      );
      const light = new THREE.PointLight(goLamp ? "#75ed9f" : "#f37b6c", 0.05, 8);
      light.position.copy(bulb.position);
      arch.add(light);
      arch.userData.startLamps.push({ bulb, light, goLamp });
    }
  }
  root.add(arch);
  return arch;
}

export function createCrowd(root, positions, colors, options = {}) {
  const bodyGeometry = new THREE.CapsuleGeometry(0.16, 0.34, 2, 5);
  const headGeometry = new THREE.SphereGeometry(0.14, 8, 6);
  const bodyMaterial = material("#ffffff");
  const headMaterial = material("#ffffff");
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, positions.length);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((entry, index) => {
    const scale = entry.scale || 1;
    const phase = entry.phase ?? Math.random() * Math.PI * 2;
    const color = colors[index % colors.length];
    dummy.position.set(entry.x, entry.y + 0.25 * scale, entry.z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, entry.rotation || 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(index, dummy.matrix);
    bodies.setColorAt(index, new THREE.Color(color));
    dummy.position.set(entry.x, entry.y + 0.55 * scale, entry.z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    heads.setMatrixAt(index, dummy.matrix);
    heads.setColorAt(index, new THREE.Color(options.skinTones
      ? options.skinTones[index % options.skinTones.length]
      : ["#f4c7a1", "#d9996c", "#8f5e47", "#f0b9a2"][index % 4]));
    entry.phase = phase;
  });
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
  root.add(bodies, heads);
  return (time, excitement = 0.06) => {
    positions.forEach((entry, index) => {
      const bob = Math.abs(Math.sin(time * 2.4 + entry.phase)) * excitement;
      dummy.position.set(entry.x, entry.y + 0.25 * (entry.scale || 1) + bob, entry.z);
      dummy.scale.setScalar(entry.scale || 1);
      dummy.rotation.set(0, entry.rotation || 0, Math.sin(time + entry.phase) * 0.025);
      dummy.updateMatrix();
      bodies.setMatrixAt(index, dummy.matrix);
      dummy.position.y = entry.y + 0.55 * (entry.scale || 1) + bob;
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
}

export function addWavingFlags(root, positions, colors) {
  const flags = [];
  positions.forEach(([x, y, z], index) => {
    addMesh(root, new THREE.CylinderGeometry(0.045, 0.06, y, 6), "#fff0d6", [x, y / 2, z]);
    const flag = addMesh(
      root,
      new THREE.PlaneGeometry(1.4, 0.8, 5, 4),
      colors[index % colors.length],
      [x + 0.72, y - 0.45, z],
      { material: { side: THREE.DoubleSide } },
    );
    flag.userData.baseVertices = flag.geometry.attributes.position.array.slice();
    flags.push(flag);
  });
  return (time) => {
    flags.forEach((flag, flagIndex) => {
      const positionsAttribute = flag.geometry.attributes.position;
      const base = flag.userData.baseVertices;
      for (let vertex = 0; vertex < positionsAttribute.count; vertex += 1) {
        positionsAttribute.setZ(
          vertex,
          base[vertex * 3] * (0.08 + Math.sin(time * 2.2 + vertex + flagIndex) * 0.1),
        );
      }
      positionsAttribute.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    });
  };
}

export function addLaneMarkings(root, length) {
  const lineMaterial = material("#fffdf2");
  const lines = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.055, 0.025, length),
    lineMaterial,
    LANE_COUNT + 1,
  );
  const dummy = new THREE.Object3D();
  for (let lane = 0; lane <= LANE_COUNT; lane += 1) {
    dummy.position.set((lane - LANE_COUNT / 2) * LANE_WIDTH, 0.015, -length / 2);
    dummy.updateMatrix();
    lines.setMatrixAt(lane, dummy.matrix);
  }
  lines.instanceMatrix.needsUpdate = true;
  root.add(lines);
}
