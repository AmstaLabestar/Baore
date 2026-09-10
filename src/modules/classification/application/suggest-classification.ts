import type { SQLiteDatabase } from "expo-sqlite";

import type { EnveloppeType } from "../../../shared/types/budget";
import {
  classementHistorique,
  classer,
  listerAClasser,
  type TransactionEnAttente,
} from "../infrastructure/classification-repository";
import { suggererDepuisRegles, suggestionParDefaut, type Suggestion } from "../domain/suggestion";

export interface EntreeFile {
  suggestion: Suggestion;
  transaction: TransactionEnAttente;
}

/**
 * Ordre de priorite : ce que l'utilisateur a deja decide prime sur toute regle
 * ecrite a l'avance. L'historique passe donc avant les mots-cles.
 */
export async function suggerer(
  db: SQLiteDatabase,
  transaction: TransactionEnAttente
): Promise<Suggestion> {
  if (transaction.contrepartie_nom) {
    const connu = await classementHistorique(db, transaction.contrepartie_nom);

    if (connu) {
      return { categorie: connu.categorie, enveloppe: connu.enveloppe, origine: "historique" };
    }
  }

  const parRegle = suggererDepuisRegles({
    contrepartieNom: transaction.contrepartie_nom,
    description: transaction.description,
    kind: transaction.kind,
    nature: transaction.nature,
  });

  return parRegle ?? suggestionParDefaut();
}

/** Construit la file de classement, chaque ligne accompagnee de sa suggestion. */
export async function construireFile(db: SQLiteDatabase, limite = 50): Promise<EntreeFile[]> {
  const transactions = await listerAClasser(db, limite);
  const entrees: EntreeFile[] = [];

  for (const transaction of transactions) {
    entrees.push({ suggestion: await suggerer(db, transaction), transaction });
  }

  return entrees;
}

/**
 * Valide le classement d'une transaction.
 *
 * Chaque validation nourrit l'historique : la contrepartie suivante du meme nom
 * sera proposee automatiquement, avec l'origine "historique".
 */
export async function validerClassement(
  db: SQLiteDatabase,
  id: number,
  enveloppe: EnveloppeType,
  categorie: string
): Promise<boolean> {
  return classer(db, id, enveloppe, categorie);
}
