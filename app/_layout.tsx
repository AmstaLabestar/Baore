import { Stack } from "expo-router";
import { useEffect } from "react";

import { initializeDatabase } from "@/database/db";

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase().catch((error) => {
      console.error("Erreur d'initialisation SQLite:", error);
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
