import { useState } from "react";
import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";

import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { OnboardingGate } from "@/components/onboarding";
import { SegmentedControl } from "@/components/segmented-control";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useVisits } from "@/data/visits";
import { useTheme } from "@/hooks/use-theme";
import { atLeast } from "@/lib/async";
import { formatToday } from "@/lib/format";
import { syncNow } from "@/sync";

// "all" matches every status; the others match the visit `status` directly.
const FILTERS = [
  ["all", "All"],
  ["open", "Open"],
  ["complete", "Completed"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const FILTER_NOUN: Record<Exclude<Filter, "all">, string> = { open: "open", complete: "completed" };

export default function VisitsListScreen() {
  const { data: visits, isPending, isError, refetch } = useVisits();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  // Pull-to-refresh must reach the server because useVisits only reads local SQLite.
  const onSync = async () => {
    setRefreshing(true);
    await atLeast(600, syncNow());
    setRefreshing(false);
  };

  const shown = (visits ?? []).filter((visit) => filter === "all" || visit.status === filter);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerTitle}>
          <ThemedText type="subtitle">Today</ThemedText>
          <ThemedText themeColor="textSecondary">{formatToday()}</ThemedText>
        </View>
        <SegmentedControl stretch options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <FlatList
        data={shown}
        style={styles.list}
        keyExtractor={(visit) => visit.id}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onSync}
        ListEmptyComponent={
          <ThemedView style={styles.message}>
            {isPending ? (
              <ActivityIndicator />
            ) : isError ? (
              <>
                <ThemedText themeColor="textSecondary">Couldn't load visits.</ThemedText>
                <Pressable onPress={() => refetch()} hitSlop={8}>
                  <ThemedText type="linkPrimary">Retry</ThemedText>
                </Pressable>
              </>
            ) : (
              <ThemedText themeColor="textSecondary">
                {filter === "all" ? "No visits yet." : `No ${FILTER_NOUN[filter]} visits.`}
              </ThemedText>
            )}
          </ThemedView>
        }
        renderItem={({ item: visit }) => (
          <Link href={`/visits/${visit.id}`} asChild>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <Card style={styles.row}>
                <View style={styles.rowText}>
                  <ThemedText type="default">{visit.patientName ?? "Unknown patient"}</ThemedText>
                  <View style={styles.badges}>
                    <Badge label={visit.type} />
                    <VisitStatusBadge status={visit.status} />
                  </View>
                </View>
                <HugeiconsIcon icon={ArrowRight01Icon} size={18} color={theme.textSecondary} />
              </Card>
            </Pressable>
          </Link>
        )}
      />
      <OnboardingGate />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  header: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.three,
  },
  headerTitle: {
    gap: Spacing.half,
  },
  message: {
    gap: Spacing.two,
    alignItems: "flex-start",
    padding: Spacing.three,
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
