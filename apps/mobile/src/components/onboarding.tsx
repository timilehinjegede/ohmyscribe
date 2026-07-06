import { Modal, StyleSheet, View } from "react-native";
import { AiMicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react-native";

import { Button } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Radius, Spacing } from "@/constants/theme";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useTheme } from "@/hooks/use-theme";

function OnboardingContent({ onContinue }: { onContinue: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.content}>
      <View style={styles.main}>
        <View style={[styles.hero, { backgroundColor: theme.accentMuted }]}>
          <HugeiconsIcon icon={AiMicIcon} size={52} color={theme.accent} strokeWidth={2} />
        </View>
        <View style={styles.copy}>
          <ThemedText type="subtitle" style={styles.title}>
            ohmyscribe
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.lead}>
            Your clinical visits, captured and coded in one place.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.lead}>
            Record a visit, review AI-drafted notes and PDGM coding, then finalize, all from your
            phone.
          </ThemedText>
        </View>
      </View>
      <Button title="Get started" onPress={onContinue} />
    </View>
  );
}

export function OnboardingGate() {
  const { status, complete } = useOnboarding();

  return (
    <Modal
      visible={status === "needed"}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={complete}
    >
      <ThemedView style={styles.sheet}>
        <OnboardingContent onContinue={complete} />
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  main: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.five,
  },
  hero: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  copy: {
    gap: Spacing.two,
    alignItems: "center",
  },
  title: {
    textAlign: "center",
  },
  lead: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
});
