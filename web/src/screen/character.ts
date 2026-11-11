import * as T from "three";
import type { Shot, Vec } from "../game/solver";
import type { RivalId } from "../game/ai";
import { box, capsule, cylinder, sphere } from "./geometry";

export interface ShotPresentation {
  shot: Shot;
  backhand?: boolean;
  contact?: Vec;
  whiff?: boolean;
}
type Action =
  "ready" | "prepare" | "contact" | "follow-through" | "recovery" | "whiff";
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const downToFace = new T.Vector3(0, -1, 0);
const identity = new T.Quaternion();

/** Root position belongs to physics. Every decorative transform lives below it. */
export class Character {
  readonly group = new T.Group();
  readonly body = new T.Group();
  readonly torso = new T.Group();
  readonly head = new T.Group();
  readonly arm = new T.Group();
  readonly elbow = new T.Group();
  private contactElbow = 0;
  readonly freeArm = new T.Group();
  readonly paddle = new T.Group();
  readonly leftLeg = new T.Group();
  readonly rightLeg = new T.Group();
  readonly leftShoe = box(0.22, 0.12, 0.38, 0xf9f8ed);
  readonly rightShoe = box(0.22, 0.12, 0.38, 0xf9f8ed);
  action: Action = "ready";
  private previous = new T.Vector3();
  private distance = 0;
  private travelX = 0;
  private travelZ = 0;
  private movement = 0;
  private offset = new T.Vector3();
  private resetTime = 0;
  private reduced = false;
  private actionTime = 0;
  private shot?: ShotPresentation;
  private contactArm = new T.Quaternion();
  private startArm = new T.Quaternion();
  private contactTorso = 0;
  private reactionTime = 1;
  private winner = false;
  private rival: RivalId = "pip";
  private target = new T.Vector3();
  private aim = new T.Quaternion();
  constructor() {
    this.group.add(this.body);
    this.body.add(this.torso);
  }
  reset(blend = false) {
    // Preserve the last displayed position across a rules-owned point placement.
    this.offset
      .copy(this.previous)
      .sub(this.group.position)
      .add(this.body.position);
    this.resetTime = blend && !this.reduced ? 0.24 : 0;
    if (!this.resetTime) this.offset.set(0, 0, 0);
    this.previous.copy(this.group.position);
    this.distance = this.travelX = this.travelZ = this.movement = 0;
    this.shot = undefined;
    this.action = "ready";
    this.reactionTime = 1;
    this.clearDecorations();
    this.body.position.copy(this.offset);
    this.pose(0);
  }
  private clearDecorations() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.head.rotation.set(0, 0, 0);
    this.freeArm.rotation.set(0, 0, 0);
    for (const [leg, shoe] of [
      [this.leftLeg, this.leftShoe],
      [this.rightLeg, this.rightShoe],
    ]) {
      leg.rotation.set(0, 0, 0);
      leg.position.y = 0.47;
      shoe.rotation.set(0, 0, 0);
    }
  }
  setReducedMotion(value: boolean) {
    this.reduced = value;
    if (value) {
      this.offset.set(0, 0, 0);
      this.resetTime = this.movement = this.travelX = this.travelZ = 0;
      this.reactionTime = 1;
      this.clearDecorations();
      this.pose(this.actionTime);
    }
    this.previous.copy(this.group.position);
  }
  prepare(backhand = false) {
    this.shot = { shot: "drive", backhand };
    this.action = "prepare";
    this.actionTime = 0;
    this.startArm.copy(this.arm.quaternion);
  }
  hit(event: ShotPresentation) {
    this.shot = event;
    this.actionTime = 0;
    this.action = event.whiff ? "whiff" : "contact";
    this.startArm.copy(this.arm.quaternion);
    const rotation = {
      serve: 0.18,
      drive: 0.36,
      dink: 0.18,
      drop: 0.14,
      lob: 0.24,
      smash: 0.45,
    }[event.shot];
    this.contactTorso = rotation * (event.backhand ? -1 : 1);
    // Serve and dink share compact rotation, but have different paddle/free-arm poses.
    if (event.shot === "serve")
      this.contactTorso = 0.2 * (event.backhand ? -1 : 1);
    this.torso.rotation.y = this.contactTorso;
    this.group.updateMatrixWorld(true);
    if (event.contact) {
      this.target.set(event.contact.x, event.contact.y, event.contact.z);
      this.torso.worldToLocal(this.target).sub(this.arm.position);
      const reach = T.MathUtils.clamp(this.target.length(), 0.351, 0.949);
      const shoulder = Math.acos(
        T.MathUtils.clamp(
          (0.3 ** 2 + reach ** 2 - 0.65 ** 2) / (2 * 0.3 * reach),
          -1,
          1,
        ),
      );
      this.contactElbow = -(
        Math.PI -
        Math.acos(
          T.MathUtils.clamp(
            (0.3 ** 2 + 0.65 ** 2 - reach ** 2) / (2 * 0.3 * 0.65),
            -1,
            1,
          ),
        )
      );
      this.contactArm.setFromUnitVectors(
        downToFace,
        this.target.clone().normalize(),
      );
      this.aim.setFromAxisAngle(new T.Vector3(0, 0, 1), shoulder);
      this.contactArm.multiply(this.aim);
      // The procedural arm has fixed reach. Do not stretch it or change physical reach.
    } else {
      this.contactElbow = -0.4;
      this.contactArm.setFromEuler(
        new T.Euler(-1.3, 0, event.backhand ? -0.9 : 0.45),
      );
    }
    this.pose(0);
  }
  react(winner: boolean, rival: RivalId) {
    this.shot = undefined;
    this.action = "ready";
    this.actionTime = 0;
    this.pose(0);
    this.winner = winner;
    this.rival = rival;
    this.reactionTime = 0;
  }
  update(dt: number, moving: boolean, roll = 0, hitStop = 0) {
    if (dt <= 0) return;
    const dx = this.group.position.x - this.previous.x;
    const dz = this.group.position.z - this.previous.z;
    this.previous.copy(this.group.position);
    const distance = Math.hypot(dx, dz);
    const travel =
      moving && !this.reduced && distance / dt >= 0.08 && distance < 0.6;
    const blend = 1 - Math.exp(-12 * dt);
    this.movement +=
      ((travel ? 1 : 0) - this.movement) *
      (travel ? blend : 1 - Math.exp(-16 * dt));
    if (travel) {
      this.distance += distance;
      const facing = Math.cos(this.group.rotation.y);
      this.travelX += ((dx / distance) * facing - this.travelX) * blend;
      this.travelZ += ((dz / distance) * facing - this.travelZ) * blend;
    }
    const phase = (this.distance / 0.8) * Math.PI * 2;
    this.clearDecorations();
    if (!this.reduced) {
      this.body.rotation.z = -this.travelX * this.movement * 0.1;
      this.body.rotation.x = this.travelZ * this.movement * 0.1;
      this.body.position.y =
        Math.abs(Math.sin(phase * 2)) * 0.025 * this.movement;
      for (const [leg, shoe, sign] of [
        [this.leftLeg, this.leftShoe, 1],
        [this.rightLeg, this.rightShoe, -1],
      ] as const) {
        const step = Math.sin(phase) * sign;
        leg.rotation.x = step * this.travelZ * this.movement * 0.28;
        leg.rotation.z = -step * this.travelX * this.movement * 0.28;
        // Compensate the hip arc during stance; swing lift never exceeds 6 cm.
        const angle = Math.hypot(leg.rotation.x, leg.rotation.z);
        leg.position.y =
          0.47 -
          0.39 * (1 - Math.cos(angle)) +
          Math.max(0, step) * 0.06 * this.movement;
        shoe.rotation.x = -leg.rotation.x;
        shoe.rotation.z = -leg.rotation.z;
      }
    }
    if (this.resetTime > 0) {
      this.resetTime = Math.max(0, this.resetTime - dt);
      this.body.position.addScaledVector(
        this.offset,
        (this.resetTime / 0.24) ** 3,
      );
    }
    // Physics owns hit-stop, including its expiry while paused.
    if (!(this.action === "contact" && hitStop > 0)) this.actionTime += dt;
    this.pose(this.actionTime);
    if (!this.reduced && this.action === "ready")
      this.arm.rotation.z += roll * 0.007;
    this.reactionTime += dt;
    if (!this.reduced && this.reactionTime < 0.8) {
      const gesture = Math.sin((this.reactionTime / 0.8) * Math.PI) ** 2;
      if (!this.winner) this.head.rotation.x = 0.08 * gesture;
      else if (this.rival === "rocket")
        this.freeArm.rotation.x = -1.8 * gesture;
      else if (this.rival === "mabel") this.arm.rotation.x -= 0.6 * gesture;
      else
        this.head.rotation.x = (this.rival === "june" ? 0.1 : 0.18) * gesture;
    }
  }
  private pose(time: number) {
    const shot = this.shot;
    let strength = 0;
    if (shot && this.action === "prepare") {
      this.aim.setFromEuler(new T.Euler(-0.35, 0, shot.backhand ? -0.3 : 0.3));
      this.arm.quaternion.slerpQuaternions(
        this.startArm,
        this.aim,
        ease(time / 0.08),
      );
      this.torso.rotation.y =
        (shot.backhand ? -1 : 1) * 0.08 * ease(time / 0.08);
      return;
    }
    if (shot) {
      const whiff = !!shot.whiff;
      const follow = whiff ? 0.06 : 0.1;
      const end = whiff ? 0.22 : 0.26;
      if (time < end) {
        this.action = whiff
          ? "whiff"
          : time === 0
            ? "contact"
            : time < follow
              ? "follow-through"
              : "recovery";
        strength =
          time < follow ? 1 : 1 - ease((time - follow) / (end - follow));
        this.aim.setFromEuler(
          new T.Euler(
            -0.45 * Math.sin((Math.min(1, time / follow) * Math.PI) / 2),
            0,
            (shot.backhand ? -1 : 1) * 0.2,
          ),
        );
        this.aim.premultiply(this.contactArm);
        if (time === 0 && !whiff) this.arm.quaternion.copy(this.contactArm);
        else if (whiff && time < follow)
          this.arm.quaternion.slerpQuaternions(
            this.startArm,
            this.aim,
            ease(time / follow),
          );
        else this.arm.quaternion.slerpQuaternions(identity, this.aim, strength);
      } else {
        this.action = "ready";
        this.shot = undefined;
      }
    }
    if (this.action === "ready") this.arm.rotation.set(-0.24, 0, 0);
    this.torso.rotation.y = this.contactTorso * strength;
    this.elbow.rotation.z = this.contactElbow * strength;
    this.paddle.rotation.set(
      0,
      shot?.shot === "lob"
        ? 0.3 * strength
        : shot?.shot === "smash"
          ? -0.2 * strength
          : 0,
      0,
    );
    this.freeArm.rotation.x =
      shot?.shot === "serve"
        ? -0.7 * strength
        : shot?.shot === "dink"
          ? -0.15 * strength
          : -0.35 * strength;
  }
}
export function character(
  color: number,
  opponent = false,
  hat = "cap",
): Character {
  const rig = new Character();
  const g = rig.torso;
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
  for (const [hip, shoe, x] of [
    [rig.leftLeg, rig.leftShoe, -0.15],
    [rig.rightLeg, rig.rightShoe, 0.15],
  ] as const) {
    hip.position.set(x, 0.47, 0);
    hip.add(capsule(0.095, 0.27, skin, 0, -0.18, 0), shoe);
    shoe.position.set(0, -0.39, -0.06);
    rig.body.add(hip);
  }
  if (hat === "sunhat") {
    const brim = cylinder(0.43, 0.045, 0xf5e1b5, 0, 1.56, 0);
    rig.head.add(brim);
  }
  if (hat === "visor") {
    rig.head.add(box(0.52, 0.04, 0.38, 0xf5f1df, 0, 1.55, -0.2));
  }
  if (hat === "headband") {
    rig.head.add(cylinder(0.263, 0.055, 0xf5f1df, 0, 1.49, 0));
  }
  rig.head.add(sphere(0.25, skin, 0, 1.37, 0));
  rig.head.add(
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
    rig.head.add(cylinder(0.27, 0.1, opponent ? 0xf5f1df : color, 0, 1.58, 0));
  if (hat === "cap")
    rig.head.add(
      box(0.46, 0.04, 0.28, opponent ? 0xf5f1df : color, 0, 1.56, -0.18),
    );
  if (hat === "visor" || hat === "sunhat")
    rig.head.add(
      sphere(0.14, hat === "sunhat" ? 0xb9b9ab : 0x3d302c, 0, 1.4, 0.22),
    );
  rig.head.add(
    sphere(0.045, skin, -0.25, 1.37, 0),
    sphere(0.045, skin, 0.25, 1.37, 0),
    sphere(0.034, skin, 0, 1.33, -0.245),
    box(0.085, 0.013, 0.016, 0x71523e, 0, 1.27, -0.235),
  );
  rig.head.add(
    sphere(0.025, 0x263b36, -0.08, 1.38, -0.232),
    sphere(0.025, 0x263b36, 0.08, 1.38, -0.232),
  );
  const arm = rig.arm;
  arm.position.set(0.28, 1.01, 0);
  const upper = capsule(0.085, 0.25, color, 0.04, -0.12, 0);
  upper.position.x = 0;
  arm.add(upper, rig.elbow);
  rig.elbow.position.set(0, -0.3, 0);
  rig.elbow.add(capsule(0.075, 0.22, skin, 0, -0.13, 0));
  const paddle = rig.paddle;
  paddle.position.set(0, -0.3, 0);
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
  rig.elbow.add(paddle);
  g.add(arm);
  rig.freeArm.position.set(-0.32, 1.01, 0);
  rig.freeArm.add(capsule(0.08, 0.28, skin, -0.03, -0.25, 0));
  g.add(rig.freeArm);
  // Reparent preserving the original silhouette around the neck pivot.
  for (const child of rig.head.children) child.position.y -= 1.25;
  rig.head.position.y = 1.25;
  rig.torso.add(rig.head);
  if (opponent) rig.group.rotation.y = Math.PI;
  rig.reset();
  return rig;
}
