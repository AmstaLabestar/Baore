import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        padding: 24,
      }}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: "700",
          color: "#111827",
          marginBottom: 8,
        }}
      >
        Budget Flow
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        Projet initialise. Navigation et base technique pretes.
      </Text>
    </View>
  );
}
