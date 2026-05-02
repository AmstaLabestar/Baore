import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

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

      <ActivityIndicator color="#ffffff" size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
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
    color: "#c7cae8",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
  },
});
