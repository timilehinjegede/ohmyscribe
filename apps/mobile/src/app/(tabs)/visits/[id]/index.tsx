import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useVisit } from "@/data/visits";

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: visit, isPending, isError, refetch } = useVisit(id);

  if (isPending && id) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (isError || !visit) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Couldn't load this visit.</ThemedText>
        <Pressable onPress={() => refetch()} hitSlop={8}>
          <ThemedText type="linkPrimary">Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const assessment = visit.assessment;
  const started = (assessment?.answeredCount ?? 0) > 0 || (assessment?.codedCount ?? 0) > 0;
  const assessmentLabel = assessment?.completedAt
    ? "View coding"
    : started
      ? "Continue assessment"
      : "Start assessment";

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">{visit.patient?.name ?? "Unknown patient"}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {visit.type} · {visit.status}
          {visit.patient?.dob ? ` · DOB ${visit.patient.dob}` : ""}
        </ThemedText>

        <Link href={`/visits/${id}/assessment`} asChild>
          <Pressable>
            <ThemedView type="backgroundElement" style={styles.documentButton}>
              <ThemedText type="smallBold">{assessmentLabel}</ThemedText>
            </ThemedView>
          </Pressable>
        </Link>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          DIAGNOSES
        </ThemedText>
        {visit.diagnoses.length === 0 ? (
          <ThemedText themeColor="textSecondary">No diagnoses.</ThemedText>
        ) : (
          visit.diagnoses.map((diagnosis) => (
            <ThemedView key={diagnosis.id} type="backgroundElement" style={styles.row}>
              <ThemedText type="default">{diagnosis.display ?? diagnosis.code}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {diagnosis.system} · {diagnosis.code}
              </ThemedText>
            </ThemedView>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  documentButton: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: "center",
    marginTop: Spacing.two,
  },
  section: {
    marginTop: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
});
