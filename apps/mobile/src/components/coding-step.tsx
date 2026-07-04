import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  getOasisItem,
  type AdmissionSource,
  type ComorbidityLevel,
  type FunctionalLevel,
  type Timing,
} from "@ohmyscribe/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { usePdgm } from "@/data/pdgm";

const FUNCTIONAL_LABEL: Record<FunctionalLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
const COMORBIDITY_LABEL: Record<ComorbidityLevel, string> = {
  none: "None",
  low: "Low",
  high: "High",
};
const TIMING_LABEL: Record<Timing, string> = { early: "Early", late: "Late" };
const ADMISSION_LABEL: Record<AdmissionSource, string> = {
  community: "Community",
  institutional: "Institutional",
};

export function CodingStep({
  assessmentId,
  isComplete,
  onFinalize,
  finalizing,
}: {
  assessmentId: string;
  isComplete: boolean;
  onFinalize: (timing: Timing, admissionSource: AdmissionSource) => void;
  finalizing: boolean;
}) {
  const [timing, setTiming] = useState<Timing>("early");
  const [admission, setAdmission] = useState<AdmissionSource>("community");
  const pdgm = usePdgm(assessmentId, timing, admission);

  if (pdgm.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (pdgm.isError || !pdgm.data) {
    return (
      <View style={styles.centered}>
        <ThemedText themeColor="textSecondary">Could not compute the PDGM grouping.</ThemedText>
        <Pressable onPress={() => pdgm.refetch()} hitSlop={8}>
          <ThemedText type="linkPrimary">Retry</ThemedText>
        </Pressable>
      </View>
    );
  }
  const result = pdgm.data;

  return (
    <View style={styles.group}>
      <ThemedView type="backgroundElement" style={styles.payment}>
        {isComplete ? (
          <ThemedText type="small" themeColor="textSecondary">
            ✓ Filed
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Estimated 30-day payment
        </ThemedText>
        <ThemedText type="subtitle">${result.estimatedPayment.toLocaleString()}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Illustrative · case-mix weight {result.caseMixWeight}
        </ThemedText>
      </ThemedView>

      {isComplete ? (
        <>
          <FrozenRow label="Timing" value={TIMING_LABEL[result.timing]} />
          <FrozenRow label="Admission source" value={ADMISSION_LABEL[result.admissionSource]} />
        </>
      ) : (
        <>
          <Toggle
            label="Timing"
            value={timing}
            options={[
              ["early", "Early"],
              ["late", "Late"],
            ]}
            onChange={(value) => setTiming(value as Timing)}
          />
          <Toggle
            label="Admission source"
            value={admission}
            options={[
              ["community", "Community"],
              ["institutional", "Institutional"],
            ]}
            onChange={(value) => setAdmission(value as AdmissionSource)}
          />
        </>
      )}

      <Dimension
        label="Clinical group"
        value={result.clinicalGroupLabel}
        detail={
          result.clinicalGroupDriver ? `from ${result.clinicalGroupDriver}` : "no primary coded"
        }
      />
      <Dimension
        label="Functional level"
        value={FUNCTIONAL_LABEL[result.functional.level]}
        detail={`${result.functional.points} points`}
      >
        {result.functional.breakdown.map((item) => (
          <ThemedText key={item.itemCode} type="small" themeColor="textSecondary">
            {item.itemCode} {getOasisItem(item.itemCode)?.label ?? ""} · {item.points} pts
          </ThemedText>
        ))}
      </Dimension>
      <Dimension
        label="Comorbidity"
        value={COMORBIDITY_LABEL[result.comorbidity.level]}
        detail={result.comorbidity.subgroups.join(", ") || "no qualifying secondary"}
      />

      <ThemedText type="small" themeColor="textSecondary">
        Illustrative PDGM — real algorithm; clinical-group map scoped to our fixtures; points,
        thresholds, and weights are illustrative pending the CMS final rule.
      </ThemedText>

      {isComplete ? null : (
        <>
          {result.clinicalGroupDriver ? null : (
            <ThemedText type="small" themeColor="textSecondary">
              Code a primary diagnosis to file.
            </ThemedText>
          )}
          <Pressable
            onPress={() => onFinalize(timing, admission)}
            disabled={finalizing || !result.clinicalGroupDriver}
          >
            <ThemedView
              type={result.clinicalGroupDriver ? "backgroundSelected" : "background"}
              style={styles.finalize}
            >
              <ThemedText type="smallBold">{finalizing ? "Filing…" : "Finalize & file"}</ThemedText>
            </ThemedView>
          </Pressable>
        </>
      )}
    </View>
  );
}

function Toggle({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.toggleOptions}>
        {options.map(([optionValue, optionLabel]) => (
          <Pressable key={optionValue} onPress={() => onChange(optionValue)} hitSlop={8}>
            <ThemedView
              type={optionValue === value ? "backgroundSelected" : "background"}
              style={styles.toggleOption}
            >
              <ThemedText type="small">{optionLabel}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function FrozenRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

function Dimension({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.dimension}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  payment: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  toggleOptions: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  toggleOption: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.one,
  },
  dimension: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  finalize: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: "center",
    marginTop: Spacing.one,
  },
});
