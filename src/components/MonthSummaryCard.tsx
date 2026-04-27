import { StyleSheet, Text, View } from "react-native";

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
  const totalCategories = categories.reduce((sum, item) => sum + item.montant, 0);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>Salaire du mois</Text>
          <Text style={styles.salary}>{formatMontant(salaire)}</Text>
        </View>
        <View style={styles.rightStats}>
          <Text style={styles.meta}>Depense: {formatMontant(depense)}</Text>
          <Text style={styles.meta}>Restant: {formatMontant(restant)}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${getPourcentage(depense, salaire)}%` }]} />
      </View>

      {categories.length > 0 ? (
        <View style={styles.chartWrap}>
          {categories.slice(0, 5).map((category) => (
            <View key={category.label} style={styles.chartItem}>
              <View
                style={[
                  styles.chartBar,
                  {
                    backgroundColor: category.color,
                    height: Math.max(16, getPourcentage(category.montant, totalCategories)),
                  },
                ]}
              />
              <Text numberOfLines={1} style={styles.chartLabel}>
                {category.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    marginBottom: 24,
    padding: 20,
    shadowColor: "#111827",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  chartBar: {
    borderRadius: 999,
    minHeight: 16,
    width: 14,
  },
  chartItem: {
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  chartLabel: {
    color: "#6b7280",
    fontSize: 11,
    maxWidth: 56,
    textAlign: "center",
  },
  chartWrap: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    minHeight: 72,
  },
  label: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 6,
  },
  meta: {
    color: "#6b7280",
    fontSize: 13,
  },
  progressFill: {
    backgroundColor: "#4f46e5",
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: "#ebe9ff",
    borderRadius: 999,
    height: 8,
    marginTop: 16,
    overflow: "hidden",
  },
  rightStats: {
    alignItems: "flex-end",
    gap: 4,
    marginLeft: 12,
  },
  salary: {
    color: "#1a1a2e",
    fontSize: 24,
    fontWeight: "700",
  },
  topRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
