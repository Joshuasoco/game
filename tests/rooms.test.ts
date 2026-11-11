import { it, expect } from "vitest";
import { Rooms } from "../server/src/rooms";
it("reserves a room for one controller and verifies its resume token", () => {
  const rooms = new Rooms();
  const r = rooms.create("host");
  expect(r.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  const a = rooms.join(r.code, "phone");
  if ("error" in a) throw Error(a.error);
  expect("error" in rooms.join(r.code, "intruder")).toBe(true);
  r.controller = undefined;
  r.disconnectedAt = Date.now();
  expect(
    "error" in
      rooms.join(r.code, "intruder", "00000000-0000-4000-8000-000000000000"),
  ).toBe(true);
  const resumed = rooms.join(r.code, "phone-2", a.playerId);
  expect("error" in resumed).toBe(false);
  expect(r.controller).toBe("phone-2");
});
it("expires controller reservations at 60 seconds and inactive rooms at ten minutes", () => {
  const rooms = new Rooms();
  const r = rooms.create("host");
  rooms.join(r.code, "phone");
  r.controller = undefined;
  r.disconnectedAt = 1000;
  r.lastActive = 1000;
  rooms.sweep(62000);
  expect(r.playerId).toBeUndefined();
  expect("error" in rooms.join(r.code, "new-phone")).toBe(false);
  r.lastActive = 1000;
  rooms.sweep(602000);
  expect(rooms.rooms.size).toBe(0);
});
