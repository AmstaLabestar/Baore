/** Formate un montant FCFA avec des espaces comme separateurs de milliers. */
export function formatMontant(n: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(Math.round(n))} FCFA`;
}

/** Formate une date ISO en etiquette courte orientee mobile. */
export function formatDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isSameDay) {
    return "Aujourd'hui";
  }

  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return "Hier";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/** Nettoie et uniformise l'affichage d'un libelle de mois. */
export function formatMois(label: string): string {
  if (!label.trim()) {
    return "";
  }

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Retourne un pourcentage borne entre 0 et 100. */
export function getPourcentage(partiel: number, total: number): number {
  if (!total || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (partiel / total) * 100));
}
