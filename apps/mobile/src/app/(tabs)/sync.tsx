import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useSyncDetail } from "@/data/sync-status";
import type { SyncVisitGroup } from "@/db/sync-status";
import { atLeast } from "@/lib/async";
import { syncNow } from "@/sync";

function rowLabel(group: SyncVisitGroup) {
  const parts: string[] = [];
  if (group.failed > 0) parts.push(`${group.failed} failed`);
  if (group.pending > 0) parts.push(`${group.pending} pending`);
  return parts.join(" · ");
}

function syncSummary(failed: number, pending: number): string {
  if (failed > 0) return `${failed} failed · ${pending} pending`;
  if (pending > 0) return `${pending} change${pending === 1 ? "" : "s"} waiting to sync`;
  return "Everything's synced";
}

export default function SyncScreen() {
  const { data, isPending } = useSyncDetail();
  const [syncing, setSyncing] = useState(false);

  const onSync = async () => {
    setSyncing(true);
    await atLeast(600, syncNow());
    setSyncing(false);
  };

  const groups = data?.groups ?? [];
  const pending = data?.pending ?? 0;
  const failed = data?.failed ?? 0;
  const summary = syncSummary(failed, pending);
  const actionLabel = syncing ? "Syncing..." : pending > 0 || failed > 0 ? "Sync now" : "Refresh";

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ThemedView style={styles.header}>
          <ThemedView>
            <ThemedText type="subtitle">Sync</ThemedText>
            <ThemedText themeColor="textSecondary">{summary}</ThemedText>
          </ThemedView>
          <Pressable onPress={onSync} disabled={syncing} hitSlop={8}>
            <ThemedText type="linkPrimary">{actionLabel}</ThemedText>
          </Pressable>
        </ThemedView>

        <FlatList
          data={groups}
          keyExtractor={(group) => group.visitId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedView style={styles.message}>
              {isPending ? (
                <ActivityIndicator />
              ) : (
                <ThemedText themeColor="textSecondary">
                  All local changes have reached the server.
                </ThemedText>
              )}
            </ThemedView>
          }
          renderItem={({ item }) => (
            <Link href={`/visits/${item.visitId}`} asChild>
              <Pressable>
                <ThemedView type="backgroundElement" style={styles.row}>
                  <ThemedText type="default">{item.patientName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {rowLabel(item)}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            </Link>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    flexGrow: 1,
  },
  message: {
    alignItems: "flex-start",
    paddingHorizontal: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
});
