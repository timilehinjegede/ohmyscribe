import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { CodedDiagnosis } from "@ohmyscribe/shared";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useCodedDiagnoses, useRemoveCoding, useSaveCoding } from "@/data/diagnosis-coding";
import { useTheme } from "@/hooks/use-theme";

const MAX_SECONDARY = 5; // OASIS M1023 allows up to five other diagnoses.

// The code to apply when a diagnosis is assigned: its confirmed code if it already has one,
// otherwise the crosswalk suggestion. Null when neither exists (can't be assigned).
const codeFor = (diagnosis: CodedDiagnosis) =>
  diagnosis.coding?.icd10Code ?? diagnosis.suggestedCode?.icd10 ?? null;
const shortName = (diagnosis: CodedDiagnosis) =>
  (diagnosis.display ?? diagnosis.code).replace(/\s*\(disorder\)\s*$/i, "");

export function DiagnosisCodingStep({
  visitId,
  assessmentId,
  isComplete,
}: {
  visitId: string;
  assessmentId: string;
  isComplete: boolean;
}) {
  const coded = useCodedDiagnoses(assessmentId);
  const saveCoding = useSaveCoding(visitId, assessmentId);
  const removeCoding = useRemoveCoding(visitId, assessmentId);

  if (coded.isPending) return <ActivityIndicator />;
  if (coded.isError || !coded.data) {
    return <ThemedText themeColor="textSecondary">Could not load diagnoses.</ThemedText>;
  }
  if (coded.data.length === 0) {
    return <ThemedText themeColor="textSecondary">No diagnoses on file.</ThemedText>;
  }

  const primary = coded.data.find((diagnosis) => diagnosis.coding?.isPrimary) ?? null;
  const secondaries = coded.data.filter(
    (diagnosis) => diagnosis.coding && !diagnosis.coding.isPrimary,
  );
  const unassigned = coded.data.filter((diagnosis) => !diagnosis.coding);
  // Anything not already the primary can be made primary; the old primary returns to the pool.
  const primaryCandidates = coded.data.filter((diagnosis) => !diagnosis.coding?.isPrimary);
  const atCap = secondaries.length >= MAX_SECONDARY;

  const assign = (diagnosis: CodedDiagnosis, isPrimary: boolean) => {
    const icd10Code = codeFor(diagnosis);
    if (icd10Code) saveCoding.mutate({ diagnosisId: diagnosis.diagnosisId, icd10Code, isPrimary });
  };

  return (
    <View style={styles.groups}>
      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          M1021 · Primary diagnosis
        </ThemedText>
        {primary ? (
          <View style={styles.chips}>
            <AssignedChip
              diagnosis={primary}
              isComplete={isComplete}
              onRemove={() => removeCoding.mutate(primary.diagnosisId)}
            />
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Not set.
          </ThemedText>
        )}
        {!isComplete && primaryCandidates.length > 0 ? (
          <Suggestions
            label={primary ? "Change primary" : "Set primary"}
            diagnoses={primaryCandidates}
            onPick={(diagnosis) => assign(diagnosis, true)}
          />
        ) : null}
      </View>

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          M1023 · Other diagnoses ({secondaries.length}/{MAX_SECONDARY})
        </ThemedText>
        {secondaries.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            None added.
          </ThemedText>
        ) : (
          <View style={styles.chips}>
            {secondaries.map((diagnosis) => (
              <AssignedChip
                key={diagnosis.diagnosisId}
                diagnosis={diagnosis}
                isComplete={isComplete}
                onRemove={() => removeCoding.mutate(diagnosis.diagnosisId)}
              />
            ))}
          </View>
        )}
        {!isComplete && unassigned.length > 0 ? (
          <Suggestions
            label={atCap ? `Max ${MAX_SECONDARY} — remove one to add another` : "Add"}
            diagnoses={unassigned}
            disabled={atCap}
            onPick={(diagnosis) => assign(diagnosis, false)}
          />
        ) : null}
      </View>

      {saveCoding.isError || removeCoding.isError ? (
        <ThemedText type="small" themeColor="textSecondary">
          Could not save — check your connection.
        </ThemedText>
      ) : null}
    </View>
  );
}

function Suggestions({
  label,
  diagnoses,
  disabled,
  onPick,
}: {
  label: string;
  diagnoses: CodedDiagnosis[];
  disabled?: boolean;
  onPick: (diagnosis: CodedDiagnosis) => void;
}) {
  return (
    <View style={styles.suggestions}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.chips}>
        {diagnoses.map((diagnosis) => (
          <SuggestionChip
            key={diagnosis.diagnosisId}
            diagnosis={diagnosis}
            disabled={disabled}
            onPress={() => onPick(diagnosis)}
          />
        ))}
      </View>
    </View>
  );
}

function SuggestionChip({
  diagnosis,
  disabled,
  onPress,
}: {
  diagnosis: CodedDiagnosis;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const code = codeFor(diagnosis);
  const lowConfidence = diagnosis.suggestedCode?.confidence === "low";
  const unavailable = disabled || !code;
  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      style={[
        styles.chip,
        { borderColor: theme.backgroundSelected },
        unavailable && styles.chipDisabled,
      ]}
    >
      <ThemedText type="small">
        {shortName(diagnosis)}
        {code ? ` · ${code}` : " · no code"}
        {lowConfidence ? "  ⚠" : ""}
      </ThemedText>
    </Pressable>
  );
}

function AssignedChip({
  diagnosis,
  isComplete,
  onRemove,
}: {
  diagnosis: CodedDiagnosis;
  isComplete: boolean;
  onRemove: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, styles.chipFilled, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small">
        {shortName(diagnosis)} · {diagnosis.coding?.icd10Code}
      </ThemedText>
      {isComplete ? null : (
        <Pressable onPress={onRemove} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            ✕
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: Spacing.four },
  group: { gap: Spacing.two },
  suggestions: { gap: Spacing.one, marginTop: Spacing.one },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    borderWidth: 1,
  },
  chipFilled: { borderColor: "transparent" },
  chipDisabled: { opacity: 0.4 },
});
