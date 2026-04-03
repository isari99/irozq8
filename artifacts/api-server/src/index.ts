import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./lib/wsManager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

setupWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
