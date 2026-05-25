import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import type { Depense, EnveloppeType } from "@/database/queries";
import { categoryColors, palette, radius } from "@/shared/theme";
import { formatMontant } from "@/utils/formatters";

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
  return categoryColors[category as keyof typeof categoryColors] ?? palette.muted;
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
          <Ionicons color={palette.white} name="trash-outline" size={18} />
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
    color: palette.danger,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    marginLeft: 12,
    textAlign: "right",
  },
  categoryBadge: {
    borderRadius: radius.round,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  container: {
    alignItems: "center",
    backgroundColor: palette.backgroundElevated,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
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
    backgroundColor: palette.danger,
    borderRadius: radius.md,
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
    color: palette.white,
    fontSize: 13,
    fontWeight: "700",
  },
  description: {
    color: palette.text,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginRight: 8,
  },
  left: {
    flex: 1,
  },
  meta: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    minWidth: 0,
  },
});
