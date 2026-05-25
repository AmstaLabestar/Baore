import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { EnveloppeType } from "@/database/queries";
import { envelopeTheme, palette, radius, shadows, spacing } from "@/shared/theme";
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
  charges: { ...envelopeTheme.charges, icon: "home-outline", lightColor: envelopeTheme.charges.soft },
  epargne: { ...envelopeTheme.epargne, icon: "wallet-outline", lightColor: envelopeTheme.epargne.soft },
  investissement: {
    color: envelopeTheme.investissement.color,
    icon: "trending-up-outline",
    label: envelopeTheme.investissement.label,
    lightColor: envelopeTheme.investissement.soft,
  },
  urgence: {
    color: envelopeTheme.urgence.color,
    icon: "shield-checkmark-outline",
    label: envelopeTheme.urgence.label,
    lightColor: envelopeTheme.urgence.soft,
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
      ? palette.dangerSoft
      : state === "danger"
        ? palette.dangerSoft
        : state === "warning"
          ? palette.warningSoft
          : palette.backgroundElevated;
  const textColor =
    state === "empty"
      ? palette.danger
      : state === "danger"
        ? palette.danger
        : state === "warning"
          ? palette.warning
          : palette.text;

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
        <Text numberOfLines={2} style={[styles.initial, { color: state === "normal" ? palette.muted : textColor }]}>
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
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 156,
    padding: spacing.md,
    ...shadows.card,
  },
  fill: {
    borderRadius: 999,
    height: "100%",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    alignItems: "center",
    borderRadius: radius.sm,
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
