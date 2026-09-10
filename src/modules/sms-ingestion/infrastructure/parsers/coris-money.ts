import { parseAmountToCentimes } from "../../domain/amount";
import { collapseWhitespace, normalizeForMatching, parseExplicitDate } from "../../domain/text";
import type { ParseResult, ParsedTransaction, RawMessage, SoldeRapporte } from "../../domain/types";

/** Coris ecrit "175000.0F" : point decimal, et le suffixe est "F", pas "FCFA". */
const CONVENTION = "dot_decimal" as const;

/** "TID:" dans un message, "TID " sans deux-points dans l'autre. */
const REFERENCE_RE = /TID\s*:?\s*([\w.]*\w)/i;
const SOLDE_RE = /Votre\s+solde\s+est\s+de\s*:?\s*([\d.,]+)\s*F/i;
const FRAIS_RE = /Frais\s*:\s*([\d.,]+)\s*F/i;
const TOTAL_RE = /Total\s*:\s*([\d.,]+)\s*F/i;

const RETRAIT_RE = /Vous\s+avez\s+effectue\s+un\s+retrait\s+de\s+([\d.,]+)\s*F/i;
const AGENT_RE = /aupres\s+de\s+l'?agent\s+(.+?)\s*-\s*(.+?)\s+le\s+\d{2}\/\d{2}\/\d{4}/i;
const RECEPTION_RE = /Vous\s+avez\s+recu\s+([\d.,]+)\s*F\s+de\s+(.+?)\s+le\s+\d{2}\/\d{2}\/\d{4}/i;

/**
 * Coris accole le motif du virement au nom de l'emetteur, sans separateur :
 * "FOSER Chargementaide2emesession20252026F". Un bloc sans espace de cette
 * longueur n'est pas un nom : on le retire pour garder un libelle lisible.
 */
function nomEmetteur(brut: string): string {
  const tokens = collapseWhitespace(brut).split(" ").filter(Boolean);
  const lisibles = tokens.filter((token) => token.length < 20);

  return (lisibles.length > 0 ? lisibles : tokens).join(" ");
}

function readSoldes(text: string): SoldeRapporte[] {
  const montantCentimes = parseAmountToCentimes(text.match(SOLDE_RE)?.[1], CONVENTION);

  return montantCentimes === null ? [] : [{ compte: "coris_money", montantCentimes }];
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
    fraisCentimes: parseAmountToCentimes(text.match(FRAIS_RE)?.[1], CONVENTION),
    operator: "coris_money",
    reference: text.match(REFERENCE_RE)?.[1] ?? null,
    soldes: readSoldes(text),
    taxeCentimes: null,
    totalCentimes: parseAmountToCentimes(text.match(TOTAL_RE)?.[1], CONVENTION),
  };
}

export function parseCorisMoney(message: RawMessage): ParseResult {
  const text = normalizeForMatching(message.body);
  const base = baseTransaction(text, message.receivedAt);

  // Un retrait deplace l'argent vers la poche : seuls les frais sont depenses.
  const retrait = text.match(RETRAIT_RE);
  const retraitCentimes = retrait ? parseAmountToCentimes(retrait[1], CONVENTION) : null;

  if (retrait && retraitCentimes !== null) {
    const agent = text.match(AGENT_RE);

    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: "cash",
        compteSource: "coris_money",
        contrepartie: agent
          ? { code: collapseWhitespace(agent[1]), nom: collapseWhitespace(agent[2]), numero: null, type: "agent" }
          : null,
        kind: "retrait",
        montantCentimes: retraitCentimes,
        nature: "transfert",
      },
    };
  }

  const reception = text.match(RECEPTION_RE);
  const receptionCentimes = reception ? parseAmountToCentimes(reception[1], CONVENTION) : null;

  if (reception && receptionCentimes !== null) {
    return {
      ok: true,
      transaction: {
        ...base,
        compteDestination: "coris_money",
        contrepartie: { code: null, nom: nomEmetteur(reception[2]), numero: null, type: "personne" },
        kind: "reception",
        montantCentimes: receptionCentimes,
        nature: "revenu",
      },
    };
  }

  return {
    ok: false,
    operator: "coris_money",
    reason: text.length === 0 ? "message_promotionnel" : "format_non_reconnu",
  };
}
