import dotenv from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabasePool } from "./index";

dotenv.config({
  path: resolve(__dirname, "../../../.env"),
  quiet: true,
});

const migrationsDirectory = resolve(__dirname, "../migrations");

async function runMigrations(): Promise<void> {
  const pool = createDatabasePool();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM public.schema_migrations",
    );
    const appliedMigrations = new Set(
      appliedResult.rows.map(({ name }) => name),
    );

    for (const fileName of migrationFiles) {
      if (appliedMigrations.has(fileName)) continue;

      const sql = await readFile(
        resolve(migrationsDirectory, fileName),
        "utf8",
      );

      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (name) VALUES ($1)",
          [fileName],
        );
        await client.query("COMMIT");
        console.log(`Migration applied: ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Migration failed:", message);
  process.exitCode = 1;
});
