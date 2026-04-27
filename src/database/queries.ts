import type { SQLiteDatabase } from "expo-sqlite";

import { initializeDatabase } from "./db";
import { DEFAULT_PARAMETRES } from "./schema";

export type StatutMois = "en_cours" | "cloture";
export type EnveloppeType = "charges" | "epargne" | "investissement" | "urgence";
export type ParametreCle =
  | "pct_charges"
  | "pct_epargne"
  | "pct_investissement"
  | "pct_urgence"
  | "seuil_alerte";

export interface Mois {
  id: number;
  label: string;
  salaire: number;
  date_debut: string;
  date_cloture: string | null;
  statut: StatutMois;
}

export interface Enveloppe {
  id: number;
  mois_id: number;
  type: EnveloppeType;
  montant_initial: number;
  pourcentage: number;
}

export interface EnveloppeAvecSolde extends Enveloppe {
  total_depenses: number;
  montant_restant: number;
}

export interface Depense {
  id: number;
  mois_id: number;
  enveloppe_type: EnveloppeType;
  description: string;
  montant: number;
  categorie: string;
  date: string;
  heure: string;
}

export interface Parametre {
  cle: ParametreCle;
  valeur: string;
}

export interface CreateMoisInput {
  label: string;
  salaire: number;
  dateDebut: string;
  dateCloture?: string | null;
  statut?: StatutMois;
}

export interface CreateEnveloppeInput {
  type: EnveloppeType;
  montantInitial: number;
  pourcentage: number;
}

export interface CreateMoisWithEnveloppesInput extends CreateMoisInput {
  enveloppes: CreateEnveloppeInput[];
}

export interface CreateDepenseInput {
  moisId: number;
  enveloppeType: EnveloppeType;
  description: string;
  montant: number;
  categorie: string;
  date: string;
  heure: string;
}

export interface UpdateParametreInput {
  cle: ParametreCle;
  valeur: string;
}

const DEFAULT_PARAMETRE_KEYS = DEFAULT_PARAMETRES.map((item) => item.cle) as ParametreCle[];

/** Retourne une instance de base deja initialisee avant d'executer une requete. */
async function getInitializedDb(): Promise<SQLiteDatabase> {
  return initializeDatabase();
}

/** Relit un mois par son identifiant et leve une erreur si l'enregistrement n'existe pas. */
async function requireMoisById(id: number, db?: SQLiteDatabase): Promise<Mois> {
  const database = db ?? (await getInitializedDb());
  const mois = await database.getFirstAsync<Mois>("SELECT * FROM mois WHERE id = ?;", id);

  if (!mois) {
    throw new Error(`Mois introuvable pour l'identifiant ${id}.`);
  }

  return mois;
}

/** Relit une depense par son identifiant et leve une erreur si l'enregistrement n'existe pas. */
async function requireDepenseById(id: number, db?: SQLiteDatabase): Promise<Depense> {
  const database = db ?? (await getInitializedDb());
  const depense = await database.getFirstAsync<Depense>("SELECT * FROM depenses WHERE id = ?;", id);

  if (!depense) {
    throw new Error(`Depense introuvable pour l'identifiant ${id}.`);
  }

  return depense;
}

/** Retourne le mois actuellement ouvert, ou `null` si aucun mois n'est en cours. */
export async function getMoisEnCours(): Promise<Mois | null> {
  const db = await getInitializedDb();

  return db.getFirstAsync<Mois>(
    `
      SELECT *
      FROM mois
      WHERE statut = 'en_cours'
      ORDER BY date_debut DESC
      LIMIT 1;
    `
  );
}

/** Retourne un mois par son identifiant, ou `null` s'il n'existe pas. */
export async function getMoisById(id: number): Promise<Mois | null> {
  const db = await getInitializedDb();

  return db.getFirstAsync<Mois>("SELECT * FROM mois WHERE id = ?;", id);
}

/** Retourne tous les mois archives ou en cours, du plus recent au plus ancien. */
export async function getMois(): Promise<Mois[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<Mois>(
    `
      SELECT *
      FROM mois
      ORDER BY date_debut DESC, id DESC;
    `
  );
}

