import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type EmptyStateContext = "depenses" | "historique" | "enveloppes" | "generic";

interface EmptyStateProps {
  context?: EmptyStateContext;
  description?: string;
  title: string;
}

function EmptyIllustration({ context = "generic" }: { context?: EmptyStateContext }) {
  if (context === "historique") {
    return (
      <Svg fill="none" height={92} viewBox="0 0 120 92" width={120}>
        <Circle cx="60" cy="46" fill="#eef2ff" r="44" />
        <Path d="M38 28h44a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z" fill="#fff" stroke="#c7d2fe" strokeWidth="3" />
        <Path d="M46 40h28M46 50h22M46 60h16" stroke="#4f46e5" strokeLinecap="round" strokeWidth="4" />
      </Svg>
    );
  }

  if (context === "enveloppes") {
    return (
      <Svg fill="none" height={92} viewBox="0 0 120 92" width={120}>
        <Circle cx="60" cy="46" fill="#eef2ff" r="44" />
        <Path d="M33 44c0-10.5 8.5-19 19-19h16c10.5 0 19 8.5 19 19v10c0 10.5-8.5 19-19 19H52c-10.5 0-19-8.5-19-19V44Z" fill="#fff" stroke="#c7d2fe" strokeWidth="3" />
        <Path d="M37 39h46" stroke="#4f46e5" strokeLinecap="round" strokeWidth="4" />
        <Circle cx="72" cy="54" fill="#10b981" r="6" />
      </Svg>
    );
  }

  return (
    <Svg fill="none" height={92} viewBox="0 0 120 92" width={120}>
      <Circle cx="60" cy="46" fill="#eef2ff" r="44" />
      <Path d="M44 30h32a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10Z" fill="#fff" stroke="#c7d2fe" strokeWidth="3" />
      <Path d="M48 49h24" stroke="#4f46e5" strokeLinecap="round" strokeWidth="4" />
      <Path d="M60 37v24" stroke="#4f46e5" strokeLinecap="round" strokeWidth="4" />
    </Svg>
  );
}

/** Etat vide reutilisable avec illustration simple et texte contextualise. */
export function EmptyState({ context = "generic", description, title }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <EmptyIllustration context={context} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  description: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 320,
    marginTop: 8,
    textAlign: "center",
  },
  title: {
    color: "#1a1a2e",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
    maxWidth: 280,
    marginTop: 14,
    textAlign: "center",
  },
});
