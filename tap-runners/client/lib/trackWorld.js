import * as THREE from "three";
import { getTheme } from "./themes";
import { TRACK_LENGTH, LANE_COUNT, LANE_WIDTH, TRACK_WIDTH } from "./themes/constants";
import { addLaneMarkings, material, makeSignTexture } from "./themes/shared";
import { buildStadium } from "./themes/stadium";
import { buildPark } from "./themes/park";
import { buildDesert } from "./themes/desert";
import { buildSnow } from "./themes/snow";

export { TRACK_LENGTH, LANE_COUNT, LANE_WIDTH, TRACK_WIDTH };

const BUILDERS = {
  stadium: buildStadium,
  park: buildPark,
  desert: buildDesert,
  snow: buildSnow,
};

function createSky(theme, trackLength) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 18),
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
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(theme.environment === "stadium" ? 5.5 : 7, 16, 10),
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

export function createTrackWorld(themeId, initialDistance = 400) {
  const theme = getTheme(themeId);
  const root = new THREE.Group();
  root.name = `race-world-${theme.environment}`;
  root.add(createSky(theme, initialDistance), createSun(theme));
  addCourseSurface(root, theme, initialDistance);
  const builder = BUILDERS[theme.environment];
  const environment = builder(root, theme, initialDistance, initialDistance);

  return {
    root,
    theme,
    finishArch: environment.finishArch,
    update({ time, countdown, raceDistance, progress = 0, raceTime = 0 }) {
      if (environment.finishArch) environment.finishArch.position.z = -raceDistance;
      environment.update(time, progress, raceTime, countdown);
    },
  };
}

export function disposeTrackWorld(world) {
  if (!world) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
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
  world.root.removeFromParent();
}
