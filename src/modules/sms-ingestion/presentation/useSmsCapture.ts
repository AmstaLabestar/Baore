import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { initializeDatabase } from "@/database/db";
import { notifyBudgetUpdated } from "@/shared/services/budget-events";
import {
  estDisponible,
  getPermissionStatus,
  readInbox,
  requestPermissions,
  startListening,
} from "@native/sms-reader";

import { ingestMessages } from "../application/ingest-messages";
import { synchroniserBoiteReception } from "../application/sync-inbox";
import { EXPEDITEURS_AUTORISES } from "../infrastructure/parsers";

export interface EtatCapture {
  autorise: boolean;
  disponible: boolean;
  derniereSynchro: Date | null;
  enCours: boolean;
  nouvelles: number;
}

/**
 * Pilote la capture des SMS d'operateurs.
 *
 * La boite de reception est rebalayee a chaque retour au premier plan plutot
 * que surveillee en continu : les SMS restent sur le telephone, donc rien ne se
 * perd, et l'application n'a besoin d'aucun service en arriere-plan.
 * L'ecoute temps reel ne sert qu'au confort pendant que l'ecran est ouvert.
 */
export function useSmsCapture() {
  const [etat, setEtat] = useState<EtatCapture>({
    autorise: false,
    derniereSynchro: null,
    disponible: estDisponible,
    enCours: false,
    nouvelles: 0,
  });
  const synchroEnCours = useRef(false);

  const rafraichirPermission = useCallback(() => {
    const statut = getPermissionStatus();
    setEtat((precedent) => ({ ...precedent, autorise: statut.canRead }));

    return statut.canRead;
  }, []);

  const synchroniser = useCallback(async () => {
    // Un retour au premier plan pendant un scan ne doit pas en lancer un second.
    if (synchroEnCours.current || !estDisponible || !getPermissionStatus().canRead) {
      return;
    }

    synchroEnCours.current = true;
    setEtat((precedent) => ({ ...precedent, enCours: true }));

    try {
      const db = await initializeDatabase();
      const resultat = await synchroniserBoiteReception(db, { readInbox });

      if (resultat.creees > 0) {
        notifyBudgetUpdated();
      }

      setEtat((precedent) => ({
        ...precedent,
        derniereSynchro: new Date(),
        enCours: false,
        nouvelles: resultat.creees,
      }));
    } catch (error) {
      console.error("Synchronisation des SMS impossible:", error);
      setEtat((precedent) => ({ ...precedent, enCours: false }));
    } finally {
      synchroEnCours.current = false;
    }
  }, []);

  const demanderAutorisation = useCallback(async () => {
    const accorde = await requestPermissions();
    rafraichirPermission();

    if (accorde) {
      await synchroniser();
    }

    return accorde;
  }, [rafraichirPermission, synchroniser]);

  useEffect(() => {
    if (!estDisponible) {
      return;
    }

    if (rafraichirPermission()) {
      void synchroniser();
    }

    const abonnement = AppState.addEventListener("change", (statut) => {
      if (statut === "active" && rafraichirPermission()) {
        void synchroniser();
      }
    });

    return () => abonnement.remove();
  }, [rafraichirPermission, synchroniser]);

  // Ecoute temps reel, active uniquement tant que l'ecran est monte.
  useEffect(() => {
    if (!estDisponible || !etat.autorise) {
      return;
    }

    return startListening(EXPEDITEURS_AUTORISES, (message) => {
      void (async () => {
        try {
          const db = await initializeDatabase();
          const resultat = await ingestMessages(db, [
            {
              body: message.body,
              receivedAt: new Date(message.receivedAt),
              sender: message.sender,
            },
          ]);

          if (resultat.creees > 0) {
            notifyBudgetUpdated();
            setEtat((precedent) => ({ ...precedent, nouvelles: precedent.nouvelles + resultat.creees }));
          }
        } catch (error) {
          console.error("Ingestion du SMS entrant impossible:", error);
        }
      })();
    });
  }, [etat.autorise]);

  return { ...etat, demanderAutorisation, synchroniser };
}
