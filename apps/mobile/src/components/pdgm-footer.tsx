import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { FunctionalLevel, PdgmDelta, PdgmResult } from "@ohmyscribe/shared";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type PdgmImpact = { itemCode: string; delta: PdgmDelta };

const FUNCTIONAL_LABEL: Record<FunctionalLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const IMPACT_CHIP_VISIBLE_MS = 5000;

const signedPoints = (points: number) => `${points > 0 ? "+" : ""}${points} pts`;
const signedMoney = (amount: number) =>
  `${amount < 0 ? "-" : "+"}$${Math.abs(amount).toLocaleString()}`;

function impactLabel({ itemCode, delta }: PdgmImpact): string {
  if (delta.functionalPointsDelta === 0 && delta.paymentDelta === 0) {
    return `${itemCode}: no payment impact`;
  }
  const parts = [`${itemCode}: ${signedPoints(delta.functionalPointsDelta)}`];
  if (delta.functionalLevelChanged) {
    parts.push(
      `Functional ${FUNCTIONAL_LABEL[delta.functionalLevelBefore]} → ${FUNCTIONAL_LABEL[delta.functionalLevelAfter]}`,
    );
  }
  if (delta.paymentDelta !== 0) parts.push(signedMoney(delta.paymentDelta));
  return parts.join(" · ");
}

// The impact chip renders only after an answer is recorded — surfacing per-option dollar amounts
// while the clinician is still choosing would nudge the choice toward payment (upcoding risk).
export function PdgmFooter({
  result,
  impact,
  onDismiss,
}: {
  result: PdgmResult | null;
  impact: PdgmImpact | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const previousPayment = useRef<number | null>(null);

  const estimatedPayment = result?.estimatedPayment ?? null;
  useEffect(() => {
    if (
      estimatedPayment !== null &&
      previousPayment.current !== null &&
      previousPayment.current !== estimatedPayment
    ) {
      pulse.setValue(0.25);
      Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
    previousPayment.current = estimatedPayment;
  }, [estimatedPayment, pulse]);

  // Keyed on the impact object itself so a rapid next tap replaces the chip and restarts the clock.
  useEffect(() => {
    if (!impact) return;
    const dismissTimer = setTimeout(onDismiss, IMPACT_CHIP_VISIBLE_MS);
    return () => clearTimeout(dismissTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact]);

  if (!result) return null;

  return (
    <View style={[styles.bar, { borderTopColor: theme.border }]}>
      <Animated.View style={[styles.estimate, { opacity: pulse }]}>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Est. ${result.estimatedPayment.toLocaleString()}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {result.weightApproximated ? "Illustrative · weight" : "weight"} {result.caseMixWeight}
        </ThemedText>
      </Animated.View>
      {impact ? (
        <View style={[styles.chip, { backgroundColor: theme.accentMuted }]}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {impactLabel(impact)}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  estimate: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
