import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Alert02Icon, Cancel01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import type { CodedDiagnosis } from "@ohmyscribe/shared";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import {
  useCodedDiagnoses,
  useRemoveCoding,
  useSaveCoding,
  useSuggestCoding,
} from "@/data/diagnosis-coding";
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
  const { mutate: draftSuggestions } = useSuggestCoding(assessmentId);

  // Draft AI suggestions once when the step opens; the server caches, so re-opens are cheap.
  useEffect(() => {
    if (!isComplete) draftSuggestions();
  }, [assessmentId, isComplete, draftSuggestions]);

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

  const aiPrimary = coded.data.find((diagnosis) => diagnosis.suggestion?.isPrimary) ?? null;
  const aiSecondaries = coded.data.filter(
    (diagnosis) => diagnosis.suggestion && !diagnosis.suggestion.isPrimary,
  );
  // Starting-point draft, dismissed by the first coding; the AI-marked chips carry the rest.
  const nothingCoded = !primary && secondaries.length === 0;
  const showDraft = !isComplete && nothingCoded && (aiPrimary !== null || aiSecondaries.length > 0);

  const assign = (diagnosis: CodedDiagnosis, isPrimary: boolean) => {
    const icd10Code = codeFor(diagnosis);
    if (icd10Code) saveCoding.mutate({ diagnosisId: diagnosis.diagnosisId, icd10Code, isPrimary });
  };

  // Primary before secondaries: the server allows only one primary.
  const acceptDraft = async () => {
    try {
      if (aiPrimary) {
        const icd10Code = codeFor(aiPrimary);
        if (icd10Code) {
          await saveCoding.mutateAsync({
            diagnosisId: aiPrimary.diagnosisId,
            icd10Code,
            isPrimary: true,
          });
        }
      }
      const room = Math.max(0, MAX_SECONDARY - secondaries.length);
      for (const secondary of aiSecondaries.slice(0, room)) {
        const icd10Code = codeFor(secondary);
        if (icd10Code) {
          await saveCoding.mutateAsync({
            diagnosisId: secondary.diagnosisId,
            icd10Code,
            isPrimary: false,
          });
        }
      }
    } catch {
      // Swallowed: failures already surface via saveCoding.isError; this just avoids an unhandled rejection.
    }
  };

  return (
    <View style={styles.groups}>
      {showDraft ? (
        <AiDraft
          primary={aiPrimary}
          secondaries={aiSecondaries}
          busy={saveCoding.isPending}
          onAccept={() => void acceptDraft()}
        />
      ) : null}

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
            aiRole="primary"
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
            label={atCap ? `Max ${MAX_SECONDARY}, remove one to add another` : "Add"}
            diagnoses={unassigned}
            disabled={atCap}
            aiRole="secondary"
            onPick={(diagnosis) => assign(diagnosis, false)}
          />
        ) : null}
      </View>

      {saveCoding.isError || removeCoding.isError ? (
        <ThemedText type="small" themeColor="danger">
          Could not save. Check your connection.
        </ThemedText>
      ) : null}
    </View>
  );
}

function AiDraft({
  primary,
  secondaries,
  busy,
  onAccept,
}: {
  primary: CodedDiagnosis | null;
  secondaries: CodedDiagnosis[];
  busy: boolean;
  onAccept: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.draft, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.draftHeader}>
        <HugeiconsIcon icon={SparklesIcon} size={16} color={theme.text} />
        <ThemedText type="smallBold">AI draft</ThemedText>
      </View>
      {primary ? (
        <ThemedText type="small">
          Primary: {shortName(primary)}
          {primary.suggestion?.rationale ? `, ${primary.suggestion.rationale}` : ""}
        </ThemedText>
      ) : null}
      {secondaries.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Also suggests: {secondaries.map(shortName).join(", ")}
        </ThemedText>
      ) : null}
      <Pressable onPress={onAccept} disabled={busy} hitSlop={8}>
        <ThemedText type="linkPrimary">{busy ? "Applying…" : "Accept draft"}</ThemedText>
      </Pressable>
    </View>
  );
}

function Suggestions({
  label,
  diagnoses,
  disabled,
  aiRole,
  onPick,
}: {
  label: string;
  diagnoses: CodedDiagnosis[];
  disabled?: boolean;
  aiRole: "primary" | "secondary";
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
            aiRecommended={diagnosis.suggestion?.isPrimary === (aiRole === "primary")}
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
  aiRecommended,
  onPress,
}: {
  diagnosis: CodedDiagnosis;
  disabled?: boolean;
  aiRecommended?: boolean;
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
      {aiRecommended ? <HugeiconsIcon icon={SparklesIcon} size={14} color={theme.text} /> : null}
      <ThemedText type="small">
        {shortName(diagnosis)}
        {code ? ` · ${code}` : " · no code"}
      </ThemedText>
      {lowConfidence ? (
        <HugeiconsIcon icon={Alert02Icon} size={14} color={theme.textSecondary} />
      ) : null}
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
    <View style={[styles.chip, styles.chipFilled, { backgroundColor: theme.accentMuted }]}>
      <ThemedText type="small" style={{ color: theme.accent }}>
        {shortName(diagnosis)} · {diagnosis.coding?.icd10Code}
      </ThemedText>
      {isComplete ? null : (
        <Pressable onPress={onRemove} hitSlop={8}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} color={theme.accent} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: Spacing.four },
  group: { gap: Spacing.two },
  draft: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  draftHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  suggestions: { gap: Spacing.one, marginTop: Spacing.one },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipFilled: { borderColor: "transparent" },
  chipDisabled: { opacity: 0.4 },
});
