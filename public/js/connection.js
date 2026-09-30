/**
 * Wraps the browser WebSocket with two extras:
 *  - messages sent while offline are queued and flushed on reconnect
 *  - the socket reconnects automatically with exponential backoff
 */
export class Connection {
  constructor({ onMessage, onOpen, onClose }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.queue = [];
    this.retryDelay = 500;
    this.connect();
  }

  connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.retryDelay = 500;
      this.onOpen();
      for (const message of this.queue.splice(0)) ws.send(JSON.stringify(message));
    });

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.onMessage(message);
    });

    ws.addEventListener("close", () => {
      this.onClose();
      setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 8000);
    });
  }

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    else this.queue.push(message);
  }
}
