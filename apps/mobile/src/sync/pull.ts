import { API_URL } from "@/config";
import { applyPulled, getCursor, setCursor, type PulledRow } from "@/db/sqlite";

type PullResponse = { changes: Record<string, PulledRow[]>; cursor: number };

// Hydrate local SQLite with everything the server has seen since our cursor. Idempotent: if it
// fails partway the cursor doesn't advance, so the next run re-applies the same rows harmlessly.
export async function pullSync(): Promise<void> {
  const since = await getCursor();
  try {
    const res = await fetch(`${API_URL}/sync/pull?since=${since}`);
    if (!res.ok) return;
    const { changes, cursor } = (await res.json()) as PullResponse;
    for (const [tbl, rows] of Object.entries(changes)) {
      for (const row of rows) {
        await applyPulled(tbl, row);
      }
    }
    await setCursor(cursor);
  } catch {
    // If an error is thrown, the cursor didn't advance, so the next trigger re-pulls.
  }
}
