import type { EnveloppeType } from "@/database/queries";
import { categoryColors, envelopeTheme } from "@/shared/theme";

export const expenseCategories = [
  { color: categoryColors.Nourriture, icon: "\u{1F354}", label: "Nourriture" },
  { color: categoryColors.Transport, icon: "\u{1F697}", label: "Transport" },
  { color: categoryColors.Logement, icon: "\u{1F3E0}", label: "Logement" },
  { color: categoryColors.Sante, icon: "\u{1F48A}", label: "Sante" },
  { color: categoryColors.Communication, icon: "\u{1F4F1}", label: "Communication" },
  { color: categoryColors.Vetements, icon: "\u{1F455}", label: "Vetements" },
  { color: categoryColors.Loisirs, icon: "\u{1F3AE}", label: "Loisirs" },
  { color: categoryColors.Education, icon: "\u{1F4DA}", label: "Education" },
  { color: categoryColors.Epargne, icon: "\u{1F4B0}", label: "Epargne" },
  { color: categoryColors.Investissement, icon: "\u{1F4C8}", label: "Investissement" },
  { color: categoryColors.Autre, icon: "\u2728", label: "Autre" },
] as const;

export type ExpenseCategoryLabel = (typeof expenseCategories)[number]["label"];

export const envelopeOptions: Array<{ color: string; key: EnveloppeType; label: string; soft: string }> = [
  {
    color: envelopeTheme.charges.color,
    key: "charges",
    label: envelopeTheme.charges.label,
    soft: envelopeTheme.charges.soft,
  },
  {
    color: envelopeTheme.epargne.color,
    key: "epargne",
    label: envelopeTheme.epargne.label,
    soft: envelopeTheme.epargne.soft,
  },
  {
    color: envelopeTheme.investissement.color,
    key: "investissement",
    label: envelopeTheme.investissement.label,
    soft: envelopeTheme.investissement.soft,
  },
  {
    color: envelopeTheme.urgence.color,
    key: "urgence",
    label: envelopeTheme.urgence.label,
    soft: envelopeTheme.urgence.soft,
  },
];

export const envelopeLabels = envelopeOptions.reduce(
  (labels, item) => ({
    ...labels,
    [item.key]: item.label,
  }),
  {} as Record<EnveloppeType, string>
);

