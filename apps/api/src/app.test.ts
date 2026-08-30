import type { DatabasePool } from "@raspi5-control-center/database";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { describe, it, type TestContext } from "node:test";
import { createApp } from "./app";

interface QueryCall {
  text: string;
  values?: unknown[];
}

function createPoolStub({ failQueries = false } = {}) {
  const calls: QueryCall[] = [];
  const query = async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (failQueries) throw new Error("sensitive database details");

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
  };

  return {
    calls,
    pool: { query } as unknown as DatabasePool,
  };
}

async function startApp(test: TestContext, pool: DatabasePool): Promise<string> {
  const server = createApp(pool).listen(0, "127.0.0.1");
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
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("API", () => {
  it("reports healthy database connectivity without Express disclosure", async (test) => {
    const { calls, pool } = createPoolStub();
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.deepEqual(await response.json(), {
      status: "ok",
      database: "connected",
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.text, /SELECT 1/);
  });

  it("rejects invalid weight limits before querying the database", async (test) => {
    const { calls, pool } = createPoolStub();
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/api/weights?limit=101`);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "limit must be an integer between 1 and 100",
    });
    assert.equal(calls.length, 0);
  });

  it("maps the latest database row to the public weight DTO", async (test) => {
    const { pool } = createPoolStub();
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/api/weights/latest`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: "42",
      weightKg: 98.65,
      measuredAt: "2026-08-30T16:31:42.584Z",
    });
  });

  it("returns JSON 404 responses for unknown routes", async (test) => {
    const { pool } = createPoolStub();
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/missing`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  });

  it("returns a generic 503 when the health database check fails", async (test) => {
    test.mock.method(console, "error", () => undefined);
    const { pool } = createPoolStub({ failQueries: true });
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "error",
      database: "unavailable",
    });
  });

  it("does not expose database errors from weight routes", async (test) => {
    test.mock.method(console, "error", () => undefined);
    const { pool } = createPoolStub({ failQueries: true });
    const baseUrl = await startApp(test, pool);
    const response = await fetch(`${baseUrl}/api/weights/latest`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  });
});
