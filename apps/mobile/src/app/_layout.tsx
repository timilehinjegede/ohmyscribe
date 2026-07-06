import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSyncTriggers } from "@/hooks/use-sync-triggers";
import { queryClient } from "@/query-client";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useSyncTriggers();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
