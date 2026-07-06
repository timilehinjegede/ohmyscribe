import { useEffect } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";

import { syncNow } from "@/sync";

export function useSyncTriggers() {
  useEffect(() => {
    void syncNow();

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });

    let wasConnected = true;
    const network = Network.addNetworkStateListener((state) => {
      const connected = state.isConnected ?? false;
      if (connected && !wasConnected) void syncNow();
      wasConnected = connected;
    });

    return () => {
      appState.remove();
      network.remove();
    };
  }, []);
}
