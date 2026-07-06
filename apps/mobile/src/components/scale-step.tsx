import { Pressable, StyleSheet, View } from "react-native";
import { oasisItemsBySection, type OasisSection } from "@ohmyscribe/shared";

import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** One OASIS scale section: each item as a card of tappable response options. */
export function ScaleStep({
  section,
  answers,
  isComplete,
  onAnswer,
}: {
  section: OasisSection;
  answers: Map<string, string>;
  isComplete: boolean;
  onAnswer: (itemCode: string, value: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      {oasisItemsBySection[section].map((item) => {
        const current = answers.get(item.code);
        return (
          <Card key={item.code} style={styles.item}>
            <ThemedText type="smallBold">
              {item.code} · {item.label}
            </ThemedText>
            <View style={styles.options}>
              {item.responses.map((response) => {
                const selected = response.value === current;
                return (
                  <Pressable
                    key={response.value}
                    disabled={isComplete}
                    onPress={() => onAnswer(item.code, response.value)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: selected ? theme.accentMuted : theme.background,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                      pressed && !isComplete && styles.optionPressed,
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={selected ? { color: theme.accent, fontWeight: "600" } : undefined}
                    >
                      {response.value} · {response.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );
      })}
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
  options: {
    gap: Spacing.one,
  },
  option: {
    padding: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  optionPressed: {
    opacity: 0.7,
  },
});
