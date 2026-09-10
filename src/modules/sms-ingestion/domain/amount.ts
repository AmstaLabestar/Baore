/**
 * Lecture des montants.
 *
 * Les trois operateurs n'ecrivent pas les nombres de la meme facon et les
 * conventions sont mutuellement incompatibles :
 *
 *   Orange  35,000.00  virgule = milliers, point = decimal
 *   Moov     3 500,00  espace  = milliers, virgule = decimal
 *   UBA         20.000  point   = milliers, pas de decimale
 *
 * Lire "20.000" avec la convention Orange donne 20,00 au lieu de 20 000 :
 * une erreur d'un facteur 1000. Il n'existe donc pas de parsing generique,
 * la convention est toujours imposee par l'appelant.
 */

export type AmountConvention = "dot_decimal" | "comma_decimal" | "dot_thousands";

/** Espace fine insecable et espace insecable : les operateurs melangent les trois. */
const SPACE_CLASS = /[\s\u00a0\u202f]/g;

function toCentimes(entier: string, decimales: string): number {
  const normalized = `${decimales}00`.slice(0, 2);
  const signe = entier.startsWith("-") ? -1 : 1;
  const unites = Math.abs(Number.parseInt(entier, 10));

  if (!Number.isFinite(unites)) {
    return Number.NaN;
  }

  return signe * (unites * 100 + Number.parseInt(normalized, 10));
}

/**
 * Convertit un montant textuel en centimes entiers.
 *
 * On travaille en entiers parce que les soldes s'enchainent d'un SMS a l'autre
 * et servent a verifier l'integrite de la suite : en flottant, l'erreur
 * s'accumule et le controle devient inexploitable.
 *
 * Retourne `null` si le texte ne contient pas de montant lisible (cas reel :
 * "Frais:  FCFA" arrive vide chez Orange).
 */
export function parseAmountToCentimes(
  raw: string | null | undefined,
  convention: AmountConvention
): number | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw.replace(SPACE_CLASS, "").replace(/FCFA|XOF|F$/gi, "").trim();

  if (!/\d/.test(cleaned)) {
    return null;
  }

  if (convention === "dot_thousands") {
    // Aucune decimale dans cette convention : tout separateur est un millier.
    const digits = cleaned.replace(/[.,]/g, "");

    return /^-?\d+$/.test(digits) ? toCentimes(digits, "0") : null;
  }

  const decimalSep = convention === "dot_decimal" ? "." : ",";
  const thousandSep = convention === "dot_decimal" ? "," : ".";
  const withoutThousands = cleaned.split(thousandSep).join("");
  const parts = withoutThousands.split(decimalSep);

  if (parts.length > 2) {
    return null;
  }

  const [entier, decimales = "0"] = parts;

  if (!/^-?\d+$/.test(entier) || !/^\d*$/.test(decimales)) {
    return null;
  }

  const centimes = toCentimes(entier, decimales || "0");

  return Number.isFinite(centimes) ? centimes : null;
}

/** Rend un montant en centimes sous forme lisible, pour les logs et l'ecran de diagnostic. */
export function formatCentimes(centimes: number): string {
  const unites = Math.trunc(Math.abs(centimes) / 100);
  const reste = Math.abs(centimes) % 100;
  const signe = centimes < 0 ? "-" : "";
  const entier = new Intl.NumberFormat("fr-FR").format(unites);

  return reste === 0
    ? `${signe}${entier} FCFA`
    : `${signe}${entier},${String(reste).padStart(2, "0")} FCFA`;
}
