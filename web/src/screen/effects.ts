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
  impact(p: Vec, perfect: boolean, bounce = false) {
    this.squash = 1;
    if (!this.enabled) return;
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
    this.squash = Math.max(0, this.squash - dt * 7);
    if (!this.enabled) {
      ball.scale.setScalar(1);
    } else
      ball.scale.set(
        1 + this.squash * 0.4,
        1 - this.squash * 0.35,
        1 + this.squash * 0.15,
      );
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
