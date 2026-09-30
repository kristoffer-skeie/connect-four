import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, dropDisc, findWinningLine, ROWS, COLS } from "../server/game.js";

/** Plays a list of columns, alternating players automatically. */
function play(columns, game = createGame(1)) {
  for (const col of columns) {
    const result = dropDisc(game, game.turn, col);
    assert.ok(result.ok, `move in column ${col} failed: ${result.error}`);
  }
  return game;
}

test("discs fall to the lowest empty row", () => {
  const game = play([3, 3]);
  assert.equal(game.board[ROWS - 1][3], 1);
  assert.equal(game.board[ROWS - 2][3], 2);
});

test("turns alternate", () => {
  const game = play([0]);
  assert.equal(game.turn, 2);
});

test("horizontal win", () => {
  const game = play([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(game.winner, 1);
  assert.equal(game.winningCells.length, 4);
});

test("vertical win", () => {
  const game = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(game.winner, 1);
});

test("diagonal wins in both directions", () => {
  const up = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(up.winner, 1);
  const down = play([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
  assert.equal(down.winner, 1);
});

test("rejects moves out of turn, off the board, or into a full column", () => {
  const game = createGame(1);
  assert.equal(dropDisc(game, 2, 0).ok, false);
  assert.equal(dropDisc(game, 1, 7).ok, false);
  assert.equal(dropDisc(game, 1, "3").ok, false);
  play([0, 0, 0, 0, 0, 0], game);
  assert.equal(dropDisc(game, game.turn, 0).ok, false);
});

test("no moves are allowed after a win", () => {
  const game = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(dropDisc(game, 2, 5).ok, false);
});

test("a full board with no line is a draw", () => {
  const A = [1, 1, 2, 2, 1, 1, 2];
  const B = [2, 2, 1, 1, 2, 2, 1];
  const game = createGame(1);
  game.board = [A, A, B, B, A, A].map((row) => [...row]);
  game.board[0][COLS - 1] = 0; // leave the top-right cell open
  game.moves = ROWS * COLS - 1;
  game.turn = A[COLS - 1];
  const result = dropDisc(game, game.turn, COLS - 1);
  assert.ok(result.ok);
  assert.equal(game.winner, 0);
  assert.equal(game.draw, true);
});

test("findWinningLine returns null for an empty cell", () => {
  assert.equal(findWinningLine(createGame().board, 0, 0), null);
});
