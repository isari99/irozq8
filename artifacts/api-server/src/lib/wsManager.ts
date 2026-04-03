import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";

interface AuthenticatedWS extends WebSocket {
  userId?: number;
  username?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;

export function setupWebSocketServer(server: import("http").Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: AuthenticatedWS) => {
    ws.isAlive = true;

    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("error", (err) => { logger.error({ err }, "WebSocket error"); });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.userId && msg.username) {
          ws.userId = msg.userId;
          ws.username = msg.username;
          ws.send(JSON.stringify({ type: "connected", message: `مرحباً ${msg.username}!` }));
        }
      } catch {
        logger.warn("Invalid WS message");
      }
    });

    ws.on("close", () => {
      logger.debug({ userId: ws.userId }, "WS disconnected");
    });
  });

  // Heartbeat
  const interval = setInterval(() => {
    if (!wss) return;
    (wss.clients as Set<AuthenticatedWS>).forEach((ws) => {
      if (ws.isAlive === false) { ws.terminate(); return; }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on("close", () => clearInterval(interval));
  logger.info("WebSocket server initialized at /ws");
  return wss;
}

export function broadcast(msg: Record<string, unknown>): void {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

export function getWss(): WebSocketServer | null { return wss; }
