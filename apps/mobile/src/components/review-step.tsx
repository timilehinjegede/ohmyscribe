import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CheckmarkCircle02Icon, FileSearchIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  getOasisItem,
  getOasisResponseLabel,
  type AnswerSuggestion,
  type PendingExtractionStatus,
  type QualityFinding,
} from "@ohmyscribe/shared";

import { Card } from "@/components/card";
import { QualityFlags } from "@/components/quality-flags";
import { ThemedText } from "@/components/themed-text";
import { TranscriptSheet } from "@/components/transcript-sheet";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** Pre-filing reconciliation of the AI's transcribed answers against the clinician's. */
export function ReviewStep({
  suggestions,
  answers,
  isComplete,
  extraction,
  transcript,
  blockers,
  warnings,
  acknowledged,
  onAcknowledge,
  onAccept,
}: {
  suggestions: AnswerSuggestion[];
  answers: Map<string, string>;
  isComplete: boolean;
  extraction: { status: PendingExtractionStatus } | null;
  transcript: string | null;
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  acknowledged: Set<string>;
  onAcknowledge: (ruleId: string) => void;
  onAccept: (itemCode: string, value: string) => void;
}) {
  const theme = useTheme();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // null = the full transcript, no highlight.
  const [sourceSuggestion, setSourceSuggestion] = useState<AnswerSuggestion | null>(null);

  const openTranscript = (suggestion: AnswerSuggestion | null) => {
    setSourceSuggestion(suggestion);
    setTranscriptOpen(true);
  };

  return (
    <View style={styles.group}>
      <QualityFlags
        blockers={blockers}
        warnings={warnings}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
      />
      {transcript !== null ? (
        <Pressable onPress={() => openTranscript(null)} hitSlop={8} style={styles.status}>
          <HugeiconsIcon icon={FileSearchIcon} size={16} color={theme.accent} />
          <ThemedText type="linkPrimary">View full transcript</ThemedText>
        </Pressable>
      ) : null}
      {suggestions.length === 0 ? (
        extraction?.status === "uploading" ? (
          <Card type="accentMuted">
            <ThemedText type="small" style={{ color: theme.accent }}>
              Transcribing your recording — AI drafts will appear shortly.
            </ThemedText>
          </Card>
        ) : extraction?.status === "queued" ? (
          <Card type="accentMuted">
            <ThemedText type="small" style={{ color: theme.accent }}>
              Your recording is saved. AI drafts will appear when back online.
            </ThemedText>
          </Card>
        ) : extraction?.status === "failed" ? (
          <Card type="dangerMuted">
            <ThemedText type="small" style={{ color: theme.danger }}>
              {"Couldn't transcribe the recording. Retry from the Sync tab. " +
                "Your manual answers stand. Complete to continue."}
            </ThemedText>
          </Card>
        ) : (
          <ThemedText themeColor="textSecondary">
            No AI draft. Your manual answers stand. Complete to continue.
          </ThemedText>
        )
      ) : (
        suggestions.map((suggestion) => {
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
              {transcript && suggestion.transcriptSnippet ? (
                <Pressable
                  onPress={() => openTranscript(suggestion)}
                  hitSlop={8}
                  style={styles.status}
                >
                  <HugeiconsIcon icon={FileSearchIcon} size={16} color={theme.accent} />
                  <ThemedText type="linkPrimary">View in transcript</ThemedText>
                </Pressable>
              ) : null}
              <View style={styles.reviewRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  You:{" "}
                  {getOasisResponseLabel(suggestion.itemCode, current) ?? current ?? "not answered"}
                </ThemedText>
                <ThemedText type="small">
                  AI:{" "}
                  {getOasisResponseLabel(suggestion.itemCode, suggestion.value) ?? suggestion.value}
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
        })
      )}
      <TranscriptSheet
        visible={transcriptOpen}
        transcript={transcript}
        snippet={sourceSuggestion?.transcriptSnippet ?? null}
        snippetStart={sourceSuggestion?.snippetStart ?? null}
        snippetEnd={sourceSuggestion?.snippetEnd ?? null}
        onClose={() => {
          setTranscriptOpen(false);
          setSourceSuggestion(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
