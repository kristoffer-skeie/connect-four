import { Connection } from "./connection.js";
import { createBoard } from "./board.js";

const $ = (id) => document.getElementById(id);
const SESSION_KEY = "four-in-a-row:session"; // per tab, so two tabs can play each other
const NAME_KEY = "four-in-a-row:name";       // remembered across visits

/* =============================================================
   State
   Everything the UI shows is derived from this object.
   ============================================================= */
const state = {
  code: null,       // room code, once we're in a room
  seat: null,       // 1 or 2
  game: null,       // latest snapshot from the server
  rejoining: false, // true while trying to reclaim a seat
};

const connection = new Connection({
  onOpen: handleOpen,
  onClose: () => { $("banner").hidden = false; },
  onMessage: handleMessage,
});

const board = createBoard($("board"), (column) => connection.send({ type: "move", column }));

/* =============================================================
   Server messages
   ============================================================= */
function handleOpen() {
  $("banner").hidden = true;
  const session = loadSession();
  if (session) {
    state.rejoining = true;
    connection.send({ type: "rejoin", code: session.code, token: session.token });
  }
}

function handleMessage(message) {
  switch (message.type) {
    case "joined":
      state.code = message.code;
      state.seat = message.seat;
      state.rejoining = false;
      saveSession({ code: message.code, token: message.token });
      setRoomInUrl(message.code);
      break;

    case "state":
      state.game = message.state;
      break;

    case "error":
      if (state.rejoining) {
        state.rejoining = false;
        clearSession();
        resetToHome();
        showToast("That game has ended. Host a new one or join with a code.");
      } else {
        showToast(message.message);
      }
      break;

    case "closed":
      clearSession();
      resetToHome();
      showToast(message.message);
      break;
  }
  render();
}

/* =============================================================
   Rendering
   ============================================================= */
function currentScreen() {
  if (!state.code || !state.game) return "home";
  return state.game.players[1] ? "game" : "lobby";
}

function render() {
  const screen = currentScreen();
  for (const name of ["home", "lobby", "game"]) {
    $(`screen-${name}`).hidden = name !== screen;
  }
  if (screen === "lobby") renderLobby();
  if (screen === "game") renderGame();
}

function renderLobby() {
  const tiles = $("code-tiles");
  tiles.setAttribute("aria-label", `Game code ${state.code.split("").join(" ")}`);
  tiles.replaceChildren(
    ...[...state.code].map((ch) => {
      const tile = document.createElement("span");
      tile.textContent = ch;
      tile.setAttribute("aria-hidden", "true");
      return tile;
    })
  );
}

function renderGame() {
  const game = state.game;
  const me = state.seat;
  const them = me === 1 ? 2 : 1;
  const opponent = game.players[them - 1];
  const over = Boolean(game.winner || game.draw);

  // Player cards
  for (const seat of [1, 2]) {
    const card = $(`player-${seat}`);
    const player = game.players[seat - 1];
    card.querySelector(".player-name").textContent = player.name;
    card.querySelector(".player-meta").textContent =
      seat === me ? "You" : player.connected ? "Opponent" : "Reconnecting…";
    card.querySelector(".player-score").textContent = game.scores[seat - 1];
    card.classList.toggle("active", !over && game.turn === seat);
    card.classList.toggle("winner", game.winner === seat);
    card.classList.toggle("offline", !player.connected);
  }

  // Status line
  let status;
  if (!opponent.connected) status = `${opponent.name} lost connection. Waiting for them to come back…`;
  else if (game.winner === me) status = "You win this round!";
  else if (game.winner) status = `${opponent.name} wins this round.`;
  else if (game.draw) status = "It's a draw. The board is full.";
  else if (game.turn === me) status = "Your turn. Pick a column.";
  else status = `${opponent.name} is thinking…`;
  $("status").textContent = status;

  // Rematch button
  const rematch = $("rematch-btn");
  rematch.hidden = !over;
  const iVoted = game.rematchVotes.includes(me);
  const theyVoted = game.rematchVotes.includes(them);
  rematch.disabled = iVoted;
  rematch.textContent = iVoted
    ? `Waiting for ${opponent.name}…`
    : theyVoted ? `Play again (${opponent.name} is ready)` : "Play again";

  $("room-code").textContent = game.code;
  board.update(game, me);
}

/* =============================================================
   User actions
   ============================================================= */
$("name-input").value = localStorage.getItem(NAME_KEY) ?? "";
$("name-input").addEventListener("change", (e) => localStorage.setItem(NAME_KEY, e.target.value.trim()));
const playerName = () => $("name-input").value.trim();

$("host-btn").addEventListener("click", () => {
  connection.send({ type: "create", name: playerName() });
});

$("code-input").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("code-input").value.trim().toUpperCase();
  if (code.length !== 4) return showToast("Enter the 4-character code your friend sent you.");
  connection.send({ type: "join", code, name: playerName() });
});

$("copy-link-btn").addEventListener("click", () => copy(inviteLink(), "Invite link copied"));
$("copy-code-btn").addEventListener("click", () => copy(state.code, "Code copied"));

$("rematch-btn").addEventListener("click", () => connection.send({ type: "rematch" }));

for (const id of ["cancel-btn", "leave-btn"]) {
  $(id).addEventListener("click", () => {
    connection.send({ type: "leave" });
    clearSession();
    resetToHome();
    render();
  });
}

// Keys 1-7 drop a disc when it's your turn.
document.addEventListener("keydown", (e) => {
  if (currentScreen() !== "game" || e.target.tagName === "INPUT") return;
  const column = Number(e.key) - 1;
  if (column >= 0 && column < 7) {
    const button = $("board").children[column];
    if (!button.disabled) connection.send({ type: "move", column });
  }
});

/* =============================================================
   Helpers
   ============================================================= */
function resetToHome() {
  state.code = null;
  state.seat = null;
  state.game = null;
  setRoomInUrl(null);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${state.code}`;
}

function setRoomInUrl(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

async function copy(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast(`Copy failed. Share this instead: ${text}`);
  }
}

let toastTimer;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}
function saveSession(session) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

/* =============================================================
   Start-up: an invite link (?room=CODE) pre-fills the join form.
   ============================================================= */
const invitedCode = new URLSearchParams(location.search).get("room");
if (invitedCode && loadSession()?.code !== invitedCode) {
  $("code-input").value = invitedCode.toUpperCase().slice(0, 4);
  $("name-input").focus();
}
render();
