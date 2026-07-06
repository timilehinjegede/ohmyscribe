import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  oasisSections,
  type AdmissionSource,
  type OasisSection,
  type Timing,
} from "@ohmyscribe/shared";

import { Button } from "@/components/button";
import { CodingStep } from "@/components/coding-step";
import { DiagnosisCodingStep } from "@/components/diagnosis-coding-step";
import { ProgressBar } from "@/components/progress-bar";
import { RecordingIndicator } from "@/components/recording-indicator";
import { ReviewStep } from "@/components/review-step";
import { ScaleStep } from "@/components/scale-step";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import {
  useAssessment,
  useCompleteAssessment,
  useExtractAudio,
  useSaveAnswer,
} from "@/data/assessment";
import { usePdgm } from "@/data/pdgm";
import { useStepSlide } from "@/hooks/use-step-slide";
import { useTheme } from "@/hooks/use-theme";

// Diagnoses, one step per catalog section, the AI-draft review, then the PDGM coding view.
const STEPS = ["diagnoses", ...oasisSections, "review", "coding"] as const;
const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  diagnoses: "Diagnoses",
  functional: "Functional",
  cognitive: "Cognitive",
  mood: "Mood",
  review: "Review AI draft",
  coding: "PDGM Coding",
};

export default function AssessmentWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { transform, slideIn } = useStepSlide();
  const [stepIndex, setStepIndex] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const assessment = useAssessment(id);
  const saveAnswer = useSaveAnswer(id, assessment.data?.id ?? "");
  const completeAssessment = useCompleteAssessment(id, assessment.data?.id ?? "");
  const extractAudio = useExtractAudio(id, assessment.data?.id ?? "");

  const isComplete = Boolean(assessment.data?.completedAt);

  // Derived before the early returns so the progress hook below can read them; the AI-draft
  // review step drops out once the assessment is filed.
  const steps = STEPS.filter((name) => !(isComplete && name === "review"));
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index]!;

  const [timing, setTiming] = useState<Timing>("early");
  const [admission, setAdmission] = useState<AdmissionSource>("community");
  const pdgm = usePdgm(assessment.data?.id ?? "", timing, admission, {
    enabled: step === "coding",
  });

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
        // Setup failed (permission / audio mode / prepare); degrade to manual-only, no draft.
      }
    })();
    return () => {
      active = false;
      // the recorder (and mic) is released on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.data?.id, isComplete]);

  // A filed assessment leads with the coding view (the record stays reachable via Back).
  const landedOnCoding = useRef(false);
  useEffect(() => {
    if (landedOnCoding.current || !assessment.data?.completedAt) return;
    landedOnCoding.current = true;
    setStepIndex(STEPS.length - 2); // filed steps drop "review", so coding sits at length-2
  }, [assessment.data?.completedAt]);

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

  const answers = new Map(assessment.data.answers.map((answer) => [answer.itemCode, answer.value]));
  const reviewIndex = steps.indexOf("review");
  const codingIndex = steps.indexOf("coding");
  const onReview = step === "review";
  const onCoding = step === "coding";
  const onLastScaleStep = step === oasisSections[oasisSections.length - 1]; // the mood step

  const goTo = (next: number) => {
    slideIn(next >= index ? 1 : -1);
    setStepIndex(next);
  };

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
    goTo(reviewIndex);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <ThemedText type="small" themeColor="textSecondary">
            Step {index + 1} of {steps.length}
            {isComplete ? " · Completed (read-only)" : ""}
          </ThemedText>
          {!isComplete && recorderState.isRecording ? <RecordingIndicator /> : null}
        </View>
        <ProgressBar value={(index + 1) / steps.length} />
        <ThemedText type="subtitle">{STEP_TITLES[step]}</ThemedText>
        {saveAnswer.isError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Could not save. Check your connection.
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.pager}>
        <Animated.View style={[styles.page, { transform }]}>
          <ScrollView key={step} contentContainerStyle={styles.content}>
            {step === "diagnoses" ? (
              <DiagnosisCodingStep
                visitId={id}
                assessmentId={assessment.data.id}
                isComplete={isComplete}
              />
            ) : onCoding ? (
              <CodingStep
                isComplete={isComplete}
                timing={timing}
                admission={admission}
                onTimingChange={setTiming}
                onAdmissionChange={setAdmission}
                pdgm={pdgm}
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
              <ScaleStep
                section={step as OasisSection}
                answers={answers}
                isComplete={isComplete}
                onAnswer={(itemCode, value) => saveAnswer.mutate({ itemCode, value })}
              />
            )}
          </ScrollView>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingVertical: Spacing.five }]}>
        <Button
          title="Back"
          variant="secondary"
          size="compact"
          onPress={() => goTo(index - 1)}
          disabled={index === 0}
          style={styles.footerButton}
        />
        {onCoding ? (
          isComplete ? null : (
            <Button
              title="Complete visit"
              size="compact"
              loading={completeAssessment.isPending}
              disabled={!pdgm.data?.clinicalGroupDriver}
              onPress={() => completeAssessment.mutate({ timing, admissionSource: admission })}
              style={styles.footerButton}
            />
          )
        ) : onReview ? (
          <Button
            title="See coding"
            size="compact"
            onPress={() => goTo(codingIndex)}
            style={styles.footerButton}
          />
        ) : onLastScaleStep && !isComplete ? (
          <Button
            title={extractAudio.isPending ? "Transcribing…" : "Finish"}
            size="compact"
            loading={extractAudio.isPending}
            onPress={() => void finish()}
            style={styles.footerButton}
          />
        ) : (
          <Button
            title="Next"
            size="compact"
            onPress={() => goTo(index + 1)}
            style={styles.footerButton}
          />
        )}
      </View>
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
  header: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pager: {
    flex: 1,
    overflow: "hidden", // clip the off-screen step during the slide
  },
  page: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  footer: {
    flexDirection: "row",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  footerButton: {
    flex: 1,
  },
});
