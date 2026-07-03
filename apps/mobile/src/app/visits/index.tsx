import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useVisits } from "@/data/visits";

export default function VisitsListScreen() {
  const { data: visits, isPending, isError, refetch, isRefetching } = useVisits();

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={visits ?? []}
        keyExtractor={(visit) => visit.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
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
              <ThemedText themeColor="textSecondary">No visits yet.</ThemedText>
            )}
          </ThemedView>
        }
        renderItem={({ item: visit }) => (
          <Link href={`/visits/${visit.id}`} asChild>
            <Pressable>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="default">{visit.patientName ?? "Unknown patient"}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {visit.type} · {visit.status}
                </ThemedText>
              </ThemedView>
            </Pressable>
          </Link>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    gap: Spacing.two,
    padding: Spacing.three,
    flexGrow: 1,
  },
  message: {
    gap: Spacing.two,
    alignItems: "flex-start",
    padding: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
});
