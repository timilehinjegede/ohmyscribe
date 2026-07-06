import { useQuery } from "@tanstack/react-query";

import { pendingCount } from "@/db/sqlite";
import { localSyncStatus } from "@/db/sync-status";

// Pending-edit count for the compact indicator.
export function useSyncStatus() {
  return useQuery({ queryKey: ["sync-status"], queryFn: pendingCount });
}

// The unsynced edits grouped by visit, for the Sync screen.
export function useSyncDetail() {
  return useQuery({ queryKey: ["sync-status", "detail"], queryFn: localSyncStatus });
}
