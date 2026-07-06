import { API_URL } from "@/config";
import { markError, markSynced, pendingRows } from "@/db/sqlite";

type PushResult = { id: string; status: "applied" | "stale" | "rejected"; serverSeq?: number };

// Send pending local edits to /sync/push and apply the per-row acks. A whole-batch failure (offline)
// leaves everything pending for the next trigger; per-row rejects are marked error.
export async function pushSync(): Promise<void> {
  const pending = await pendingRows();
  if (pending.length === 0) return;
  const byId = new Map(pending.map((row) => [row.id, row]));
  try {
    const res = await fetch(`${API_URL}/sync/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: pending.map((row) => ({ table: row.tbl, ...row.data })) }),
    });
    if (!res.ok) return;
    const { results } = (await res.json()) as { results: PushResult[] };
    for (const result of results) {
      const row = byId.get(result.id);
      if (!row) continue;
      if (result.status === "rejected") {
        await markError(row.tbl, result.id, row.updatedAt);
      } else {
        // applied so we store the fresh serverSeq; if stale, the server already has newer, a pull reconciles.
        await markSynced(row.tbl, result.id, row.updatedAt, result.serverSeq ?? null);
      }
    }
  } catch {
    // Round-trip failed (offline/timeout) so we leave pending; next trigger re-pushes, safe because idempotent.
  }
}
