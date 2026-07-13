import * as SQLite from "expo-sqlite";

// One row-store for every synced table: the row as JSON keyed by (tbl, id), plus server_seq (the
// pull cursor source) and a device-only sync_status ('synced' | 'pending' | 'error') that drives
// the push queue. Views are rebuilt in JS from these rows; the data is small enough that in-memory
// joins beat mirroring every column into typed tables.
export const db = SQLite.openDatabaseSync("ohmyscribe.db");

db.execSync(`
  CREATE TABLE IF NOT EXISTS sync_rows (
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    server_seq INTEGER,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    data TEXT NOT NULL,
    PRIMARY KEY (tbl, id)
  );
  CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- Device-only queue of recorded audio awaiting upload. assessment_id is the PK so a re-record
  -- replaces the pending row (newest wins); a finished upload deletes the row rather than keeping
  -- a terminal status.
  CREATE TABLE IF NOT EXISTS pending_extractions (
    assessment_id TEXT PRIMARY KEY,
    file_uri TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL
  );
`);

// The sync trio the server sends on every row (camelCase, since drizzle returns schema field names).
export type PulledRow = Record<string, unknown> & {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  serverSeq: number;
};

export async function localRows<T = Record<string, unknown>>(tbl: string): Promise<T[]> {
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM sync_rows WHERE tbl = ? AND deleted_at IS NULL`,
    tbl,
  );
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function localRow<T = Record<string, unknown>>(
  tbl: string,
  id: string,
): Promise<T | null> {
  const row = await db.getFirstAsync<{ data: string }>(
    `SELECT data FROM sync_rows WHERE tbl = ? AND id = ? AND deleted_at IS NULL`,
    tbl,
    id,
  );
  return row ? (JSON.parse(row.data) as T) : null;
}

// All rows for a table INCLUDING soft-deleted, for reusing a logical row's id when the nurse
// re-adds something they removed, so the push revives that server row instead of colliding on it.
export async function allRows<T = Record<string, unknown>>(tbl: string): Promise<T[]> {
  const rows = await db.getAllAsync<{ data: string }>(
    `SELECT data FROM sync_rows WHERE tbl = ?`,
    tbl,
  );
  return rows.map((r) => JSON.parse(r.data) as T);
}

// Write a client-authored row locally, marked pending for the next push. Keeps any existing
// server_seq (the last-synced revision); a brand-new row has none until the push acks it.
export async function writeAuthored(
  tbl: string,
  row: Record<string, unknown> & { id: string; updatedAt: string; deletedAt: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_rows (tbl, id, server_seq, updated_at, deleted_at, sync_status, data)
       VALUES (?, ?, NULL, ?, ?, 'pending', ?)
     ON CONFLICT(tbl, id) DO UPDATE SET
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
       sync_status = 'pending', data = excluded.data`,
    tbl,
    row.id,
    row.updatedAt,
    row.deletedAt,
    JSON.stringify(row),
  );
}

// Apply a row from /sync/pull. LWW: keep only a still-pending local edit that's at least as new (it
// will push). A synced or rejected(error) row yields to the server, so a reject reconciles to the
// server's version instead of staying stuck. ISO timestamps compare as strings.
export async function applyPulled(tbl: string, row: PulledRow): Promise<void> {
  const existing = await db.getFirstAsync<{ updated_at: string; sync_status: string }>(
    `SELECT updated_at, sync_status FROM sync_rows WHERE tbl = ? AND id = ?`,
    tbl,
    row.id,
  );
  if (existing && existing.sync_status === "pending" && existing.updated_at >= row.updatedAt) {
    return;
  }
  await db.runAsync(
    `INSERT INTO sync_rows (tbl, id, server_seq, updated_at, deleted_at, sync_status, data)
       VALUES (?, ?, ?, ?, ?, 'synced', ?)
     ON CONFLICT(tbl, id) DO UPDATE SET
       server_seq = excluded.server_seq, updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at, sync_status = 'synced', data = excluded.data`,
    tbl,
    row.id,
    row.serverSeq,
    row.updatedAt,
    row.deletedAt,
    JSON.stringify(row),
  );
}

export async function getCursor(): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM sync_meta WHERE key = 'cursor'`,
  );
  return row ? Number(row.value) : 0;
}

export async function setCursor(cursor: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES ('cursor', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    String(cursor),
  );
}

// The client-authored rows waiting to push. data holds the exact wire payload (id, updatedAt,
// deletedAt + fields); tbl becomes the push row's `table`.
export async function pendingRows(): Promise<
  { tbl: string; id: string; updatedAt: string; data: Record<string, unknown> }[]
> {
  const rows = await db.getAllAsync<{ tbl: string; id: string; updated_at: string; data: string }>(
    `SELECT tbl, id, updated_at, data FROM sync_rows WHERE sync_status = 'pending'`,
  );
  return rows.map((r) => ({
    tbl: r.tbl,
    id: r.id,
    updatedAt: r.updated_at,
    data: JSON.parse(r.data),
  }));
}

// Version-guarded ack: clear pending only if the row hasn't been edited since we pushed this exact
// version; otherwise the newer local edit stays pending and re-pushes next round (no lost writes).
export async function markSynced(
  tbl: string,
  id: string,
  pushedUpdatedAt: string,
  serverSeq: number | null,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_rows SET sync_status = 'synced', server_seq = COALESCE(?, server_seq)
       WHERE tbl = ? AND id = ? AND updated_at = ?`,
    serverSeq,
    tbl,
    id,
    pushedUpdatedAt,
  );
}

export async function markError(tbl: string, id: string, pushedUpdatedAt: string): Promise<void> {
  await db.runAsync(
    `UPDATE sync_rows SET sync_status = 'error' WHERE tbl = ? AND id = ? AND updated_at = ?`,
    tbl,
    id,
    pushedUpdatedAt,
  );
}

// How many local edits are still waiting to reach the server; drives the sync-status indicator.
// Errored rows are excluded: they reconcile to the server on the next pull, so they don't pin the badge.
export async function pendingCount(): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) as n FROM sync_rows WHERE sync_status = 'pending'`,
  );
  return row?.n ?? 0;
}

// Every not-yet-synced local edit (pending or failed), with its data (which carries assessmentId),
// for the Sync screen to group by visit and surface failures.
export async function unsyncedRows(): Promise<
  { tbl: string; syncStatus: string; data: Record<string, unknown> }[]
> {
  const rows = await db.getAllAsync<{ tbl: string; sync_status: string; data: string }>(
    `SELECT tbl, sync_status, data FROM sync_rows WHERE sync_status IN ('pending', 'error')`,
  );
  return rows.map((r) => ({ tbl: r.tbl, syncStatus: r.sync_status, data: JSON.parse(r.data) }));
}
