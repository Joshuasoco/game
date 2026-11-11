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
