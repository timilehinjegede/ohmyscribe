import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { subscribeToast } from "@/lib/toast";

const TOAST_DURATION_MS = 2500;

/** Auto-dismissing banner host for `showToast`; a newer message restarts the timer. */
export function Toast() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToast((nextMessage) => {
      setMessage(nextMessage);
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    });
    return () => {
      unsubscribe();
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, []);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.overlay, { top: insets.top + Spacing.two }]}>
      <Card style={styles.toast}>
        <ThemedText type="smallBold">{message}</ThemedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toast: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
