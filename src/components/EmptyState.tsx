import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { palette, radius, shadows, spacing, typography } from "@/shared/theme";

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
        <Circle cx="60" cy="46" fill={palette.primarySoft} r="44" />
        <Path d="M38 28h44a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z" fill={palette.white} stroke={palette.borderStrong} strokeWidth="3" />
        <Path d="M46 40h28M46 50h22M46 60h16" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
      </Svg>
    );
  }

  if (context === "enveloppes") {
    return (
      <Svg fill="none" height={92} viewBox="0 0 120 92" width={120}>
        <Circle cx="60" cy="46" fill={palette.primarySoft} r="44" />
        <Path d="M33 44c0-10.5 8.5-19 19-19h16c10.5 0 19 8.5 19 19v10c0 10.5-8.5 19-19 19H52c-10.5 0-19-8.5-19-19V44Z" fill={palette.white} stroke={palette.borderStrong} strokeWidth="3" />
        <Path d="M37 39h46" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
        <Circle cx="72" cy="54" fill={palette.success} r="6" />
      </Svg>
    );
  }

  return (
    <Svg fill="none" height={92} viewBox="0 0 120 92" width={120}>
      <Circle cx="60" cy="46" fill={palette.primarySoft} r="44" />
      <Path d="M44 30h32a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10V40a10 10 0 0 1 10-10Z" fill={palette.white} stroke={palette.borderStrong} strokeWidth="3" />
      <Path d="M48 49h24" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
      <Path d="M60 37v24" stroke={palette.primary} strokeLinecap="round" strokeWidth="4" />
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
    backgroundColor: palette.backgroundElevated,
    borderColor: palette.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    minWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...shadows.card,
  },
  description: {
    color: palette.muted,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    maxWidth: 320,
    marginTop: spacing.xs,
    textAlign: "center",
  },
  title: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
    maxWidth: 280,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
