import * as T from "three";
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
  private sky: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  private contactMap = contactTexture();
  private leafGeometry = new T.IcosahedronGeometry(1, 2);
  constructor() {
    this.sky = new T.Mesh(
      new T.SphereGeometry(110, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new T.Color("#9ebdca") },
          horizon: { value: new T.Color("#f4d5b5") },
        },
        vertexShader: `varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 direction;
        void main() { float h = smoothstep(-.08, .65, normalize(direction).y);
          gl_FragColor = vec4(mix(horizon, top, h), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      }),
    );
    this.group.add(this.sky);
    const grass = bevel(42, 0.15, 38, 0x83966b, 0, -0.59, -2);
    grass.castShadow = false;
    this.group.add(grass);
    // Distant layers are progressively lighter, cooler and less contrasted.
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 5; i++) {
        const hill = new T.Mesh(
          new T.SphereGeometry(1, 20, 12),
          new T.MeshStandardMaterial({
            color: [0xc1c5b5, 0xa5b6a3, 0x8da58a][layer],
            roughness: 1,
          }),
        );
        hill.position.set(-45 + i * 22, -4, -44 + layer * 10);
        hill.scale.set(18, 4 + Math.sin(i * 4 + layer) * 1.2, 7);
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
      cloud.scale.set(5 + (i % 3), 0.55, 1.6);
      cloud.position.set(-35 + i * 12, 13 + (i % 3) * 2.4, -42 - (i % 2) * 8);
      this.group.add(cloud);
    }
    for (const [x, z, scale] of [
      [-7, -9, 1.4],
      [-7, -4, 1.1],
      [7, -9, 1.5],
      [7, 7, 1.2],
      [-7, 8, 1.1],
      [-11, -14, 1.8],
      [12, -14, 1.7],
    ])
      this.tree(x, z, scale);
    // Low hedges, kept clear of the play area.
    for (const x of [-7.4, 7.4]) {
      this.group.add(bevel(1, 0.55, 7, 0x5d7d50, x, -0.04, 0, 0.2));
      this.contact(x, 0, 2, 8, -0.5);
    }
    this.clubhouse();
    this.scoreboard();
    this.grass();
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
    const colors = [0x527c57, 0x73915d, 0x91a76b, 0x6b8c60, 0xa6b67b];
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
    this.group.add(trunk, crown);
    this.contact(x, z, scale * 3, scale * 3, -0.5);
  }
  private grass() {
    // All blades in one draw call, with deterministic placement outside the slab.
    const mesh = new T.InstancedMesh(
      new T.ConeGeometry(0.045, 0.28, 3),
      new T.MeshStandardMaterial({ color: 0x718b51, roughness: 1 }),
      500,
    );
    const transform = new T.Object3D();
    const color = new T.Color();
    for (let i = 0; i < 500; i++) {
      const side = i % 2 ? 1 : -1;
      transform.position.set(
        side * (6.7 + ((i * 73) % 100) * 0.06),
        -0.35,
        ((i * 137) % 240) * 0.1 - 12,
      );
      transform.rotation.set(0, i * 1.7, Math.sin(i) * 0.18);
      transform.scale.setScalar(0.6 + (i % 5) * 0.15);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, color.setHSL(0.22, 0.22, 0.4 + (i % 7) * 0.025));
    }
    this.group.add(mesh);
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
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#29483e";
    ctx.fillRect(0, 0, 512, 256);
    ctx.textAlign = "center";
    ctx.fillStyle = "#e9e8c9";
    ctx.font = "24px sans-serif";
    ctx.fillText("EVERGREEN  /  COURT 01", 256, 52);
    ctx.font = "bold 96px monospace";
    ctx.fillText("00 : 00", 256, 164);
    ctx.font = "20px sans-serif";
    ctx.fillText("A LITTLE FRIENDLY COMPETITION", 256, 220);
    const board = bevel(2.7, 1.4, 0.14, 0xddd8bb, 3, 1.85, -9);
    const face = new T.Mesh(
      new T.PlaneGeometry(2.55, 1.25),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas) }),
    );
    face.position.set(3, 1.85, -8.92);
    this.group.add(
      board,
      face,
      bevel(0.09, 1.5, 0.09, 0x476051, 2.1, 0.55, -9),
      bevel(0.09, 1.5, 0.09, 0x476051, 3.9, 0.55, -9),
    );
  }
  theme(sunset: boolean) {
    this.sky.material.uniforms.top.value.set(sunset ? "#969fbd" : "#9ebdca");
    this.sky.material.uniforms.horizon.value.set(
      sunset ? "#f2c39f" : "#efddbf",
    );
  }
  update(time: number, reduced: boolean) {
    this.foliage.forEach((c, i) => {
      c.rotation.z = reduced ? 0 : Math.sin(time * 0.7 + i * 1.7) * 0.014;
    });
  }
  dispose() {
    this.contactMap.dispose();
    this.leafGeometry.dispose();
  }
}