/** Cree un nouveau mois budgetaire sans encore alimenter ses enveloppes. */
export async function createMois(input: CreateMoisInput): Promise<Mois> {
  const db = await getInitializedDb();
  const statut = input.statut ?? "en_cours";
  const dateCloture = input.dateCloture ?? null;

  const result = await db.runAsync(
    `
      INSERT INTO mois (label, salaire, date_debut, date_cloture, statut)
      VALUES (?, ?, ?, ?, ?);
    `,
    input.label,
    input.salaire,
    input.dateDebut,
    dateCloture,
    statut
  );

  return requireMoisById(result.lastInsertRowId, db);
}

/** Cree les enveloppes d'un mois en une seule transaction afin de garder les donnees coherentes. */
export async function createEnveloppesForMois(
  moisId: number,
  enveloppes: CreateEnveloppeInput[]
): Promise<Enveloppe[]> {
  const db = await getInitializedDb();

  await db.withTransactionAsync(async () => {
    for (const enveloppe of enveloppes) {
      await db.runAsync(
        `
          INSERT INTO enveloppes (mois_id, type, montant_initial, pourcentage)
          VALUES (?, ?, ?, ?);
        `,
        moisId,
        enveloppe.type,
        enveloppe.montantInitial,
        enveloppe.pourcentage
      );
    }
  });

  return getEnveloppesByMois(moisId);
}

/** Cree un mois et ses enveloppes associees dans la meme sequence d'initialisation. */
export async function createMoisWithEnveloppes(
  input: CreateMoisWithEnveloppesInput
): Promise<{ mois: Mois; enveloppes: Enveloppe[] }> {
  const db = await getInitializedDb();
  let createdMoisId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `
        INSERT INTO mois (label, salaire, date_debut, date_cloture, statut)
        VALUES (?, ?, ?, ?, ?);
      `,
      input.label,
      input.salaire,
      input.dateDebut,
      input.dateCloture ?? null,
      input.statut ?? "en_cours"
    );

    createdMoisId = result.lastInsertRowId;

    for (const enveloppe of input.enveloppes) {
      await db.runAsync(
        `
          INSERT INTO enveloppes (mois_id, type, montant_initial, pourcentage)
          VALUES (?, ?, ?, ?);
        `,
        createdMoisId,
        enveloppe.type,
        enveloppe.montantInitial,
        enveloppe.pourcentage
      );
    }
  });

  const mois = await requireMoisById(createdMoisId, db);
  const enveloppes = await getEnveloppesByMois(createdMoisId);

  return { mois, enveloppes };
}

/** Retourne toutes les enveloppes d'un mois avec les depenses cumulees et le solde restant. */
export async function getEnveloppesByMois(moisId: number): Promise<EnveloppeAvecSolde[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<EnveloppeAvecSolde>(
    `
      SELECT
        e.id,
        e.mois_id,
        e.type,
        e.montant_initial,
        e.pourcentage,
        COALESCE(SUM(d.montant), 0) AS total_depenses,
        e.montant_initial - COALESCE(SUM(d.montant), 0) AS montant_restant
      FROM enveloppes e
      LEFT JOIN depenses d
        ON d.mois_id = e.mois_id
       AND d.enveloppe_type = e.type
      WHERE e.mois_id = ?
      GROUP BY e.id, e.mois_id, e.type, e.montant_initial, e.pourcentage
      ORDER BY e.id ASC;
    `,
    moisId
  );
}

/** Retourne une enveloppe precise d'un mois avec son solde restant calcule. */
export async function getEnveloppeByMoisAndType(
  moisId: number,
  type: EnveloppeType
): Promise<EnveloppeAvecSolde | null> {
  const db = await getInitializedDb();

  return db.getFirstAsync<EnveloppeAvecSolde>(
    `
      SELECT
        e.id,
        e.mois_id,
        e.type,
        e.montant_initial,
        e.pourcentage,
        COALESCE(SUM(d.montant), 0) AS total_depenses,
        e.montant_initial - COALESCE(SUM(d.montant), 0) AS montant_restant
      FROM enveloppes e
      LEFT JOIN depenses d
        ON d.mois_id = e.mois_id
       AND d.enveloppe_type = e.type
      WHERE e.mois_id = ?
        AND e.type = ?
      GROUP BY e.id, e.mois_id, e.type, e.montant_initial, e.pourcentage
      LIMIT 1;
    `,
    moisId,
    type
  );
}

