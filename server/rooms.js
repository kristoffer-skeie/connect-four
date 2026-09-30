import crypto from "node:crypto";
import { createGame, dropDisc } from "./game.js";

// No 0/O or 1/I/L, so codes are easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const MAX_NAME_LENGTH = 16;
const DEFAULT_TTL_MS = 2 * 60 * 1000; // keep an abandoned room for 2 minutes

function cleanName(name, fallback) {
  const cleaned = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || fallback;
}

/**
 * Owns every game room and decides what happens for each message.
 *
 * It never touches sockets directly. A "connection" is any object
 * with a send(message) method, which keeps this class easy to test
 * with fake connections.
 *
 * Room shape:
 *   { code, players: [seat1, seat2], game, scores, round,
 *     nextStarter, rematchVotes, cleanupTimer }
 * Seat shape:
 *   { name, token, conn }   conn is null while disconnected
 */
export class RoomManager {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.rooms = new Map();   // code -> room
    this.members = new Map(); // connection -> { room, seat }
    this.ttlMs = ttlMs;
  }

  // ---------------------------------------------------------------
  // Message handlers
  // ---------------------------------------------------------------

  create(conn, name) {
    this.leave(conn); // one room per connection
    const room = {
      code: this.generateCode(),
      players: [null, null],
      game: createGame(1),
      scores: [0, 0],
      round: 1,
      nextStarter: 2, // players take turns starting each round
      rematchVotes: new Set(),
      cleanupTimer: null,
    };
    this.rooms.set(room.code, room);
    this.seat(room, 0, conn, cleanName(name, "Player 1"));
    return room;
  }

  join(conn, code, name) {
    const room = this.rooms.get(String(code ?? "").trim().toUpperCase());
    if (!room) return this.error(conn, "No game uses that code. Check the code with your friend and try again.");
    if (room.players[1]) return this.error(conn, "That game already has two players.");
    this.leave(conn);
    this.seat(room, 1, conn, cleanName(name, "Player 2"));
    return room;
  }

  /** Lets a player who refreshed or lost connection take their seat back. */
  rejoin(conn, code, token) {
    const room = this.rooms.get(code);
    const seatIndex = room ? room.players.findIndex((p) => p && p.token === token) : -1;
    if (seatIndex === -1) return this.error(conn, "That game has ended.");

    const player = room.players[seatIndex];
    if (player.conn && player.conn !== conn) this.members.delete(player.conn);
    player.conn = conn;
    this.members.set(conn, { room, seat: seatIndex });
    clearTimeout(room.cleanupTimer);

    conn.send({ type: "joined", code: room.code, seat: seatIndex + 1, token });
    this.broadcast(room);
    return room;
  }

  move(conn, column) {
    const member = this.members.get(conn);
    if (!member) return this.error(conn, "You're not in a game.");
    const { room, seat } = member;
    if (!room.players[1]) return this.error(conn, "Wait for your friend to join first.");

    const result = dropDisc(room.game, seat + 1, column);
    if (!result.ok) return this.error(conn, result.error);

    if (room.game.winner) room.scores[room.game.winner - 1]++;
    this.broadcast(room);
    return result;
  }

  /** A new round starts once BOTH players have asked for one. */
  rematch(conn) {
    const member = this.members.get(conn);
    if (!member) return null;
    const { room, seat } = member;
    if (!room.game.winner && !room.game.draw) return null;

    room.rematchVotes.add(seat);
    if (room.rematchVotes.size === 2) {
      room.game = createGame(room.nextStarter);
      room.nextStarter = room.nextStarter === 1 ? 2 : 1;
      room.round++;
      room.rematchVotes.clear();
    }
    this.broadcast(room);
    return room;
  }

  /** Player chose to leave: the room closes for both players. */
  leave(conn) {
    const member = this.members.get(conn);
    if (!member) return;
    this.closeRoom(member.room, "Your opponent left the game.", conn);
  }

  /** Socket closed unexpectedly: keep the seat so the player can rejoin. */
  disconnect(conn) {
    const member = this.members.get(conn);
    if (!member) return;
    this.members.delete(conn);

    const { room, seat } = member;
    const player = room.players[seat];
    if (player && player.conn === conn) player.conn = null;

    const anyoneConnected = room.players.some((p) => p && p.conn);
    if (anyoneConnected) this.broadcast(room);
    else this.scheduleCleanup(room);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  seat(room, index, conn, name) {
    const token = crypto.randomUUID(); // secret used to reclaim the seat later
    room.players[index] = { name, token, conn };
    this.members.set(conn, { room, seat: index });
    conn.send({ type: "joined", code: room.code, seat: index + 1, token });
    this.broadcast(room);
  }

  generateCode() {
    let code;
    do {
      code = Array.from({ length: CODE_LENGTH }, () =>
        CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  scheduleCleanup(room) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => this.rooms.delete(room.code), this.ttlMs);
    room.cleanupTimer.unref?.(); // don't keep the process alive just for this timer
  }

  closeRoom(room, message, closedBy) {
    clearTimeout(room.cleanupTimer);
    for (const player of room.players) {
      if (!player?.conn) continue;
      this.members.delete(player.conn);
      if (player.conn !== closedBy) player.conn.send({ type: "closed", message });
    }
    this.rooms.delete(room.code);
  }

  /** The public view of a room. Tokens and connections never leave the server. */
  snapshot(room) {
    const { game } = room;
    return {
      code: room.code,
      board: game.board,
      turn: game.turn,
      winner: game.winner,
      winningCells: game.winningCells,
      draw: game.draw,
      moves: game.moves,
      lastMove: game.lastMove,
      round: room.round,
      scores: room.scores,
      players: room.players.map((p) => (p ? { name: p.name, connected: Boolean(p.conn) } : null)),
      rematchVotes: [...room.rematchVotes].map((seat) => seat + 1),
    };
  }

  broadcast(room) {
    const state = this.snapshot(room);
    for (const player of room.players) player?.conn?.send({ type: "state", state });
  }

  error(conn, message) {
    conn.send({ type: "error", message });
    return null;
  }
}
