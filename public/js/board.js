const ROWS = 6;
const COLS = 7;

/**
 Builds the board (7 column buttons x 6 slots) and returns an
 update() function that syncs it with the server state. Updating
 existing elements instead of rebuilding them lets only the newest
 disc play its drop animation.
 **/
export function createBoard(root, onDrop) {
  const columns = [];
  const slots = Array.from({ length: ROWS }, () => []);
  let renderedMoves = -1;

  for (let c = 0; c < COLS; c++) {
    const column = document.createElement("button");
    column.type = "button";
    column.className = "column";
    column.setAttribute("aria-label", `Drop a disc in column ${c + 1}`);

    const ghost = document.createElement("span"); // preview disc shown on hover
    ghost.className = "ghost";
    column.append(ghost);

    for (let r = 0; r < ROWS; r++) {
      const slot = document.createElement("span");
      slot.className = "slot";
      const disc = document.createElement("span");
      disc.className = "disc";
      slot.append(disc);
      column.append(slot);
      slots[r][c] = slot;
    }

    column.addEventListener("click", () => onDrop(c));
    root.append(column);
    columns.push(column);
  }

  function update(game, mySeat) {
    const over = Boolean(game.winner || game.draw);
    const everyoneHere = game.players.every((p) => p && p.connected);
    const myTurn = !over && everyoneHere && game.turn === mySeat;

    root.dataset.me = String(mySeat);
    root.classList.toggle("my-turn", myTurn);
    root.classList.toggle("finished", Boolean(game.winner));

    const winning = new Set(game.winningCells.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const slot = slots[r][c];
        slot.dataset.player = game.board[r][c] || "";
        slot.classList.toggle("win", winning.has(`${r},${c}`));
        slot.classList.remove("drop");
      }
    }

    // Animate only when exactly one new disc arrived since the last render.
    if (game.lastMove && game.moves === renderedMoves + 1) {
      const { row, col } = game.lastMove;
      const slot = slots[row][col];
      slot.style.setProperty("--fall", row + 1);
      void slot.offsetWidth; // restart the CSS animation
      slot.classList.add("drop");
    }
    renderedMoves = game.moves;

    columns.forEach((column, c) => {
      column.disabled = !myTurn || game.board[0][c] !== 0;
    });
  }

  return { update };
}
