import { Pool, type PoolConfig } from "pg";

export type DatabasePool = Pool;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseConfig(): PoolConfig {
  const port = Number(requireEnvironmentVariable("POSTGRES_PORT"));

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("POSTGRES_PORT must be a valid TCP port");
  }

  return {
    host: requireEnvironmentVariable("POSTGRES_HOST"),
    port,
    user: requireEnvironmentVariable("POSTGRES_USER"),
    password: requireEnvironmentVariable("POSTGRES_PASSWORD"),
    database: requireEnvironmentVariable("POSTGRES_DB"),
  };
}

export function createDatabasePool(): Pool {
  return new Pool(getDatabaseConfig());
}
