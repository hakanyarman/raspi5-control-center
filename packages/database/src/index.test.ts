import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getDatabaseConfig } from "./index";

const variableNames = [
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;
const originalValues = new Map(
  variableNames.map((name) => [name, process.env[name]]),
);

function setValidEnvironment(): void {
  process.env.POSTGRES_HOST = "127.0.0.1";
  process.env.POSTGRES_PORT = "5432";
  process.env.POSTGRES_USER = "test-user";
  process.env.POSTGRES_PASSWORD = "test-placeholder";
  process.env.POSTGRES_DB = "test-database";
}

afterEach(() => {
  for (const name of variableNames) {
    const originalValue = originalValues.get(name);
    if (originalValue === undefined) delete process.env[name];
    else process.env[name] = originalValue;
  }
});

describe("getDatabaseConfig", () => {
  it("maps a complete environment to a pg Pool config", () => {
    setValidEnvironment();

    assert.deepEqual(getDatabaseConfig(), {
      host: "127.0.0.1",
      port: 5432,
      user: "test-user",
      password: "test-placeholder",
      database: "test-database",
    });
  });

  it("rejects a missing required variable", () => {
    setValidEnvironment();
    delete process.env.POSTGRES_PASSWORD;

    assert.throws(
      () => getDatabaseConfig(),
      /Missing required environment variable: POSTGRES_PASSWORD/,
    );
  });

  for (const port of ["0", "65536", "not-a-port"]) {
    it(`rejects invalid PostgreSQL port ${port}`, () => {
      setValidEnvironment();
      process.env.POSTGRES_PORT = port;

      assert.throws(
        () => getDatabaseConfig(),
        /POSTGRES_PORT must be a valid TCP port/,
      );
    });
  }
});
