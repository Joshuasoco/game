import * as T from "three";
import type { ReadinessSnapshot } from "../game/readiness/evaluate";
import type { ClarityPreferences } from "../game/readiness/preferences";
import type { FaultEvent } from "../game/rules";
import { COURT } from "../game/tuning";
import { READINESS } from "../game/readiness/config";
const colors = {
  NO_BALL: 0xbbc4c0,
  FAR: 0xbbc4c0,
  GET_READY: 0xffdc65,
  IN_REACH: 0x77ff9c,
  WAIT_BOUNCE: 0xffb459,
  WAIT_KITCHEN: 0xff6767,
  RECOVERING: 0xffffff,
};
const material = (color: number, opacity = 1) =>
  new T.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: T.DoubleSide,
    toneMapped: false,
  });
function label(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#182b24";
  g.beginPath();
  g.arc(48, 48, 44, 0, Math.PI * 2);
  g.fill();
  g.font = "bold 60px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff4d6";
  g.fillText(text, 48, 49);
  const sprite = new T.Sprite(
    new T.SpriteMaterial({
      map: new T.CanvasTexture(canvas),
      depthTest: false,
      toneMapped: false,
    }),
  );
  sprite.scale.setScalar(0.65);
  return sprite;
}
/** Presentation only: all decisions come from the readiness store and referee. */
export class SwingFeedback {
  readonly group = new T.Group();
  private ring = new T.Group();
  private line = new T.Line(
    new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]),
    new T.LineDashedMaterial({
      color: 0xffdc65,
      dashSize: 0.12,
      gapSize: 0.14,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  private halo = new T.Mesh(
    new T.SphereGeometry(0.21, 12, 8),
    new T.MeshBasicMaterial({
      color: 0x77ff9c,
      wireframe: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  private kitchen = new T.Mesh(
    new T.PlaneGeometry(COURT.halfWidth * 2, COURT.kitchen),
    material(0xff4040, 0.3),
  );
  private net = new T.Mesh(
    new T.PlaneGeometry(6.7, COURT.net + 0.2),
    material(0xff6868, 0.55),
  );
  private markers = [label("X"), label("1"), label("2"), label("!")];
  private bounce = label("↷");
  private key = "";
  private recoveringAt = 0;
  private snap?: ReadinessSnapshot;
  private fault?: FaultEvent;
  private preferences?: ClarityPreferences;
  constructor() {
    this.kitchen.rotation.x = -Math.PI / 2;
    this.net.position.set(0, COURT.net / 2, 0);
    this.group.add(
      this.ring,
      this.line,
      this.halo,
      this.kitchen,
      this.net,
      this.bounce,
      ...this.markers,
    );
    this.group.visible = false;
  }
  set(
    snap: ReadinessSnapshot | undefined,
    fault: FaultEvent | undefined,
    preferences: ClarityPreferences,
  ) {
    this.snap = snap;
    this.fault = fault;
    this.preferences = preferences;
  }
  private rebuild(snap: ReadinessSnapshot, highContrast: boolean) {
    this.ring.children.forEach((child) => {
      const mesh = child as T.Mesh<T.RingGeometry, T.MeshBasicMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.ring.clear();
    const r = snap.reachRadius;
    const width =
      (snap.state === "IN_REACH" ? 0.085 : 0.035) * (highContrast ? 1.6 : 1);
    const add = (
      inner: number,
      outer: number,
      color: number,
      alpha = 1,
      start = 0,
      length = Math.PI * 2,
    ) => {
      const mesh = new T.Mesh(
        new T.RingGeometry(inner, outer, 72, 1, start, length),
        material(color, alpha),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = this.ring.children.length * 0.0003;
      this.ring.add(mesh);
    };
    if (highContrast) {
      add(r - width * 2, r + width * 2, 0x111111);
      add(r - width * 1.5, r + width * 1.5, 0xffffff);
    }
    if (snap.state === "WAIT_KITCHEN") {
      for (let i = 0; i < 16; i++)
        add(
          r - width,
          r,
          colors[snap.state],
          1,
          (i * Math.PI) / 8,
          Math.PI / 12,
        );
    } else {
      add(
        r - width,
        r,
        colors[snap.state],
        snap.state === "FAR" ? 0.3 : snap.state === "RECOVERING" ? 0.5 : 1,
      );
      if (snap.state === "IN_REACH") add(r, r + 0.16, colors.IN_REACH, 0.18);
    }
  }
  update(player: T.Vector3, ball: T.Vector3, time: number, reduced: boolean) {
    const snap = this.snap,
      fault = this.fault,
      prefs = this.preferences;
    this.group.visible = !!snap || !!fault;
    if (!this.group.visible) return;
    const show = !!snap && !prefs?.minimal;
    this.ring.visible = show && snap.state !== "NO_BALL";
    if (snap) {
      const key = `${snap.state}:${snap.reachRadius}:${prefs?.highContrast}`;
      if (key !== this.key) {
        this.key = key;
        this.rebuild(snap, !!prefs?.highContrast);
        this.recoveringAt = time;
      }
      this.ring.position.set(player.x, 0.083, player.z);
      this.ring.scale.setScalar(
        !reduced && snap.state === "GET_READY"
          ? 1 + Math.sin(time * 4) * 0.015
          : 1,
      );
      if (snap.state === "RECOVERING")
        this.ring.children.forEach((child) => {
          (
            child as T.Mesh<T.RingGeometry, T.MeshBasicMaterial>
          ).material.opacity = Math.max(
            0,
            0.5 *
              (1 -
                (time - this.recoveringAt) / (READINESS.hitCooldownMs / 1000)),
          );
        });
    }
    this.line.visible = show && snap?.state === "GET_READY";
    if (this.line.visible) {
      const positions = this.line.geometry.getAttribute(
        "position",
      ) as T.BufferAttribute;
      positions.setXYZ(0, ball.x, 0.09, ball.z);
      positions.setXYZ(1, player.x, 0.09, player.z);
      positions.needsUpdate = true;
      this.line.computeLineDistances();
      this.line.frustumCulled = false;
    }
    this.bounce.visible = show && snap?.state === "WAIT_BOUNCE";
    this.bounce.position.set(
      player.x,
      0.55,
      player.z + (snap?.reachRadius ?? 1),
    );
    this.halo.visible =
      show &&
      !!snap &&
      ["IN_REACH", "WAIT_BOUNCE", "WAIT_KITCHEN"].includes(snap.state);
    this.halo.position.copy(ball);
    if (snap) this.halo.material.color.setHex(colors[snap.state]);
    this.kitchen.visible =
      snap?.state === "WAIT_KITCHEN" || fault?.reason === "KITCHEN_VOLLEY";
    this.kitchen.position.set(
      0,
      0.081,
      fault?.side === "ai" ? -COURT.kitchen / 2 : COURT.kitchen / 2,
    );
    this.net.visible = fault?.reason === "NET";
    this.net.material.opacity = reduced
      ? 0.55
      : 0.45 + Math.sin(performance.now() * 0.008) * 0.15;
    this.markers.forEach((marker) => {
      marker.visible = false;
    });
    if (fault) {
      const mark = (index: number, p: { x: number; y: number; z: number }) => {
        this.markers[index].visible = true;
        this.markers[index].position.set(p.x, Math.max(0.4, p.y), p.z);
      };
      if (fault.reason === "OUT" || fault.reason === "WRONG_SERVICE_COURT")
        mark(0, fault.ballPos);
      else if (fault.reason === "DOUBLE_BOUNCE")
        fault.bounces.slice(-2).forEach((p, i) => mark(i + 1, p));
      else if (fault.reason.startsWith("EARLY")) mark(3, fault.ballPos);
    }
  }
}
