import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import {
  getOasisItem,
  type AdmissionSource,
  type ComorbidityLevel,
  type FunctionalLevel,
  type PdgmResult,
  type Timing,
} from "@ohmyscribe/shared";

import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { SegmentedControl } from "@/components/segmented-control";
import { ThemedText } from "@/components/themed-text";
import { TranscriptSheet } from "@/components/transcript-sheet";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

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

const fileHint = (blockerCount: number, unacknowledgedCount: number): string => {
  const steps = [
    blockerCount > 0 ? `resolve ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}` : null,
    unacknowledgedCount > 0
      ? `acknowledge ${unacknowledgedCount} warning${unacknowledgedCount === 1 ? "" : "s"} on the Review step`
      : null,
  ].filter((step) => step !== null);
  return `To file: ${steps.join(" and ")}.`;
};

export function CodingStep({
  isComplete,
  timing,
  admission,
  onTimingChange,
  onAdmissionChange,
  result,
  transcript,
  blockerCount,
  unacknowledgedCount,
}: {
  isComplete: boolean;
  timing: Timing;
  admission: AdmissionSource;
  onTimingChange: (timing: Timing) => void;
  onAdmissionChange: (admissionSource: AdmissionSource) => void;
  result: PdgmResult;
  transcript: string | null;
  blockerCount: number;
  unacknowledgedCount: number;
}) {
  const theme = useTheme();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  return (
    <View style={styles.group}>
      {isComplete ? (
        <>
          <Pressable
            onPress={() => setTranscriptOpen(true)}
            hitSlop={8}
            style={styles.transcriptLink}
          >
            <HugeiconsIcon icon={FileSearchIcon} size={16} color={theme.accent} />
            <ThemedText type="linkPrimary">View visit transcript</ThemedText>
          </Pressable>
          <TranscriptSheet
            visible={transcriptOpen}
            transcript={transcript}
            snippet={null}
            snippetStart={null}
            snippetEnd={null}
            onClose={() => setTranscriptOpen(false)}
          />
        </>
      ) : null}
      <Card style={styles.payment}>
        {isComplete ? <Badge label="Filed" tone="success" /> : null}
        <ThemedText type="small" themeColor="textSecondary">
          Estimated 30-day payment
        </ThemedText>
        <ThemedText type="subtitle" style={{ color: theme.accent }}>
          ${result.estimatedPayment.toLocaleString()}
        </ThemedText>
        {result.weightApproximated ? (
          <ThemedText type="small" themeColor="textSecondary">
            Illustrative · case-mix weight {result.caseMixWeight}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              CMS CY2025 base-rate estimate · weight {result.caseMixWeight}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Excludes wage index, LUPA & outliers
            </ThemedText>
          </>
        )}
      </Card>

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
            onChange={(value) => onTimingChange(value as Timing)}
          />
          <Toggle
            label="Admission source"
            value={admission}
            options={[
              ["community", "Community"],
              ["institutional", "Institutional"],
            ]}
            onChange={(value) => onAdmissionChange(value as AdmissionSource)}
          />
        </>
      )}

      <Dimension
        label="Clinical group"
        value={result.clinicalGroupLabel}
        detail={
          result.clinicalGroupDriver ? `from ${result.clinicalGroupDriver}` : "no primary coded"
        }
      >
        {/* An uncoded primary gets the gentler hint below, not the return-to-provider warning. */}
        {result.clinicalGroupDriver && !result.primaryAcceptable ? (
          <ThemedText type="small" themeColor="danger">
            Primary not valid for PDGM (return to provider)
          </ThemedText>
        ) : null}
      </Dimension>
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

      {!isComplete && !result.clinicalGroupDriver ? (
        <ThemedText type="small" themeColor="textSecondary">
          Code a primary diagnosis to file, then Complete visit.
        </ThemedText>
      ) : null}
      {!isComplete && (blockerCount > 0 || unacknowledgedCount > 0) ? (
        <ThemedText type="small" themeColor="textSecondary">
          {fileHint(blockerCount, unacknowledgedCount)}
        </ThemedText>
      ) : null}
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
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <SegmentedControl options={options} value={value} onChange={onChange} />
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
    <Card style={styles.dimension}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  transcriptLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  group: {
    gap: Spacing.two,
  },
  payment: {
    gap: Spacing.one,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  dimension: {
    gap: Spacing.one,
  },
});
