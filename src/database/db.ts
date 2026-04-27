import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { DATABASE_NAME, DEFAULT_PARAMETRES, SCHEMA_QUERIES } from "./schema";

let databaseInstance: SQLiteDatabase | null = null;
let initializationPromise: Promise<SQLiteDatabase> | null = null;

/** Ouvre la base SQLite de l'application et reutilise la meme instance. */
export async function getDatabase(): Promise<SQLiteDatabase> {
  if (databaseInstance) {
    return databaseInstance;
  }

  databaseInstance = await openDatabaseAsync(DATABASE_NAME, {
    enableChangeListener: true,
  });

  return databaseInstance;
}

/** Cree toutes les tables et indexes necessaires si la base est ouverte pour la premiere fois. */
async function createSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA journal_mode = WAL;");

  for (const query of SCHEMA_QUERIES) {
    await db.execAsync(query);
  }
}

/** Insere les parametres par defaut uniquement s'ils n'existent pas deja. */
async function seedDefaultParametres(db: SQLiteDatabase): Promise<void> {
  for (const parametre of DEFAULT_PARAMETRES) {
    await db.runAsync(
      "INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?);",
      parametre.cle,
      parametre.valeur
    );
  }
}

/** Initialise la base une seule fois pendant le cycle de vie de l'application. */
export async function initializeDatabase(): Promise<SQLiteDatabase> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const db = await getDatabase();

    await createSchema(db);
    await seedDefaultParametres(db);

    return db;
  })();

  return initializationPromise;
}

/** Ferme proprement la connexion SQLite si l'application en a besoin. */
export async function closeDatabase(): Promise<void> {
  if (!databaseInstance) {
    return;
  }

  await databaseInstance.closeAsync();
  databaseInstance = null;
  initializationPromise = null;
}
