import type {
  DatabaseClient,
  DatabasePool,
} from "@raspi5-control-center/database";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  getLatestWeightMeasurement,
  getWeightMeasurementById,
  type WeightMeasurement,
} from "../weights/measurements";
import { collectSystemMetrics, type SystemMetrics } from "./metrics";

const WEIGHT_NOTIFICATION_CHANNEL = "weight_measurement_saved";

interface MetricsMessage {
  type: "system.metrics";
  data: SystemMetrics;
}

interface WeightMessage {
  type: "weight.measurement";
  data: WeightMeasurement;
}

export function attachSystemMetricsWebSocket(
  server: Server,
  pool: DatabasePool,
): () => void {
  const webSocketServer = new WebSocketServer({ path: "/ws", server });
  const clients = new Set<WebSocket>();
  let isCollecting = false;
  let isConnectingListener = false;
  let isStopped = false;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let listenerClient: DatabaseClient | undefined;

  function broadcast(message: MetricsMessage | WeightMessage): void {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

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
      broadcast(message);
    } catch (error) {
      console.error("System metrics broadcast error:", error);
    } finally {
      isCollecting = false;
    }
  }

  async function sendLatestWeight(socket: WebSocket): Promise<void> {
    try {
      const measurement = await getLatestWeightMeasurement(pool);
      if (!measurement || socket.readyState !== WebSocket.OPEN) return;
      const message: WeightMessage = {
        type: "weight.measurement",
        data: measurement,
      };
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("Latest weight stream error:", error);
    }
  }

  async function broadcastWeight(id: string): Promise<void> {
    try {
      const measurement = await getWeightMeasurementById(pool, id);
      if (!measurement) return;
      broadcast({ type: "weight.measurement", data: measurement });
    } catch (error) {
      console.error("Weight measurement broadcast error:", error);
    }
  }

  function scheduleListenerReconnect(): void {
    if (isStopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connectWeightListener();
    }, 2_000);
  }

  async function connectWeightListener(): Promise<void> {
    if (isStopped || listenerClient || isConnectingListener) return;
    isConnectingListener = true;
    let client: DatabaseClient | undefined;

    try {
      const connectedClient = await pool.connect();
      client = connectedClient;
      if (isStopped) {
        connectedClient.release();
        return;
      }

      connectedClient.on("notification", (notification) => {
        if (
          notification.channel === WEIGHT_NOTIFICATION_CHANNEL &&
          notification.payload
        ) {
          void broadcastWeight(notification.payload);
        }
      });
      connectedClient.once("error", (error) => {
        console.error("Weight notification listener error:", error);
        if (listenerClient === connectedClient) listenerClient = undefined;
        connectedClient.release(true);
        scheduleListenerReconnect();
      });
      await connectedClient.query(`LISTEN ${WEIGHT_NOTIFICATION_CHANNEL}`);
      listenerClient = connectedClient;
      client = undefined;
    } catch (error) {
      console.error("Weight notification listener connection error:", error);
      if (client) {
        client.removeAllListeners();
        client.release(true);
      }
      scheduleListenerReconnect();
    } finally {
      isConnectingListener = false;
    }
  }

  webSocketServer.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    void sendMetrics(socket);
    void sendLatestWeight(socket);
  });

  const interval = setInterval(() => void broadcastMetrics(), 1_000);
  void connectWeightListener();

  return () => {
    isStopped = true;
    clearInterval(interval);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (listenerClient) {
      const client = listenerClient;
      listenerClient = undefined;
      client.removeAllListeners();
      void client
        .query("UNLISTEN *")
        .finally(() => client.release(true));
    }
    for (const client of clients) client.close();
    clients.clear();
    webSocketServer.close();
  };
}
