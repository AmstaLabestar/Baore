import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing } from "@/shared/theme";

/** Ecran de chargement reutilisable pendant l'initialisation de Baore. */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.logoWrap}>
        <Image
          resizeMode="contain"
          source={require("../../assets/Baore.png")}
          style={styles.logoImage}
        />
        <Text style={styles.title}>Baore</Text>
        <Text style={styles.subtitle}>On prepare ton espace budgetaire</Text>
      </View>

      <ActivityIndicator color={palette.white} size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: palette.primaryDark,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  logoImage: {
    height: 92,
    marginBottom: 16,
    width: 92,
  },
  logoWrap: {
    alignItems: "center",
    marginBottom: 24,
  },
  subtitle: {
    color: palette.borderStrong,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  title: {
    color: palette.white,
    fontSize: 28,
    fontWeight: "700",
  },
});
