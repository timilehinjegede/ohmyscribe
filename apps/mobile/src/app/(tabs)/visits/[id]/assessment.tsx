import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  buildPdgmInput,
  computePdgm,
  diffPdgm,
  oasisSections,
  type AdmissionSource,
  type OasisSection,
  type Timing,
} from "@ohmyscribe/shared";

import { Button } from "@/components/button";
import { CodingStep } from "@/components/coding-step";
import { DiagnosisCodingStep } from "@/components/diagnosis-coding-step";
import { PdgmFooter, type PdgmImpact } from "@/components/pdgm-footer";
import { ProgressBar } from "@/components/progress-bar";
import { RecordingIndicator } from "@/components/recording-indicator";
import { ReviewStep } from "@/components/review-step";
import { ScaleStep } from "@/components/scale-step";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAssessment, useCompleteAssessment, useSaveAnswer } from "@/data/assessment";
import { useCodedDiagnoses } from "@/data/diagnosis-coding";
import { usePendingExtraction } from "@/data/extractions";
import { useLocalPdgm } from "@/data/local-pdgm";
import { enqueueExtraction } from "@/db/extractions";
import { drainExtractions } from "@/sync";
import { useQualityChecks } from "@/hooks/use-quality-checks";
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

  const queryClient = useQueryClient();
  const assessment = useAssessment(id);
  const saveAnswer = useSaveAnswer(id, assessment.data?.id ?? "");
  const completeAssessment = useCompleteAssessment(id, assessment.data?.id ?? "");
  const pendingExtraction = usePendingExtraction(assessment.data?.id ?? "");

  const isComplete = Boolean(assessment.data?.completedAt);

  // Derived before the early returns so the progress hook below can read them; the AI-draft
  // review step drops out once the assessment is filed.
  const steps = STEPS.filter((name) => !(isComplete && name === "review"));
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index]!;

  const [timing, setTiming] = useState<Timing>("early");
  const [admission, setAdmission] = useState<AdmissionSource>("community");
  const [impact, setImpact] = useState<PdgmImpact | null>(null);

  const codedDiagnoses = useCodedDiagnoses(assessment.data?.id ?? "");
  const liveResult = useLocalPdgm(assessment.data, codedDiagnoses.data, timing, admission);
  const { blockers, warnings } = useQualityChecks(
    assessment.data?.answers ?? [],
    codedDiagnoses.data,
  );
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const acknowledgeWarning = (ruleId: string) =>
    setAcknowledged((previous) => new Set(previous).add(ruleId));

  // Record the visit from the moment the assessment opens; Finish stops + queues it for upload.
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
  const unacknowledgedWarnings = warnings.filter((warning) => !acknowledged.has(warning.ruleId));
  const fileBlocked = blockers.length > 0 || unacknowledgedWarnings.length > 0;
  const reviewIndex = steps.indexOf("review");
  const codingIndex = steps.indexOf("coding");
  const onReview = step === "review";
  const onCoding = step === "coding";
  const onLastScaleStep = step === oasisSections[oasisSections.length - 1]; // the mood step

  const goTo = (next: number) => {
    slideIn(next >= index ? 1 : -1);
    setStepIndex(next);
  };

  // The impact is diffed eagerly, before the save lands, and only for the recorded value — the
  // footer never previews what an option would pay before the clinician commits to it.
  const recordAnswer = (itemCode: string, value: string) => {
    if (liveResult && assessment.data) {
      const nextAnswers = [
        ...assessment.data.answers.filter((answer) => answer.itemCode !== itemCode),
        { itemCode, value },
      ];
      const nextResult = computePdgm(
        buildPdgmInput(codedDiagnoses.data ?? [], nextAnswers, timing, admission),
      );
      setImpact({ itemCode, delta: diffPdgm(liveResult, nextResult) });
    }
    saveAnswer.mutate({ itemCode, value });
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
    const assessmentId = assessment.data?.id;
    if (uri && assessmentId) {
      try {
        await enqueueExtraction(assessmentId, uri, new Date().toISOString());
        queryClient.invalidateQueries({ queryKey: ["pending-extraction", assessmentId] });
        queryClient.invalidateQueries({ queryKey: ["sync-status"] });
        // Fire-and-forget: drains now if online, otherwise the next sync trigger picks it up.
        void drainExtractions();
      } catch {
        // Move/enqueue failed: degrade to no-draft and still advance.
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
            Could not save, please try again.
          </ThemedText>
        ) : null}
        {completeAssessment.isError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Could not file, please reconnect and try again.
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
                result={liveResult!} // non-null once assessment.data passed the guards above
                blockerCount={blockers.length}
                unacknowledgedCount={unacknowledgedWarnings.length}
              />
            ) : onReview ? (
              <ReviewStep
                suggestions={assessment.data.suggestions}
                answers={answers}
                isComplete={isComplete}
                extraction={pendingExtraction.data ?? null}
                transcript={assessment.data.transcript}
                blockers={blockers}
                warnings={warnings}
                acknowledged={acknowledged}
                onAcknowledge={acknowledgeWarning}
                onAccept={recordAnswer}
              />
            ) : (
              <ScaleStep
                section={step as OasisSection}
                answers={answers}
                isComplete={isComplete}
                onAnswer={recordAnswer}
              />
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* The coding step already shows the full breakdown card; a filed record is read-only. */}
      {!isComplete && !onCoding ? (
        <PdgmFooter result={liveResult} impact={impact} onDismiss={() => setImpact(null)} />
      ) : null}

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
              disabled={fileBlocked || completeAssessment.isPending}
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
            title="Finish"
            size="compact"
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
