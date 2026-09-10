import type { SQLiteDatabase } from "expo-sqlite";

import {
  CREATE_COMPTES_TABLE,
  CREATE_MESSAGES_BRUTS_TABLE,
  CREATE_MULTI_COMPTES_INDEXES,
  CREATE_SOLDES_RAPPORTES_TABLE,
  CREATE_TRANSACTIONS_TABLE,
  DEFAULT_COMPTES,
  SCHEMA_QUERIES,
} from "./schema";

/**
 * Migrations versionnees via `PRAGMA user_version`.
 *
 * Chaque migration doit etre rejouable sans dommage : une base existante
 * demarre a la version 0 et traverse toute la liste, une base neuve aussi.
 */
interface Migration {
  nom: string;
  run: (db: SQLiteDatabase) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    nom: "001-budget-par-enveloppes",
    run: async (db) => {
      for (const query of SCHEMA_QUERIES) {
        await db.execAsync(query);
      }
    },
  },
  {
    nom: "002-multi-comptes-et-transactions",
    run: async (db) => {
      await db.execAsync(CREATE_COMPTES_TABLE);
      await db.execAsync(CREATE_TRANSACTIONS_TABLE);
      await db.execAsync(CREATE_MESSAGES_BRUTS_TABLE);
      await db.execAsync(CREATE_SOLDES_RAPPORTES_TABLE);
      await db.execAsync(CREATE_MULTI_COMPTES_INDEXES);

      for (const compte of DEFAULT_COMPTES) {
        await db.runAsync(
          `
            INSERT OR IGNORE INTO comptes (cle, label, operateur, type, actif, ordre)
            VALUES (?, ?, ?, ?, ?, ?);
          `,
          compte.cle,
          compte.label,
          compte.operateur,
          compte.type,
          compte.actif,
          compte.ordre
        );
      }
    },
  },
];

/**
 * Recopie les depenses historiques dans `transactions`.
 *
 * Appelee a chaque demarrage et non une seule fois a la migration : tant que
 * les ecrans ecrivent encore dans `depenses`, c'est ce qui empeche les deux
 * tables de diverger pendant la periode de bascule.
 *
 * Le compte debite reste inconnu pour ces lignes : l'ancienne saisie manuelle
 * ne le demandait pas, et l'inventer serait une fausse donnee.
 */
export async function syncLegacyDepenses(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(`
    INSERT INTO transactions (
      mois_id, nature, kind, montant_centimes, enveloppe_type, categorie,
      description, date, source, statut, legacy_depense_id, cree_le
    )
    SELECT
      d.mois_id,
      'depense',
      'saisie_manuelle',
      CAST(ROUND(d.montant * 100) AS INTEGER),
      d.enveloppe_type,
      d.categorie,
      d.description,
      d.date,
      'manuelle',
      'classee',
      d.id,
      datetime('now')
    FROM depenses d
    WHERE NOT EXISTS (
      SELECT 1 FROM transactions t WHERE t.legacy_depense_id = d.id
    );
  `);

  return result.changes;
}

async function getUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");

  return row?.user_version ?? 0;
}

/** Applique les migrations manquantes, dans l'ordre, une transaction par migration. */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const version = await getUserVersion(db);

  for (let index = version; index < MIGRATIONS.length; index += 1) {
    const migration = MIGRATIONS[index];

    try {
      await db.withTransactionAsync(async () => {
        await migration.run(db);
      });
      // PRAGMA n'accepte pas de parametre lie : l'entier vient de notre liste,
      // jamais d'une entree utilisateur.
      await db.execAsync(`PRAGMA user_version = ${index + 1};`);
    } catch (error) {
      console.error(`Echec de la migration ${migration.nom}:`, error);
      throw error;
    }
  }
}
