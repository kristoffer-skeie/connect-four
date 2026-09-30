/**
 * Four-in-a-row rules. Plain JavaScript, no networking.
 *
 * The board is a 6x7 grid stored as board[row][col].
 * Row 0 is the TOP row, so discs "fall" toward row 5.
 * Cell values: 0 = empty, 1 = player one, 2 = player two.
 */

export const ROWS = 6;
export const COLS = 7;
const DIRECTIONS = [
  [0, 1],  // horizontal
  [1, 0],  // vertical
  [1, 1],  // diagonal down-right
  [1, -1], // diagonal down-left
];

export function createGame(startingPlayer = 1) {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
    turn: startingPlayer,
    winner: 0,
    winningCells: [],
    draw: false,
    moves: 0,
    lastMove: null,
  };
}

/**
 * Tries to drop a disc for `player` into `column`.
 * Mutates the game on success. Returns { ok: true, row } or { ok: false, error }.
 */
export function dropDisc(game, player, column) {
  if (game.winner || game.draw) return { ok: false, error: "This round is over. Start a new one to keep playing." };
  if (player !== game.turn) return { ok: false, error: "It's not your turn yet." };
  if (!Number.isInteger(column) || column < 0 || column >= COLS) {
    return { ok: false, error: "That column doesn't exist." };
  }

  // Find the lowest empty cell in the column.
  let row = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (game.board[r][column] === 0) {
      row = r;
      break;
    }
  }
  if (row === -1) return { ok: false, error: "That column is full. Pick another one." };

  game.board[row][column] = player;
  game.moves++;
  game.lastMove = { row, col: column };

  const line = findWinningLine(game.board, row, column);
  if (line) {
    game.winner = player;
    game.winningCells = line;
  } else if (game.moves === ROWS * COLS) {
    game.draw = true;
  } else {
    game.turn = player === 1 ? 2 : 1;
  }
  return { ok: true, row };
}

/**
 * Checks only the lines through the disc that was just placed,
 * which is all that can have changed. Returns the winning cells
 * as [[row, col], ...] or null.
 */
export function findWinningLine(board, row, col) {
  const player = board[row][col];
  if (!player) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];
    // Walk outward in both directions from the new disc.
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}
