import { beforeAll, afterAll, it, expect } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/src/index";
import type {
  ClientEvents,
  ServerEvents,
  JoinResult,
} from "../shared/src/protocol";
const server = createApp();
let url: string;
const clients: Socket<ServerEvents, ClientEvents>[] = [];
it("relays only validated host readiness messages to the paired phone", async () => {
  const host = await client();
  const { roomCode } = await host.timeout(3000).emitWithAck("host:create");
  const phone = await client();
  await phone.timeout(3000).emitWithAck("controller:join", { roomCode });
  const message = {
    type: "readiness" as const,
    seq: 1,
    state: "IN_REACH" as const,
    blockReason: null,
    timeToReachMs: 0,
    serving: false,
    enabled: true,
  };
  const received = new Promise((resolve) =>
    phone.once("game:readiness", resolve),
  );
  host.emit("game:readiness", message);
  expect(await received).toEqual(message);
  let count = 0;
  phone.on("game:readiness", () => count++);
  phone.emit("game:readiness", { ...message, seq: 2 });
  host.emit("game:readiness", { ...message, seq: -1 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(count).toBe(0);
});
beforeAll(async () => {
  await new Promise<void>((r) => server.http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
});
afterAll(async () => {
  clients.forEach((c) => c.disconnect());
  await new Promise<void>((r) => server.io.close(() => r()));
});
async function client() {
  const c = io(url, { transports: ["websocket"], forceNew: true });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.on("connect", resolve);
    c.on("connect_error", reject);
    setTimeout(() => reject(new Error("Socket connect timeout")), 3000);
  });
  return c;
}
it("pairs two real sockets, relays validated swings, rejects a second phone, and resumes", async () => {
  const host = await client();
  const { roomCode } = await host.timeout(3000).emitWithAck("host:create");
  const phone = await client();
  const join: JoinResult = await phone
    .timeout(3000)
    .emitWithAck("controller:join", { roomCode });
  expect(join.ok).toBe(true);
  const second = await client();
  expect(
    (await second.timeout(3000).emitWithAck("controller:join", { roomCode }))
      .ok,
  ).toBe(false);
  const received = new Promise<unknown>((r) => host.once("input:swing", r));
  const input = {
    seq: 1,
    power: 0.7,
    side: "forehand" as const,
    tilt: 0,
    lob: false,
    tPhone: Date.now(),
  };
  phone.emit("input:swing", input);
  expect(await received).toEqual(input);
  let duplicate = 0;
  host.on("input:swing", () => duplicate++);
  phone.emit("input:swing", input);
  phone.emit("input:swing", { ...input, seq: 2, power: 2 });
  await new Promise((r) => setTimeout(r, 60));
  expect(duplicate).toBe(0);
  const dropped = new Promise<void>((r) =>
    host.once("controller:status", () => r()),
  );
  phone.disconnect();
  await dropped;
  const replacement = await client();
  if (!join.ok) throw Error();
  expect(
    (
      await replacement
        .timeout(3000)
        .emitWithAck("controller:resume", { roomCode, playerId: join.playerId })
    ).ok,
  ).toBe(true);
  const closed = new Promise<unknown>((r) =>
    replacement.once("room:closed", r),
  );
  host.disconnect();
  expect(await closed).toHaveProperty("reason");
});
it("keeps the same room and score after a host transport reset and authenticates recovery", async () => {
  const host = await client();
  const session = await host.timeout(3000).emitWithAck("host:create");
  const phone = await client();
  await phone
    .timeout(3000)
    .emitWithAck("controller:join", { roomCode: session.roomCode });
  const phase = {
    phase: "rally" as const,
    score: [4, 3] as [number, number],
    serving: "player" as const,
    rally: 5,
    message: "Playing",
  };
  const playing = new Promise((resolve) => phone.once("game:phase", resolve));
  host.emit("game:phase", phase);
  await playing;
  let closed = false;
  phone.on("room:closed", () => {
    closed = true;
  });
  const paused = new Promise((resolve) => phone.once("game:phase", resolve));
  // Close the transport, as a tunnel reset would, without sending a deliberate
  // Socket.IO disconnect. Disable auto reconnect so this test controls recovery.
  host.io.reconnection(false);
  host.io.engine.close();
  expect(await paused).toMatchObject({ phase: "paused", score: [4, 3] });
  const replacement = await client();
  expect(
    await replacement.timeout(3000).emitWithAck("host:resume", {
      ...session,
      hostId: "00000000-0000-4000-8000-000000000000",
    }),
  ).toEqual({ ok: false });
  const status = new Promise((resolve) =>
    replacement.once("controller:status", resolve),
  );
  expect(
    await replacement.timeout(3000).emitWithAck("host:resume", session),
  ).toEqual({ ok: true });
  expect(await status).toEqual({ connected: true, resumed: true });
  const swing = new Promise((resolve) =>
    replacement.once("input:swing", resolve),
  );
  phone.emit("input:swing", {
    seq: 1,
    power: 0.7,
    side: "forehand",
    tilt: 0,
    lob: false,
    tPhone: Date.now(),
  });
  expect(await swing).toMatchObject({ seq: 1 });
  expect(server.rooms.rooms.get(session.roomCode)?.phase?.score).toEqual([
    4, 3,
  ]);
  expect(closed).toBe(false);
  replacement.disconnect();
  phone.disconnect();
});
it("keeps an idle paired room active when the phone-to-screen heartbeat succeeds", async () => {
  const host = await client();
  const { roomCode } = await host.timeout(3000).emitWithAck("host:create");
  const phone = await client();
  await phone.timeout(3000).emitWithAck("controller:join", { roomCode });
  const room = server.rooms.rooms.get(roomCode)!;
  room.lastActive = Date.now() - 601_000;
  host.on("net:ping", (data, ack) => ack({ ...data, tHost: Date.now() }));
  await phone.timeout(3000).emitWithAck("net:ping", { tPhone: Date.now() });
  server.rooms.sweep();
  expect(server.rooms.rooms.has(roomCode)).toBe(true);
  host.disconnect();
  phone.disconnect();
});
