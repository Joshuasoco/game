import { randomInt, randomUUID } from "node:crypto";
import type { GamePhase } from "../../shared/src/protocol.js";
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export interface Room {
  code: string;
  host: string;
  controller?: string;
  playerId?: string;
  lastActive: number;
  disconnectedAt?: number;
  phase?: GamePhase;
  lastSwing: number;
  lastPose: number;
}
export class Rooms {
  readonly rooms = new Map<string, Room>();
  create(host: string): Room {
    let code: string;
    do {
      code = Array.from(
        { length: 4 },
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join("");
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      host,
      lastActive: Date.now(),
      lastSwing: -1,
      lastPose: -1,
    };
    this.rooms.set(code, room);
    return room;
  }
  join(
    code: string,
    socketId: string,
    playerId?: string,
  ): { room: Room; playerId: string } | { error: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: "Room not found. Check the four-letter code." };
    if (room.controller)
      return { error: "This court already has a paddle connected." };
    if (
      playerId &&
      (room.playerId !== playerId ||
        !room.disconnectedAt ||
        Date.now() - room.disconnectedAt > 60_000)
    )
      return { error: "Your session expired. Pair again from the screen." };
    if (!playerId && room.playerId)
      return { error: "A paddle is reconnecting. Try again in a minute." };
    room.controller = socketId;
    room.playerId = playerId ?? randomUUID();
    room.disconnectedAt = undefined;
    room.lastActive = Date.now();
    return { room, playerId: room.playerId };
  }
  sweep(now = Date.now()): { closed: Room[]; expired: Room[] } {
    const closed: Room[] = [];
    const expired: Room[] = [];
    for (const [code, r] of this.rooms) {
      if (now - r.lastActive > 600_000) {
        closed.push(r);
        this.rooms.delete(code);
      } else if (r.disconnectedAt && now - r.disconnectedAt > 60_000) {
        expired.push({ ...r });
        r.playerId = undefined;
        r.disconnectedAt = undefined;
        r.lastSwing = -1;
        r.lastPose = -1;
      }
    }
    return { closed, expired };
  }
}
