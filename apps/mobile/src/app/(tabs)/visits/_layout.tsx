import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";

import { ThemedText } from "@/components/themed-text";

function DoneButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <ThemedText type="linkPrimary">Done</ThemedText>
    </Pressable>
  );
}

export default function VisitsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Visits" }} />
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
