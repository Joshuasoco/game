import express from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { z } from "zod";
import {
  calibrationSchema,
  joinSchema,
  resumeSchema,
  hostResumeSchema,
  swingSchema,
  poseSchema,
  phaseSchema,
  hapticSchema,
  readinessSchema,
  type ClientEvents,
  type ServerEvents,
} from "../../shared/src/protocol.js";
import { Rooms } from "./rooms.js";
export function createApp() {
  const app = express();
  const http = createServer(app);
  const rooms = new Rooms();
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const io = new Server<ClientEvents, ServerEvents>(http, {
    transports: ["websocket"],
    maxHttpBufferSize: 8192,
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      let same = false;
      try {
        same = !!origin && new URL(origin).host === req.headers.host;
      } catch {
        /* Invalid origin is rejected. */
      }
      done(null, !origin || same || allowed.includes(origin));
    },
  });
  app.disable("x-powered-by");
  app.get("/health", (_req, res) =>
    res.json({ ok: true, rooms: rooms.rooms.size }),
  );
  if (process.env.NODE_ENV !== "production")
    app.get("/network", (_req, res) =>
      res.json({
        addresses: Object.values(networkInterfaces())
          .flat()
          .filter((n) => n?.family === "IPv4" && !n.internal)
          .map((n) => n!.address),
      }),
    );
  const root = fileURLToPath(
    new URL(
      import.meta.url.includes("/dist/") ? "../../../../" : "../../",
      import.meta.url,
    ),
  );
  const web = resolve(root, "web/dist");
  app.get("/c", (_req, res) => res.sendFile(resolve(web, "controller.html")));
  app.use(
    express.static(web, {
      maxAge: "1h",
      setHeaders: (res, path) => {
        if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  const attempts = new Map<string, { count: number; reset: number }>();
  io.on("connection", (socket) => {
    let role: "host" | "controller" | undefined;
    let code: string | undefined;
    let count = 0;
    let windowStart = Date.now();
    socket.use(([_event], next) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        count = 0;
        windowStart = now;
      }
      if (++count > 65) return next(new Error("Input rate exceeded"));
      next();
    });
    const current = () => (code ? rooms.rooms.get(code) : undefined);
    socket.on("host:create", (ack) => {
      if (typeof ack !== "function") return;
      if (role === "controller") return;
      if (role === "host") {
        ack({ roomCode: code!, hostId: current()!.hostId });
        return;
      }
      const r = rooms.create(socket.id);
      role = "host";
      code = r.code;
      socket.join(code);
      ack({ roomCode: code, hostId: r.hostId });
    });
    socket.on("host:resume", (data, ack) => {
      if (typeof ack !== "function" || role) return;
      const parsed = hostResumeSchema.safeParse(data);
      const r = parsed.success
        ? rooms.resumeHost(parsed.data.roomCode, socket.id, parsed.data.hostId)
        : undefined;
      if (!r) {
        ack({ ok: false });
        return;
      }
      code = r.code;
      role = "host";
      socket.join(code);
      ack({ ok: true });
      socket.emit("controller:status", {
        connected: !!r.controller,
        resumed: true,
      });
    });
    const join = (data: unknown, ack: unknown, resume: boolean) => {
      if (typeof ack !== "function" || role) return;
      const parsed = (resume ? resumeSchema : joinSchema).safeParse(data);
      if (!parsed.success) {
        ack({ ok: false, error: "Enter a valid four-letter room code." });
        return;
      }
      const ip = socket.handshake.address;
      const now = Date.now();
      let entry = attempts.get(ip);
      if (!entry || now > entry.reset) {
        entry = { count: 0, reset: now + 60_000 };
        attempts.set(ip, entry);
      }
      if (++entry.count > 12) {
        ack({ ok: false, error: "Too many attempts. Please wait a minute." });
        return;
      }
      const result = rooms.join(
        parsed.data.roomCode,
        socket.id,
        "playerId" in parsed.data
          ? (parsed.data.playerId as string)
          : undefined,
      );
      if ("error" in result) {
        ack({ ok: false, error: result.error });
        return;
      }
      code = result.room.code;
      role = "controller";
      socket.join(code);
      ack({ ok: true, playerId: result.playerId });
      io.to(result.room.host).emit("controller:status", {
        connected: true,
        resumed: resume,
      });
      if (result.room.phase) socket.emit("game:phase", result.room.phase);
    };
    socket.on("controller:join", (d, a) => join(d, a, false));
    socket.on("controller:resume", (d, a) => join(d, a, true));
    socket.on("input:calibration", (d) => {
      const r = current();
      const p = calibrationSchema.safeParse(d);
      if (role === "controller" && r && p.success) {
        r.lastActive = Date.now();
        io.to(r.host).emit("input:calibration", p.data);
      }
    });
    socket.on("input:swing", (d) => {
      const r = current();
      const p = swingSchema.safeParse(d);
      if (role === "controller" && r && p.success && p.data.seq > r.lastSwing) {
        r.lastSwing = p.data.seq;
        r.lastActive = Date.now();
        io.to(r.host).emit("input:swing", p.data);
      }
    });
    socket.on("input:pose", (d) => {
      const r = current();
      const p = poseSchema.safeParse(d);
      if (role === "controller" && r && p.success && p.data.seq > r.lastPose) {
        r.lastPose = p.data.seq;
        r.lastActive = Date.now();
        io.to(r.host).volatile.emit("input:pose", p.data);
      }
    });
    socket.on("input:pause", () => {
      const r = current();
      if (role === "controller" && r) io.to(r.host).emit("input:pause");
    });
    socket.on("game:phase", (d) => {
      const r = current();
      const p = phaseSchema.safeParse(d);
      if (role === "host" && r && p.success) {
        r.phase = p.data;
        r.lastActive = Date.now();
        if (r.controller) io.to(r.controller).emit("game:phase", p.data);
      }
    });
    socket.on("game:readiness", (d) => {
      const r = role === "host" ? current() : undefined;
      const p = readinessSchema.safeParse(d);
      if (r?.controller && p.success)
        io.to(r.controller).emit("game:readiness", p.data);
    });
    socket.on("haptic", (d) => {
      const r = current();
      const p = hapticSchema.safeParse(d);
      if (role === "host" && r?.controller && p.success)
        io.to(r.controller).emit("haptic", p.data);
    });
    socket.on("net:ping", (d, ack) => {
      const r = current();
      if (
        role === "controller" &&
        r &&
        typeof ack === "function" &&
        z.object({ tPhone: z.number().finite() }).safeParse(d).success
      ) {
        // A successful phone-to-screen heartbeat counts as room activity,
        // including touch mode when the player is holding still.
        io.to(r.host)
          .timeout(1500)
          .emit("net:ping", d, (err, replies) => {
            if (!err && replies?.[0]) {
              r.lastActive = Date.now();
              ack(replies[0]);
            }
          });
      }
    });
    socket.on("net:latency", (d) => {
      const r = current();
      const p = z
        .object({
          rtt: z.number().min(0).max(5000),
          offset: z.number().finite(),
        })
        .safeParse(d);
      if (role === "controller" && r && p.success)
        io.to(r.host).emit("net:latency", p.data);
    });
    socket.on("disconnect", (reason) => {
      const r = current();
      if (!r) return;
      if (role === "host") {
        if (
          ["transport close", "transport error", "ping timeout"].includes(
            reason,
          )
        ) {
          r.hostDisconnectedAt = Date.now();
          if (r.phase) {
            r.phase = {
              ...r.phase,
              phase: "paused",
              message: "Game screen reconnecting. Your score is saved.",
            };
            io.to(code!).emit("game:phase", r.phase);
          }
          return;
        }
        io.to(code!).emit("room:closed", {
          reason:
            "The game screen disconnected. Create a new room to play again.",
        });
        io.in(code!).socketsLeave(code!);
        rooms.rooms.delete(code!);
      } else if (role === "controller") {
        r.controller = undefined;
        r.disconnectedAt = Date.now();
        io.to(r.host).emit("controller:status", {
          connected: false,
          resumed: false,
        });
      }
    });
  });
  const timer = setInterval(() => {
    const { closed, expired } = rooms.sweep();
    for (const r of closed) {
      io.to(r.code).emit("room:closed", {
        reason:
          r.hostDisconnectedAt !== undefined
            ? "Game screen reconnect timed out. Create a new room to play again."
            : "Room expired after 10 minutes of inactivity.",
      });
      io.in(r.code).socketsLeave(r.code);
    }
    for (const r of expired)
      io.to(r.host).emit("room:closed", {
        reason: "Paddle reconnect timed out. Pair a phone again.",
      });
    for (const [ip, e] of attempts)
      if (Date.now() > e.reset) attempts.delete(ip);
  }, 5000);
  timer.unref();
  http.on("close", () => clearInterval(timer));
  return { app, http, io, rooms };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { http } = createApp();
  const port = Number(process.env.PORT ?? 3001);
  http.listen(port, "0.0.0.0", () =>
    console.log(`Dink Duel relay listening on :${port}`),
  );
}
