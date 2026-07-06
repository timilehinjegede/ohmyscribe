import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";

function DoneButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <ThemedText type="default" themeColor="accent" style={styles.done}>
        Done
      </ThemedText>
    </Pressable>
  );
}

export default function VisitsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="[id]/index"
        options={{ title: "Visit", headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen
        name="[id]/assessment"
        options={{ presentation: "modal", title: "Assessment", headerRight: () => <DoneButton /> }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  done: {
    fontWeight: "600",
  },
});
