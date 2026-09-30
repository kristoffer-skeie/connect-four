import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { RoomManager } from "./rooms.js";

const PORT = process.env.PORT || 3000;
const HEARTBEAT_MS = 30_000;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// 1. HTTP: serves the static front end.
const app = express();
app.use(express.static(publicDir));
app.get("/health", (_req, res) => res.send("ok"));
const server = http.createServer(app);

// 2. WebSocket: shares the same port, on the /ws path.
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 });
const rooms = new RoomManager();

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  // Thin adapter so RoomManager never deals with raw sockets.
  const conn = {
    send(message) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    },
  };

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return conn.send({ type: "error", message: "The server couldn't read that message." });
    }
    handleMessage(conn, message);
  });

  ws.on("close", () => rooms.disconnect(conn));
});

// 3. Routes each client message to the matching RoomManager method.
function handleMessage(conn, message) {
  switch (message?.type) {
    case "create":  return rooms.create(conn, message.name);
    case "join":    return rooms.join(conn, message.code, message.name);
    case "rejoin":  return rooms.rejoin(conn, message.code, message.token);
    case "move":    return rooms.move(conn, message.column);
    case "rematch": return rooms.rematch(conn);
    case "leave":   return rooms.leave(conn);
    default:        return conn.send({ type: "error", message: "Unknown message type." });
  }
}

// 4. Heartbeat: drop connections that stopped answering (e.g. a closed laptop).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Four in a Row is running at http://localhost:${PORT}`);
});
