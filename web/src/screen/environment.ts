import * as T from "three";
import { surface } from "./art-surface";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function bevel(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
  radius = 0.06,
) {
  const mesh = new T.Mesh(
    new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)),
    new T.MeshStandardMaterial({ color, roughness: 0.84 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A single gradient texture is shared by all baked contact-occlusion patches. */
function contactTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, "rgba(30,48,37,.32)");
  gradient.addColorStop(0.5, "rgba(30,48,37,.14)");
  gradient.addColorStop(1, "rgba(30,48,37,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(canvas);
}

export class ParkEnvironment {
  readonly group = new T.Group();
  private foliage: T.Group[] = [];
  private foreground: T.Mesh[] = [];
  private sky: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  private contactMap = contactTexture();
  private leafGeometry = new T.IcosahedronGeometry(1, 2);
  private scoreboardMap!: T.CanvasTexture;
  private displayedScore: [number, number] = [-1, -1];
  constructor() {
    this.sky = new T.Mesh(
      new T.SphereGeometry(110, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new T.Color("#79a8cb") },
          horizon: { value: new T.Color("#f4d5b5") },
        },
        vertexShader: `varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 direction;
        void main() { float h = smoothstep(-.65, .05, normalize(direction).y);
          gl_FragColor = vec4(mix(horizon, top, h), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    );
    this.group.add(this.sky);
    const grass = bevel(42, 0.15, 38, 0x52645a, 0, -0.59, -2);
    grass.material.dispose();
    grass.material = surface(0x52645a, "grass");
    grass.castShadow = false;
    this.group.add(grass);
    // Distant layers are progressively lighter, cooler and less contrasted.
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 5; i++) {
        const hill = new T.Mesh(
          // Smooth, overlapping silhouettes avoid the old angular gray wedge.
          new T.SphereGeometry(1, 64, 32),
          new T.MeshStandardMaterial({
            color: [0x778780, 0x687c72, 0x596e63][layer],
            roughness: 1,
          }),
        );
        hill.position.set(-45 + i * 22, -6, -52 + layer * 9);
        hill.scale.set(20, 6.5 + Math.sin(i * 4 + layer) * 0.6, 9);
        this.group.add(hill);
      }
    }
    const cloudMaterial = new T.MeshBasicMaterial({
      color: 0xfff5e2,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    for (let i = 0; i < 7; i++) {
      const cloud = new T.Mesh(this.leafGeometry, cloudMaterial);
      cloud.scale.set(3.5 + (i % 3), 0.45, 1.3);
      cloud.position.set(-30 + i * 10, 4 + (i % 3) * 1.2, -26 - (i % 2) * 8);
      this.group.add(cloud);
    }
    for (const [x, z, scale] of [
      [-7, -9, 1.4],
      [-7, -4, 1.1],
      [7, -9, 1.5],
      [10, 8, 0.55],
      [-10, 8, 0.55],
      [-11, -14, 1.8],
      [12, -14, 1.7],
    ])
      this.tree(x, z, scale);
    // Low hedges, kept clear of the play area.
    for (const x of [-7.4, 7.4]) {
      this.group.add(bevel(1, 0.45, 7, 0x41594c, x, -0.09, 0, 0.2));
      this.contact(x, 0, 2, 8, -0.5);
    }
    this.clubhouse();
    this.scoreboard();
    this.contact(0, 0, 16, 23, -0.5);
  }
  contact(x: number, z: number, w: number, d: number, y = 0.063) {
    const patch = new T.Mesh(
      new T.PlaneGeometry(w, d),
      new T.MeshBasicMaterial({
        map: this.contactMap,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, y, z);
    this.group.add(patch);
    return patch;
  }
  private tree(x: number, z: number, scale: number) {
    const trunk = bevel(0.2, 1.6, 0.22, 0x866b4d, x, 0.3, z);
    const crown = new T.Group();
    crown.position.set(x, 1, z);
    crown.scale.setScalar(scale);
    const colors = [0x344e45, 0x4a6154, 0x637363, 0x405c50, 0x71806b];
    // Flattened interlocking lobes form a broad crown, rather than stacked spheres.
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4;
      const leaf = new T.Mesh(
        this.leafGeometry,
        new T.MeshStandardMaterial({
          color: colors[i % colors.length],
          roughness: 0.94,
        }),
      );
      leaf.position.set(
        Math.cos(angle) * (i ? 0.54 : 0),
        0.6 + (i % 3) * 0.32,
        Math.sin(angle) * 0.5,
      );
      leaf.scale.set(0.88, 0.65 + (i % 2) * 0.18, 0.84);
      leaf.castShadow = leaf.receiveShadow = true;
      crown.add(leaf);
    }
    this.foliage.push(crown);
    if (z > 0) {
      this.foreground.push(trunk);
      crown.traverse((object) => {
        if (object instanceof T.Mesh) this.foreground.push(object);
      });
      for (const object of this.foreground) {
        const material = object.material as T.MeshStandardMaterial;
        material.transparent = true;
        material.depthWrite = false;
        object.castShadow = false;
      }
    }
    this.group.add(trunk, crown);
    this.contact(x, z, scale * 3, scale * 3, -0.5);
  }
  private clubhouse() {
    this.group.add(bevel(6, 2.1, 3, 0xd2c3a3, -11, 0.55, -19));
    const roof = new T.Mesh(
      new T.ConeGeometry(4.5, 1.6, 4),
      new T.MeshStandardMaterial({ color: 0x65786b, roughness: 1 }),
    );
    roof.position.set(-11, 2.4, -19);
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);
    for (const x of [-12.7, -10.6])
      this.group.add(bevel(1.25, 0.85, 0.06, 0x566e65, x, 0.8, -17.47));
    this.group.add(bevel(7, 0.12, 1.3, 0xf0dcc0, -11, 1.9, -17));
  }
  private scoreboard() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    this.scoreboardMap = new T.CanvasTexture(canvas);
    this.setScore([0, 0]);
    const board = bevel(2.7, 1.4, 0.14, 0xddd8bb, 3, 1.85, -9);
    const face = new T.Mesh(
      new T.PlaneGeometry(2.55, 1.25),
      new T.MeshBasicMaterial({ map: this.scoreboardMap }),
    );
    face.position.set(3, 1.85, -8.92);
    this.group.add(
      board,
      face,
      bevel(0.09, 1.5, 0.09, 0x476051, 2.1, 0.55, -9),
      bevel(0.09, 1.5, 0.09, 0x476051, 3.9, 0.55, -9),
    );
  }
  setScore(score: [number, number]) {
    if (
      score[0] === this.displayedScore[0] &&
      score[1] === this.displayedScore[1]
    )
      return;
    this.displayedScore = [...score];
    const canvas = this.scoreboardMap.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#29483e";
    ctx.fillRect(0, 0, 512, 256);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e9e8c9";
    ctx.font = "24px sans-serif";
    ctx.fillText("EVERGREEN  /  COURT 01", 256, 52);
    ctx.font = "bold 96px monospace";
    ctx.fillText(
      score.map((points) => String(points).padStart(2, "0")).join(" : "),
      256,
      164,
    );
    ctx.font = "20px sans-serif";
    ctx.fillText("A LITTLE FRIENDLY COMPETITION", 256, 220);
    this.scoreboardMap.needsUpdate = true;
  }
  theme(sunset: boolean) {
    this.sky.material.uniforms.top.value.set(sunset ? "#737b8b" : "#647e8a");
    this.sky.material.uniforms.horizon.value.set(
      sunset ? "#b3a091" : "#929d96",
    );
  }
  update(time: number, reduced: boolean, active = false) {
    this.foliage.forEach((c, i) => {
      c.rotation.z = reduced ? 0 : Math.sin(time * 0.7 + i * 1.7) * 0.014;
    });
    for (const object of this.foreground)
      (object.material as T.MeshStandardMaterial).opacity = active ? 0.18 : 0.7;
  }
  dispose() {
    this.contactMap.dispose();
    this.leafGeometry.dispose();
  }
}
