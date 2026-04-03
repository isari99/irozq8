import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { db, chatMessagesTable } from "@workspace/db";
import { logger } from "./logger";

export type WSMessage =
  | { type: "chat"; userId: number; username: string; message: string }
  | { type: "answer"; userId: number; username: string; answer: number; correct: boolean; newScore: number }
  | { type: "new_question"; questionId: number; text: string; choices: string[]; category: string; sessionId: number }
  | { type: "leaderboard_update"; leaderboard: { userId: number; username: string; score: number; rank: number }[] }
  | { type: "stats_update"; totalAnswers: number; correctAnswers: number; distribution: Record<string, number> }
  | { type: "connected"; message: string };

interface AuthenticatedWS extends WebSocket {
  userId?: number;
  username?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;

export function setupWebSocketServer(server: import("http").Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: AuthenticatedWS, req: IncomingMessage) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.userId && msg.username) {
          ws.userId = msg.userId;
          ws.username = msg.username;
          ws.send(JSON.stringify({ type: "connected", message: `مرحباً ${msg.username}!` }));
        }
      } catch (e) {
        logger.warn("Invalid WS message");
      }
    });

    ws.on("close", () => {
      logger.info({ userId: ws.userId }, "WS disconnected");
    });
  });

  // Heartbeat
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws: AuthenticatedWS) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  logger.info("WebSocket server initialized at /ws");
  return wss;
}

export function broadcast(msg: WSMessage): void {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

export function getWss(): WebSocketServer | null {
  return wss;
}
