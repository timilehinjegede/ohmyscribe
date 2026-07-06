import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type View as ViewType,
  type ViewStyle,
} from "react-native";
import type { Ref } from "react";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "default" | "compact";

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  title: string;
  variant?: ButtonVariant;
  /** `compact` is a shorter, smaller-text button for secondary/inline actions (e.g. wizard nav). */
  size?: ButtonSize;
  /** Show a spinner and block presses while an action is in flight. */
  loading?: boolean;
  /** Container style override, e.g. spacing from surrounding content. */
  style?: StyleProp<ViewStyle>;
  /** Forwarded to the underlying Pressable so the button composes with `<Link asChild>`. */
  ref?: Ref<ViewType>;
};

/** The app's tap target: an accent-filled `primary`, a bordered `secondary`, or a text-only `ghost`. */
export function Button({
  title,
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  style,
  ref,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const compact = size === "compact";

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.accent },
    secondary: {
      backgroundColor: theme.backgroundElement,
      borderWidth: 1,
      borderColor: theme.border,
    },
    ghost: { backgroundColor: "transparent" },
  };
  const label = variant === "primary" ? theme.onAccent : theme.accent;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.baseCompact,
        surface[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={label} /> : null}
        <Text style={[styles.label, compact && styles.labelCompact, { color: label }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
  },
  baseCompact: {
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
});
