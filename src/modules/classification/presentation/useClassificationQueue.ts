import { useCallback, useEffect, useState } from "react";

import { initializeDatabase } from "@/database/db";
import { notifyBudgetUpdated } from "@/shared/services/budget-events";
import type { EnveloppeType } from "@/shared/types/budget";

import {
  construireFile,
  validerClassement,
  type EntreeFile,
} from "../application/suggest-classification";
import {
  compterRevenusAConfirmer,
  ignorer,
} from "../infrastructure/classification-repository";

interface EtatFile {
  chargement: boolean;
  entrees: EntreeFile[];
  revenusAConfirmer: number;
}

/**
 * Alimente l'ecran de classement.
 *
 * La file est rechargee apres chaque action plutot que mutee localement :
 * valider une contrepartie change la suggestion des lignes suivantes du meme
 * nom, et un etat local ne le refleterait pas.
 */
export function useClassificationQueue() {
  const [etat, setEtat] = useState<EtatFile>({
    chargement: true,
    entrees: [],
    revenusAConfirmer: 0,
  });

  const recharger = useCallback(async () => {
    try {
      const db = await initializeDatabase();
      const [entrees, revenusAConfirmer] = await Promise.all([
        construireFile(db),
        compterRevenusAConfirmer(db),
      ]);

      setEtat({ chargement: false, entrees, revenusAConfirmer });
    } catch (error) {
      console.error("Chargement de la file de classement impossible:", error);
      setEtat((precedent) => ({ ...precedent, chargement: false }));
    }
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const valider = useCallback(
    async (id: number, enveloppe: EnveloppeType, categorie: string) => {
      const db = await initializeDatabase();
      await validerClassement(db, id, enveloppe, categorie);
      // Le classement consomme une enveloppe : les ecrans budgetaires doivent suivre.
      notifyBudgetUpdated();
      await recharger();
    },
    [recharger]
  );

  const ecarter = useCallback(
    async (id: number) => {
      const db = await initializeDatabase();
      await ignorer(db, id);
      await recharger();
    },
    [recharger]
  );

  return { ...etat, ecarter, recharger, valider };
}
