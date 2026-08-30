import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { collectSystemMetrics, type SystemMetrics } from "./metrics";

interface MetricsMessage {
  type: "system.metrics";
  data: SystemMetrics;
}

export function attachSystemMetricsWebSocket(server: Server): () => void {
  const webSocketServer = new WebSocketServer({ path: "/ws", server });
  const clients = new Set<WebSocket>();
  let isCollecting = false;

  async function sendMetrics(socket: WebSocket): Promise<void> {
    try {
      const message: MetricsMessage = {
        type: "system.metrics",
        data: await collectSystemMetrics(),
      };
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("System metrics stream error:", error);
    }
  }

  async function broadcastMetrics(): Promise<void> {
    if (isCollecting || clients.size === 0) return;
    isCollecting = true;
    try {
      const message: MetricsMessage = {
        type: "system.metrics",
        data: await collectSystemMetrics(),
      };
      const payload = JSON.stringify(message);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    } catch (error) {
      console.error("System metrics broadcast error:", error);
    } finally {
      isCollecting = false;
    }
  }

  webSocketServer.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    void sendMetrics(socket);
  });

  const interval = setInterval(() => void broadcastMetrics(), 1_000);

  return () => {
    clearInterval(interval);
    for (const client of clients) client.close();
    clients.clear();
    webSocketServer.close();
  };
}
