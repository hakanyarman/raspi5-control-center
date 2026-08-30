import type {
  StorageInventory,
  StorageMetrics,
} from "@raspi5-control-center/shared";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import express from "express";
import { createStorageRouter } from "./storage";

const metrics: StorageMetrics = {
  devicePath: "/dev/nvme0n1p2",
  drivePath: "/dev/nvme0n1",
  model: "Test NVMe",
  transport: "nvme",
  filesystem: "ext4",
  mountPoint: "/",
  totalBytes: 1_000,
  usedBytes: 400,
  availableBytes: 600,
  usagePercent: 40,
  collectedAt: "2026-08-31T00:00:00.000Z",
};

const inventory: StorageInventory = {
  devices: [],
  externalDriveConnected: false,
  collectedAt: "2026-08-31T00:00:00.000Z",
};

describe("storage routes", () => {
  for (const testCase of [
    { path: "/metrics", expected: metrics },
    { path: "/devices", expected: inventory },
  ] as const) {
    it(`returns a no-store ${testCase.path} response`, async (test) => {
      const app = express().use(
        "/api/storage",
        createStorageRouter(async () => metrics, async () => inventory),
      );
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      test.after(
        () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      );
      const { port } = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/storage${testCase.path}`,
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), testCase.expected);
    });
  }
});
