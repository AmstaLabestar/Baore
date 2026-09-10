import { parseAmountToCentimes } from "../../domain/amount";
import {
  collapseRepeatedLabel,
  normalizeForMatching,
  parseDateFromOrangeReference,
} from "../../domain/text";
import type {
  ParseResult,
  ParsedTransaction,
  RawMessage,
  SoldeRapporte,
} from "../../domain/types";

/** Orange ecrit "35,000.00" : virgule = milliers, point = decimal. */
const CONVENTION = "dot_decimal" as const;

/** La meme etiquette existe en trois graphies chez le meme operateur. */
const REFERENCE_RE = /(?:TRANS\s*ID|ID\s*Tran|Trans\s*id)\s*:\s*([A-Z]{2}\d{6}\.\d{4}\.\d+)/i;

const ENVOI_UNITES_RE =
  /Vous\s+avez\s+envoye\s+([\d.,]+)\s*FCFA\s+d\s*'?\s*unites?[^.]*?au\s+numero\s+(\d+)/i;
const RECHARGE_UNITES_RE = /Vous\s+avez\s+recharge\s+([\d.,]+)\s*FCFA\s+d\s*'?\s*unites?/i;
const TRANSFERT_INTERNE_RE =
  /Vous\s+avez\s+transfere\s+([\d.,]+)\s*FCFA\s+vers\s+votre\s+([A-Za-z ]+?)\s*\./i;
const PAIEMENT_RE =
  /Votre\s+paiement\s+de\s+([\d.,]+)\s*FCFA\s+a\s+(.+?)\s+a\s+ete\s+effectue\s+avec\s+succes/i;

/** "Frais:  FCFA" arrive sans valeur : les groupes doivent tolerer le vide. */
const RECEPTION_RE =
  /Vous\s+avez\s+recu\s+([\d.,]+)\s*FCFA(?:\s*,\s*Frais\s*:\s*([\d.,]*)\s*FCFA)?(?:\s*,\s*Taxe\s*:\s*([\d.,]*)\s*FCFA)?\s*du\s+(\d+)\s*,?\s*([^.]*?)\s*(?:\.|Le\s+solde|Trans|$)/i;

const SOLDE_PATTERNS: Array<{ compte: SoldeRapporte["compte"]; re: RegExp }> = [
  { compte: "orange_money_coffre", re: /Solde\s+Coffre\s+Fort\s*:\s*([\d.,]+)/i },
  { compte: "orange_money_normal", re: /Solde\s+Normal\s*:\s*([\d.,]+)/i },
  { compte: "orange_money_normal", re: /Le\s+solde\s+de\s+votre\s+compte\s+est\s+de\s*:?\s*([\d.,]+)/i },
  { compte: "orange_money_normal", re: /Votre\s+solde\s+est\s+de\s*:?\s*([\d.,]+)/i },
];

function readSoldes(text: string): SoldeRapporte[] {
  const soldes: SoldeRapporte[] = [];

  for (const { compte, re } of SOLDE_PATTERNS) {
    if (soldes.some((solde) => solde.compte === compte)) {
      continue;
    }

    const montantCentimes = parseAmountToCentimes(text.match(re)?.[1], CONVENTION);

    if (montantCentimes !== null) {
      soldes.push({ compte, montantCentimes });
    }
  }

  return soldes;
}

type Base = Omit<ParsedTransaction, "kind" | "montantCentimes" | "nature">;

function baseTransaction(text: string, receivedAt?: Date): Base {
  const reference = text.match(REFERENCE_RE)?.[1] ?? null;
  const dateFromRef = reference ? parseDateFromOrangeReference(reference) : null;

  return {
    compteDestination: null,
    compteSource: null,
    contrepartie: null,
    dateISO: dateFromRef ?? receivedAt?.toISOString() ?? null,
    dateSource: dateFromRef ? "reference" : receivedAt ? "message" : null,
    fraisCentimes: null,
    operator: "orange_money",
    reference,
    soldes: readSoldes(text),
    taxeCentimes: null,
    totalCentimes: null,
  };
}

export function parseOrangeMoney(message: RawMessage): ParseResult {
  const text = normalizeForMatching(message.body);
  const base = baseTransaction(text, message.receivedAt);

  // Achat de credit telephonique pour un tiers : depense, pas un transfert.
  const envoi = text.match(ENVOI_UNITES_RE);
  const envoiCentimes = envoi ? parseAmountToCentimes(envoi[1], CONVENTION) : null;

  if (envoi && envoiCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteSource: "orange_money_normal",
        contrepartie: { code: null, nom: envoi[2], numero: envoi[2], type: "personne" },
        kind: "achat_credit_tiers",
        montantCentimes: envoiCentimes,
        nature: "depense",
      },
    };
  }

  const recharge = text.match(RECHARGE_UNITES_RE);
  const rechargeCentimes = recharge ? parseAmountToCentimes(recharge[1], CONVENTION) : null;

  if (recharge && rechargeCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteSource: "orange_money_normal",
        contrepartie: { code: null, nom: "Recharge de credit", numero: null, type: "operateur" },
        kind: "achat_credit",
        montantCentimes: rechargeCentimes,
        nature: "depense",
      },
    };
  }

  // Mouvement entre deux poches du meme utilisateur : l'argent ne sort pas.
  const transfert = text.match(TRANSFERT_INTERNE_RE);
  const transfertCentimes = transfert ? parseAmountToCentimes(transfert[1], CONVENTION) : null;

  if (transfert && transfertCentimes !== null) {
    const versCoffre = /coffre/i.test(transfert[2]);

    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: versCoffre ? "orange_money_coffre" : "orange_money_normal",
        compteSource: versCoffre ? "orange_money_normal" : "orange_money_coffre",
        kind: "transfert_interne",
        montantCentimes: transfertCentimes,
        nature: "transfert",
      },
    };
  }

  const paiement = text.match(PAIEMENT_RE);
  const paiementCentimes = paiement ? parseAmountToCentimes(paiement[1], CONVENTION) : null;

  if (paiement && paiementCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteSource: "orange_money_normal",
        // Orange repete le nom du marchand deux fois dans le meme champ.
        contrepartie: {
          code: null,
          nom: collapseRepeatedLabel(paiement[2]),
          numero: null,
          type: "marchand",
        },
        kind: "paiement_marchand",
        montantCentimes: paiementCentimes,
        nature: "depense",
      },
    };
  }

  const reception = text.match(RECEPTION_RE);
  const receptionCentimes = reception ? parseAmountToCentimes(reception[1], CONVENTION) : null;

  if (reception && receptionCentimes !== null) {
    const nom = reception[5]?.trim();

    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: "orange_money_normal",
        contrepartie: {
          code: null,
          nom: nom || reception[4],
          numero: reception[4],
          type: "personne",
        },
        fraisCentimes: parseAmountToCentimes(reception[2], CONVENTION),
        kind: "reception",
        montantCentimes: receptionCentimes,
        nature: "revenu",
        taxeCentimes: parseAmountToCentimes(reception[3], CONVENTION),
      },
    };
  }

  // Un message dont il ne reste rien apres retrait de la promo etait une pub.
  return {
    ok: false,
    operator: "orange_money",
    reason: text.length === 0 ? "message_promotionnel" : "format_non_reconnu",
  };
}
