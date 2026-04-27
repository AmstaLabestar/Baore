import { StyleSheet, Text, View } from "react-native";

import type { BudgetAlertTone } from "@/services/budget-alerts";

const TONE_STYLES: Record<
  BudgetAlertTone,
  { backgroundColor: string; textColor: string }
> = {
  danger: {
    backgroundColor: "#fee2e2",
    textColor: "#ef4444",
  },
  success: {
    backgroundColor: "#dcfce7",
    textColor: "#10b981",
  },
  warning: {
    backgroundColor: "#fff7d6",
    textColor: "#f59e0b",
  },
};

interface AlertBannerProps {
  icon: string;
  message: string;
  tone: BudgetAlertTone;
}

/** Affiche une banniere d'alerte budgetaire reutilisable dans l'application. */
export function AlertBanner({ icon, message, tone }: AlertBannerProps) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <View style={[styles.container, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.message, { color: toneStyle.textColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    fontSize: 18,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
