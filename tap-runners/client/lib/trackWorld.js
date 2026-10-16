import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getTheme } from "./themes";
import { TRACK_LENGTH, LANE_COUNT, LANE_WIDTH, TRACK_WIDTH } from "./themes/constants";
import { addLaneMarkings, clearThemeMaterialCache, material, makeSignTexture } from "./themes/shared";
import { buildStadium } from "./themes/stadium";
import { buildPark } from "./themes/park";
import { buildDesert } from "./themes/desert";
import { buildSnow } from "./themes/snow";
import { getSceneQuality } from "./quality";

export { TRACK_LENGTH, LANE_COUNT, LANE_WIDTH, TRACK_WIDTH };

const BUILDERS = {
  stadium: buildStadium,
  park: buildPark,
  desert: buildDesert,
  snow: buildSnow,
};

function mergeStaticMeshes(root) {
  const groups = new Map();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.userData.dynamic) return;
    if (
      Array.isArray(object.material)
      || object.material?.map
      || object.material?.transparent
      || object.material?.isShaderMaterial
    ) return;
    let parent = object.parent;
    while (parent && parent !== root) {
      if (parent.userData.dynamic) return;
      parent = parent.parent;
    }
    const position = object.getWorldPosition(new THREE.Vector3());
    const bucket = `${Math.floor(position.x / 60)}:${Math.floor(position.z / 80)}`;
    const geometry = object.geometry;
    const attributes = Object.keys(geometry.attributes).sort().join(",");
    const key = `${object.material.uuid}:${geometry.type}:${attributes}:${Boolean(geometry.index)}:${bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    const transformed = geometry.clone().toNonIndexed();
    transformed.applyMatrix4(object.matrixWorld);
    groups.get(key).push({ object, transformed });
  });

  root.userData.mergedSourceGeometries = [];
  for (const entries of groups.values()) {
    if (entries.length < 2) {
      entries.forEach(({ transformed }) => transformed.dispose());
      continue;
    }
    const geometry = mergeGeometries(entries.map(({ transformed }) => transformed), false);
    entries.forEach(({ transformed }) => transformed.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const source = entries[0].object;
    const merged = new THREE.Mesh(geometry, source.material);
    merged.name = "merged-static-scenery";
    merged.castShadow = source.castShadow;
    merged.receiveShadow = source.receiveShadow;
    merged.userData.staticMerged = true;
    entries.forEach(({ object }) => {
      root.userData.mergedSourceGeometries.push(object.geometry);
      object.removeFromParent();
    });
    root.add(merged);
  }
}

function createSky(theme, trackLength) {
  const segments = getSceneQuality().id === "HIGH" ? [32, 18] : [16, 10];
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, ...segments),
    new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(theme.skyTop) },
        horizonColor: { value: new THREE.Color(theme.skyBottom) },
      },
      vertexShader: `
        varying vec3 skyPosition;
        void main() {
          skyPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 skyPosition;
        void main() {
          float gradient = smoothstep(-0.24, 0.78, normalize(skyPosition).y);
          gl_FragColor = vec4(mix(horizonColor, topColor, gradient), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.position.z = -trackLength / 2;
  sky.renderOrder = -10;
  sky.name = "themed-gradient-sky";
  return sky;
}

function createSun(theme) {
  const segments = getSceneQuality().id === "HIGH" ? [16, 10] : [8, 6];
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(theme.environment === "stadium" ? 5.5 : 7, ...segments),
    new THREE.MeshBasicMaterial({ color: theme.sun, fog: false }),
  );
  sun.position.set(...theme.sunPosition);
  sun.name = "theme-sun";
  return sun;
}

function addCourseSurface(root, theme, trackLength) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(330, trackLength + 220),
    material(theme.ground),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.23, -trackLength / 2);
  ground.receiveShadow = true;
  ground.name = "themed-full-length-ground";
  root.add(ground);

  const track = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH + 1.15, 0.22, trackLength),
    material(theme.track),
  );
  track.position.set(0, -0.12, -trackLength / 2);
  track.receiveShadow = true;
  track.name = "straight-running-track";
  root.add(track);
  addLaneMarkings(root, trackLength);

  const shoulders = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.42, 0.028, trackLength),
    material(theme.trackAccent),
    2,
  );
  for (const [index, side] of [-1, 1].entries()) {
    const transform = new THREE.Object3D();
    transform.position.set(side * (TRACK_WIDTH / 2 + 0.28), 0.022, -trackLength / 2);
    transform.updateMatrix();
    shoulders.setMatrixAt(index, transform.matrix);
  }
  shoulders.instanceMatrix.needsUpdate = true;
  root.add(shoulders);

  const markerSpacing = trackLength <= 100 ? 10 : trackLength <= 200 ? 25 : 50;
  const markerCount = trackLength / markerSpacing - 1;
  const markers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TRACK_WIDTH - 0.12, 0.026, 0.12),
    material("#fff8e9"),
    markerCount,
  );
  for (let index = 0; index < markerCount; index += 1) {
    const transform = new THREE.Object3D();
    transform.position.set(0, 0.025, -(index + 1) * markerSpacing);
    transform.updateMatrix();
    markers.setMatrixAt(index, transform.matrix);
  }
  markers.instanceMatrix.needsUpdate = true;
  root.add(markers);

  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH + 0.2, 0.03, 0.38),
    material("#fffdf5"),
  );
  startLine.position.y = 0.03;
  root.add(startLine);

  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.76, 0.12, 1.1),
    material("#66828b"),
    LANE_COUNT,
  );
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const transform = new THREE.Object3D();
    transform.position.set((lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH, 0.08, 1.65);
    transform.updateMatrix();
    blocks.setMatrixAt(lane, transform.matrix);
  }
  blocks.instanceMatrix.needsUpdate = true;
  root.add(blocks);

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const texture = makeSignTexture(String(lane + 1), "#fff9ed", "#70564a", 128, 128);
    if (!texture) continue;
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshToonMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    number.rotation.x = -Math.PI / 2;
    number.position.set((lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH, 0.045, 3.1);
    root.add(number);
  }
}

