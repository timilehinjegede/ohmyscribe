import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { CheckmarkCircle02Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import { getOasisItem, getOasisResponseLabel, type AnswerSuggestion } from "@ohmyscribe/shared";

import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** Pre-filing reconciliation of the AI's transcribed answers against the clinician's. */
export function ReviewStep({
  suggestions,
  answers,
  isComplete,
  pending,
  failed,
  onAccept,
}: {
  suggestions: AnswerSuggestion[];
  answers: Map<string, string>;
  isComplete: boolean;
  pending: boolean;
  failed: boolean;
  onAccept: (itemCode: string, value: string) => void;
}) {
  const theme = useTheme();

  if (pending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <ThemedText type="small" themeColor="textSecondary">
          Transcribing the visit…
        </ThemedText>
      </View>
    );
  }
  if (suggestions.length === 0) {
    return (
      <ThemedText themeColor="textSecondary">
        {failed ? "Couldn't transcribe the recording." : "No AI draft."} Your manual answers stand.
        Complete to continue.
      </ThemedText>
    );
  }
  return (
    <View style={styles.group}>
      {suggestions.map((suggestion) => {
        const current = answers.get(suggestion.itemCode);
        const item = getOasisItem(suggestion.itemCode);
        const matches = current === suggestion.value;
        return (
          <Card key={suggestion.itemCode} style={styles.item}>
            <ThemedText type="smallBold">
              {suggestion.itemCode} · {item?.label ?? ""}
            </ThemedText>
            {suggestion.transcriptSnippet ? (
              <ThemedText type="small" themeColor="textSecondary">
                “{suggestion.transcriptSnippet}”
              </ThemedText>
            ) : null}
            <View style={styles.reviewRow}>
              <ThemedText type="small" themeColor="textSecondary">
                You: {getOasisResponseLabel(suggestion.itemCode, current) ?? current ?? "not answered"}
              </ThemedText>
              <ThemedText type="small">
                AI: {getOasisResponseLabel(suggestion.itemCode, suggestion.value) ?? suggestion.value}
              </ThemedText>
            </View>
            {isComplete ? null : matches ? (
              <View style={styles.status}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color={theme.success} />
                <ThemedText type="small" style={{ color: theme.success }}>
                  Matches your answer
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={() => onAccept(suggestion.itemCode, suggestion.value)}
                hitSlop={8}
                style={styles.status}
              >
                <HugeiconsIcon icon={SparklesIcon} size={16} color={theme.accent} />
                <ThemedText type="linkPrimary">Accept AI answer</ThemedText>
              </Pressable>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  group: {
    gap: Spacing.two,
  },
  item: {
    gap: Spacing.two,
  },
  reviewRow: {
    gap: Spacing.half,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
});
