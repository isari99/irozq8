import { WebSocket } from "ws";
import { logger } from "./logger";

type AnswerHandler = (username: string, answer: number) => void;
type StatusHandler = (status: "connected" | "disconnected" | "error") => void;

class TwitchClient {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private answerHandlers: AnswerHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private _channel: string | null = null;
  private _connected = false;

  get channel() { return this._channel; }
  get connected() { return this._connected; }

  onAnswer(h: AnswerHandler) { this.answerHandlers.push(h); }
  onStatus(h: StatusHandler) { this.statusHandlers.push(h); }

  private emit(h: AnswerHandler[], ...args: Parameters<AnswerHandler>): void;
  private emit(h: StatusHandler[], ...args: Parameters<StatusHandler>): void;
  private emit(handlers: any[], ...args: any[]) {
    handlers.forEach(h => h(...args));
  }

  connect(channel: string) {
    this.disconnect();
    this._channel = channel.toLowerCase().replace(/^#/, "");

    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    this.ws = ws;

    ws.on("open", () => {
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 99999) + 10000}`);
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`JOIN #${this._channel}`);
      this._connected = true;
      logger.info({ channel: this._channel }, "Twitch IRC connected");
      this.emit(this.statusHandlers, "connected");

      this.pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("PING :tmi.twitch.tv");
      }, 60_000);
    });

    ws.on("message", (raw) => {
      const lines = raw.toString().split("\r\n").filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING")) {
          ws.send("PONG :tmi.twitch.tv");
          continue;
        }
        // Parse PRIVMSG  :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
        const m = line.match(/^(?:@[^ ]+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)$/);
        if (m) {
          const username = m[1];
          const text = m[2].trim();
          const num = parseInt(text, 10);
          if (num >= 1 && num <= 4 && String(num) === text) {
            this.emit(this.answerHandlers, username, num);
          }
        }
      }
    });

    ws.on("close", () => {
      this._connected = false;
      if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
      logger.info("Twitch IRC disconnected");
      this.emit(this.statusHandlers, "disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Twitch IRC error");
      this.emit(this.statusHandlers, "error");
    });
  }

  disconnect() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.ws) { this.ws.removeAllListeners(); this.ws.close(); this.ws = null; }
    this._connected = false;
    this._channel = null;
  }
}

export const twitchClient = new TwitchClient();
