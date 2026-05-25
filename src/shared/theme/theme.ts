import type { ViewStyle } from "react-native";

export const palette = {
  background: "#f6f7fb",
  backgroundElevated: "#ffffff",
  backgroundSoft: "#eef2ff",
  border: "#e7e9f2",
  borderStrong: "#d8dcf0",
  danger: "#ef4444",
  dangerSoft: "#fee2e2",
  muted: "#6b7280",
  mutedSoft: "#f1f3f8",
  primary: "#4f46e5",
  primaryDark: "#17172f",
  primarySoft: "#eef2ff",
  success: "#10b981",
  successSoft: "#dcfce7",
  text: "#17172f",
  warning: "#f59e0b",
  warningSoft: "#fff7d6",
  white: "#ffffff",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  round: 999,
} as const;

export const typography = {
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
  },
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
} as const;

export const shadows = {
  card: {
    elevation: 3,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  } satisfies ViewStyle,
  floating: {
    elevation: 8,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  } satisfies ViewStyle,
} as const;

export const envelopeTheme = {
  charges: {
    color: "#3b82f6",
    label: "Charges",
    soft: "#eff6ff",
  },
  epargne: {
    color: "#10b981",
    label: "Epargne",
    soft: "#ecfdf5",
  },
  investissement: {
    color: "#8b5cf6",
    label: "Investissement",
    soft: "#f5f3ff",
  },
  urgence: {
    color: "#f59e0b",
    label: "Urgence",
    soft: "#fff7ed",
  },
} as const;

export const categoryColors = {
  Autre: "#6b7280",
  Communication: "#3b82f6",
  Education: "#8b5cf6",
  Epargne: "#10b981",
  Investissement: "#7c3aed",
  Logement: "#f59e0b",
  Loisirs: "#ec4899",
  Nourriture: "#ef4444",
  Sante: "#10b981",
  Transport: "#0ea5e9",
  Vetements: "#6366f1",
} as const;

