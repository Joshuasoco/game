import { z } from "zod";
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
export const joinSchema = z.object({ roomCode: roomCodeSchema });
export const resumeSchema = joinSchema.extend({ playerId: z.string().uuid() });
export const hostResumeSchema = joinSchema.extend({
  hostId: z.string().uuid(),
});
export const calibrationSchema = z.object({
  hand: z.enum(["right", "left"]),
  swingSign: z.union([z.literal(1), z.literal(-1)]),
});
export const swingSchema = z.object({
  seq: z.number().int().nonnegative(),
  power: z.number().min(0).max(1),
  side: z.enum(["forehand", "backhand"]),
  tilt: z.number().min(-1).max(1),
  lob: z.boolean(),
  tPhone: z.number().finite(),
  drop: z.boolean().optional(),
  spin: z.number().min(-1).max(1).optional(),
  intent: z.number().min(-1).max(1).optional(),
  assisted: z.boolean().optional(),
});
export const poseSchema = z.object({
  seq: z.number().int().nonnegative(),
  pitch: z.number().min(-180).max(180),
  roll: z.number().min(-180).max(180),
  intent: z.number().min(-1).max(1).optional(),
});
export const phases = [
  "menu",
  "waiting",
  "calibrate",
  "serve",
  "rally",
  "point",
  "matchover",
  "paused",
] as const;
export const phaseSchema = z.object({
  phase: z.enum(phases),
  score: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]),
  serving: z.enum(["player", "ai"]),
  rally: z.number().int().nonnegative(),
  message: z.string().max(200),
  rival: z.enum(["pip", "rocket", "mabel", "june"]).optional(),
});
export const hapticSchema = z.object({
  pattern: z.array(z.number().int().min(0).max(250)).max(8),
});
export const readinessSchema = z.object({
  type: z.literal("readiness"),
  seq: z.number().int().nonnegative(),
  state: z.enum([
    "NO_BALL",
    "FAR",
    "GET_READY",
    "IN_REACH",
    "WAIT_BOUNCE",
    "WAIT_KITCHEN",
    "RECOVERING",
  ]),
  blockReason: z
    .enum(["SERVE_MUST_BOUNCE", "RETURN_MUST_BOUNCE", "KITCHEN_VOLLEY"])
    .nullable(),
  timeToReachMs: z.number().finite().nonnegative().nullable(),
  serving: z.boolean(),
  enabled: z.boolean(),
});
export type ReadinessMessage = z.infer<typeof readinessSchema>;
export type SwingReadiness = ReadinessMessage["state"];
export type BlockReason = NonNullable<ReadinessMessage["blockReason"]>;
export type Swing = z.infer<typeof swingSchema>;
export type Pose = z.infer<typeof poseSchema>;
export type Calibration = z.infer<typeof calibrationSchema>;
export type GamePhase = z.infer<typeof phaseSchema>;
export type Side = "player" | "ai";
export type Difficulty = "easy" | "medium" | "hard";
export type JoinResult =
  { ok: true; playerId: string } | { ok: false; error: string };
export interface ClientEvents {
  "game:readiness": (data: ReadinessMessage) => void;
  "host:create": (
    ack: (result: { roomCode: string; hostId: string }) => void,
  ) => void;
  "host:resume": (
    data: { roomCode: string; hostId: string },
    ack: (result: { ok: boolean }) => void,
  ) => void;
  "controller:join": (
    data: { roomCode: string },
    ack: (result: JoinResult) => void,
  ) => void;
  "controller:resume": (
    data: { roomCode: string; playerId: string },
    ack: (result: JoinResult) => void,
  ) => void;
  "input:calibration": (data: Calibration) => void;
  "input:swing": (data: Swing) => void;
  "input:pose": (data: Pose) => void;
  "input:pause": () => void;
  "game:phase": (data: GamePhase) => void;
  haptic: (data: { pattern: number[] }) => void;
  "net:ping": (
    data: { tPhone: number },
    ack: (data: { tPhone: number; tHost: number }) => void,
  ) => void;
  "net:latency": (data: { rtt: number; offset: number }) => void;
}
export interface ServerEvents {
  "game:readiness": (data: ReadinessMessage) => void;
  "controller:status": (data: { connected: boolean; resumed: boolean }) => void;
  "room:closed": (data: { reason: string }) => void;
  "input:calibration": (data: Calibration) => void;
  "input:swing": (data: Swing) => void;
  "input:pose": (data: Pose) => void;
  "input:pause": () => void;
  "game:phase": (data: GamePhase) => void;
  haptic: (data: { pattern: number[] }) => void;
  "net:ping": (
    data: { tPhone: number },
    ack: (data: { tPhone: number; tHost: number }) => void,
  ) => void;
  "net:latency": (data: { rtt: number; offset: number }) => void;
}
