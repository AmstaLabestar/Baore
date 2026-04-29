import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { EnveloppeType } from "@/database/queries";
import { formatMontant, getPourcentage } from "@/utils/formatters";

const ENVELOPE_CONFIG: Record<
  EnveloppeType,
  {
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    lightColor: string;
  }
> = {
  charges: { color: "#3b82f6", icon: "home-outline", label: "Charges", lightColor: "#eff6ff" },
  epargne: { color: "#10b981", icon: "wallet-outline", label: "Epargne", lightColor: "#ecfdf5" },
  investissement: {
    color: "#8b5cf6",
    icon: "trending-up-outline",
    label: "Investissement",
    lightColor: "#f5f3ff",
  },
  urgence: {
    color: "#f59e0b",
    icon: "shield-checkmark-outline",
    label: "Urgence",
    lightColor: "#fff7ed",
  },
};

interface EnveloppeCardProps {
  montantInitial: number;
  montantRestant: number;
  pourcentage: number;
  seuil: number;
  type: EnveloppeType;
}

export function EnveloppeCard({
  montantInitial,
  montantRestant,
  pourcentage,
  seuil,
  type,
}: EnveloppeCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const config = ENVELOPE_CONFIG[type];
  const horizontalPadding = 40;
  const columnGap = 12;
  const isCompact = screenWidth < 390;
  const cardWidth = isCompact ? "100%" : (screenWidth - horizontalPadding - columnGap) / 2;
  const remainingRatio = getPourcentage(montantRestant, montantInitial);
  const spentRatio = getPourcentage(montantInitial - montantRestant, montantInitial) / 100;
  const state =
    montantRestant <= 0
      ? "empty"
      : remainingRatio <= seuil
        ? remainingRatio <= Math.max(4, seuil / 2)
          ? "danger"
          : "warning"
        : "normal";

  useEffect(() => {
    Animated.timing(animatedValue, {
      duration: 700,
      toValue: Math.min(Math.max(spentRatio, 0), 1),
      useNativeDriver: false,
    }).start();
  }, [animatedValue, spentRatio]);

  const progressWidth = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  const backgroundColor =
    state === "empty"
      ? "#fee2e2"
      : state === "danger"
        ? "#fee2e2"
        : state === "warning"
          ? "#fff7d6"
          : "#ffffff";
  const textColor =
    state === "empty"
      ? "#ef4444"
      : state === "danger"
        ? "#ef4444"
        : state === "warning"
          ? "#f59e0b"
          : "#1a1a2e";

  return (
    <View style={[styles.wrap, { width: cardWidth }]}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
        }}
        style={[styles.card, { backgroundColor }]}
      >
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: config.lightColor }]}>
            <Ionicons color={config.color} name={config.icon} size={18} />
          </View>
          <Text style={[styles.title, { color: textColor }]}>{config.label}</Text>
        </View>

        <Text style={[styles.remaining, { color: textColor }]}>{formatMontant(montantRestant)}</Text>
        <Text numberOfLines={2} style={[styles.initial, { color: state === "normal" ? "#6b7280" : textColor }]}>
          Initial: {formatMontant(montantInitial)} - {Math.round(pourcentage)}%
        </Text>

        <View style={[styles.track, { backgroundColor: config.lightColor }]}>
          <Animated.View style={[styles.fill, { backgroundColor: config.color, width: progressWidth }]} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    minHeight: 156,
    padding: 16,
    shadowColor: "#111827",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  fill: {
    borderRadius: 999,
    height: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  iconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  initial: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  remaining: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 6,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  track: {
    borderRadius: 999,
    height: 8,
    overflow: "hidden",
    width: "100%",
  },
  wrap: {
    minWidth: 0,
  },
});
