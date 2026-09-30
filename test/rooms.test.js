import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../server/rooms.js";

/** Stands in for a WebSocket: records every message it is sent. */
class FakeConn {
  constructor() { this.messages = []; }
  send(message) { this.messages.push(message); }
  last(type) { return [...this.messages].reverse().find((m) => !type || m.type === type); }
}

function startGame() {
  const rooms = new RoomManager({ ttlMs: 20 });
  const host = new FakeConn();
  const guest = new FakeConn();
  const room = rooms.create(host, "Ada");
  rooms.join(guest, room.code.toLowerCase(), "Linus"); // codes are case-insensitive
  return { rooms, host, guest, code: room.code };
}

test("hosting returns a 4-character code and seat 1", () => {
  const rooms = new RoomManager();
  const host = new FakeConn();
  const room = rooms.create(host, "  Ada  ");
  assert.match(room.code, /^[A-Z2-9]{4}$/);
  assert.deepEqual(host.last("joined").seat, 1);
  assert.equal(host.last("state").state.players[0].name, "Ada");
});

test("joining with a code seats the guest and tells both players", () => {
  const { host, guest } = startGame();
  assert.equal(guest.last("joined").seat, 2);
  assert.equal(host.last("state").state.players[1].name, "Linus");
});

test("unknown codes and full rooms are rejected", () => {
  const { rooms, code } = startGame();
  const stranger = new FakeConn();
  rooms.join(stranger, "ZZZZ", "Eve");
  assert.equal(stranger.last().type, "error");
  rooms.join(stranger, code, "Eve");
  assert.match(stranger.last("error").message, /two players/);
});

test("moves are validated by the server and broadcast to both players", () => {
  const { rooms, host, guest } = startGame();
  rooms.move(guest, 0); // host goes first
  assert.equal(guest.last().type, "error");

  rooms.move(host, 3);
  assert.equal(guest.last("state").state.board[5][3], 1);
  assert.equal(host.last("state").state.turn, 2);
});

test("secrets never appear in the shared state", () => {
  const { host } = startGame();
  const json = JSON.stringify(host.last("state"));
  assert.ok(!json.includes("token"));
  assert.ok(!json.includes(host.last("joined").token));
});

test("a win updates the score, and a rematch needs both votes", () => {
  const { rooms, host, guest } = startGame();
  for (const [conn, col] of [[host, 0], [guest, 1], [host, 0], [guest, 1], [host, 0], [guest, 1], [host, 0]]) {
    rooms.move(conn, col);
  }
  let state = guest.last("state").state;
  assert.equal(state.winner, 1);
  assert.deepEqual(state.scores, [1, 0]);

  rooms.rematch(host);
  state = guest.last("state").state;
  assert.deepEqual(state.rematchVotes, [1]);
  assert.equal(state.round, 1);

  rooms.rematch(guest);
  state = guest.last("state").state;
  assert.equal(state.round, 2);
  assert.equal(state.moves, 0);
  assert.equal(state.turn, 2); // the other player starts round 2
});

test("a disconnected player can rejoin with their token", () => {
  const { rooms, host, guest, code } = startGame();
  const { token } = guest.last("joined");
  rooms.disconnect(guest);
  assert.equal(host.last("state").state.players[1].connected, false);

  const newTab = new FakeConn();
  rooms.rejoin(newTab, code, token);
  assert.equal(newTab.last("joined").seat, 2);
  assert.equal(host.last("state").state.players[1].connected, true);

  const impostor = new FakeConn();
  rooms.rejoin(impostor, code, "not-the-token");
  assert.equal(impostor.last().type, "error");
});

test("leaving closes the room for the other player", () => {
  const { rooms, host, guest, code } = startGame();
  rooms.leave(host);
  assert.equal(guest.last().type, "closed");
  assert.equal(rooms.rooms.has(code), false);
});

test("a room with nobody connected is cleaned up after the timeout", async () => {
  const { rooms, host, guest, code } = startGame();
  rooms.disconnect(host);
  rooms.disconnect(guest);
  assert.equal(rooms.rooms.has(code), true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(rooms.rooms.has(code), false);
});
