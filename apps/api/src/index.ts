import { createDatabasePool } from "@raspi5-control-center/database";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app";
import { attachSystemMetricsWebSocket } from "./system/metrics-stream";

dotenv.config({
  path: resolve(__dirname, "../../../.env"),
  quiet: true,
});

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? "3001");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("API_PORT must be a valid TCP port");
}

const pool = createDatabasePool();
const app = createApp(pool);
const server = app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
const stopMetricsStream = attachSystemMetricsWebSocket(server, pool);

let isShuttingDown = false;

function shutDown(signal: NodeJS.Signals): void {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down API`);
  stopMetricsStream();

  server.close(async (error) => {
    await pool.end();

    if (error) {
      console.error("API shutdown error:", error.message);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
