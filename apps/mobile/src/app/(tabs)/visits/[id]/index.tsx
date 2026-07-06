import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { icd10ForSnomed } from "@ohmyscribe/shared";

import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useVisit } from "@/data/visits";
import { formatDob, titleCase } from "@/lib/format";

// SNOMED display names end with a semantic tag like "(disorder)"; drop it for a cleaner label.
const stripQualifier = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "");

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {label}: <ThemedText type="smallBold">{value}</ThemedText>
    </ThemedText>
  );
}

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
        <View style={styles.meta}>
          <MetaRow label="Type" value={visit.type} />
          <MetaRow label="Status" value={titleCase(visit.status)} />
          {visit.patient?.dob ? (
            <MetaRow label="Date of birth" value={formatDob(visit.patient.dob)} />
          ) : null}
        </View>

        <Link href={`/visits/${id}/assessment`} asChild>
          <Button title={assessmentLabel} style={styles.cta} />
        </Link>

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
          DIAGNOSES
        </ThemedText>
        {visit.diagnoses.length === 0 ? (
          <ThemedText themeColor="textSecondary">No diagnoses.</ThemedText>
        ) : (
          visit.diagnoses.map((diagnosis) => {
            const icd10 = icd10ForSnomed(diagnosis.code)?.icd10;
            return (
              <Card key={diagnosis.id} style={styles.row}>
                <ThemedText type="default">
                  {stripQualifier(diagnosis.display ?? diagnosis.code)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {icd10 ? `ICD-10 · ${icd10}` : `SNOMED · ${diagnosis.code}`}
                </ThemedText>
              </Card>
            );
          })
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
    paddingBottom: BottomTabInset + Spacing.three,
  },
  meta: {
    gap: Spacing.half,
  },
  cta: {
    marginTop: Spacing.two,
  },
  section: {
    marginTop: Spacing.three,
  },
  row: {
    gap: Spacing.half,
  },
});
