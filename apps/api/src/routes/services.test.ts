import type { ServicesStatus } from "@raspi5-control-center/shared";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { it } from "node:test";
import express from "express";
import { createServicesRouter } from "./services";

it("returns a normalized no-store services response", async (test) => {
  const snapshot: ServicesStatus = {
    dockerAvailable: true,
    containers: [],
    processes: [],
    collectedAt: "2026-08-31T00:00:00.000Z",
  };
  const app = express().use(
    "/api/services",
    createServicesRouter(async () => snapshot),
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
  const response = await fetch(`http://127.0.0.1:${port}/api/services/status`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), snapshot);
});