function addItemBoxes(root, theme, boxes) {
  if (!boxes.length) return null;
  const texture = makeSignTexture("?", "#f0b53f", "#fffdf5", 128, 128);
  const geometry = new RoundedBoxGeometry(0.85, 0.85, 0.85, 2, 0.12);
  const boxMaterial = getSceneQuality().id === "HIGH"
    ? new THREE.MeshStandardMaterial({
      map: texture,
      color: "#fffdf5",
      roughness: 0.28,
      metalness: 0.08,
    })
    : new THREE.MeshLambertMaterial({ map: texture, color: "#fffdf5" });
  const mesh = new THREE.InstancedMesh(
    geometry,
    boxMaterial,
    boxes.length,
  );
  mesh.name = "race-item-boxes";
  mesh.userData.distanceCull = false;
  const transform = new THREE.Object3D();
  boxes.forEach((box, instanceIndex) => {
    transform.position.set(
      (box.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
      0.8,
      -box.distance,
    );
    transform.updateMatrix();
    mesh.setMatrixAt(instanceIndex, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  const halo = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.62, 0.035, 5, 16),
    new THREE.MeshBasicMaterial({ color: theme.trackAccent, transparent: true, opacity: 0.85 }),
    boxes.length,
  );
  halo.name = "race-item-box-rings";
  halo.userData.distanceCull = false;
  boxes.forEach((box, instanceIndex) => {
    transform.position.set(
      (box.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
      0.035,
      -box.distance,
    );
    transform.rotation.set(Math.PI / 2, 0, 0);
    transform.updateMatrix();
    halo.setMatrixAt(instanceIndex, transform.matrix);
  });
  halo.instanceMatrix.needsUpdate = true;
  root.add(halo);
  mesh.castShadow = true;
  return {
    mesh,
    halo,
    boxes,
    transform,
    fadedAt: new Float64Array(boxes.length),
    texture,
  };
}

function addBoostPads(root, theme, pads) {
  if (!pads.length) return null;
  const shape = new THREE.Shape();
  shape.moveTo(-0.34, -0.42);
  shape.lineTo(0.34, -0.42);
  shape.lineTo(0.34, 0.04);
  shape.lineTo(0.52, 0.04);
  shape.lineTo(0, 0.48);
  shape.lineTo(-0.52, 0.04);
  shape.lineTo(-0.34, 0.04);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: theme.trackAccent, side: THREE.DoubleSide }),
    pads.length,
  );
  mesh.name = "race-boost-pads";
  mesh.userData.distanceCull = false;
  const transform = new THREE.Object3D();
  pads.forEach((pad, index) => {
    transform.position.set(
      (pad.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
      0.018,
      -pad.distance,
    );
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return { mesh, pads, transform, fadedAt: new Float64Array(pads.length) };
}

export function createTrackWorld(themeId, initialDistance = 400, itemBoxes = [], boostPads = []) {
  const theme = getTheme(themeId);
  const root = new THREE.Group();
  root.name = `race-world-${theme.environment}`;
  root.add(createSky(theme, initialDistance), createSun(theme));
  addCourseSurface(root, theme, initialDistance);
  const builder = BUILDERS[theme.environment];
  const environment = builder(root, theme, initialDistance, initialDistance);
  mergeStaticMeshes(root);
  let itemBoxSystem = addItemBoxes(root, theme, itemBoxes);
  let boostPadSystem = addBoostPads(root, theme, boostPads);
  root.traverse((object) => {
    if (
      (object.isMesh || object.isInstancedMesh || object.isPoints)
      && object.userData.distanceCull !== false
      && object.name !== "themed-full-length-ground"
      && object.name !== "straight-running-track"
      && object.name !== "themed-gradient-sky"
    ) {
      object.userData.distanceCull = true;
    }
  });
  let updateFrame = 0;
  const quality = getSceneQuality();

  return {
    root,
    cullPosition: new THREE.Vector3(),
    cullScale: new THREE.Vector3(),
    theme,
    finishArch: environment.finishArch,
    setItemBoxes(boxes) {
      if (itemBoxSystem) {
        root.remove(itemBoxSystem.mesh);
        root.remove(itemBoxSystem.halo);
        itemBoxSystem.mesh.geometry.dispose();
        itemBoxSystem.mesh.material.dispose();
        itemBoxSystem.halo.geometry.dispose();
        itemBoxSystem.halo.material.dispose();
        itemBoxSystem.texture?.dispose();
      }
      itemBoxSystem = addItemBoxes(root, theme, boxes);
    },
    setBoostPads(pads) {
      if (boostPadSystem) {
        root.remove(boostPadSystem.mesh);
        boostPadSystem.mesh.geometry.dispose();
        boostPadSystem.mesh.material.dispose();
      }
      boostPadSystem = addBoostPads(root, theme, pads);
    },
    hitItemBox(boxIndex, time) {
      if (!itemBoxSystem) return;
      const instanceIndex = itemBoxSystem.boxes.findIndex((box) => box.index === boxIndex);
      if (instanceIndex >= 0 && !itemBoxSystem.fadedAt[instanceIndex]) {
        itemBoxSystem.fadedAt[instanceIndex] = time || 0.000001;
      }
    },
    hitBoostPad(padIndex, time) {
      if (!boostPadSystem) return;
      const instanceIndex = boostPadSystem.pads.findIndex((pad) => pad.index === padIndex);
      if (instanceIndex >= 0 && !boostPadSystem.fadedAt[instanceIndex]) {
        boostPadSystem.fadedAt[instanceIndex] = time || 0.000001;
      }
    },
    update({ time, countdown, raceDistance, progress = 0, raceTime = 0 }) {
      if (environment.finishArch) environment.finishArch.position.z = -raceDistance;
      if (itemBoxSystem) {
        for (let index = 0; index < itemBoxSystem.boxes.length; index += 1) {
          const fadedAt = itemBoxSystem.fadedAt[index];
          const fade = fadedAt ? Math.max(0, 1 - (time - fadedAt) / 0.3) : 1;
          const box = itemBoxSystem.boxes[index];
          itemBoxSystem.transform.position.set(
            (box.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
            0.8 + Math.sin(time * 2.5 + index) * 0.12,
            -box.distance,
          );
          itemBoxSystem.transform.rotation.set(0, time * 0.45, 0);
          const pulse = 1 + Math.sin(time * 4 + index) * 0.035;
          itemBoxSystem.transform.scale.setScalar(pulse * fade);
          itemBoxSystem.transform.updateMatrix();
          itemBoxSystem.mesh.setMatrixAt(index, itemBoxSystem.transform.matrix);
          itemBoxSystem.transform.position.y = 0.035;
          itemBoxSystem.transform.rotation.set(Math.PI / 2, 0, 0);
          itemBoxSystem.transform.scale.setScalar(fade * (1 + Math.sin(time * 3 + index) * 0.07));
          itemBoxSystem.transform.updateMatrix();
          itemBoxSystem.halo.setMatrixAt(index, itemBoxSystem.transform.matrix);
        }
        itemBoxSystem.mesh.instanceMatrix.needsUpdate = true;
        itemBoxSystem.halo.instanceMatrix.needsUpdate = true;
      }
      if (boostPadSystem) {
        for (let index = 0; index < boostPadSystem.pads.length; index += 1) {
          const fadedAt = boostPadSystem.fadedAt[index];
          const fade = fadedAt ? Math.max(0, 1 - (time - fadedAt) / 0.35) : 1;
          const pad = boostPadSystem.pads[index];
          boostPadSystem.transform.position.set(
            (pad.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
            0.018,
            -pad.distance,
          );
          boostPadSystem.transform.rotation.set(-Math.PI / 2, 0, 0);
          const pulse = 1 + Math.sin(time * 4 + index) * 0.06;
          boostPadSystem.transform.scale.set(pulse * fade, pulse * fade, 1);
          boostPadSystem.transform.updateMatrix();
          boostPadSystem.mesh.setMatrixAt(index, boostPadSystem.transform.matrix);
        }
        boostPadSystem.mesh.instanceMatrix.needsUpdate = true;
      }
      updateFrame += 1;
      if (quality.crowdAnimationInterval === 0) return;
      if (updateFrame % quality.crowdAnimationInterval === 0) {
        environment.update(time, progress, raceTime, countdown);
      }
    },
  };
}

export function cullTrackWorld(world, camera, frame) {
  if (frame % 8 !== 0) return;
  const ahead = 150;
  const behind = 50;
  const position = world.cullPosition;
  world.root.updateMatrixWorld(true);
  world.root.traverse((object) => {
    if (!object.userData.distanceCull) return;
    // Instanced scenery spans many track positions; the base geometry's center is not its bounds.
    if (object.isInstancedMesh || object.isPoints || !object.isMesh) return;
    if (!object.geometry) return;
    if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
    position.copy(object.geometry.boundingSphere.center);
    object.localToWorld(position);
    object.getWorldScale(world.cullScale);
    const radius = object.geometry.boundingSphere.radius * Math.max(
      Math.abs(world.cullScale.x),
      Math.abs(world.cullScale.y),
      Math.abs(world.cullScale.z),
    );
    object.visible = position.z - radius <= camera.position.z + behind
      && position.z + radius >= camera.position.z - ahead;
  });
}

export function disposeTrackWorld(world) {
  if (!world) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  (world.root.userData.mergedSourceGeometries || []).forEach((geometry) => geometries.add(geometry));
  world.root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((item) => {
      if (!item) return;
      materials.add(item);
      for (const value of Object.values(item)) {
        if (value?.isTexture) textures.add(value);
      }
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((item) => item.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  clearThemeMaterialCache();
  world.root.removeFromParent();
}
