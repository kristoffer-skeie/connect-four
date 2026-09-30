# Four in a Row

A real-time multiplayer four-in-a-row game you play in the browser.
One player hosts a game and gets a four-letter code, the other types the code in (or opens the invite link), and you play live against each other.

![Four in a Row demo](docs/demo.gif)
<!-- Record a short GIF of two browser windows playing and save it as docs/demo.gif -->

**Live demo:** _add your Render link here_

## Features

- **Host or join with a code.** Rooms use short codes without look-alike characters (no 0/O or 1/I), plus a shareable invite link.
- **Real-time play over WebSockets.** Both players see every move instantly.
- **Server-authoritative rules.** The server validates every move, so a modified client can't cheat.
- **Reconnects automatically.** Refresh the page or lose Wi-Fi and you get your seat back.
- **Rematches and scores.** Both players must agree to a rematch, and the starting player alternates each round.
- **Responsive and accessible.** Works on phones, supports keyboard play (keys 1 to 7), dark mode, and reduced motion.
- **Tested.** 18 unit tests cover the game rules and room logic, with no test framework needed.

## Tech stack

| Part | Technology |
| --- | --- |
| Server | Node.js, Express (static files), `ws` (WebSockets) |
| Client | Vanilla JavaScript (ES modules), HTML, CSS; no build step |
| Tests | Node's built-in test runner (`node --test`) |
| Hosting | Any Node host; a `render.yaml` is included for Render |

## Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 in **two browser tabs**. Host in one tab and join with the code in the other.

To play against someone on the same Wi-Fi, have them open `http://<your-computer's-local-IP>:3000`.

Other commands:

```bash
npm run dev   # restarts the server automatically when you edit files
npm test      # runs the unit tests
```

## Deploy it for free (Render)

1. Push this repo to GitHub.
2. On [render.com](https://render.com), choose **New → Blueprint** and select the repo. Render reads `render.yaml` and sets everything up.
3. Share the URL Render gives you. Anyone can now host and join games from anywhere.

Free instances go to sleep when idle, so the first visit after a while can take about 30 seconds to load.

## Project structure

```
├── server/
│   ├── index.js      HTTP + WebSocket server, routes messages to RoomManager
│   ├── rooms.js      Rooms, seats, codes, reconnection, rematches
│   └── game.js       Pure game rules: dropping discs, detecting wins and draws
├── public/
│   ├── index.html    The three screens: home, lobby, game
│   ├── styles.css
│   └── js/
│       ├── main.js        App state, server messages, rendering, user actions
│       ├── connection.js  WebSocket wrapper with auto-reconnect and a send queue
│       └── board.js       Builds and updates the board, drop animations
├── test/
│   ├── game.test.js
│   └── rooms.test.js
├── docs/ARCHITECTURE.md
└── render.yaml
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together, including the message protocol.

## Ideas for extending it

- Spectator mode for extra people who join a full room
- An in-game chat or emoji reactions
- A computer opponent using minimax with alpha-beta pruning
- Persisting match history in a database such as SQLite or PostgreSQL
