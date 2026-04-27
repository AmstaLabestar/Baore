import type { EnveloppeAvecSolde, EnveloppeType, Mois } from "@/database/queries";

export type BudgetAlertTone = "danger" | "success" | "warning";

export interface BudgetAlert {
  icon: string;
  id: string;
  message: string;
  tone: BudgetAlertTone;
}

const ENVELOPE_LABELS: Record<EnveloppeType, string> = {
  charges: "Charges",
  epargne: "Epargne",
  investissement: "Investissement",
  urgence: "Urgence",
};

function isEndOfMonth(date: Date): boolean {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() >= Math.max(26, lastDay - 2);
}

/** Construit la liste des alertes in-app a afficher a partir de l'etat budgetaire courant. */
export function buildBudgetAlerts({
  currentMonth,
  enveloppes,
  now = new Date(),
  seuilAlerte,
}: {
  currentMonth: Mois | null;
  enveloppes: EnveloppeAvecSolde[];
  now?: Date;
  seuilAlerte: number;
}): BudgetAlert[] {
  const thresholdRatio = seuilAlerte / 100;
  const alerts = enveloppes.flatMap<BudgetAlert>((enveloppe) => {
    const ratio =
      enveloppe.montant_initial > 0 ? enveloppe.montant_restant / enveloppe.montant_initial : 0;
    const label = ENVELOPE_LABELS[enveloppe.type];

    if (enveloppe.montant_restant <= 0) {
      return [
        {
          icon: "\u{1F6AB}",
          id: `${enveloppe.type}-danger`,
          message: `${label} est epuisee. Il faut ralentir ou reequilibrer cette enveloppe.`,
          tone: "danger",
        },
      ];
    }

    if (ratio <= thresholdRatio) {
      return [
        {
          icon: "\u26A0\uFE0F",
          id: `${enveloppe.type}-warning`,
          message: `${label} approche du seuil critique avec ${Math.round(ratio * 100)}% restant.`,
          tone: "warning",
        },
      ];
    }

    return [];
  });

  const epargne = enveloppes.find((item) => item.type === "epargne");

  if (
    currentMonth &&
    currentMonth.statut === "en_cours" &&
    isEndOfMonth(now) &&
    epargne &&
    epargne.montant_restant > 0
  ) {
    alerts.push({
      icon: "\u{1F389}",
      id: "positive-epargne",
      message: `Bravo, tu termines ${currentMonth.label} avec une epargne positive de ${Math.round(
        epargne.montant_restant
      ).toLocaleString("fr-FR")} FCFA.`,
      tone: "success",
    });
  }

  return alerts;
}

/** Compte uniquement les alertes de vigilance a remonter dans le badge de navigation. */
export function countActiveBudgetAlerts(alerts: BudgetAlert[]): number {
  return alerts.filter((alert) => alert.tone === "warning" || alert.tone === "danger").length;
}
