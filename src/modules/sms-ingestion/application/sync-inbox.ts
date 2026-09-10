import type { SQLiteDatabase } from "expo-sqlite";

import type { RawMessage } from "../domain/types";
import { EXPEDITEURS_AUTORISES } from "../infrastructure/parsers";
import { ingestMessages, type IngestionResult } from "./ingest-messages";

/**
 * Source de messages, volontairement abstraite du module natif.
 * Permet de rejouer la synchronisation hors appareil, avec un lecteur simule.
 */
export interface LecteurBoiteReception {
  readInbox(options: {
    limit?: number;
    senders: string[];
    since?: number;
  }): Promise<Array<{ body: string; receivedAt: number; sender: string }>>;
}

/**
 * Recouvrement applique a la reprise.
 *
 * On relit systematiquement les 24 dernieres heures deja traitees : si un scan
 * precedent a ete interrompu, repartir exactement du dernier message connu
 * laisserait un trou definitif. La deduplication rend ce recouvrement gratuit.
 */
const RECOUVREMENT_MS = 24 * 60 * 60 * 1000;

async function dernierMessageTraite(db: SQLiteDatabase): Promise<number | undefined> {
  const row = await db.getFirstAsync<{ dernier: string | null }>(
    "SELECT MAX(recu_le) AS dernier FROM messages_bruts;"
  );

  if (!row?.dernier) {
    return undefined;
  }

  const horodatage = new Date(row.dernier).getTime();

  return Number.isFinite(horodatage) ? Math.max(0, horodatage - RECOUVREMENT_MS) : undefined;
}

/**
 * Rattrape la boite de reception puis ingere ce qui en sort.
 *
 * Au premier lancement, `since` est absent : tout l'historique disponible est
 * lu, ce qui remplit l'application des la premiere ouverture au lieu de la
 * laisser vide pendant des semaines.
 */
export async function synchroniserBoiteReception(
  db: SQLiteDatabase,
  lecteur: LecteurBoiteReception,
  limite = 1000
): Promise<IngestionResult> {
  const since = await dernierMessageTraite(db);

  const bruts = await lecteur.readInbox({
    limit: limite,
    senders: EXPEDITEURS_AUTORISES,
    since,
  });

  const messages: RawMessage[] = bruts.map((brut) => ({
    body: brut.body,
    receivedAt: new Date(brut.receivedAt),
    sender: brut.sender,
  }));

  return ingestMessages(db, messages);
}
