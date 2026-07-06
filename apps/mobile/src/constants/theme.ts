/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#11181C",
    textSecondary: "#60646C",
    background: "#ffffff",
    backgroundElement: "#F0F0F3",
    backgroundSelected: "#E0E1E6",
    /** Hairline separators and card outlines. */
    border: "#E6E7EB",
    /** Brand / primary action color. */
    accent: "#732EBB",
    /** Tinted accent fill for selected states and highlights. */
    accentMuted: "#F0E7FB",
    /** Foreground on top of an `accent` fill. */
    onAccent: "#FFFFFF",
    success: "#1B9E4B",
    /** Tinted success fill for success chips/badges. */
    successMuted: "#E4F5E9",
    danger: "#E5484D",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#B0B4BA",
    background: "#000000",
    backgroundElement: "#212225",
    backgroundSelected: "#2E3135",
    border: "#2A2D31",
    accent: "#A655FF",
    accentMuted: "#2A1640",
    onAccent: "#FFFFFF",
    success: "#3DD68C",
    successMuted: "#123122",
    danger: "#FF6369",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Corner radii: `sm` for inline controls, `md`/`lg` for cards and buttons, `pill` for chips and badges.
 */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Clearance for the floating tab bar so scroll content isn't hidden behind it.
export const BottomTabInset = Platform.select({ ios: 96, android: 90 }) ?? 0;
export const MaxContentWidth = 800;
