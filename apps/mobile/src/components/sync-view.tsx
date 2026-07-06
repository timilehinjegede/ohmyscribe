import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
import type { SyncVisitGroup } from "@/db/sync-status";
import { useTheme } from "@/hooks/use-theme";

export type SyncData = { groups: SyncVisitGroup[]; pending: number; failed: number };

type SyncState = "synced" | "pending" | "failed";

// Failures take priority over pending edits, which take priority over the all-clear state.
function syncState(failed: number, pending: number): SyncState {
  if (failed > 0) return "failed";
  if (pending > 0) return "pending";
  return "synced";
}

const plural = (n: number) => (n === 1 ? "" : "s");

// Icon + tint + copy for the hero card, keyed by overall sync state.
function hero(state: SyncState, failed: number, pending: number) {
  switch (state) {
    case "failed":
      return {
        icon: Alert02Icon,
        tone: "danger" as const,
        title: `${failed} change${plural(failed)} failed to sync`,
        subtitle: pending > 0 ? `${pending} more waiting. Tap to retry.` : "Tap Sync now to retry.",
      };
    case "pending":
      return {
        icon: CloudUploadIcon,
        tone: "accent" as const,
        title: `${pending} change${plural(pending)} waiting to sync`,
        subtitle: "Tap Sync now to push your latest edits.",
      };
    default:
      return {
        icon: CheckmarkCircle02Icon,
        tone: "success" as const,
        title: "Everything's synced",
        subtitle: "All local changes have reached the server.",
      };
  }
}

export function SyncView({
  data,
  isPending,
  syncing,
  onSync,
}: {
  data: SyncData | undefined;
  isPending: boolean;
  syncing: boolean;
  onSync: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const groups = data?.groups ?? [];
  const pending = data?.pending ?? 0;
  const failed = data?.failed ?? 0;
  const state = syncState(failed, pending);
  const { icon, tone, title, subtitle } = hero(state, failed, pending);
  const tint = { fill: theme[`${tone}Muted`], fg: theme[tone] };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText type="subtitle">Sync</ThemedText>
      </View>

      {isPending && !data ? (
        <ThemedView style={styles.centered}>
          <ActivityIndicator />
        </ThemedView>
      ) : (
        <FlatList
          data={groups}
          style={styles.list}
          keyExtractor={(group) => group.visitId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Card style={styles.hero}>
                <View style={[styles.heroIcon, { backgroundColor: tint.fill }]}>
                  <HugeiconsIcon icon={icon} size={22} color={tint.fg} />
                </View>
                <View style={styles.heroText}>
                  <ThemedText style={styles.heroTitle}>{title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {subtitle}
                  </ThemedText>
                </View>
              </Card>
              <Button
                title={state === "synced" ? "Refresh" : "Sync now"}
                variant={state === "synced" ? "secondary" : "primary"}
                loading={syncing}
                onPress={onSync}
              />
              {groups.length > 0 ? (
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
                  PENDING BY VISIT
                </ThemedText>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <GroupRow group={item} chevron={theme.textSecondary} />}
        />
      )}
    </ThemedView>
  );
}

function GroupRow({ group, chevron }: { group: SyncVisitGroup; chevron: string }) {
  return (
    <Link href={`/visits/${group.visitId}`} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <Card style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="default">{group.patientName}</ThemedText>
            <View style={styles.badges}>
              {group.failed > 0 ? <Badge tone="danger" label={`${group.failed} failed`} /> : null}
              {group.pending > 0 ? (
                <Badge tone="neutral" label={`${group.pending} pending`} />
              ) : null}
            </View>
          </View>
          <HugeiconsIcon icon={ArrowRight01Icon} size={18} color={chevron} />
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    flexGrow: 1,
  },
  headerBlock: {
    gap: Spacing.two,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: {
    flex: 1,
    gap: Spacing.half,
  },
  heroTitle: {
    fontWeight: "600",
  },
  section: {
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  rowText: {
    flex: 1,
    gap: Spacing.one,
  },
  badges: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
});
