import type { ParsedTransaction, TransactionKind } from "./types";

/**
 * Libelle lisible d'une transaction.
 *
 * L'utilisateur doit reconnaitre l'operation d'un coup d'oeil dans la file de
 * classement : "Retrait chez ALEXANDRE SEGUEDA" est actionnable,
 * "retrait 3500" ne l'est pas.
 */
const GABARITS: Record<TransactionKind, (nom: string | null) => string> = {
  achat_credit: () => "Recharge de credit",
  achat_credit_tiers: (nom) => (nom ? `Credit envoye au ${nom}` : "Credit envoye"),
  depot: (nom) => (nom ? `Depot chez ${nom}` : "Depot d'especes"),
  envoi: (nom) => (nom ? `Envoi a ${nom}` : "Envoi d'argent"),
  frais: (nom) => (nom ? `Frais - ${nom}` : "Frais d'operation"),
  paiement_marchand: (nom) => nom ?? "Paiement marchand",
  reception: (nom) => (nom ? `Recu de ${nom}` : "Argent recu"),
  retrait: (nom) => (nom ? `Retrait chez ${nom}` : "Retrait d'especes"),
  saisie_manuelle: (nom) => nom ?? "Depense",
  transfert_interne: () => "Transfert entre comptes",
};

export function decrireTransaction(transaction: ParsedTransaction): string {
  return GABARITS[transaction.kind](transaction.contrepartie?.nom ?? null);
}

/**
 * Un transfert ne consomme aucune enveloppe : il n'a donc rien a classer.
 * Ne mettre dans la file que ce qui appelle une vraie decision evite de
 * transformer le classement en corvee.
 */
export function demandeClassement(transaction: ParsedTransaction): boolean {
  return transaction.nature !== "transfert";
}
