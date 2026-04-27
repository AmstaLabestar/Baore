import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";

const COLORS = {
  primary: "#4f46e5",
  primaryDark: "#1a1a2e",
  background: "#f8f7ff",
  card: "#ffffff",
  text: "#1a1a2e",
  muted: "#6b7280",
  border: "#ecebff",
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
      onPress={onPress}
      style={styles.addButtonWrapper}
      testID={testID}
    >
      <View style={styles.addButton}>{children}</View>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primaryDark,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
        tabBarHideOnKeyboard: true,
        sceneStyle: styles.scene,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
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
    elevation: 0,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: -4,
    },
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
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 8,
  },
});
