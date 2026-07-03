import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";

import AppTabs from "@/components/app-tabs";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { queryClient } from "@/query-client";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppTabs />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
