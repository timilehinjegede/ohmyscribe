import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  stretch = false,
  style,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  /** Fill the available width with equal-width segments. */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const selectedIndex = Math.max(
    0,
    options.findIndex(([optionValue]) => optionValue === value),
  );

  const [segments, setSegments] = useState<LayoutRectangle[]>([]);
  const thumbLeft = useRef(new Animated.Value(0)).current;
  const thumbWidth = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);

  useEffect(() => {
    const segment = segments[selectedIndex];
    if (!segment) return;
    // Snap into place on the first measure; slide on every selection after that.
    if (!settled.current) {
      settled.current = true;
      thumbLeft.setValue(segment.x);
      thumbWidth.setValue(segment.width);
      return;
    }
    Animated.parallel([
      Animated.timing(thumbLeft, { toValue: segment.x, duration: 180, useNativeDriver: false }),
      Animated.timing(thumbWidth, {
        toValue: segment.width,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [selectedIndex, segments, thumbLeft, thumbWidth]);

  const measure = (index: number, layout: LayoutRectangle) =>
    setSegments((prev) => {
      const next = prev.slice();
      next[index] = layout;
      return next;
    });

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: theme.backgroundElement },
        stretch && styles.trackStretch,
        style,
      ]}
    >
      {segments[selectedIndex] ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: theme.accent, left: thumbLeft, width: thumbWidth },
          ]}
        />
      ) : null}
      {options.map(([optionValue, label], index) => {
        const selected = optionValue === value;
        return (
          <Pressable
            key={optionValue}
            onLayout={(event) => measure(index, event.nativeEvent.layout)}
            onPress={() => onChange(optionValue)}
            style={[styles.segment, stretch && styles.segmentStretch]}
          >
            <ThemedText
              type="small"
              style={{ color: selected ? theme.onAccent : theme.text, fontWeight: "600" }}
            >
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: Spacing.half,
    padding: Spacing.half,
    borderRadius: Radius.pill,
  },
  trackStretch: {
    alignSelf: "stretch",
  },
  // Sits behind the labels and slides between segments.
  thumb: {
    position: "absolute",
    top: Spacing.half,
    bottom: Spacing.half,
    borderRadius: Radius.pill,
  },
  segment: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentStretch: {
    flex: 1,
  },
});
