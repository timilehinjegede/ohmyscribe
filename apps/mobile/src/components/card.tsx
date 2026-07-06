import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { Radius, Spacing, type ThemeColor } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type CardProps = ViewProps & {
  /** Surface fill. Defaults to the subtle `backgroundElement` tint. */
  type?: ThemeColor;
  /** Apply the standard inner padding. Set false when the card lays out its own children. */
  padded?: boolean;
};

/** The app's card surface: rounded corners, a hairline border, and a soft lift on iOS. */
export function Card({ style, type = "backgroundElement", padded = true, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme[type], borderColor: theme.border },
        padded && styles.padded,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  padded: {
    padding: Spacing.three,
  },
});
