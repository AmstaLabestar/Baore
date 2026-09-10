import type { SQLiteDatabase } from "expo-sqlite";

import type { CompteKey, OperatorId, TransactionKind, TransactionNature } from "../domain/types";

export interface TransactionRow {
  categorie: string | null;
  compteDestinationId: number | null;
  compteSourceId: number | null;
  contrepartieCode: string | null;
  contrepartieNom: string | null;
  contrepartieNumero: string | null;
  contrepartieType: string | null;
  dateISO: string;
  description: string;
  enveloppeType: string | null;
  fraisCentimes: number | null;
  kind: TransactionKind;
  moisId: number | null;
  montantCentimes: number;
  nature: TransactionNature;
  operateur: OperatorId | null;
  reference: string | null;
  statut: "a_classer" | "classee" | "ignoree";
  taxeCentimes: number | null;
  totalCentimes: number | null;
}

export interface MessageRow {
  corps: string;
  empreinte: string;
  expediteur: string;
  operateur: OperatorId | null;
  raison: string | null;
  recuLe: string;
  statut: "parse" | "non_reconnu" | "ignore";
  transactionId: number | null;
}

/** Identifiants des comptes, charges une fois par ingestion. */
export async function chargerComptes(db: SQLiteDatabase): Promise<Map<CompteKey, number>> {
  const rows = await db.getAllAsync<{ cle: string; id: number }>("SELECT id, cle FROM comptes;");

  return new Map(rows.map((row) => [row.cle as CompteKey, row.id]));
}

/** Un compte devient visible des le premier message recu de son operateur. */
export async function activerCompte(db: SQLiteDatabase, compteId: number): Promise<void> {
  await db.runAsync("UPDATE comptes SET actif = 1 WHERE id = ? AND actif = 0;", compteId);
}

export async function messageDejaVu(db: SQLiteDatabase, empreinte: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM messages_bruts WHERE empreinte = ? LIMIT 1;",
    empreinte
  );

  return row !== null;
}

export async function enregistrerMessage(db: SQLiteDatabase, message: MessageRow): Promise<number> {
  const result = await db.runAsync(
    `
      INSERT INTO messages_bruts (expediteur, corps, recu_le, operateur, statut, raison, transaction_id, empreinte)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `,
    message.expediteur,
    message.corps,
    message.recuLe,
    message.operateur,
    message.statut,
    message.raison,
    message.transactionId,
    message.empreinte
  );

  return result.lastInsertRowId;
}

/**
 * La reference operateur est unique par operateur : c'est la garantie qu'un
 * meme SMS relu au rattrapage ne cree pas une seconde transaction.
 */
export async function trouverParReference(
  db: SQLiteDatabase,
  operateur: OperatorId,
  reference: string
): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM transactions WHERE operateur = ? AND reference = ? LIMIT 1;",
    operateur,
    reference
  );

  return row?.id ?? null;
}

export async function insererTransaction(
  db: SQLiteDatabase,
  row: TransactionRow
): Promise<number> {
  const result = await db.runAsync(
    `
      INSERT INTO transactions (
        mois_id, nature, kind, montant_centimes, frais_centimes, taxe_centimes, total_centimes,
        compte_source_id, compte_destination_id, enveloppe_type, categorie, description,
        contrepartie_nom, contrepartie_numero, contrepartie_code, contrepartie_type,
        date, source, operateur, reference, statut, cree_le
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sms', ?, ?, ?, datetime('now'));
    `,
    row.moisId,
    row.nature,
    row.kind,
    row.montantCentimes,
    row.fraisCentimes,
    row.taxeCentimes,
    row.totalCentimes,
    row.compteSourceId,
    row.compteDestinationId,
    row.enveloppeType,
    row.categorie,
    row.description,
    row.contrepartieNom,
    row.contrepartieNumero,
    row.contrepartieCode,
    row.contrepartieType,
    row.dateISO,
    row.operateur,
    row.reference,
    row.statut
  );

  return result.lastInsertRowId;
}

export async function enregistrerSolde(
  db: SQLiteDatabase,
  compteId: number,
  transactionId: number | null,
  soldeCentimes: number,
  constateLe: string
): Promise<void> {
  await db.runAsync(
    `
      INSERT INTO soldes_rapportes (compte_id, transaction_id, solde_centimes, constate_le)
      VALUES (?, ?, ?, ?);
    `,
    compteId,
    transactionId,
    soldeCentimes,
    constateLe
  );
}

/**
 * Le solde affiche suit le dernier releve **le plus recent**, jamais le dernier
 * insere : le rattrapage traite des messages anciens et ne doit pas ecraser un
 * solde a jour par un solde perime.
 */
export async function majSoldeCompte(
  db: SQLiteDatabase,
  compteId: number,
  soldeCentimes: number,
  constateLe: string
): Promise<void> {
  await db.runAsync(
    `
      UPDATE comptes
      SET solde_centimes = ?, solde_constate_le = ?
      WHERE id = ? AND (solde_constate_le IS NULL OR solde_constate_le < ?);
    `,
    soldeCentimes,
    constateLe,
    compteId,
    constateLe
  );
}

/** Rattache la transaction au mois budgetaire ouvert qui la contient, si il existe. */
export async function trouverMoisPour(
  db: SQLiteDatabase,
  dateISO: string
): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id FROM mois
      WHERE statut = 'en_cours' AND date(?) >= date(date_debut)
      ORDER BY date_debut DESC LIMIT 1;
    `,
    dateISO
  );

  return row?.id ?? null;
}
