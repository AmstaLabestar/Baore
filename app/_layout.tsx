import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { initializeDatabase } from "@/database/db";
import {
  requestPermissions,
  scheduleInactivityReminder,
  scheduleMonthlyReminder,
} from "@/services/notifications";

export default function RootLayout() {
  useEffect(() => {
    void (async () => {
      try {
        await initializeDatabase();

        const hasPermission = await requestPermissions();

        if (hasPermission) {
          await Promise.all([scheduleMonthlyReminder(), scheduleInactivityReminder()]);
        }
      } catch (error) {
        console.error("Erreur d'initialisation de l'application:", error);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
