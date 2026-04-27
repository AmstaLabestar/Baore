import "react-native-gesture-handler";

import { Stack } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { initializeDatabase } from "@/database/db";

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase().catch((error) => {
      console.error("Erreur d'initialisation SQLite:", error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
