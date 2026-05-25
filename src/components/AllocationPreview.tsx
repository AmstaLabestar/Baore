import { StyleSheet, Text, View } from "react-native";

import type { CreateEnveloppeInput } from "@/database/queries";
import { envelopeLabels } from "@/shared/budget-config";
import { envelopeTheme, palette, radius, spacing } from "@/shared/theme";
import { formatMontant } from "@/utils/formatters";

interface AllocationPreviewProps {
  items: CreateEnveloppeInput[];
}

export function AllocationPreview({ items }: AllocationPreviewProps) {
  if (!items.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Repartition prevue</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const theme = envelopeTheme[item.type];

          return (
            <View key={item.type} style={[styles.item, { backgroundColor: theme.soft }]}>
              <View style={styles.itemHeader}>
                <View style={[styles.dot, { backgroundColor: theme.color }]} />
                <Text style={styles.itemLabel}>{envelopeLabels[item.type]}</Text>
              </View>
              <Text style={styles.itemAmount}>{formatMontant(item.montantInitial)}</Text>
              <Text style={styles.itemMeta}>{Math.round(item.pourcentage)}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  dot: {
    borderRadius: radius.round,
    height: 8,
    width: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  item: {
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: "46%",
    padding: spacing.sm,
  },
  itemAmount: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  itemHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  itemLabel: {
    color: palette.text,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  itemMeta: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  title: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
  },
});

