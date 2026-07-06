import { useState } from "react";

import { SyncView } from "@/components/sync-view";
import { useSyncDetail } from "@/data/sync-status";
import { atLeast } from "@/lib/async";
import { syncNow } from "@/sync";

export default function SyncScreen() {
  const { data, isPending } = useSyncDetail();
  const [syncing, setSyncing] = useState(false);

  const onSync = async () => {
    setSyncing(true);
    await atLeast(600, syncNow());
    setSyncing(false);
  };

  return <SyncView data={data} isPending={isPending} syncing={syncing} onSync={onSync} />;
}
