import { ThemedText } from "@/components/themed-text";
import { useSyncStatus } from "@/data/sync-status";

export function SyncStatus() {
  const { data: pending = 0 } = useSyncStatus();
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {pending > 0 ? `${pending} change${pending === 1 ? "" : "s"} to sync` : "All synced"}
    </ThemedText>
  );
}
