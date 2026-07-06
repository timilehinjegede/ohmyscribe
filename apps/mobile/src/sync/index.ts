import { queryClient } from "@/query-client";
import { pullSync } from "@/sync/pull";
import { pushSync } from "@/sync/push";

export { pullSync } from "@/sync/pull";
export { pushSync } from "@/sync/push";

export async function syncNow(): Promise<void> {
  await pushSync();
  await pullSync();
  queryClient.invalidateQueries();
}
