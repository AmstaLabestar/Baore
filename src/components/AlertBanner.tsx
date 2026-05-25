import { StyleSheet, Text, View } from "react-native";

import type { BudgetAlertTone } from "@/services/budget-alerts";
import { palette, radius, spacing, typography } from "@/shared/theme";

const TONE_STYLES: Record<
  BudgetAlertTone,
  { backgroundColor: string; textColor: string }
> = {
  danger: {
    backgroundColor: palette.dangerSoft,
    textColor: palette.danger,
  },
  success: {
    backgroundColor: palette.successSoft,
    textColor: palette.success,
  },
  warning: {
    backgroundColor: palette.warningSoft,
    textColor: palette.warning,
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
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: {
    fontSize: 18,
  },
  message: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    lineHeight: typography.body.lineHeight,
  },
});
