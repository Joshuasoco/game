import RAPIER from "@dimforge/rapier3d-compat";
import type { Difficulty, GamePhase, Side, Swing } from "@dink/shared";
import type { CourtScene } from "../screen/scene";
import { Rules } from "./rules";
import {
  clamp,
  integrateVelocity,
  seeded,
  shotType,
  solveShot,
  targetFor,
  trace,
  type Vec,
  type Shot,
} from "./solver";
import { COURT, PHYSICS, SKILL } from "./tuning";
import { Audio } from "./audio";
import { LocalMetrics } from "./metrics";
import { readPreferences } from "./preferences";
import {
  RIVALS,
  chooseShot,
  adaptiveFactor,
  spinBounce,
  type RivalId,
} from "./ai";
import { judgeTiming, timingDelta, type Timing } from "./timing";
export interface Snapshot extends GamePhase {
  tutorial?: "serve" | "dink" | "lob";
  rival: RivalId;
  timing: Timing | undefined;
  stats: MatchStats;
  best: number;
  hits: number;
  fps: number;
  shot: string;
  winner?: Side;
  challenge: boolean;
}
export interface MatchStats {
  longestRally: number;
  winners: number;
  faults: number;
  timingTotalMs: number;
  timedSwings: number;
}
export class Game {
  readonly metrics = new LocalMetrics();
  private tutorial: Snapshot["tutorial"];
  private tutorialStarted = 0;
  rival: RivalId = "pip";
  private timing: Timing | undefined;
  private intent = 0;
  private spin = 0;
  private results: boolean[] = [];
  private adaptation = 1;
  private hitStop = 0;
  private stats: MatchStats = {
    longestRally: 0,
    winners: 0,
    faults: 0,
    timingTotalMs: 0,
    timedSwings: 0,
  };
  readonly audio = new Audio();
  readonly rules = new Rules();
  private world!: RAPIER.World;
  private body!: RAPIER.RigidBody;
  private events!: RAPIER.EventQueue;
  private ground = 0;
  private net = 0;
  phase: GamePhase["phase"] = "menu";
  private beforePause: GamePhase["phase"] = "serve";
  difficulty: Difficulty = "medium";
  challenge = false;
  private random = seeded(42);
  private swing?: { input: Swing; expires: number };
  private pointTimer = 0;
  private running = false;
  private disposed = false;
  private last = 0;
  private accumulator = 0;
  private frame = 0;
  private frameTime = 0;
  private fps = 60;
  private message = "A little friendly competition.";
  private shot = "Ready to rally";
  private hitCount = 0;
  private rally = 0;
  private best = 0;
  private aiWait = 0;
  private aiMiss = false;
  private target?: Vec;
  private prev: Vec = { x: 1.7, y: 1.1, z: 4.7 };
  private elapsed = 0;
  private lastSwing = -1;
  private roll = 0;
  private history: { at: number; p: Vec }[] = [];
  private clockOffset = 0;
  private rtt = 0;
  onHaptic?: (kind: "hit" | "perfect" | "fault" | "point") => void;
  onPhase?: (s: GamePhase) => void;
  constructor(
    readonly scene: CourtScene,
    private update: (s: Snapshot) => void,
  ) {
    const preferences = readPreferences();
    this.metrics.enabled = preferences.analytics;
    this.scene.setQuality?.(preferences.quality);
    this.scene.setReducedMotion?.(preferences.reducedMotion);
    try {
      this.best = Number(localStorage.getItem("dink-best") ?? 0) || 0;
    } catch {
      /* Storage is optional. */
    }
  }
  async init() {
    await RAPIER.init();
    if (this.disposed) return;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = PHYSICS.dt;
    this.events = new RAPIER.EventQueue(true);
    this.ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(30, 0.1, 30)
        .setTranslation(0, -0.1, 0)
        .setRestitution(PHYSICS.restitution)
        .setFriction(0.05),
    ).handle;
    this.net = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3.35, COURT.net / 2, 0.025).setTranslation(
        0,
        COURT.net / 2,
        0,
      ),
    ).handle;
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(1.7, 1.1, 4.7)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(COURT.ballRadius)
        .setRestitution(PHYSICS.restitution)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    this.running = true;
    this.last = performance.now();
    this.loop(this.last);
    this.emit();
  }
  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.elapsed += dt;
    if (this.tutorial && this.elapsed - this.tutorialStarted > 30)
      this.skipTutorial();
    this.frame++;
    this.frameTime += dt;
    if (this.frameTime > 0.5) {
      this.fps = Math.round(this.frame / this.frameTime);
      this.frame = 0;
      this.frameTime = 0;
      if (this.phase === "rally") this.emit(false);
    }
    this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.phase === "rally" && this.hitStop === 0) {
      this.accumulator += dt;
      while (this.accumulator >= PHYSICS.dt) {
        this.step();
        this.accumulator -= PHYSICS.dt;
        if (this.phase !== "rally") break;
      }
    } else if (this.phase === "point") {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) this.prepareServe();
    } else if (this.phase === "serve" && this.rules.serving === "ai") {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) this.serve("ai");
    }
    const p = this.body.translation();
    if (this.phase === "rally") {
      const a = clamp(this.accumulator / PHYSICS.dt, 0, 1);
      this.scene.setBall(
        {
          x: this.prev.x + (p.x - this.prev.x) * a,
          y: this.prev.y + (p.y - this.prev.y) * a,
          z: this.prev.z + (p.z - this.prev.z) * a,
        },
        this.target,
      );
    } else this.scene.setBall(p);
    this.scene.render(dt, now / 1000, this.phase === "rally", this.roll);
    requestAnimationFrame(this.loop);
  };
  snapshot(): Snapshot {
    return {
      phase: this.phase,
      score: [...this.rules.score],
      serving: this.rules.serving,
      rally: this.rally,
      message: this.message,
      best: this.best,
      hits: this.hitCount,
      fps: this.fps,
      shot: this.shot,
      winner: this.rules.winner,
      challenge: this.challenge,
      stats: { ...this.stats },
      tutorial: this.tutorial,
      rival: this.rival,
      timing: this.timing,
    };
  }
  private emit(network = true) {
    this.audio.setRally?.(this.rally, this.phase === "rally");
    const s = this.snapshot();
    this.update(s);
    if (network) this.onPhase?.(s);
  }
  setPhase(phase: GamePhase["phase"], message: string) {
    this.scene.matchState?.(this.rules.score);
    this.phase = phase;
    this.message = message;
    this.accumulator = 0;
    this.emit();
  }
  wait() {
    this.setPhase("waiting", "Scan the code. Step onto the court.");
  }
  calibrate() {
    this.setPhase("calibrate", "Three easy practice swings on your phone.");
  }
  start(difficulty: Difficulty, challenge = false) {
    try {
      this.tutorial = localStorage.getItem("dink-tutorial")
        ? undefined
        : "serve";
    } catch {
      this.tutorial = undefined;
    }
    this.tutorialStarted = this.elapsed;
    this.adaptation = adaptiveFactor(this.results);
    this.timing = undefined;
    this.spin = 0;
    this.intent = 0;
    this.stats = {
      longestRally: 0,
      winners: 0,
      faults: 0,
      timingTotalMs: 0,
      timedSwings: 0,
    };
    this.difficulty = difficulty;
    this.challenge = challenge;
    this.rules.score = [0, 0];
    this.rules.serving = "player";
    this.rally = 0;
    this.hitCount = 0;
    this.lastSwing = -1;
    this.audio.start();
    this.scene.setActive(true);
    this.prepareServe();
  }
  menu() {
    this.phase = "menu";
    this.scene.setActive(false);
    this.body.setTranslation({ x: 1.7, y: 1.1, z: 4.7 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.scene.player.group.position.set(1.35, 0, 5.15);
    this.scene.ai.group.position.set(-1.1, 0, -5.05);
    this.emit();
  }
  setLatency(rtt: number, offset: number) {
    this.rtt = rtt;
    this.clockOffset = offset;
  }
  skipTransition() {
    if (this.phase === "point") this.prepareServe();
  }
  skipTutorial() {
    this.tutorial = undefined;
    try {
      localStorage.setItem("dink-tutorial", "seen");
    } catch {
      /* Optional. */
    }
    this.emit(false);
  }
  setRival(id: RivalId) {
    this.rival = id;
    this.scene.setRival?.(id);
  }
  positionIntent(value: number) {
    this.intent = clamp(value, -1, 1);
  }
  pose(roll: number, intent?: number) {
    this.roll = roll;
    if (intent !== undefined) this.positionIntent(intent);
  }
  pause() {
    if (this.phase === "paused") {
      this.setPhase(this.beforePause, "Back on court.");
      return;
    }
    if (["serve", "rally", "point"].includes(this.phase)) {
      this.beforePause = this.phase;
      this.setPhase("paused", "Take a breather. Your court is waiting.");
    }
  }
  disconnect() {
    if (["serve", "rally", "point"].includes(this.phase)) {
      this.beforePause = this.phase;
      this.setPhase(
        "paused",
        "Paddle disconnected. Reconnecting for up to 60 seconds…",
      );
    }
  }
  input(input: Swing) {
    if (input.seq <= this.lastSwing) return;
    this.lastSwing = input.seq;
    this.metrics.record("swing");
    if (this.phase === "serve" && this.rules.serving === "player") {
      this.serve("player", input);
      return;
    }
    if (this.phase !== "rally") return;
    const at = clamp(
      input.tPhone + this.clockOffset,
      Date.now() - Math.min(200, this.rtt / 2 + 100),
      Date.now(),
    );
    this.swing = { input, expires: this.elapsed + PHYSICS.bufferMs / 1000 };
    // A small position history accepts hits that arrived after the contact window.
    const historical = this.history.findLast((h) => h.at <= at);
    if (
      historical &&
      Date.now() - at < 200 &&
      this.canHit("player", historical.p)
    )
      this.hit("player", input, historical.p);
  }
  private prepareServe() {
    this.history = [];
    if (this.rules.winner && !this.challenge) {
      this.results.push(this.rules.winner === "player");
      this.setPhase(
        "matchover",
        this.rules.winner === "player"
          ? "That’s your game. Beautifully played!"
          : "Good game. There’s always the rematch.",
      );
      if (this.rules.winner === "player") {
        try {
          localStorage.setItem("dink-sunset", "unlocked");
        } catch {
          /* Optional cosmetics. */
        }
      }
      return;
    }
    const x =
      this.rules.score[this.rules.serving === "player" ? 0 : 1] % 2 === 0
        ? 1.5
        : -1.5;
    const sign = this.rules.serving === "player" ? 1 : -1;
    this.scene.player.group.position.set(
      this.rules.serving === "player" ? x : -x,
      0,
      5.8,
    );
    this.scene.ai.group.position.set(
      this.rules.serving === "ai" ? x : -x,
      0,
      -5.8,
    );
    this.body.setTranslation({ x, y: 0.85, z: sign * 5.9 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rally = 0;
    this.target = undefined;
    this.pointTimer = 1.35;
    this.swing = undefined;
    this.setPhase(
      "serve",
      this.rules.serving === "player"
        ? "Your serve."
        : `${RIVALS[this.rival].name} is serving.`,
    );
  }
  private serve(side: Side, input?: Swing) {
    if (side === "player" && this.tutorial === "serve") this.tutorial = "dink";
    this.history = [];
    const p = { ...this.body.translation() };
    this.rules.start(side, p.x);
    const target = {
      x: -Math.sign(p.x) * 1.6,
      y: COURT.ballRadius,
      z: side === "player" ? -4.8 : 4.8,
    };
    this.launch(p, target, "serve");
    this.scene.hit(side);
    this.audio.play("hit", 0.5);
    this.aiWait = 0;
    this.aiMiss = this.random() < SKILL[this.difficulty].miss;
    this.setPhase("rally", "Let it bounce.");
    if (input) this.onHaptic?.("hit");
  }
  private launch(p: Vec, target: Vec, shot: Shot, power = 0.65) {
    this.body.setTranslation(p, true);
    this.body.setLinvel(solveShot(p, target, shot, power), true);
    this.target = target;
    this.prev = { ...p };
    this.shot = shot;
  }
  private canHit(side: Side, p: Vec) {
    const c = side === "player" ? this.scene.player : this.scene.ai;
    if (this.rules.lastHitter === side) return false;
    if (side === "player" ? p.z < 0.2 : p.z > -0.2) return false;
    return (
      p.y > 0.15 &&
      p.y < 2.45 &&
      Math.abs(p.x - c.group.position.x) < 1.35 &&
      Math.abs(p.z - c.group.position.z) < 1.6
    );
  }
  private hit(side: Side, input?: Swing, position?: Vec) {
    const p = position ?? { ...this.body.translation() };
    const c = side === "player" ? this.scene.player : this.scene.ai;
    const result = this.rules.apply({
      type: "hit",
      side,
      feetZ: c.group.position.z,
    });
    if (result) {
      this.finish(result.winner, result.fault);
      return;
    }
    const skill = SKILL[this.difficulty];
    let power = input?.power ?? 0.35 + this.random() * 0.5;
    let shot = shotType(
      power,
      p.y,
      input?.lob ?? (p.y > 2.2 && this.random() < 0.3),
    );
    const tilt = input?.tilt ?? this.random() * 2 - 1;
    if (side === "ai")
      shot = chooseShot(this.rival, this.random, {
        height: p.y,
        distance: Math.abs(p.z),
        opponentZ: this.scene.player.group.position.z,
      });
    else if (input?.drop) shot = "drop";
    let accuracy = 0.16;
    if (side === "player" && input) {
      const age = clamp(Date.now() - (input.tPhone + this.clockOffset), 0, 200);
      const delta = timingDelta(p.y, this.body.linvel().y, age);
      const timing = judgeTiming(delta);
      this.timing = timing.grade;
      accuracy = timing.accuracy;
      power *= timing.pace;
      this.stats.timingTotalMs += Math.abs(delta);
      this.stats.timedSwings++;
      if (input.intent !== undefined) this.positionIntent(input.intent);
    }
    const target = targetFor(
      side,
      tilt,
      shot,
      this.random,
      side === "ai"
        ? (skill.error * RIVALS[this.rival].error) / this.adaptation
        : accuracy,
    );
    this.history = [];
    this.launch(p, target, shot, power);
    if (side === "player" && (this.timing === "late" || power > 0.82)) {
      target.x += (this.random() - 0.5) * (this.timing === "late" ? 1.4 : 0.7);
      this.launch(p, target, shot, power);
    }
    this.spin =
      side === "player"
        ? (input?.spin ?? (input?.side === "backhand" ? -0.45 : 0.45))
        : shot === "dink"
          ? -0.5
          : 0.5;
    this.body.setAngvel({ x: this.spin * 45, y: 0, z: 0 }, true);
    this.scene.hit(side, input?.side === "backhand", shot === "smash");
    if (side === "player") {
      this.metrics.record("hit");
      if (this.timing) this.metrics.record(this.timing);
      if (this.tutorial === "dink" && shot === "dink") this.tutorial = "lob";
      else if (this.tutorial === "lob" && shot === "lob") this.skipTutorial();
    }
    this.scene.impact?.(
      p,
      side === "player" && this.timing === "perfect",
      power,
    );
    this.hitStop =
      side === "player" && this.timing === "perfect"
        ? 0.075
        : power > 0.6
          ? 0.06
          : 0;
    this.audio.play("hit", power);
    if (side === "player" && this.timing === "perfect")
      this.audio.play("perfect");
    this.rally++;
    this.stats.longestRally = Math.max(this.stats.longestRally, this.rally);
    this.hitCount++;
    this.swing = undefined;
    this.aiWait = 0;
    this.aiMiss =
      this.random() <
      (skill.miss * RIVALS[this.rival].error) / this.adaptation +
        (this.rally > 5 ? RIVALS[this.rival].pressure * 0.16 : 0);
    if (this.rally > this.best) {
      this.best = this.rally;
      try {
        localStorage.setItem("dink-best", String(this.best));
      } catch {
        /* Storage may be disabled. */
      }
    }
    if (side === "player")
      this.onHaptic?.(this.timing === "perfect" ? "perfect" : "hit");
    this.message = "";
    this.emit();
  }
  private step() {
    if (this.phase !== "rally") return;
    const dt = PHYSICS.dt;
    this.prev = { ...this.body.translation() };
    this.body.setLinvel(integrateVelocity(this.body.linvel()), true);
    this.world.step(this.events);
    let point: { winner: Side; fault: string } | undefined;
    this.events.drainCollisionEvents((a, b, started) => {
      if (!started || point) return;
      if (a === this.net || b === this.net) {
        point = this.rules.apply({ type: "net" });
        this.audio.play("net");
      } else if (a === this.ground || b === this.ground) {
        const p = this.body.translation();
        point = this.rules.apply({ type: "bounce", x: p.x, z: p.z });
        this.audio.play(Math.abs(p.z) < COURT.kitchen ? "kitchen" : "bounce");
        this.scene.impact?.(p, false, 0.1, true);
        if (!point)
          this.body.setLinvel(spinBounce(this.body.linvel(), this.spin), true);
        if (!point) {
          this.message =
            this.rules.bounces === 1
              ? "Bounced. Your paddle is ready."
              : this.message;
          this.emit();
        }
      }
    });
    if (point) {
      this.finish(point.winner, point.fault);
      return;
    }
    const p = { ...this.body.translation() };
    const v = this.body.linvel();
    this.history.push({ at: Date.now(), p });
    if (this.history.length > 50) this.history.shift();
    for (const side of ["player", "ai"] as const) {
      const c = side === "player" ? this.scene.player : this.scene.ai;
      const sign = side === "player" ? 1 : -1;
      const receiving = this.rules.lastHitter !== side;
      let desiredX = 0,
        desiredZ =
          sign *
          (side === "player"
            ? 4.6 - this.intent * 1.9
            : RIVALS[this.rival].net);
      if (receiving && p.z * sign > -0.7) {
        const prediction = trace(p, v).landing;
        desiredX = clamp(p.y < 1.6 ? p.x : prediction.x, -2.85, 2.85);
        desiredZ =
          sign *
          clamp(
            Math.abs(p.z) +
              (this.rules.bounces === 0 ? 1.0 : 0) -
              (side === "player" ? this.intent * 0.35 : 0),
            2.4,
            7.3,
          );
      }
      const speed =
        side === "player"
          ? 6.8
          : SKILL[this.difficulty].speed *
            this.adaptation *
            (this.rival === "mabel" && this.shot === "lob" ? 0.76 : 1);
      const pos = c.group.position;
      const dx = desiredX - pos.x,
        dz = desiredZ - pos.z;
      const dist = Math.hypot(dx, dz);
      const amount = Math.min(1, (speed * dt) / Math.max(0.001, dist));
      pos.x += dx * amount;
      pos.z += dz * amount;
    }
    if (this.swing && this.elapsed > this.swing.expires) this.swing = undefined;
    if (this.swing && this.canHit("player", p))
      this.hit("player", this.swing.input);
    if (this.rules.lastHitter === "player") {
      this.aiWait += dt;
      if (
        !this.aiMiss &&
        this.aiWait >
          (SKILL[this.difficulty].reaction * RIVALS[this.rival].reaction) /
            this.adaptation &&
        this.canHit("ai", p) &&
        (this.rules.shots > 2 || this.rules.bounces > 0)
      )
        this.hit("ai");
    }
    if (Math.abs(p.z) > 10 || Math.abs(p.x) > 8 || p.y < -0.5) {
      const result = this.rules.apply({
        type: "miss",
        side: this.rules.lastHitter === "player" ? "ai" : "player",
      });
      if (result) this.finish(result.winner, result.fault);
    }
  }
  private finish(winner: Side, fault: string) {
    this.metrics.record(winner === "player" ? "point" : "fault");
    this.scene.react?.(winner);
    this.onHaptic?.(winner === "player" ? "point" : "fault");
    if (winner === "ai") this.stats.faults++;
    else if (fault === "missed return" || fault === "double bounce")
      this.stats.winners++;
    this.audio.play("point");
    this.pointTimer = 2.2;
    this.swing = undefined;
    this.setPhase(
      "point",
      `${winner === "player" ? "Your point" : `Point to ${RIVALS[this.rival].name}`} · ${fault}.`,
    );
  }
  dispose() {
    this.disposed = true;
    this.running = false;
    this.audio.dispose();
    this.events?.free();
    this.world?.free();
    this.scene.dispose();
  }
}
