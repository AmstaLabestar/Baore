import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { initializeDatabase } from "@/database/db";
import { getEnveloppesByMois, getMoisEnCours, getParametresMap } from "@/database/queries";
import { compterAClasser } from "@/modules/classification/infrastructure/classification-repository";
import { buildBudgetAlerts, countActiveBudgetAlerts } from "@/services/budget-alerts";
import { palette, radius, shadows } from "@/shared/theme";
import { subscribeToBudgetUpdates } from "@/shared/services/budget-events";

const COLORS = {
  primary: palette.primary,
  primaryDark: palette.primaryDark,
  background: palette.background,
  card: palette.backgroundElevated,
  text: palette.text,
  muted: palette.muted,
  border: palette.border,
};

type AddTabButtonProps = Pick<
  BottomTabBarButtonProps,
  "accessibilityState" | "children" | "onLongPress" | "onPress" | "testID"
>;

function AddTabButton({
  accessibilityState,
  children,
  onLongPress,
  onPress,
  testID,
}: AddTabButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onLongPress={onLongPress}
      onPress={(event) => {
        void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={styles.addButtonWrapper}
      testID={testID}
    >
      <View style={styles.addButton}>{children}</View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [homeAlertCount, setHomeAlertCount] = useState(0);
  const [aClasserCount, setAClasserCount] = useState(0);

  const loadHomeAlertCount = useCallback(async () => {
    const currentMonth = await getMoisEnCours();

    if (!currentMonth) {
      setHomeAlertCount(0);
      return;
    }

    const [parametres, enveloppes] = await Promise.all([
      getParametresMap(),
      getEnveloppesByMois(currentMonth.id),
    ]);

    const alerts = buildBudgetAlerts({
      currentMonth,
      enveloppes,
      seuilAlerte: Number.parseFloat(parametres.seuil_alerte) || 10,
    });

    setHomeAlertCount(countActiveBudgetAlerts(alerts));
  }, []);

  const loadAClasserCount = useCallback(async () => {
    try {
      setAClasserCount(await compterAClasser(await initializeDatabase()));
    } catch (error) {
      console.error("Comptage de la file de classement impossible:", error);
    }
  }, []);

  useEffect(() => {
    void loadHomeAlertCount();
    void loadAClasserCount();

    return subscribeToBudgetUpdates(() => {
      void loadHomeAlertCount();
      void loadAClasserCount();
    });
  }, [loadAClasserCount, loadHomeAlertCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primaryDark,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 72 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ],
        tabBarItemStyle: styles.tabBarItem,
        tabBarHideOnKeyboard: true,
        sceneStyle: styles.scene,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          tabBarBadge: homeAlertCount > 0 ? homeAlertCount : undefined,
          tabBarBadgeStyle: styles.badge,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "home" : "home-outline"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="classer"
        options={{
          title: "A classer",
          tabBarBadge: aClasserCount > 0 ? aClasserCount : undefined,
          tabBarBadgeStyle: styles.badge,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "pricetags" : "pricetags-outline"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="depense"
        options={{
          title: "Depense",
          tabBarIcon: () => <Ionicons color={COLORS.card} name="add" size={28} />,
          tabBarButton: (props) => <AddTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="historique"
        options={{
          title: "Historique",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "list" : "list-outline"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reglages"
        options={{
          title: "Reglages",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              color={color}
              name={focused ? "settings" : "settings-outline"}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: COLORS.background,
  },
  tabBar: {
    height: 78,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...shadows.card,
  },
  tabBarItem: {
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -28,
  },
  addButton: {
    width: 60,
    height: 60,
    borderRadius: radius.round,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.floating,
  },
  badge: {
    backgroundColor: palette.danger,
    color: palette.white,
    fontSize: 11,
    fontWeight: "700",
  },
});
