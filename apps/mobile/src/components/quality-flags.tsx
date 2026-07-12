import { Pressable, StyleSheet, View } from "react-native";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";
import type { QualityFinding } from "@ohmyscribe/shared";

import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const KIND_LABEL: Record<QualityFinding["kind"], string> = {
  contradiction: "Contradiction",
  missing: "Missing",
};

/**
 * Live quality findings: blockers stop filing outright; warnings need a tap-through acknowledge.
 */
export function QualityFlags({
  blockers,
  warnings,
  acknowledged,
  onAcknowledge,
}: {
  blockers: QualityFinding[];
  warnings: QualityFinding[];
  acknowledged: Set<string>;
  onAcknowledge: (ruleId: string) => void;
}) {
  const theme = useTheme();

  if (blockers.length === 0 && warnings.length === 0) return null;
  return (
    <View style={styles.group}>
      {blockers.map((finding) => (
        <Card key={finding.ruleId} style={styles.item}>
          <Badge label="Blocker" tone="danger" />
          <ThemedText type="small">{finding.message}</ThemedText>
        </Card>
      ))}
      {warnings.map((finding) => (
        <Card key={finding.ruleId} style={styles.item}>
          <Badge label={KIND_LABEL[finding.kind]} tone="neutral" />
          <ThemedText type="small">{finding.message}</ThemedText>
          {acknowledged.has(finding.ruleId) ? (
            <View style={styles.status}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color={theme.success} />
              <ThemedText type="small" style={{ color: theme.success }}>
                Acknowledged
              </ThemedText>
            </View>
          ) : (
            <Pressable
              onPress={() => onAcknowledge(finding.ruleId)}
              hitSlop={8}
              style={styles.status}
            >
              <ThemedText type="linkPrimary">Acknowledge</ThemedText>
            </Pressable>
          )}
        </Card>
      ))}
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
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
});
