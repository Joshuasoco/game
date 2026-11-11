import * as T from "three";
import { COURT } from "../game/tuning";
import type { Vec } from "../game/solver";
import { RIVALS, type RivalId } from "../game/ai";
import { ImpactEffects } from "./effects";
import {
  detectQuality,
  type Quality,
  type QualityPreference,
} from "../game/preferences";
import { surface, disposeSurfaceTextures } from "./art-surface";
import { ParkEnvironment, bevel } from "./environment";
import { CourtPostProcessing } from "./post-processing";
import { matchPointSide } from "./match-presentation";
import { SwingFeedback } from "./swing-feedback";
import type { ReadinessSnapshot } from "../game/readiness/evaluate";
import type { FaultEvent } from "../game/rules";
import type { ClarityPreferences } from "../game/readiness/preferences";
const mat = (color: number, roughness = 0.9) =>
  [0xdbbda0, 0x367e69, 0x86b49c, 0xbd8860, 0x4b9274, 0xf0f3db].includes(color)
    ? surface(
        color,
        color === 0xdbbda0
          ? "clay"
          : color === 0xbd8860
            ? "wood"
            : color === 0xf0f3db
              ? "paint"
              : "court",
      )
    : new T.MeshStandardMaterial({ color, roughness });
function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = bevel(w, h, d, color, 0, 0, 0, h < 0.04 ? 0.003 : 0.045);
  m.material.dispose();
  m.material = mat(color);
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
  const skin =
    hat === "visor" ? 0xb78562 : hat === "headband" ? 0xc08f6c : 0xd6ac87;
  const jersey = capsule(0.29, 0.38, color, 0, 0.85, 0);
  const jerseyEdge = new T.Mesh(
    jersey.geometry.clone(),
    new T.MeshBasicMaterial({ color: 0xf2efd8, side: T.BackSide }),
  );
  jerseyEdge.scale.setScalar(1.035);
  jersey.add(jerseyEdge);
  g.add(jersey);
  const shorts = capsule(0.255, 0.1, 0xf5f1df, 0, 0.47, 0);
  shorts.scale.z = 0.8;
  g.add(shorts);
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
  g.add(
    capsule(
      0.255,
      0.02,
      hat === "sunhat" ? 0xb9b9ab : 0x3d302c,
      0,
      1.48,
      0.025,
    ),
  );
  if (hat === "cap" || hat === "sunhat")
    g.add(cylinder(0.27, 0.1, opponent ? 0xf5f1df : color, 0, 1.58, 0));
  if (hat === "cap")
    g.add(box(0.46, 0.04, 0.28, opponent ? 0xf5f1df : color, 0, 1.56, -0.18));
  if (hat === "visor" || hat === "sunhat")
    g.add(sphere(0.14, hat === "sunhat" ? 0xb9b9ab : 0x3d302c, 0, 1.4, 0.22));
  g.add(
    sphere(0.045, skin, -0.25, 1.37, 0),
    sphere(0.045, skin, 0.25, 1.37, 0),
    sphere(0.034, skin, 0, 1.33, -0.245),
    box(0.085, 0.013, 0.016, 0x71523e, 0, 1.27, -0.235),
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
  const face = capsule(0.19, 0.17, 0xfff8db, 0, -0.35, 0);
  face.scale.z = 0.18;
  paddle.add(face);
  const inset = capsule(
    0.155,
    0.15,
    opponent ? 0xf2a278 : 0xfff1b0,
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
  private swingFeedback = new SwingFeedback();
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  readonly camera = new T.PerspectiveCamera(40, 1, 0.1, 180);
  readonly player = character(0xbd623f);
  ai = character(0x83966d, true);
  readonly ball: T.Mesh;
  private observer: ResizeObserver;
  private shadow: T.Mesh;
  private marker: T.Mesh;
  private trail: T.Mesh[] = [];
  private trailPoints: Vec[] = [];
  private markerFade = 0;
  private markerLanded = false;
  private contactPulse = 0;
  private lastBall = new T.Vector3();
  private ballSpeed = 0;
  private disposed = false;
  private alternate = false;
  private active = false;
  private effects = new ImpactEffects();
  private hitPush = 0;
  private matchPoint = false;
  private quality: Quality = "medium";
  private shake = 0;
  private environment = new ParkEnvironment();
  private post?: CourtPostProcessing;
  private automatic = true;
  private frameTotal = 0;
  private frameCount = 0;
  private warmup = 4;
  private intro = 1;
  private pointer = new T.Vector2();
  private cameraDestination = new T.Vector3();
  private playerContact?: T.Mesh;
  private rivalContact?: T.Mesh;
  private pointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = this.container.getBoundingClientRect();
    this.pointer.set(
      (event.clientX - rect.left) / rect.width - 0.5,
      (event.clientY - rect.top) / rect.height - 0.5,
    );
  };
  private pointerLeave = () => this.pointer.set(0, 0);
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  constructor(private container: HTMLElement) {
    this.scene.add(this.swingFeedback.group);
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
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D pickleball court at Evergreen Park",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.scene.background = new T.Color(0xe8eedf);
    this.scene.fog = new T.Fog(0xe8eedf, 40, 85);
    this.scene.add(new T.HemisphereLight(0xb7d5ee, 0x71694d, 1.45));
    const rim = new T.DirectionalLight(0xc5e1ed, 1.5);
    rim.position.set(6, 5, -10);
    this.scene.add(rim);
    const sun = new T.DirectionalLight(0xffd0a0, 3.1);
    sun.position.set(-9, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 55;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    this.scene.add(this.environment.group);
    this.court();
    this.park();
    this.player.group.position.set(1.35, 0, 5.15);
    this.ai.group.position.set(-1.1, 0, -5.05);
    this.scene.add(this.player.group, this.ai.group);
    this.playerContact = this.environment.contact(1.35, 5.15, 1.5, 1.1);
    this.rivalContact = this.environment.contact(-1.1, -5.05, 1.5, 1.1);
    container.addEventListener("pointermove", this.pointerMove);
    container.addEventListener("pointerleave", this.pointerLeave);
    this.ball = sphere(0.144, 0xe5f55b, 1.7, 1.1, 4.7);
    (this.ball.material as T.Material).dispose();
    this.ball.material = new T.MeshStandardMaterial({
      color: 0xecff38,
      emissive: 0xd5f52f,
      emissiveIntensity: 0.28,
      roughness: 0.55,
    });
    this.ball.add(
      new T.Mesh(
        new T.SphereGeometry(0.158, 16, 12),
        new T.MeshBasicMaterial({ color: 0xfffdea, side: T.BackSide }),
      ),
    );
    this.scene.add(this.ball);
    this.ball.name = "match-ball";
    this.ball.castShadow = false;
    this.shadow = this.environment.contact(1.7, 4.7, 0.7, 0.7);
    this.shadow.name = "ball-shadow";
    this.marker = new T.Mesh(
      new T.RingGeometry(0.24, 0.285, 32),
      new T.MeshBasicMaterial({
        color: 0xf2ff85,
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.name = "landing-marker";
    this.marker.position.y = 0.035;
    this.marker.visible = false;
    const markerEdge = new T.Mesh(
      new T.RingGeometry(0.285, 0.32, 32),
      new T.MeshBasicMaterial({
        color: 0x24483f,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.marker.add(markerEdge);
    this.scene.add(this.marker);
    for (let i = 0; i < 7; i++) {
      const m = new T.Mesh(
        new T.SphereGeometry(0.105, 8, 6),
        new T.MeshBasicMaterial({
          color: 0xecf8a2,
          transparent: true,
          opacity: (1 - i / 7) * 0.45,
          depthWrite: false,
        }),
      );
      this.trail.push(m);
      m.name = "ball-trail";
      this.scene.add(m);
    }
    this.camera.position.set(14, 16, 21);
    this.camera.lookAt(0, 0, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.setTheme("park");
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
    for (const x of [-4.1, 4.1]) {
      const g = new T.Group();
      g.add(
        box(0.17, 0.09, 1.9, 0xbd8860, -0.12, 0.52, 0),
        box(0.17, 0.09, 1.9, 0xbd8860, 0.08, 0.52, 0),
        box(0.09, 0.16, 1.9, 0xbd8860, 0.24, 0.74, 0),
        box(0.09, 0.16, 1.9, 0xbd8860, 0.24, 0.94, 0),
        box(0.45, 0.05, 0.06, 0x345b49, 0, 0.76, -0.75),
        box(0.45, 0.05, 0.06, 0x345b49, 0, 0.76, 0.75),
        box(0.28, 0.45, 0.12, 0x345b49, 0, 0.25, -0.65),
        box(0.28, 0.45, 0.12, 0x345b49, 0, 0.25, 0.65),
      );
      g.position.set(x, 0, x < 0 ? 2.9 : -2.8);
      if (x < 0) g.rotation.y = Math.PI;
      this.scene.add(g);
      this.environment.contact(x, x < 0 ? 2.9 : -2.8, 1.4, 2.5);
    }
    for (const z of [-8.1, 8.1]) {
      const foreground = z > 0;
      const fence = new T.Group();
      for (let x = -4.7; x <= 4.8; x += 1.2)
        fence.add(
          cylinder(0.035, 1.25, 0x4c7260, x, 0.59, z),
          sphere(0.055, 0xaab89b, x, 1.23, z),
        );
      // A single batched diamond-wire fence mesh per end.
      const wire: number[] = [];
      for (let x = -4.8; x < 4.8; x += 0.18) {
        const end = Math.min(x + 0.7, 4.8);
        wire.push(x, 0.08, z, end, 1.18, z, x, 1.18, z, end, 0.08, z);
      }
      const mesh = new T.BufferGeometry();
      mesh.setAttribute("position", new T.Float32BufferAttribute(wire, 3));
      fence.add(
        new T.LineSegments(
          mesh,
          new T.LineBasicMaterial({
            color: 0x648373,
            transparent: true,
            opacity: foreground ? 0.09 : 0.26,
            depthWrite: false,
          }),
        ),
      );
      for (const y of [0.4, 0.88, 1.2])
        fence.add(box(9.6, 0.028, 0.028, 0x5c8069, 0, y, z));
      if (foreground) {
        fence.scale.y = 0.45;
        fence.traverse((object) => {
          if (object instanceof T.Mesh) {
            object.material.transparent = true;
            object.material.opacity = 0.2;
            object.material.depthWrite = false;
            object.castShadow = false;
          }
        });
      }
      this.scene.add(fence);
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
        bevel(0.65, 0.5, 0.65, 0xc49170, x, 0.22, z),
        bevel(0.72, 0.09, 0.72, 0xe0b58d, x, 0.47, z),
        sphere(0.3, 0x5c966d, x, 0.64, z),
        sphere(0.22, 0x8ba76b, x + 0.12, 0.8, z),
      );
    }
    this.scene.add(box(0.75, 0.06, 0.4, 0xf1cf9b, 4.5, 0.08, 1.7));
  }
  private resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.post?.resize(w, h);
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
    const sunset = theme === "sunset";
    this.environment.theme(sunset);
    this.scene.background = new T.Color(sunset ? 0xf2c39f : 0xefddbf);
    this.scene.fog = new T.Fog(sunset ? 0x9e9991 : 0x879a95, 32, 105);
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
  setQuality(value: QualityPreference) {
    this.automatic = value === "auto";
    this.applyQuality(value === "auto" ? detectQuality() : value);
  }
  private applyQuality(value: Quality) {
    this.quality = value;
    this.warmup = 4;
    this.frameTotal = this.frameCount = 0;
    this.post?.dispose();
    this.post = undefined;
    this.renderer.autoClear = true;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        value === "low" ? 1 : value === "medium" ? 1.25 : 1.5,
      ),
    );
    this.renderer.shadowMap.enabled = value !== "low";
    this.effects.budget = value === "low" ? 0 : value === "medium" ? 16 : 32;
    const sun = this.scene.children.find(
      (o) => o instanceof T.DirectionalLight && o.castShadow,
    ) as T.DirectionalLight;
    const size = value === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    if (value !== "low")
      this.post = new CourtPostProcessing(
        this.renderer,
        this.scene,
        this.camera,
        value,
      );
    this.renderer.domElement.dataset.quality = value;
    this.resize();
  }
  setReducedMotion(value: boolean) {
    this.reduced =
      value || matchMedia("(prefers-reduced-motion:reduce)").matches;
    document.documentElement.dataset.reducedMotion = String(this.reduced);
  }
  setSwingFeedback(
    snap: ReadinessSnapshot | undefined,
    fault: FaultEvent | undefined,
    preferences: ClarityPreferences,
  ) {
    this.swingFeedback.set(snap, fault, preferences);
  }
  playerScreenPosition(height = 2) {
    const p = this.player.group.position.clone();
    p.y += height;
    p.project(this.camera);
    return { x: (p.x + 1) * 50, y: (1 - p.y) * 50 };
  }
  matchState(score: [number, number]) {
    this.environment.setScore(score);
    this.matchPoint = !!matchPointSide(score);
  }
  react(winner: "player" | "ai") {
    this.player.reaction = winner === "player" ? 1 : -1;
    this.ai.reaction = winner === "ai" ? 1 : -1;
  }
  impact(p: Vec, perfect: boolean, power: number, bounce = false) {
    this.markerLanded = bounce;
    if (!this.reduced) this.contactPulse = 1;
    this.effects.enabled = !this.reduced && this.quality !== "low";
    this.effects.impact(p, perfect, bounce);
    if (!bounce && !this.reduced) {
      this.shake = 0.018 + power * 0.05;
      this.hitPush = power;
    }
  }
  setBall(p: Vec, target?: Vec) {
    this.ball.position.set(p.x, Math.max(0.15, p.y), p.z);
    // Present the held ball beside the serving hand, clear of the torso.
    // The physical ball and all launch calculations retain their existing positions.
    if (!target && Math.abs(p.y - 0.85) < 0.001 && this.active)
      this.ball.position.x += 0.48;
    this.shadow.position.set(this.ball.position.x, 0.064, p.z);
    const scale = 1 + p.y * 0.2;
    this.shadow.scale.setScalar(scale);
    (this.shadow.material as T.MeshBasicMaterial).opacity = 1 / (1 + p.y * 0.3);
    if (target) {
      if (!this.markerLanded) this.markerFade = 0.45;
      this.marker.position.set(target.x, 0.066, target.z);
    }
    this.trailPoints.unshift({ ...p });
    if (this.trailPoints.length > 21) this.trailPoints.pop();
  }
  hit(side: "player" | "ai", backhand = false, smash = false) {
    this.markerLanded = false;
    if (!this.reduced) this.contactPulse = 1;
    (side === "player" ? this.player : this.ai).swing = backhand ? -1 : 1;
    if (smash && !this.reduced) this.shake = 0.08;
  }
  render(dt: number, time: number, playing: boolean, roll = 0) {
    if (this.disposed) return;
    this.swingFeedback.update(
      this.player.group.position,
      this.ball.position,
      time,
      this.reduced,
    );
    this.intro = Math.max(0, this.intro - dt * 0.28);
    const menuMotion = !this.active && !this.reduced;
    const dest = this.cameraDestination;
    if (this.alternate) dest.set(this.player.group.position.x * 0.2, 9.3, 17.5);
    else
      dest.set(
        12 +
          (menuMotion
            ? Math.sin(time * 0.12) * 0.35 + this.pointer.x * 0.7
            : 0),
        10.8 + (menuMotion ? this.pointer.y * 0.45 + this.intro * 2.5 : 0),
        19.8 + (menuMotion ? this.intro * 3 : 0),
      );
    this.camera.position.lerp(dest, Math.min(1, dt * 2));
    if (this.active) {
      const target = new T.Vector3(this.ball.position.x * 0.08, 0.1, -0.4);
      this.camera.lookAt(target);
      this.hitPush = Math.max(0, this.hitPush - dt * 3);
      // Narrow framing on desktop; retain the full court on portrait screens.
      const fov =
        (this.camera.aspect >= 1.4 ? 34 : 40) +
        this.hitPush * 2 -
        (this.matchPoint ? 1 : 0);
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
    if (!this.active) {
      // Shift the court to the open side of the menu card on desktop.
      this.camera.lookAt(this.camera.aspect > 1.2 ? -2.2 : 0, 0.1, 0);
      this.camera.fov += (40 - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
      if (!this.reduced)
        this.ball.position.y = 0.18 + Math.abs(Math.sin(time * 2)) * 0.95;
    }
    this.environment.update(time, this.reduced, this.active);
    if (this.playerContact)
      this.playerContact.position.set(
        this.player.group.position.x,
        0.063,
        this.player.group.position.z,
      );
    if (this.rivalContact)
      this.rivalContact.position.set(
        this.ai.group.position.x,
        0.063,
        this.ai.group.position.z,
      );
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
      const menuScale = this.active ? 1 : 1.12;
      c.group.scale.setScalar(menuScale);
      if (!this.reduced) {
        const walk = playing
          ? Math.sin(time * 12 + c.group.position.x) * 0.16
          : Math.sin(time * 2 + i) * 0.025;
        c.group.scale.y = menuScale * (1 + Math.sin(time * 2 + i) * 0.012);
        c.leftLeg.rotation.x = walk;
        c.rightLeg.rotation.x = -walk;
      }
    }
    this.ballSpeed =
      this.lastBall.distanceTo(this.ball.position) / Math.max(dt, 0.001);
    this.lastBall.copy(this.ball.position);
    this.trail.forEach((m, i) => {
      const p = this.trailPoints[(i + 1) * 2];
      m.visible = playing && !this.reduced && !!p && this.ballSpeed > 1.5;
      if (p) m.position.set(p.x, p.y, p.z);
      const speed = T.MathUtils.clamp(this.ballSpeed / 10, 0, 1);
      m.scale.setScalar((1 - i / 9) * (0.5 + speed));
      (m.material as T.MeshBasicMaterial).opacity = (1 - i / 7) * speed * 0.55;
    });
    if (!playing) this.trailPoints.length = 0;
    this.markerFade = Math.max(0, this.markerFade - dt);
    this.marker.visible = this.markerFade > 0 && this.active;
    if (this.marker.visible) {
      this.marker.scale.setScalar(
        this.reduced ? 1 : 1 + Math.sin(time * 5) * 0.15,
      );
      (this.marker.material as T.MeshBasicMaterial).opacity =
        (this.markerFade / 0.45) *
        (this.reduced ? 0.8 : 0.65 + Math.sin(time * 5) * 0.15);
      (
        (this.marker.children[0] as T.Mesh).material as T.MeshBasicMaterial
      ).opacity = (this.marker.material as T.MeshBasicMaterial).opacity;
    }
    this.contactPulse = Math.max(0, this.contactPulse - dt * 5);
    (this.ball.material as T.MeshStandardMaterial).emissiveIntensity =
      0.28 + this.contactPulse * 0.8;
    this.effects.update(dt, this.camera, this.ball);
    if (this.post) this.post.render(dt, this.active);
    else this.renderer.render(this.scene, this.camera);
    // Ignore hidden tabs and shader warmup before evaluating sustained frame times.
    if (this.automatic && this.quality !== "low" && !document.hidden) {
      if (this.warmup > 0) this.warmup -= dt;
      else {
        this.frameTotal += dt;
        this.frameCount++;
        if (this.frameTotal >= 3) {
          if (this.frameTotal / this.frameCount > 0.019)
            this.applyQuality(this.quality === "high" ? "medium" : "low");
          this.frameTotal = this.frameCount = 0;
        }
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.container.removeEventListener("pointermove", this.pointerMove);
    this.container.removeEventListener("pointerleave", this.pointerLeave);
    this.post?.dispose();
    this.environment.dispose();
    if (this.scene.background instanceof T.Texture)
      this.scene.background.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Sprite) {
        if (!(o instanceof T.Sprite)) o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => {
          if ("map" in m && (m as T.MeshStandardMaterial).map)
            (m as T.MeshStandardMaterial).map!.dispose();
          m.dispose();
        });
      }
    });
    disposeSurfaceTextures();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
