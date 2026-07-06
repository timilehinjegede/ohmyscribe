import { useRef } from "react";
import { Animated, useWindowDimensions } from "react-native";

/**
 * Horizontal slide for a step pager. Call `slideIn(direction)` when the step changes — `1` slides
 * the new step in from the right (forward), `-1` from the left (back).
 */
export function useStepSlide() {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;

  const slideIn = (direction: 1 | -1) => {
    translateX.setValue(direction * width);
    Animated.timing(translateX, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  return { transform: [{ translateX }], slideIn };
}
