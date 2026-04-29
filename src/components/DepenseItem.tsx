import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import type { Depense, EnveloppeType } from "@/database/queries";
import { formatMontant } from "@/utils/formatters";

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  Autre: "#6b7280",
  Communication: "#3b82f6",
  Education: "#8b5cf6",
  Epargne: "#10b981",
  Investissement: "#7c3aed",
  Logement: "#f59e0b",
  Loisirs: "#ec4899",
  Nourriture: "#ef4444",
  Sante: "#10b981",
  Transport: "#0ea5e9",
  Vetements: "#6366f1",
};

function getEnvelopeLabel(type: EnveloppeType): string {
  switch (type) {
    case "charges":
      return "Charges";
    case "epargne":
      return "Epargne";
    case "investissement":
      return "Investissement";
    case "urgence":
      return "Urgence";
    default:
      return type;
  }
}

function getCategoryColor(category: string): string {
  return CATEGORY_BADGE_COLORS[category] ?? "#6b7280";
}

interface DepenseItemProps {
  depense: Depense;
  onDelete: (depense: Depense) => void;
  onPress?: (depense: Depense) => void;
}

export function DepenseItem({ depense, onDelete, onPress }: DepenseItemProps) {
  const categoryColor = getCategoryColor(depense.categorie);

  return (
    <Swipeable
      overshootLeft={false}
      renderLeftActions={() => (
        <Pressable
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            onDelete(depense);
          }}
          style={({ pressed }) => [styles.deleteAction, pressed ? styles.deleteActionPressed : null]}
        >
          <Ionicons color="#ffffff" name="trash-outline" size={18} />
          <Text style={styles.deleteActionText}>Supprimer</Text>
        </Pressable>
      )}
    >
      <Pressable
        onPress={() => onPress?.(depense)}
        style={({ pressed }) => [styles.container, pressed ? styles.containerPressed : null]}
      >
        <View style={styles.left}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.description}>
              {depense.description}
            </Text>
            <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}18` }]}>
              <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
                {depense.categorie}
              </Text>
            </View>
          </View>

          <Text style={styles.meta}>
            {getEnvelopeLabel(depense.enveloppe_type)} - {depense.heure}
          </Text>
        </View>

        <Text style={styles.amount}>{formatMontant(depense.montant)}</Text>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  amount: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 12,
  },
  categoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  container: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  containerPressed: {
    opacity: 0.9,
  },
  deleteAction: {
    alignItems: "center",
    backgroundColor: "#ef4444",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 8,
    marginRight: 10,
    marginTop: 8,
    paddingHorizontal: 18,
  },
  deleteActionPressed: {
    opacity: 0.85,
  },
  deleteActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  description: {
    color: "#1a1a2e",
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginRight: 8,
  },
  left: {
    flex: 1,
  },
  meta: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 6,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
  },
});
