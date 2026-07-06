import { StyleSheet, Text, View } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type BadgeTone = "neutral" | "accent" | "success" | "danger";

/** A small status pill; `tone` picks a tinted, on-tone fill (e.g. `success` = green on green). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const theme = useTheme();

  const tones: Record<BadgeTone, { backgroundColor: string; color: string }> = {
    neutral: { backgroundColor: theme.backgroundSelected, color: theme.textSecondary },
    accent: { backgroundColor: theme.accentMuted, color: theme.accent },
    success: { backgroundColor: theme.successMuted, color: theme.success },
    danger: { backgroundColor: theme.dangerMuted, color: theme.danger },
  };
  const { backgroundColor, color } = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: Radius.pill,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.three,
    overflow: "visible",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
