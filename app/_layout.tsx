import "react-native-gesture-handler";

import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { LoadingScreen } from "@/components/LoadingScreen";
import { initializeDatabase } from "@/database/db";
import {
  requestPermissions,
  scheduleInactivityReminder,
  scheduleMonthlyReminder,
} from "@/services/notifications";

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

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
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
