import type { DatabaseSync } from "node:sqlite";
import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Expose l'API asynchrone d'expo-sqlite au-dessus de `node:sqlite`, pour
 * pouvoir executer le vrai code de persistance hors de l'appareil.
 *
 * Les deux s'appuient sur le meme moteur SQLite : ce qui est verifie ici est
 * le SQL reel de l'application, pas une reecriture.
 */
export function adaptSqlite(db: DatabaseSync): SQLiteDatabase {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as never[])),
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      db.prepare(sql).get(...(params as never[])) ?? null,
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = db.prepare(sql).run(...(params as never[]));

      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      db.exec("BEGIN;");

      try {
        await task();
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
}
