import { parseAmountToCentimes } from "../../domain/amount";
import { collapseWhitespace, normalizeForMatching, parseExplicitDate } from "../../domain/text";
import type { ParseResult, ParsedTransaction, RawMessage, SoldeRapporte } from "../../domain/types";

/** Moov ecrit "3 500,00" : espace = milliers, virgule = decimal. */
const CONVENTION = "comma_decimal" as const;

/**
 * Moov emet deux formats : un format etiquete ligne par ligne (paiement,
 * retrait, depot) et un format prose (reception de credit). Les montants y
 * contiennent des espaces de milliers, y compris insecables.
 */
const LABEL_RES = {
  Frais: /Frais\s*:\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i,
  Montant: /Montant\s*:\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i,
  Solde: /Solde\s*:\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i,
  Taxe: /Taxe\s*:\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i,
  Total: /Total\s*:\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i,
} as const;

const SOLDE_PROSE_RE = /Votre\s+solde\s+est\s+de\s*:?\s*([\d.,\u00a0\u202f ]+?)\s*FCFA/i;

/** Moov alterne "TID:" et "Txn ID:", et met "Ref :" en tete du format prose. */
const REFERENCE_RE = /(?:Txn\s*ID|TID|Ref)\s*:\s*([A-Z0-9]+)/i;

const PAIEMENT_RE = /Paiement\s+reussi\s+aupres\s+du\s+marchand\s+(.+?)\s+Montant\s*:/i;
const RETRAIT_RE =
  /Retrait\s+reussi\s+aupres\s+de\s+l'?Agent\s+(.+?)\s+Code\s*d?'?\s*agent\s*:\s*(\w+)/i;
const DEPOT_RE =
  /Depot\s+d'?\s*argent\s+reussi\s+aupres\s+de\s*:?\s*(.+?)\s+Code\s*agent\s*:\s*(\w+)/i;
/**
 * "de credit" change tout : la chaine des soldes montre que le compte est
 * **debite** du montant. C'est un achat de credit telephonique, pas une
 * rentree d'argent, malgre le verbe "recu" employe par l'operateur.
 */
const RECEPTION_RE =
  /Vous\s+avez\s+recu\s+([\d.,\u00a0\u202f ]+?)\s*FCFA(\s+de\s+credit)?\s+du\s+(\d+)/i;

function readLabel(text: string, label: keyof typeof LABEL_RES): number | null {
  return parseAmountToCentimes(text.match(LABEL_RES[label])?.[1], CONVENTION);
}

function readSoldes(text: string): SoldeRapporte[] {
  const montantCentimes =
    readLabel(text, "Solde") ??
    parseAmountToCentimes(text.match(SOLDE_PROSE_RE)?.[1], CONVENTION);

  return montantCentimes === null ? [] : [{ compte: "moov_money", montantCentimes }];
}

type Base = Omit<ParsedTransaction, "kind" | "montantCentimes" | "nature">;

function baseTransaction(text: string, receivedAt?: Date): Base {
  const dateFromMessage = parseExplicitDate(text);

  return {
    compteDestination: null,
    compteSource: null,
    contrepartie: null,
    dateISO: dateFromMessage ?? receivedAt?.toISOString() ?? null,
    dateSource: dateFromMessage || receivedAt ? "message" : null,
    fraisCentimes: readLabel(text, "Frais"),
    operator: "moov_money",
    reference: text.match(REFERENCE_RE)?.[1] ?? null,
    soldes: readSoldes(text),
    taxeCentimes: readLabel(text, "Taxe"),
    totalCentimes: readLabel(text, "Total"),
  };
}

export function parseMoovMoney(message: RawMessage): ParseResult {
  const text = normalizeForMatching(message.body);
  const base = baseTransaction(text, message.receivedAt);
  const montantCentimes = readLabel(text, "Montant");

  const paiement = text.match(PAIEMENT_RE);

  if (paiement && montantCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteSource: "moov_money",
        contrepartie: {
          code: null,
          nom: collapseWhitespace(paiement[1]),
          numero: null,
          type: "marchand",
        },
        kind: "paiement_marchand",
        montantCentimes,
        nature: "depense",
      },
    };
  }

  // Un retrait deplace l'argent vers la poche, il ne le depense pas.
  // Seuls les frais sont une depense reelle : le classement les isolera.
  const retrait = text.match(RETRAIT_RE);

  if (retrait && montantCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: "cash",
        compteSource: "moov_money",
        contrepartie: {
          code: retrait[2],
          nom: collapseWhitespace(retrait[1]),
          numero: null,
          type: "agent",
        },
        kind: "retrait",
        montantCentimes,
        nature: "transfert",
      },
    };
  }

  // Symetrique du retrait : de l'argent deja possede rentre sur le compte.
  const depot = text.match(DEPOT_RE);

  if (depot && montantCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: "moov_money",
        compteSource: "cash",
        contrepartie: {
          code: depot[2],
          nom: collapseWhitespace(depot[1]),
          numero: null,
          type: "agent",
        },
        kind: "depot",
        montantCentimes,
        nature: "transfert",
      },
    };
  }

  const reception = text.match(RECEPTION_RE);
  const recuCentimes = reception ? parseAmountToCentimes(reception[1], CONVENTION) : null;

  if (reception && recuCentimes !== null) {
    const achatDeCredit = Boolean(reception[2]);

    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: achatDeCredit ? null : "moov_money",
        compteSource: achatDeCredit ? "moov_money" : null,
        contrepartie: {
          code: null,
          nom: reception[3],
          numero: reception[3],
          type: achatDeCredit ? "operateur" : "personne",
        },
        kind: achatDeCredit ? "achat_credit" : "reception",
        montantCentimes: recuCentimes,
        nature: achatDeCredit ? "depense" : "revenu",
      },
    };
  }

  return {
    ok: false,
    operator: "moov_money",
    reason: text.length === 0 ? "message_promotionnel" : "format_non_reconnu",
  };
}
