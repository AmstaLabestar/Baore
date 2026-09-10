/**
 * Contrat de sortie commun a tous les parsers d'operateurs.
 *
 * Regle d'or : un parser ne decide jamais d'une enveloppe ni d'une categorie.
 * Il traduit un SMS en fait comptable brut et verifiable. Le classement
 * budgetaire est une etape separee, revisable par l'utilisateur.
 */

export type OperatorId = "orange_money" | "moov_money" | "wave" | "coris_money" | "uba";

/**
 * Nature comptable. C'est la distinction qui evite de compter un retrait ou un
 * transfert interne comme une depense (facteur 12 d'erreur sur nos echantillons).
 */
export type TransactionNature = "depense" | "revenu" | "transfert";

export type TransactionKind =
  | "achat_credit"
  | "achat_credit_tiers"
  | "depot"
  | "envoi"
  | "frais"
  | "paiement_marchand"
  | "reception"
  | "retrait"
  | "saisie_manuelle"
  | "transfert_interne";

/** Poches connues. Le compte "cash" est virtuel : il materialise l'argent en poche. */
export type CompteKey =
  | "cash"
  | "coris_money"
  | "moov_money"
  | "orange_money_coffre"
  | "orange_money_normal"
  | "uba"
  | "wave";

export interface SoldeRapporte {
  compte: CompteKey;
  /** Solde apres operation, en centimes. */
  montantCentimes: number;
}

export type ContrepartieType = "agent" | "marchand" | "personne" | "operateur";

export interface Contrepartie {
  /** Identifiant agent/marchand quand l'operateur le fournit. */
  code: string | null;
  nom: string;
  /** Numero de telephone de la contrepartie, quand present. */
  numero: string | null;
  type: ContrepartieType;
}

export interface ParsedTransaction {
  compteDestination: CompteKey | null;
  compteSource: CompteKey | null;
  contrepartie: Contrepartie | null;
  /** Date ISO locale si le message ou la reference permet de la deduire. */
  dateISO: string | null;
  /** D'ou vient la date : le corps du message, la reference, ou rien. */
  dateSource: "message" | "reference" | null;
  fraisCentimes: number | null;
  kind: TransactionKind;
  /** Montant principal, toujours positif. Le sens est porte par `nature`. */
  montantCentimes: number;
  nature: TransactionNature;
  operator: OperatorId;
  /** Reference operateur : sert de cle de deduplication naturelle. */
  reference: string | null;
  soldes: SoldeRapporte[];
  taxeCentimes: number | null;
  /** Total reellement debite quand l'operateur le distingue du montant. */
  totalCentimes: number | null;
}

export type ParseFailureReason =
  | "expediteur_inconnu"
  | "format_non_reconnu"
  | "message_promotionnel";

export type ParseResult =
  | { ok: true; transaction: ParsedTransaction }
  | { ok: false; operator: OperatorId | null; reason: ParseFailureReason };

/** Message brut, indifferent a sa source (SMS ou notification). */
export interface RawMessage {
  /** Horodatage de reception, utilise en dernier recours pour dater. */
  receivedAt?: Date;
  sender: string;
  body: string;
}
