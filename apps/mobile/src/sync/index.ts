import { queryClient } from "@/query-client";
import { drainExtractions } from "@/sync/drain";
import { pullSync } from "@/sync/pull";
import { pushSync } from "@/sync/push";

export { drainExtractions } from "@/sync/drain";
export { pullSync } from "@/sync/pull";
export { pushSync } from "@/sync/push";

export async function syncNow(): Promise<void> {
  await pushSync();
  await pullSync();
  await drainExtractions();
  queryClient.invalidateQueries();
}