/** Ajoute une depense dans le mois cible et retourne la ligne creee. */
export async function addDepense(input: CreateDepenseInput): Promise<Depense> {
  const db = await getInitializedDb();

  const result = await db.runAsync(
    `
      INSERT INTO depenses (mois_id, enveloppe_type, description, montant, categorie, date, heure)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
    input.moisId,
    input.enveloppeType,
    input.description,
    input.montant,
    input.categorie,
    input.date,
    input.heure
  );

  return requireDepenseById(result.lastInsertRowId, db);
}

/** Retourne l'historique complet des depenses, de la plus recente a la plus ancienne. */
export async function getDepenses(): Promise<Depense[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<Depense>(
    `
      SELECT *
      FROM depenses
      ORDER BY date DESC, heure DESC, id DESC;
    `
  );
}

/** Retourne toutes les depenses d'un mois donne, triees des plus recentes aux plus anciennes. */
export async function getDepensesByMois(moisId: number): Promise<Depense[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<Depense>(
    `
      SELECT *
      FROM depenses
      WHERE mois_id = ?
      ORDER BY date DESC, heure DESC, id DESC;
    `,
    moisId
  );
}

/** Retourne toutes les depenses associees a un type d'enveloppe pour un mois donne. */
export async function getDepensesByMoisAndEnveloppe(
  moisId: number,
  enveloppeType: EnveloppeType
): Promise<Depense[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<Depense>(
    `
      SELECT *
      FROM depenses
      WHERE mois_id = ?
        AND enveloppe_type = ?
      ORDER BY date DESC, heure DESC, id DESC;
    `,
    moisId,
    enveloppeType
  );
}

/** Supprime une depense et indique si une ligne a effectivement ete retiree. */
export async function deleteDepense(id: number): Promise<boolean> {
  const db = await getInitializedDb();
  const result = await db.runAsync("DELETE FROM depenses WHERE id = ?;", id);

  return result.changes > 0;
}

/** Marque un mois comme cloture et renseigne sa date de cloture. */
export async function cloturerMois(
  moisId: number,
  dateCloture: string = new Date().toISOString()
): Promise<Mois> {
  const db = await getInitializedDb();

  await db.runAsync(
    `
      UPDATE mois
      SET statut = 'cloture',
          date_cloture = ?
      WHERE id = ?;
    `,
    dateCloture,
    moisId
  );

  return requireMoisById(moisId, db);
}

/** Retourne tous les parametres de configuration de l'application. */
export async function getParametres(): Promise<Parametre[]> {
  const db = await getInitializedDb();

  return db.getAllAsync<Parametre>(
    `
      SELECT cle, valeur
      FROM parametres
      ORDER BY cle ASC;
    `
  );
}

/** Retourne les parametres sous forme d'objet cle/valeur pour un acces direct dans l'UI. */
export async function getParametresMap(): Promise<Record<ParametreCle, string>> {
  const parametres = await getParametres();

  return DEFAULT_PARAMETRE_KEYS.reduce(
    (acc, cle) => {
      const valeur = parametres.find((parametre) => parametre.cle === cle)?.valeur ?? "";
      acc[cle] = valeur;
      return acc;
    },
    {} as Record<ParametreCle, string>
  );
}

/** Retourne un parametre unique via sa cle, ou `null` s'il n'existe pas. */
export async function getParametre(cle: ParametreCle): Promise<Parametre | null> {
  const db = await getInitializedDb();

  return db.getFirstAsync<Parametre>(
    `
      SELECT cle, valeur
      FROM parametres
      WHERE cle = ?;
    `,
    cle
  );
}

/** Cree ou met a jour un parametre afin de conserver une API simple cote application. */
export async function updateParametre(input: UpdateParametreInput): Promise<Parametre> {
  const db = await getInitializedDb();

  await db.runAsync(
    `
      INSERT INTO parametres (cle, valeur)
      VALUES (?, ?)
      ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur;
    `,
    input.cle,
    input.valeur
  );

  const parametre = await getParametre(input.cle);

  if (!parametre) {
    throw new Error(`Parametre introuvable pour la cle ${input.cle}.`);
  }

  return parametre;
}
