import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { palette, radius, shadows, spacing } from "@/shared/theme";
import { formatMontant, getPourcentage } from "@/utils/formatters";

interface MonthCategoryBar {
  color: string;
  label: string;
  montant: number;
}

interface MonthSummaryCardProps {
  categories: MonthCategoryBar[];
  depense: number;
  restant: number;
  salaire: number;
}

export function MonthSummaryCard({
  categories,
  depense,
  restant,
  salaire,
}: MonthSummaryCardProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const topCategories = categories.slice(0, 4);
  const totalCategories = topCategories.reduce((sum, item) => sum + item.montant, 0);
  const spentPercent = getPourcentage(depense, salaire);

  useEffect(() => {
    progressAnimation.setValue(0);
    Animated.timing(progressAnimation, {
      duration: 680,
      toValue: 1,
      useNativeDriver: false,
    }).start();
  }, [depense, progressAnimation, salaire]);

  const mainProgressWidth = progressAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", `${spentPercent}%`],
  });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.label}>Salaire du mois</Text>
          <Text style={styles.salary}>{formatMontant(salaire)}</Text>
        </View>

        <View style={[styles.rightStats, isCompact ? styles.rightStatsCompact : null]}>
          <Text style={styles.metaLabel}>Depense</Text>
          <Text style={styles.metaValue}>{formatMontant(depense)}</Text>
          <Text style={[styles.metaValue, restant >= 0 ? styles.restantPositive : styles.restantNegative]}>
            {formatMontant(restant)}
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: mainProgressWidth }]} />
      </View>

      {topCategories.length > 0 ? (
        <View style={styles.categoriesWrap}>
          <Text style={styles.sectionLabel}>Repartition</Text>

          {topCategories.map((category) => (
            <View key={category.label} style={styles.categoryRow}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryLabelWrap}>
                  <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                  <Text numberOfLines={1} style={styles.categoryLabel}>
                    {category.label}
                  </Text>
                </View>

                <Text numberOfLines={1} style={styles.categoryAmount}>
                  {formatMontant(category.montant)}
                </Text>
              </View>

              <View style={styles.categoryTrack}>
                <Animated.View
                  style={[
                    styles.categoryFill,
                    {
                      backgroundColor: category.color,
                      width: progressAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          "0%",
                          `${Math.max(8, getPourcentage(category.montant, totalCategories || 1))}%`,
                        ],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.backgroundElevated,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    ...shadows.card,
  },
  categoriesWrap: {
    marginTop: 18,
  },
  categoryAmount: {
    color: palette.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginLeft: 12,
    textAlign: "right",
  },
  categoryDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  categoryFill: {
    borderRadius: 999,
    height: "100%",
  },
  categoryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  categoryLabel: {
    color: palette.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  categoryLabelWrap: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
  },
  categoryRow: {
    marginTop: 12,
  },
  categoryTrack: {
    backgroundColor: palette.primarySoft,
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
  },
  label: {
    color: palette.muted,
    fontSize: 14,
    marginBottom: 6,
  },
  metaLabel: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  metaValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  progressFill: {
    backgroundColor: palette.primary,
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: palette.primarySoft,
    borderRadius: 999,
    height: 8,
    marginTop: 16,
    overflow: "hidden",
  },
  restantNegative: {
    color: palette.danger,
  },
  restantPositive: {
    color: palette.success,
  },
  rightStats: {
    alignItems: "flex-end",
    gap: 2,
    marginLeft: 12,
  },
  rightStatsCompact: {
    alignItems: "flex-start",
    marginLeft: 0,
    marginTop: 12,
  },
  salary: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  sectionLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  topLeft: {
    flexShrink: 1,
  },
  topRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
});
