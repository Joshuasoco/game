import * as T from "three";
import type { Vec } from "../game/solver";
export class ImpactEffects {
  readonly group = new T.Group();
  private particles: {
    mesh: T.Mesh;
    velocity: T.Vector3;
    life: number;
    duration: number;
  }[] = [];
  private ring: T.Mesh;
  private flash = 0;
  private squash = 0;
  private direction = new T.Vector3(0, 1, 0);
  private up = new T.Vector3(0, 1, 0);
  enabled = true;
  budget = 32;
  constructor() {
    this.ring = new T.Mesh(
      new T.RingGeometry(0.14, 0.17, 32),
      new T.MeshBasicMaterial({
        color: 0xf5f1df,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.group.add(this.ring);
    for (let i = 0; i < 32; i++) {
      const mesh = new T.Mesh(
        new T.SphereGeometry(0.05, 6, 4),
        new T.MeshBasicMaterial({
          color: 0xedd5a7,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      this.group.add(mesh);
      this.particles.push({
        mesh,
        velocity: new T.Vector3(),
        life: 0,
        duration: 1,
      });
    }
  }
  clear(ball: T.Mesh) {
    this.flash = this.squash = 0;
    ball.scale.setScalar(1);
    ball.quaternion.identity();
    this.ring.visible = false;
    for (const p of this.particles) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }
  impact(p: Vec, perfect: boolean, bounce = false, velocity?: Vec) {
    if (!this.enabled) return;
    this.squash = 1;
    this.direction.set(velocity?.x ?? 0, velocity?.y ?? 1, velocity?.z ?? 0);
    if (this.direction.lengthSq() < 0.001) this.direction.copy(this.up);
    this.direction.normalize();
    this.ring.position.set(p.x, p.y, p.z);
    this.flash = perfect ? 0.42 : 0.19;
    (this.ring.material as T.MeshBasicMaterial).color.setHex(
      perfect ? 0xf5f1df : 0xbd623f,
    );
    let remaining = perfect ? 14 : bounce ? 7 : 4;
    for (const particle of this.particles) {
      if (this.particles.indexOf(particle) >= this.budget) break;
      if (particle.life > 0) continue;
      const angle = (remaining * 2.4) % 6.283;
      particle.mesh.position.set(p.x, p.y, p.z);
      particle.velocity.set(
        Math.cos(angle) * 0.85,
        0.4 + (remaining % 3) * 0.17,
        Math.sin(angle) * 0.85,
      );
      particle.life = particle.duration = perfect ? 0.48 : 0.35;
      (particle.mesh.material as T.MeshBasicMaterial).color.setHex(
        perfect ? 0xf5e6ad : bounce ? 0xcbb18f : 0xbd623f,
      );
      if (--remaining === 0) break;
    }
  }
  update(dt: number, camera: T.Camera, ball: T.Mesh) {
    this.flash = Math.max(0, this.flash - dt);
    this.ring.visible = this.enabled && this.flash > 0;
    this.ring.quaternion.copy(camera.quaternion);
    this.ring.scale.setScalar(1 + (1 - this.flash / 0.42) * 2);
    (this.ring.material as T.MeshBasicMaterial).opacity = Math.min(
      1,
      this.flash * 3,
    );
    this.squash = Math.max(0, this.squash - dt * 10);
    if (!this.enabled) {
      ball.scale.setScalar(1);
    } else {
      ball.quaternion.setFromUnitVectors(this.up, this.direction);
      ball.scale.set(
        1 - this.squash * 0.07,
        1 + this.squash * 0.15,
        1 - this.squash * 0.07,
      );
    }
    for (const p of this.particles) {
      p.life = Math.max(0, p.life - dt);
      p.mesh.visible = this.enabled && p.life > 0;
      if (!p.mesh.visible) continue;
      p.velocity.y -= dt * 2;
      p.mesh.position.addScaledVector(p.velocity, dt);
      (p.mesh.material as T.MeshBasicMaterial).opacity = p.life / p.duration;
      p.mesh.scale.setScalar(0.5 + p.life / p.duration);
    }
  }
}

/** Recycles the existing bounded history, sampled at 60 Hz rather than render Hz. */
export class MotionTrail {
  readonly points: T.Vector3[] = [];
  private pool = Array.from({ length: 21 }, () => new T.Vector3());
  private previous = new T.Vector3();
  private elapsed = 0;
  private initialized = false;
  clear() {
    this.pool.push(...this.points);
    this.points.length = 0;
    this.elapsed = 0;
    this.initialized = false;
  }
  update(p: Vec, dt: number, playing: boolean) {
    if (!playing) {
      this.clear();
      return;
    }
    if (!this.initialized || this.previous.distanceToSquared(p) > 16) {
      this.clear();
      this.previous.set(p.x, p.y, p.z);
      this.initialized = true;
    }
    const period = 1 / 60;
    const total = this.elapsed + dt;
    for (let at = period - this.elapsed; at <= dt + 1e-9; at += period) {
      const point = this.pool.pop() ?? this.points.pop()!;
      point.copy(this.previous).lerp(p, dt > 0 ? at / dt : 1);
      this.points.unshift(point);
    }
    this.elapsed = total - Math.floor((total + 1e-9) / period) * period;
    this.previous.set(p.x, p.y, p.z);
  }
}
