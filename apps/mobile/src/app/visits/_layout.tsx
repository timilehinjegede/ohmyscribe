import { Stack } from "expo-router";

export default function VisitsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Visits" }} />
      <Stack.Screen
        name="[id]"
        options={{ title: "Visit", headerBackButtonDisplayMode: "minimal" }}
      />
    </Stack>
  );
}
