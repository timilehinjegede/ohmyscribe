import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

/**
 * Create a Drizzle client bound to a Postgres connection. Callers own the
 * connection string; this package never reads env implicitly except as the
 * default here, so it stays usable from the API, ingestion, and scripts alike.
 *
 * Each call opens a new postgres.js connection pool. Create ONE per process
 * (e.g. once at API startup) and reuse it — don't call this per request. A
 * one-off script must close the pool when done or the process hangs on exit:
 * `await db.$client.end()`.
 */
export function createDb(
  connectionString: string | undefined = process.env.DATABASE_URL,
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
