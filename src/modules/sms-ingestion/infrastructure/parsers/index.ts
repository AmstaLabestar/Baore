import { stripAccents } from "../../domain/text";
import type { OperatorId, ParseResult, RawMessage } from "../../domain/types";
import { parseCorisMoney } from "./coris-money";
import { parseMoovMoney } from "./moov-money";
import { parseOrangeMoney } from "./orange-money";

export type OperatorParser = (message: RawMessage) => ParseResult;

/**
 * Expediteurs autorises. C'est le seul filtre d'entree : tout SMS dont
 * l'expediteur n'est pas dans cette table est ignore avant meme d'etre lu.
 * Les messages personnels de l'utilisateur ne sont donc jamais analyses.
 */
const SENDER_TO_OPERATOR: Record<string, OperatorId> = {
  CORISMONEY: "coris_money",
  MOOVMONEY: "moov_money",
  ORANGEMONEY: "orange_money",
  UBA: "uba",
  WAVE: "wave",
};

/** "MooV Money", "Moov-Money" et "MOOVMONEY" designent le meme emetteur. */
/**
 * Liste transmise au module natif : il ne remonte que ces expediteurs.
 * Le filtre est applique cote Android, avant meme que le contenu d'un SMS
 * personnel n'atteigne JavaScript.
 */
export const EXPEDITEURS_AUTORISES = Object.keys(SENDER_TO_OPERATOR);

export function normalizeSender(sender: string): string {
  return stripAccents(sender).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveOperator(sender: string): OperatorId | null {
  return SENDER_TO_OPERATOR[normalizeSender(sender)] ?? null;
}

/**
 * Wave et UBA sont declares mais sans parser : leurs formats ne
 * sont pas encore connus. Leurs messages tombent dans la file "non reconnus"
 * au lieu d'etre perdus, et le parser se branche ici sans rien changer d'autre.
 */
export const PARSERS: Partial<Record<OperatorId, OperatorParser>> = {
  coris_money: parseCorisMoney,
  moov_money: parseMoovMoney,
  orange_money: parseOrangeMoney,
};

export const OPERATOR_LABELS: Record<OperatorId, string> = {
  coris_money: "CorisMoney",
  moov_money: "Moov Money",
  orange_money: "Orange Money",
  uba: "UBA",
  wave: "Wave",
};
