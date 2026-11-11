import * as T from "three";
import { COURT } from "../game/tuning";
import type { Vec } from "../game/solver";
import { RIVALS, type RivalId } from "../game/ai";
import { ImpactEffects } from "./effects";
const mat = (color: number, roughness = 0.9) =>
  new T.MeshStandardMaterial({ color, roughness });
function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function sphere(r: number, color: number, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(new T.SphereGeometry(r, 16, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function capsule(r: number, l: number, color: number, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(new T.CapsuleGeometry(r, l, 4, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cylinder(
  r: number,
  h: number,
  color: number,
  x: number,
  y: number,
  z: number,
) {
  const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export interface Character {
  group: T.Group;
  paddle: T.Group;
  leftLeg: T.Mesh;
  rightLeg: T.Mesh;
  arm: T.Group;
  swing: number;
  reaction: number;
}
function character(color: number, opponent = false, hat = "cap"): Character {
  const g = new T.Group();
  const skin = 0xeab896;
  g.add(capsule(0.29, 0.38, color, 0, 0.85, 0));
  g.add(box(0.49, 0.25, 0.38, 0x213e3c, 0, 0.45, 0));
  const leftLeg = capsule(0.095, 0.27, skin, -0.15, 0.29, 0);
  const rightLeg = capsule(0.095, 0.27, skin, 0.15, 0.29, 0);
  g.add(
    leftLeg,
    rightLeg,
    box(0.22, 0.12, 0.38, 0xf9f8ed, -0.15, 0.08, -0.06),
    box(0.22, 0.12, 0.38, 0xf9f8ed, 0.15, 0.08, -0.06),
  );
  if (hat === "sunhat") {
    const brim = cylinder(0.43, 0.045, 0xf5e1b5, 0, 1.56, 0);
    g.add(brim);
  }
  if (hat === "visor") {
    g.add(box(0.52, 0.04, 0.38, 0xf5f1df, 0, 1.55, -0.2));
  }
  if (hat === "headband") {
    g.add(cylinder(0.263, 0.055, 0xf5f1df, 0, 1.49, 0));
  }
  g.add(sphere(0.25, skin, 0, 1.37, 0));
  g.add(capsule(0.255, 0.02, 0x3d302c, 0, 1.48, 0.025));
  g.add(
    cylinder(0.27, 0.1, color, 0, 1.58, 0),
    box(0.46, 0.04, 0.28, color, 0, 1.56, -0.18),
  );
  g.add(
    sphere(0.025, 0x263b36, -0.08, 1.38, -0.232),
    sphere(0.025, 0x263b36, 0.08, 1.38, -0.232),
  );
  const arm = new T.Group();
  arm.position.set(0.28, 1.01, 0);
  const upper = capsule(0.085, 0.25, color, 0.04, -0.12, 0);
  upper.rotation.z = 0.25;
  arm.add(upper, capsule(0.075, 0.22, skin, 0.12, -0.4, -0.03));
  const paddle = new T.Group();
  paddle.position.set(0.13, -0.55, -0.05);
  paddle.add(cylinder(0.035, 0.27, 0x263e36, 0, -0.03, 0));
  const face = capsule(0.19, 0.17, 0x173d35, 0, -0.35, 0);
  face.scale.z = 0.18;
  paddle.add(face);
  const inset = capsule(
    0.155,
    0.15,
    opponent ? 0xf2a278 : 0xd9ed9a,
    0,
    -0.35,
    -0.037,
  );
  inset.scale.z = 0.1;
  paddle.add(inset);
  arm.add(paddle);
  g.add(arm);
  g.add(capsule(0.08, 0.28, skin, -0.35, 0.76, 0));
  if (opponent) g.rotation.y = Math.PI;
  return { group: g, paddle, leftLeg, rightLeg, arm, swing: 0, reaction: 0 };
}
export class CourtScene {
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  readonly camera = new T.PerspectiveCamera(40, 1, 0.1, 180);
  readonly player = character(0xf27c61);
  ai = character(0x83966d, true);
  readonly ball: T.Mesh;
  private observer: ResizeObserver;
  private shadow: T.Mesh;
  private marker: T.Mesh;
  private trail: T.Mesh[] = [];
  private trailPoints: Vec[] = [];
  private disposed = false;
  private alternate = false;
  private active = false;
  private effects = new ImpactEffects();
  private hitPush = 0;
  private matchPoint = false;
  private shake = 0;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(private container: HTMLElement) {
    this.scene.add(this.effects.group);
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D pickleball court at Evergreen Park",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.scene.background = new T.Color(0xe8eedf);
    this.scene.fog = new T.Fog(0xe8eedf, 40, 85);
    this.scene.add(new T.HemisphereLight(0xfff9e9, 0x8ba58e, 2.8));
    const sun = new T.DirectionalLight(0xffefcf, 3.8);
    sun.position.set(-8, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    this.court();
    this.park();
    this.player.group.position.set(1.35, 0, 5.15);
    this.ai.group.position.set(-1.1, 0, -5.05);
    this.scene.add(this.player.group, this.ai.group);
    this.ball = sphere(0.09, 0xe5f55b, 1.7, 1.1, 4.7);
    this.ball.material = new T.MeshStandardMaterial({
      color: 0xe4f65c,
      emissive: 0x667500,
      emissiveIntensity: 0.16,
    });
    this.scene.add(this.ball);
    this.shadow = new T.Mesh(
      new T.CircleGeometry(0.15, 24),
      new T.MeshBasicMaterial({
        color: 0x254b32,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.marker = new T.Mesh(
      new T.RingGeometry(0.17, 0.205, 32),
      new T.MeshBasicMaterial({
        color: 0xe8f88f,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.035;
    this.marker.visible = false;
    this.scene.add(this.marker);
    for (let i = 0; i < 7; i++) {
      const m = new T.Mesh(
        new T.SphereGeometry(0.06, 8, 6),
        new T.MeshBasicMaterial({
          color: 0xecf8a2,
          transparent: true,
          opacity: (1 - i / 7) * 0.45,
        }),
      );
      this.trail.push(m);
      this.scene.add(m);
    }
    this.camera.position.set(12, 14.5, 18);
    this.camera.lookAt(0, 0, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }
  private court() {
    this.scene.add(box(13, 0.35, 19.5, 0xc8d0b3, 0, -0.3, 0));
    this.scene.add(box(12.8, 0.08, 19.3, 0xdbbda0, 0, -0.09, 0));
    this.scene.add(box(9.8, 0.08, 16.7, 0x4b9274, 0, -0.035, 0));
    this.scene.add(
      box(
        COURT.halfWidth * 2,
        0.025,
        COURT.halfLength * 2,
        0x367e69,
        0,
        0.018,
        0,
      ),
    );
    this.scene.add(
      box(COURT.halfWidth * 2, 0.028, COURT.kitchen * 2, 0x86b49c, 0, 0.025, 0),
    );
    const line = (w: number, d: number, x: number, z: number) =>
      this.scene.add(box(w, 0.012, d, 0xf0f3db, x, 0.046, z));
    for (const x of [-COURT.halfWidth, COURT.halfWidth])
      line(0.045, 13.45, x, 0);
    for (const z of [
      -COURT.halfLength,
      -COURT.kitchen,
      COURT.kitchen,
      COURT.halfLength,
    ])
      line(6.14, 0.045, 0, z);
    line(0.045, 4.57, 0, 4.42);
    line(0.045, 4.57, 0, -4.42);
    for (const x of [-3.35, 3.35])
      this.scene.add(
        cylinder(0.055, 1.05, 0x24483f, x, 0.5, 0),
        sphere(0.075, 0xd1d8b4, x, 1.03, 0),
      );
    // A real open mesh net with a subtly sagging top band.
    const positions: number[] = [];
    const add = (
      x: number,
      y: number,
      z: number,
      a: number,
      b: number,
      c: number,
    ) => positions.push(x, y, z, a, b, c);
    for (let i = 0; i <= 56; i++) {
      const x = -3.3 + (i * 6.6) / 56;
      const top = 0.864 + (Math.abs(x) / 3.3) * 0.05;
      add(x, 0.06, 0, x, top, 0);
    }
    for (let y = 0.09; y < 0.9; y += 0.08) add(-3.3, y, 0, 3.3, y, 0);
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    this.scene.add(
      new T.LineSegments(
        geo,
        new T.LineBasicMaterial({
          color: 0x254e40,
          transparent: true,
          opacity: 0.72,
        }),
      ),
    );
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-3.35, 0.92, 0),
      new T.Vector3(0, 0.87, 0),
      new T.Vector3(3.35, 0.92, 0),
    ]);
    this.scene.add(
      new T.Mesh(new T.TubeGeometry(curve, 32, 0.025, 6, false), mat(0xf1eed7)),
    );
  }
  private park() {
    const tree = (x: number, z: number, s = 1) => {
      const g = new T.Group();
      g.add(cylinder(0.11, 1.2, 0x9e8162, 0, 0.5, 0));
      g.add(
        sphere(0.68, 0x76a77e, -0.2, 1.6, 0),
        sphere(0.74, 0x97b682, 0.25, 1.9, 0.12),
        sphere(0.63, 0x659873, 0.05, 2.3, 0),
      );
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      this.scene.add(g);
    };
    tree(-5.1, -7.6, 1.2);
    tree(-5.3, -4, 0.95);
    tree(5.15, -7.7, 1.15);
    tree(5.3, 6.9, 0.9);
    tree(-5.2, 7.6, 0.8);
    for (const x of [-4.1, 4.1]) {
      const g = new T.Group();
      g.add(
        box(0.38, 0.12, 1.8, 0xbd8860, 0, 0.52, 0),
        box(0.12, 0.45, 1.8, 0xbd8860, 0.19, 0.77, 0),
        box(0.28, 0.45, 0.12, 0x345b49, 0, 0.25, -0.65),
        box(0.28, 0.45, 0.12, 0x345b49, 0, 0.25, 0.65),
      );
      g.position.set(x, 0, x < 0 ? 2.9 : -2.8);
      if (x < 0) g.rotation.y = Math.PI;
      this.scene.add(g);
    }
    for (const z of [-8.1, 8.1]) {
      for (let x = -4.7; x <= 4.8; x += 1.2)
        this.scene.add(cylinder(0.035, 1.25, 0x4c7260, x, 0.59, z));
      for (const y of [0.4, 0.88, 1.2])
        this.scene.add(box(9.6, 0.028, 0.028, 0x5c8069, 0, y, z));
    }
    const sign = box(1.45, 0.65, 0.1, 0xf1efdd, -4.5, 1.5, -6.3);
    this.scene.add(sign, cylinder(0.045, 1.4, 0x56715a, -4.5, 0.67, -6.3));
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f1efdd";
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = "#34584b";
    ctx.textAlign = "center";
    ctx.font = "bold 50px sans-serif";
    ctx.fillText("EVERGREEN", 256, 108);
    ctx.font = "32px sans-serif";
    ctx.fillText("PICKLEBALL CLUB", 256, 168);
    const label = new T.Mesh(
      new T.PlaneGeometry(1.43, 0.63),
      new T.MeshBasicMaterial({ map: new T.CanvasTexture(canvas) }),
    );
    label.position.set(-4.5, 1.5, -6.24);
    this.scene.add(label);
    for (const [x, z] of [
      [4.8, 3.8],
      [-4.7, -1.9],
      [4.6, -5.8],
    ]) {
      this.scene.add(
        cylinder(0.25, 0.5, 0xe5c5a0, x, 0.22, z),
        sphere(0.28, 0x5c966d, x, 0.58, z),
      );
    }
    this.scene.add(box(0.75, 0.06, 0.4, 0xf1cf9b, 4.5, 0.08, 1.7));
  }
  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  setActive(active: boolean) {
    this.active = active;
    this.alternate = active;
  }
  toggleCamera() {
    this.alternate = !this.alternate;
  }
  setTheme(theme: string) {
    this.scene.background = new T.Color(
      theme === "sunset" ? 0xedd8c6 : 0xe8eedf,
    );
    this.scene.fog = new T.Fog(
      theme === "sunset" ? 0xedd8c6 : 0xe8eedf,
      40,
      85,
    );
  }
  setRival(id: RivalId) {
    const old = this.ai;
    const position = old.group.position.clone();
    this.scene.remove(old.group);
    old.group.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    const r = RIVALS[id];
    this.ai = character(parseInt(r.color.slice(1), 16), true, r.hat);
    this.ai.group.position.copy(position);
    this.scene.add(this.ai.group);
  }
  matchState(score: [number, number]) {
    this.matchPoint =
      Math.max(...score) >= 10 && Math.abs(score[0] - score[1]) >= 1;
  }
  react(winner: "player" | "ai") {
    this.player.reaction = winner === "player" ? 1 : -1;
    this.ai.reaction = winner === "ai" ? 1 : -1;
  }
  impact(p: Vec, perfect: boolean, power: number, bounce = false) {
    this.effects.enabled = !this.reduced;
    this.effects.impact(p, perfect, bounce);
    if (!bounce && !this.reduced) {
      this.shake = 0.018 + power * 0.05;
      this.hitPush = power;
    }
  }
  setBall(p: Vec, target?: Vec) {
    this.ball.position.set(p.x, p.y, p.z);
    this.shadow.position.set(p.x, 0.055, p.z);
    const scale = 1 + p.y * 0.2;
    this.shadow.scale.setScalar(scale);
    this.marker.visible = !!target;
    if (target) this.marker.position.set(target.x, 0.06, target.z);
    this.trailPoints.unshift({ ...p });
    if (this.trailPoints.length > 21) this.trailPoints.pop();
  }
  hit(side: "player" | "ai", backhand = false, smash = false) {
    (side === "player" ? this.player : this.ai).swing = backhand ? -1 : 1;
    if (smash && !this.reduced) this.shake = 0.08;
  }
  render(dt: number, time: number, playing: boolean, roll = 0) {
    if (this.disposed) return;
    const dest = this.alternate
      ? new T.Vector3(this.player.group.position.x * 0.2, 9.8, 17.5)
      : new T.Vector3(
          12 +
            (!this.active && !this.reduced ? Math.sin(time * 0.12) * 1.2 : 0),
          14.5,
          18,
        );
    this.camera.position.lerp(dest, Math.min(1, dt * 2));
    if (this.active) {
      const target = new T.Vector3(this.ball.position.x * 0.08, 0.1, -0.4);
      this.camera.lookAt(target);
      this.hitPush = Math.max(0, this.hitPush - dt * 3);
      const fov = 40 + this.hitPush * 3 - (this.matchPoint ? 2 : 0);
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
    if (!this.active) this.camera.lookAt(0, 0.1, 0);
    this.shake = Math.max(0, this.shake - dt * 0.4);
    this.camera.position.x += Math.sin(time * 95) * this.shake;
    for (const [i, c] of [this.player, this.ai].entries()) {
      c.swing = Math.sign(c.swing) * Math.max(0, Math.abs(c.swing) - dt * 3.5);
      c.arm.rotation.x = -Math.sin(c.swing * Math.PI) * 1.8;
      c.paddle.rotation.x = Math.sin(Math.abs(c.swing) * Math.PI) * 0.45;
      c.reaction *= Math.max(0, 1 - dt * 1.6);
      c.group.position.y = this.reduced
        ? 0
        : c.reaction > 0
          ? Math.abs(Math.sin(time * 9)) * c.reaction * 0.22
          : 0;
      c.group.rotation.z = this.reduced
        ? 0
        : c.reaction < 0
          ? Math.sin(time * 6) * Math.abs(c.reaction) * 0.07
          : 0;
      c.arm.rotation.z = i === 0 ? roll * 0.007 : 0;
      if (
        playing &&
        c.swing === 0 &&
        Math.abs(this.ball.position.z - c.group.position.z) < 3
      )
        c.arm.rotation.x -= 0.24;
      if (c.reaction < 0) c.arm.rotation.z += Math.abs(c.reaction) * 0.4;
      if (!this.reduced) {
        const walk = playing
          ? Math.sin(time * 12 + c.group.position.x) * 0.16
          : Math.sin(time * 2 + i) * 0.025;
        c.group.scale.y = 1 + Math.sin(time * 2 + i) * 0.012;
        c.leftLeg.rotation.x = walk;
        c.rightLeg.rotation.x = -walk;
      }
    }
    this.trail.forEach((m, i) => {
      const p = this.trailPoints[(i + 1) * 2];
      m.visible = playing && !!p;
      if (p) m.position.set(p.x, p.y, p.z);
      m.scale.setScalar(
        Math.max(
          0.5,
          Math.min(
            1.7,
            this.trailPoints.length > 2
              ? Math.hypot(
                  this.trailPoints[0].x - this.trailPoints[2].x,
                  this.trailPoints[0].z - this.trailPoints[2].z,
                ) * 6
              : 1,
          ),
        ),
      );
    });
    if (this.marker.visible) {
      this.marker.scale.setScalar(
        this.reduced ? 1 : 1 + Math.sin(time * 4) * 0.09,
      );
      (this.marker.material as T.MeshBasicMaterial).opacity =
        0.5 + Math.sin(time * 3) * 0.15;
    }
    this.effects.update(dt, this.camera, this.ball);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => {
          if ("map" in m && (m as T.MeshStandardMaterial).map)
            (m as T.MeshStandardMaterial).map!.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
