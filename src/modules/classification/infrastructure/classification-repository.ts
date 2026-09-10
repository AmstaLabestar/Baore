import type { SQLiteDatabase } from "expo-sqlite";

import type { EnveloppeType } from "../../../shared/types/budget";

export interface TransactionEnAttente {
  contrepartie_nom: string | null;
  date: string;
  description: string;
  id: number;
  kind: string;
  montant_centimes: number;
  nature: string;
  operateur: string | null;
}

/**
 * File de classement : uniquement les depenses.
 *
 * Un revenu ne consomme aucune enveloppe : lui en proposer une n'aurait pas de
 * sens. Les revenus relevent d'une decision differente ("faut-il l'ajouter au
 * budget du mois ?") et sont comptes a part.
 *
 * Les plus recentes d'abord, parce que l'utilisateur s'en souvient encore.
 */
export async function listerAClasser(
  db: SQLiteDatabase,
  limite = 50
): Promise<TransactionEnAttente[]> {
  return db.getAllAsync<TransactionEnAttente>(
    `
      SELECT id, nature, kind, montant_centimes, description, contrepartie_nom, date, operateur
      FROM transactions
      WHERE statut = 'a_classer' AND nature = 'depense'
      ORDER BY date DESC
      LIMIT ?;
    `,
    limite
  );
}

export async function compterAClasser(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM transactions WHERE statut = 'a_classer' AND nature = 'depense';"
  );

  return row?.n ?? 0;
}

/** Revenus captes en attente de confirmation : un flux distinct du classement. */
export async function compterRevenusAConfirmer(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM transactions WHERE statut = 'a_classer' AND nature = 'revenu';"
  );

  return row?.n ?? 0;
}

/**
 * Retrouve comment une contrepartie a deja ete classee.
 *
 * C'est la regle la plus fiable : elle vient des choix reels de l'utilisateur
 * et se renforce a chaque usage, la ou une liste de mots-cles reste figee.
 */
export async function classementHistorique(
  db: SQLiteDatabase,
  contrepartieNom: string
): Promise<{ categorie: string; enveloppe: EnveloppeType } | null> {
  const row = await db.getFirstAsync<{ categorie: string; enveloppe_type: EnveloppeType }>(
    `
      SELECT categorie, enveloppe_type
      FROM transactions
      WHERE statut = 'classee'
        AND contrepartie_nom = ?
        AND enveloppe_type IS NOT NULL
        AND categorie IS NOT NULL
      GROUP BY enveloppe_type, categorie
      ORDER BY COUNT(*) DESC, MAX(date) DESC
      LIMIT 1;
    `,
    contrepartieNom
  );

  return row ? { categorie: row.categorie, enveloppe: row.enveloppe_type } : null;
}

/** Affecte une transaction a une enveloppe et la sort de la file. */
export async function classer(
  db: SQLiteDatabase,
  id: number,
  enveloppe: EnveloppeType,
  categorie: string
): Promise<boolean> {
  const result = await db.runAsync(
    `
      UPDATE transactions
      SET enveloppe_type = ?, categorie = ?, statut = 'classee'
      WHERE id = ? AND statut = 'a_classer';
    `,
    enveloppe,
    categorie,
    id
  );

  return result.changes > 0;
}

/**
 * Ecarte une transaction sans la supprimer.
 *
 * Sert aux mouvements qui ne relevent d'aucune enveloppe (un remboursement
 * entre amis, par exemple). La ligne reste dans l'historique des comptes.
 */
export async function ignorer(db: SQLiteDatabase, id: number): Promise<boolean> {
  const result = await db.runAsync(
    "UPDATE transactions SET statut = 'ignoree' WHERE id = ? AND statut = 'a_classer';",
    id
  );

  return result.changes > 0;
}
