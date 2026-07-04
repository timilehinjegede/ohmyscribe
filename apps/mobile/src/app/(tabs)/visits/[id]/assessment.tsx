import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  getOasisItem,
  oasisItemsBySection,
  oasisSections,
  type AnswerSuggestion,
} from "@ohmyscribe/shared";

import { DiagnosisCodingStep } from "@/components/diagnosis-coding-step";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  useAssessment,
  useCompleteAssessment,
  useExtractAudio,
  useSaveAnswer,
} from "@/data/assessment";

// Diagnoses review, one step per catalog section, then the AI-draft review.
const STEPS = ["diagnoses", ...oasisSections, "review"] as const;
const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  diagnoses: "Diagnoses",
  functional: "Functional",
  cognitive: "Cognitive",
  mood: "Mood",
  review: "Review AI draft",
};

// Response label for an item's value, so the review step shows text, not raw codes.
const labelFor = (itemCode: string, value: string | undefined) =>
  value === undefined
    ? null
    : (getOasisItem(itemCode)?.responses.find((response) => response.value === value)?.label ??
      value);

export default function AssessmentWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stepIndex, setStepIndex] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const assessment = useAssessment(id);
  const saveAnswer = useSaveAnswer(id, assessment.data?.id ?? "");
  const completeAssessment = useCompleteAssessment(id, assessment.data?.id ?? "");
  const extractAudio = useExtractAudio(id, assessment.data?.id ?? "");

  const isComplete = Boolean(assessment.data?.completedAt);

  // Record the visit from the moment the assessment opens; Finish stops + uploads it.
  useEffect(() => {
    if (!assessment.data || isComplete) return;
    let active = true;
    (async () => {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted || !active) return;
        // iOS: allowsRecording requires playsInSilentMode.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        // Setup failed (permission / audio mode / prepare) — degrade to manual-only, no draft.
      }
    })();
    return () => {
      active = false;
      // expo-audio releases the recorder (and mic) on unmount, so dismissing mid-visit discards the
      // take on its own — touching recorder here would hit an already-freed native object.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.data?.id, isComplete]);

  if (assessment.isPending && id) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (assessment.isError || !assessment.data) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">Could not load the assessment.</ThemedText>
        <Pressable onPress={() => assessment.refetch()} hitSlop={8}>
          <ThemedText type="linkPrimary">Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const step = STEPS[stepIndex]!;
  const answers = new Map(assessment.data.answers.map((answer) => [answer.itemCode, answer.value]));
  const reviewIndex = STEPS.length - 1;
  const onReview = step === "review";
  const onLastScaleStep = stepIndex === reviewIndex - 1; // the mood step

  const finish = async () => {
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        // best-effort stop
      }
    }
    const uri = recorder.uri;
    // A transcription/upload failure surfaces via extractAudio.isError in the review step.
    if (uri) {
      try {
        await extractAudio.mutateAsync(uri);
      } catch {
        // handled via extractAudio.isError
      }
    }
    setStepIndex(reviewIndex);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          Step {stepIndex + 1} of {STEPS.length}
          {isComplete
            ? " · Completed (read-only)"
            : recorderState.isRecording
              ? " · ● Recording"
              : ""}
        </ThemedText>
        <ThemedText type="subtitle">{STEP_TITLES[step]}</ThemedText>
        {saveAnswer.isError ? (
          <ThemedText type="small" themeColor="textSecondary">
            Could not save — check your connection.
          </ThemedText>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === "diagnoses" ? (
          <DiagnosisCodingStep
            visitId={id}
            assessmentId={assessment.data.id}
            isComplete={isComplete}
          />
        ) : onReview ? (
          <ReviewStep
            suggestions={assessment.data.suggestions}
            answers={answers}
            isComplete={isComplete}
            pending={extractAudio.isPending}
            failed={extractAudio.isError}
            onAccept={(itemCode, value) => saveAnswer.mutate({ itemCode, value })}
          />
        ) : (
          oasisItemsBySection[step].map((item) => {
            const current = answers.get(item.code);
            return (
              <ThemedView key={item.code} type="backgroundElement" style={styles.item}>
                <ThemedText type="smallBold">
                  {item.code} · {item.label}
                </ThemedText>
                <View style={styles.options}>
                  {item.responses.map((response) => (
                    <Pressable
                      key={response.value}
                      disabled={isComplete}
                      onPress={() =>
                        saveAnswer.mutate({ itemCode: item.code, value: response.value })
                      }
                    >
                      <ThemedView
                        type={response.value === current ? "backgroundSelected" : "background"}
                        style={styles.option}
                      >
                        <ThemedText type="small">
                          {response.value} · {response.label}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              </ThemedView>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => setStepIndex((index) => index - 1)}
          disabled={stepIndex === 0}
          hitSlop={8}
        >
          <ThemedText type="linkPrimary" style={stepIndex === 0 ? styles.disabled : undefined}>
            Back
          </ThemedText>
        </Pressable>
        {onReview ? (
          isComplete ? null : (
            <Pressable
              onPress={() => completeAssessment.mutate()}
              disabled={completeAssessment.isPending}
              hitSlop={8}
            >
              <ThemedText type="linkPrimary">Complete → coding</ThemedText>
            </Pressable>
          )
        ) : onLastScaleStep && !isComplete ? (
          <Pressable onPress={() => void finish()} disabled={extractAudio.isPending} hitSlop={8}>
            <ThemedText type="linkPrimary">
              {extractAudio.isPending ? "Transcribing…" : "Finish"}
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable onPress={() => setStepIndex((index) => index + 1)} hitSlop={8}>
            <ThemedText type="linkPrimary">Next</ThemedText>
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

function ReviewStep({
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
        {failed ? "Couldn't transcribe the recording." : "No AI draft."} Your manual answers stand —
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
          <ThemedView key={suggestion.itemCode} type="backgroundElement" style={styles.item}>
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
                You: {labelFor(suggestion.itemCode, current) ?? "not answered"}
              </ThemedText>
              <ThemedText type="small">
                AI: {labelFor(suggestion.itemCode, suggestion.value)}
              </ThemedText>
            </View>
            {isComplete ? null : matches ? (
              <ThemedText type="small" themeColor="textSecondary">
                ✓ matches your answer
              </ThemedText>
            ) : (
              <Pressable
                onPress={() => onAccept(suggestion.itemCode, suggestion.value)}
                hitSlop={8}
              >
                <ThemedText type="linkPrimary">Accept AI answer</ThemedText>
              </Pressable>
            )}
          </ThemedView>
        );
      })}
    </View>
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
  header: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  group: {
    gap: Spacing.two,
  },
  item: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  options: {
    gap: Spacing.one,
  },
  option: {
    padding: Spacing.two,
    borderRadius: Spacing.one,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: Spacing.three,
    gap: Spacing.three,
  },
  disabled: {
    opacity: 0.3,
  },
});
