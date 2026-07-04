import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { oasisItemsBySection, oasisSections } from "@ohmyscribe/shared";

import { DiagnosisCodingStep } from "@/components/diagnosis-coding-step";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useAssessment, useCompleteAssessment, useSaveAnswer } from "@/data/assessment";

// A read-only diagnoses review, then one step per catalog section.
const STEPS = ["diagnoses", ...oasisSections] as const;
const STEP_TITLES: Record<(typeof STEPS)[number], string> = {
  diagnoses: "Diagnoses",
  functional: "Functional",
  cognitive: "Cognitive",
  mood: "Mood",
};

export default function AssessmentWizard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stepIndex, setStepIndex] = useState(0);

  const assessment = useAssessment(id);
  const saveAnswer = useSaveAnswer(id, assessment.data?.id ?? "");
  const completeAssessment = useCompleteAssessment(id, assessment.data?.id ?? "");

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
  const isLastStep = stepIndex === STEPS.length - 1;
  const isComplete = Boolean(assessment.data.completedAt);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          Step {stepIndex + 1} of {STEPS.length}
          {isComplete ? " · Completed (read-only)" : ""}
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
        {!isLastStep ? (
          <Pressable onPress={() => setStepIndex((index) => index + 1)} hitSlop={8}>
            <ThemedText type="linkPrimary">Next</ThemedText>
          </Pressable>
        ) : isComplete ? null : (
          <Pressable
            onPress={() => completeAssessment.mutate()}
            disabled={completeAssessment.isPending}
            hitSlop={8}
          >
            <ThemedText type="linkPrimary">Complete</ThemedText>
          </Pressable>
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
    gap: Spacing.one,
  },
  content: {
    padding: Spacing.three,
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
