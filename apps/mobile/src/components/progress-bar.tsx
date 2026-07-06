import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** A thin accent progress bar that animates its fill toward `value` (0..1). */
export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value,
      duration: 300,
      useNativeDriver: false, // width is a layout prop
    }).start();
  }, [value, progress]);

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: theme.accent,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
});
