/**
 * Nettoyage des messages avant extraction.
 *
 * Les operateurs encastrent leur publicite *au milieu* de la donnee utile, pas
 * a la fin, et ecrivent la meme etiquette de trois facons ("aupres", "auprés",
 * "auprès"). On normalise donc avant de matcher, et on retire la promo avant
 * d'extraire, sinon "100% de bonus" et "7 jours" polluent les montants.
 */

const PROMO_MARKERS = [
  /gagnez\s+\d+\s*%/i,
  /bonus\s+valable/i,
  /rendez-?vous\s+sur/i,
  /flashez\s+le\s+qr/i,
  /meilleures?\s+offres/i,
  /faites\s+vos\s+retraits/i,
  /simple\s+et\s+cool/i,
  /https?:\/\//i,
];

/** Retire les accents pour que "auprès", "auprés" et "aupres" matchent le meme motif. */
export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Decoupe en phrases sans casser les nombres.
 *
 * Le point est un separateur decimal chez Orange ("250.00") : on ne coupe donc
 * qu'a un point suivi d'une espace, jamais d'un chiffre.
 */
function splitSentences(input: string): string[] {
  return input.split(/(?<=[.!?])(?=\s)/);
}

/** Supprime les phrases purement promotionnelles et les URL residuelles. */
export function stripPromotional(input: string): string {
  return splitSentences(input)
    .filter((sentence) => !PROMO_MARKERS.some((marker) => marker.test(sentence)))
    .join("")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
}

/** Espaces multiples, sauts de ligne et espaces insecables ramenes a une espace simple. */
export function collapseWhitespace(input: string): string {
  return input.replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

/**
 * Replie un libelle integralement repete.
 *
 * Orange envoie "PHARMACIE UNIVERS SIRIBIE ALIMATA PHARMACIE UNIVERS SIRIBIE
 * ALIMATA" : le nom du marchand apparait deux fois de suite dans le meme champ.
 */
export function collapseRepeatedLabel(input: string): string {
  const tokens = collapseWhitespace(input).split(" ").filter(Boolean);

  if (tokens.length < 2 || tokens.length % 2 !== 0) {
    return collapseWhitespace(input);
  }

  const milieu = tokens.length / 2;
  const premiere = tokens.slice(0, milieu).join(" ");
  const seconde = tokens.slice(milieu).join(" ");

  return premiere.toLowerCase() === seconde.toLowerCase() ? premiere : collapseWhitespace(input);
}

/** Prepare un message : promo retiree, accents neutralises, espaces normalises. */
export function normalizeForMatching(body: string): string {
  return collapseWhitespace(stripAccents(stripPromotional(body)));
}

function toISO(annee: number, mois: number, jour: number, heures: number, minutes: number, secondes: number): string | null {
  const date = new Date(annee, mois - 1, jour, heures, minutes, secondes);

  if (Number.isNaN(date.getTime()) || date.getMonth() !== mois - 1 || date.getDate() !== jour) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Lit une date explicite au format JJ/MM/AAAA HH:MM(:SS), utilise par Moov et UBA. */
export function parseExplicitDate(input: string): string | null {
  const match = input.match(
    /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2})[:h](\d{2})(?::(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const [, jour, mois, annee, heures, minutes, secondes] = match;

  return toISO(
    Number(annee),
    Number(mois),
    Number(jour),
    Number(heures),
    Number(minutes),
    Number(secondes ?? "0")
  );
}

/**
 * Extrait la date encodee dans une reference Orange.
 *
 * "RC260908.2040.71377212" porte le type (RC), la date (26-09-08) et l'heure
 * (20:40). C'est notre repli quand le SMS lui-meme n'est pas horodate.
 */
export function parseDateFromOrangeReference(reference: string): string | null {
  const match = reference.match(/^([A-Z]{2})(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})\./);

  if (!match) {
    return null;
  }

  const [, , aa, mm, jj, hh, min] = match;

  return toISO(2000 + Number(aa), Number(mm), Number(jj), Number(hh), Number(min), 0);
}
