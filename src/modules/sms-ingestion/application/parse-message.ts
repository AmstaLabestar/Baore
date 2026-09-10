import { PARSERS, resolveOperator } from "../infrastructure/parsers";
import type { ParseResult, RawMessage } from "../domain/types";

/**
 * Point d'entree unique de l'ingestion.
 *
 * Volontairement agnostique de la source : le message peut venir d'un SMS
 * entrant, de la boite de reception lors du rattrapage initial, ou plus tard
 * d'une notification. Le contrat reste `{ sender, body, receivedAt }`.
 */
export function parseMessage(message: RawMessage): ParseResult {
  const operator = resolveOperator(message.sender);

  if (!operator) {
    return { ok: false, operator: null, reason: "expediteur_inconnu" };
  }

  const parser = PARSERS[operator];

  if (!parser) {
    return { ok: false, operator, reason: "format_non_reconnu" };
  }

  return parser(message);
}
