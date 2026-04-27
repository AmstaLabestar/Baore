import type { SQLiteDatabase } from "expo-sqlite";

import {
  cancelInactivityReminder,
  scheduleInactivityReminder,
  sendEnveloppeAlert,
} from "@/services/notifications";

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

export interface InitializeMoisBudgetInput {
  enveloppes: CreateEnveloppeInput[];
  label?: string;
  moisId: number;
  salaire: number;
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
const ENVELOPPE_LABELS: Record<EnveloppeType, string> = {
  charges: "Charges",
  epargne: "Epargne",
  investissement: "Investissement",
  urgence: "Urgence",
};

/** Compare une date ISO a une autre pour savoir si elles appartiennent au meme mois civil. */
function isSameMonthForQuery(isoDate: string, referenceDate: Date): boolean {
  const parsedDate = new Date(isoDate);

  return (
    parsedDate.getFullYear() === referenceDate.getFullYear() &&
    parsedDate.getMonth() === referenceDate.getMonth()
  );
}

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

/** Calcule si une enveloppe vient juste de franchir le seuil d'alerte ou d'etre epuisee. */
function hasCrossedAlertThreshold(
  before: EnveloppeAvecSolde | null,
  after: EnveloppeAvecSolde,
  seuilAlerte: number
): boolean {
  const thresholdRatio = seuilAlerte / 100;
  const beforeRatio =
    before && before.montant_initial > 0 ? before.montant_restant / before.montant_initial : 1;
  const afterRatio = after.montant_initial > 0 ? after.montant_restant / after.montant_initial : 0;

  const crossedIntoDanger = after.montant_restant <= 0 && (!before || before.montant_restant > 0);
  const crossedIntoWarning =
    after.montant_restant > 0 && afterRatio <= thresholdRatio && (!before || beforeRatio > thresholdRatio);

  return crossedIntoDanger || crossedIntoWarning;
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

/** Retourne le mois associe a une date de reference, ou `null` si aucun mois n'a encore ete cree. */
export async function getMoisPourDate(referenceDate: Date = new Date()): Promise<Mois | null> {
  const mois = await getMois();

  return mois.find((item) => isSameMonthForQuery(item.date_debut, referenceDate)) ?? null;
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

/** Initialise ou reinitialise le budget d'un mois deja cree en y associant salaire et enveloppes. */
export async function initializeMoisBudget(
  input: InitializeMoisBudgetInput
): Promise<{ mois: Mois; enveloppes: Enveloppe[] }> {
  const db = await getInitializedDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE mois
        SET salaire = ?,
            label = COALESCE(?, label),
            statut = 'en_cours'
        WHERE id = ?;
      `,
      input.salaire,
      input.label ?? null,
      input.moisId
    );

    await db.runAsync("DELETE FROM enveloppes WHERE mois_id = ?;", input.moisId);

    for (const enveloppe of input.enveloppes) {
      await db.runAsync(
        `
          INSERT INTO enveloppes (mois_id, type, montant_initial, pourcentage)
          VALUES (?, ?, ?, ?);
        `,
        input.moisId,
        enveloppe.type,
        enveloppe.montantInitial,
        enveloppe.pourcentage
      );
    }
  });

  const mois = await requireMoisById(input.moisId, db);
  const enveloppes = await getEnveloppesByMois(input.moisId);

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
  const previousEnvelope = await getEnveloppeByMoisAndType(input.moisId, input.enveloppeType);

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

  const depense = await requireDepenseById(result.lastInsertRowId, db);

  try {
    const [updatedEnvelope, parametres] = await Promise.all([
      getEnveloppeByMoisAndType(input.moisId, input.enveloppeType),
      getParametresMap(),
    ]);

    if (updatedEnvelope) {
      const seuilAlerte = Number.parseFloat(parametres.seuil_alerte) || 10;
      const pourcentageRestant =
        updatedEnvelope.montant_initial > 0
          ? (updatedEnvelope.montant_restant / updatedEnvelope.montant_initial) * 100
          : 0;

      if (hasCrossedAlertThreshold(previousEnvelope, updatedEnvelope, seuilAlerte)) {
        await sendEnveloppeAlert(
          ENVELOPPE_LABELS[updatedEnvelope.type],
          updatedEnvelope.montant_restant,
          pourcentageRestant
        );
      }
    }

    await cancelInactivityReminder();
    await scheduleInactivityReminder();
  } catch (error) {
    console.error("Erreur lors de l'envoi des notifications locales:", error);
  }

  return depense;
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

/** Retourne les dernieres descriptions uniques les plus recentes pour accelerer la saisie. */
export async function getRecentDescriptions(limit: number = 8): Promise<string[]> {
  const depenses = await getDepenses();
  const descriptions = new Set<string>();

  for (const depense of depenses) {
    const normalizedDescription = depense.description.trim();

    if (!normalizedDescription || descriptions.has(normalizedDescription)) {
      continue;
    }

    descriptions.add(normalizedDescription);

    if (descriptions.size >= limit) {
      break;
    }
  }

  return [...descriptions];
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
