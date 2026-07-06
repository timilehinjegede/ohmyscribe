import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "onboarding-complete";

export type OnboardingStatus = "loading" | "needed" | "done";

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus>("loading");

  useEffect(() => {
    // Guards against setting state after unmount if the read resolves late.
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (active) setStatus(value ? "done" : "needed");
      })
      .catch(() => {
        // If the read fails, show the welcome screen rather than skipping it.
        if (active) setStatus("needed");
      });
    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(() => {
    setStatus("done");
    AsyncStorage.setItem(STORAGE_KEY, "1").catch(() => {});
  }, []);

  return { status, complete };
}
