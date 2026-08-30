import type {
  DatabaseClient,
  DatabasePool,
} from "@raspi5-control-center/database";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { it } from "node:test";
import WebSocket from "ws";
import { attachSystemMetricsWebSocket } from "./metrics-stream";

class ListenerClientStub extends EventEmitter {
  async query(): Promise<{ rows: never[] }> {
    return { rows: [] };
  }

  release(): void {}
}

it("sends system, network, and latest-weight snapshots on connection", async (test) => {
  const listenerClient = new ListenerClientStub();
  const pool = {
    connect: async () => listenerClient as unknown as DatabaseClient,
    query: async (text: string) => {
      if (text.includes("FROM public.weight_measurements")) {
        return {
          rows: [
            {
              id: "42",
              weight_kg: "98.65",
              measured_at: new Date("2026-08-30T16:31:42.584Z"),
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as unknown as DatabasePool;

  const server = createServer();
  const stopStream = attachSystemMetricsWebSocket(server, pool);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  test.after(() => {
    socket.close();
    stopStream();
    server.close();
  });

  const messageTypes = await new Promise<Set<string>>((resolve, reject) => {
    const types = new Set<string>();
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for WebSocket snapshots")),
      3_000,
    );
    socket.on("error", reject);
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as { type?: string };
      if (message.type) types.add(message.type);
      if (types.size === 3) {
        clearTimeout(timeout);
        resolve(types);
      }
    });
  });

  assert.deepEqual(
    [...messageTypes].sort(),
    ["network.metrics", "system.metrics", "weight.measurement"],
  );
});
