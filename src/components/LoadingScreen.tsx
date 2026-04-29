import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

/** Ecran de chargement reutilisable pendant l'initialisation de Baore. */
export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.logoWrap}>
        <View style={styles.logoBubble}>
          <Text style={styles.logoText}>B</Text>
        </View>
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
  logoBubble: {
    alignItems: "center",
    backgroundColor: "#4f46e5",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 14,
    width: 56,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
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
