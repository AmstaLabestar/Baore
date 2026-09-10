import type { EnveloppeType } from "../../../shared/types/budget";

/**
 * Suggestion de classement pour une transaction non affectee.
 *
 * Une suggestion n'est jamais appliquee d'office : elle preselectionne un choix
 * que l'utilisateur valide d'un tap. Se tromper en silence coute plus cher que
 * de demander.
 */
export type OrigineSuggestion = "historique" | "mot_cle" | "type_operation" | "defaut";

export interface Suggestion {
  categorie: string;
  enveloppe: EnveloppeType;
  /** Sert a trier la file : ce qui est sur passe vite, le reste demande un choix. */
  origine: OrigineSuggestion;
}

export interface TransactionAClasser {
  contrepartieNom: string | null;
  description: string;
  kind: string;
  nature: string;
}

/**
 * Mots-cles marchands, orientes Burkina Faso.
 * SONABEL (electricite) et ONEA (eau) sont les operateurs nationaux : ce sont
 * des charges recurrentes qu'on veut reconnaitre sans jamais les saisir.
 */
const MOTS_CLES: Array<{ categorie: string; enveloppe: EnveloppeType; motifs: RegExp }> = [
  { categorie: "Sante", enveloppe: "charges", motifs: /PHARMACIE|CLINIQUE|HOPITAL|MEDIC|LABORATOIRE|DOCTEUR|SANTE/i },
  { categorie: "Logement", enveloppe: "charges", motifs: /SONABEL|ONEA|LOYER|IMMOBILIER|ELECTRICITE|BAIL/i },
  { categorie: "Education", enveloppe: "charges", motifs: /ECOLE|UNIVERSITE|LYCEE|SCOLARITE|FORMATION|INSCRIPTION|ETUDIANT/i },
  { categorie: "Transport", enveloppe: "charges", motifs: /STATION|CARBURANT|ESSENCE|TAXI|TRANSPORT|SOTRACO|PETROL|TOTAL\b|SHELL/i },
  { categorie: "Nourriture", enveloppe: "charges", motifs: /ALIMENT|MARCHE|BOULANGERIE|RESTAURANT|SUPERMARCHE|MAQUIS|EPICERIE/i },
  { categorie: "Communication", enveloppe: "charges", motifs: /TELECEL|INTERNET|FORFAIT|UNITES|CREDIT|RECHARGE/i },
  { categorie: "Vetements", enveloppe: "charges", motifs: /FRIPERIE|CHAUSSURE|TAILLEUR|PRET\s*A\s*PORTER|BOUTIQUE/i },
  { categorie: "Loisirs", enveloppe: "charges", motifs: /CINEMA|HOTEL|VOYAGE|LOISIR|SPORT|BAR\b/i },
];

/**
 * Defauts par type d'operation, quand aucun mot-cle ne parle.
 * Les frais d'operateur sont une charge subie : les ranger ailleurs
 * reviendrait a les diluer, alors que l'interet est justement de les voir.
 */
const PAR_TYPE: Record<string, { categorie: string; enveloppe: EnveloppeType }> = {
  achat_credit: { categorie: "Communication", enveloppe: "charges" },
  achat_credit_tiers: { categorie: "Communication", enveloppe: "charges" },
  frais: { categorie: "Autre", enveloppe: "charges" },
};

/** Cherche une suggestion sans consulter l'historique. */
export function suggererDepuisRegles(transaction: TransactionAClasser): Suggestion | null {
  const texte = `${transaction.contrepartieNom ?? ""} ${transaction.description}`;

  for (const regle of MOTS_CLES) {
    if (regle.motifs.test(texte)) {
      return { categorie: regle.categorie, enveloppe: regle.enveloppe, origine: "mot_cle" };
    }
  }

  const parType = PAR_TYPE[transaction.kind];

  if (parType) {
    return { categorie: parType.categorie, enveloppe: parType.enveloppe, origine: "type_operation" };
  }

  return null;
}

/** Repli quand rien n'est reconnu : a l'utilisateur de trancher. */
export function suggestionParDefaut(): Suggestion {
  return { categorie: "Autre", enveloppe: "charges", origine: "defaut" };
}
