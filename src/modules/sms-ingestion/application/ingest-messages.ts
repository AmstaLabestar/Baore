import type { SQLiteDatabase } from "expo-sqlite";

import { decrireTransaction, demandeClassement } from "../domain/describe";
import { empreinteMessage } from "../domain/fingerprint";
import type { CompteKey, ParsedTransaction, RawMessage } from "../domain/types";
import {
  activerCompte,
  chargerComptes,
  enregistrerMessage,
  enregistrerSolde,
  insererTransaction,
  majSoldeCompte,
  messageDejaVu,
  trouverMoisPour,
  trouverParReference,
} from "../infrastructure/ingestion-repository";
import { parseMessage } from "./parse-message";

export interface IngestionResult {
  creees: number;
  dejaVus: number;
  doublons: number;
  erreurs: number;
  nonReconnus: number;
  transactionIds: number[];
}

function resultatVide(): IngestionResult {
  return { creees: 0, dejaVus: 0, doublons: 0, erreurs: 0, nonReconnus: 0, transactionIds: [] };
}

async function resoudreCompte(
  db: SQLiteDatabase,
  comptes: Map<CompteKey, number>,
  cle: CompteKey | null
): Promise<number | null> {
  if (!cle) {
    return null;
  }

  const id = comptes.get(cle) ?? null;

  if (id !== null) {
    await activerCompte(db, id);
  }

  return id;
}

async function ingererUn(
  db: SQLiteDatabase,
  comptes: Map<CompteKey, number>,
  message: RawMessage,
  resultat: IngestionResult
): Promise<void> {
  const empreinte = empreinteMessage(message.sender, message.body, message.receivedAt);
  const recuLe = message.receivedAt?.toISOString() ?? new Date().toISOString();

  // Le rattrapage de la boite de reception relit des messages deja traites.
  if (await messageDejaVu(db, empreinte)) {
    resultat.dejaVus += 1;
    return;
  }

  const analyse = parseMessage(message);

  if (!analyse.ok) {
    // Conserve : un message non reconnu aujourd'hui sert a ecrire le parser manquant.
    await enregistrerMessage(db, {
      corps: message.body,
      empreinte,
      expediteur: message.sender,
      operateur: analyse.operator,
      raison: analyse.reason,
      recuLe,
      statut: analyse.reason === "message_promotionnel" ? "ignore" : "non_reconnu",
      transactionId: null,
    });
    resultat.nonReconnus += 1;
    return;
  }

  const transaction = analyse.transaction;

  if (transaction.reference) {
    const existante = await trouverParReference(db, transaction.operator, transaction.reference);

    if (existante !== null) {
      await enregistrerMessage(db, {
        corps: message.body,
        empreinte,
        expediteur: message.sender,
        operateur: transaction.operator,
        raison: "doublon",
        recuLe,
        statut: "ignore",
        transactionId: existante,
      });
      resultat.doublons += 1;
      return;
    }
  }

  const dateISO = transaction.dateISO ?? recuLe;
  const compteSourceId = await resoudreCompte(db, comptes, transaction.compteSource);
  const compteDestinationId = await resoudreCompte(db, comptes, transaction.compteDestination);

  const transactionId = await insererTransaction(db, {
    categorie: null,
    compteDestinationId,
    compteSourceId,
    contrepartieCode: transaction.contrepartie?.code ?? null,
    contrepartieNom: transaction.contrepartie?.nom ?? null,
    contrepartieNumero: transaction.contrepartie?.numero ?? null,
    contrepartieType: transaction.contrepartie?.type ?? null,
    dateISO,
    description: decrireTransaction(transaction),
    enveloppeType: null,
    fraisCentimes: transaction.fraisCentimes,
    kind: transaction.kind,
    moisId: await trouverMoisPour(db, dateISO),
    montantCentimes: transaction.montantCentimes,
    nature: transaction.nature,
    operateur: transaction.operator,
    reference: transaction.reference,
    statut: demandeClassement(transaction) ? "a_classer" : "classee",
    taxeCentimes: transaction.taxeCentimes,
    totalCentimes: transaction.totalCentimes,
  });

  resultat.transactionIds.push(transactionId);
  resultat.creees += 1;

  await creerLigneDeFrais(db, transaction, dateISO, compteSourceId, resultat);
  await enregistrerSoldes(db, comptes, transaction, transactionId, dateISO);

  await enregistrerMessage(db, {
    corps: message.body,
    empreinte,
    expediteur: message.sender,
    operateur: transaction.operator,
    raison: null,
    recuLe,
    statut: "parse",
    transactionId,
  });
}

/**
 * Les frais sont une depense a part entiere, meme quand l'operation porteuse
 * n'en est pas une : un retrait deplace l'argent sans le consommer, mais les
 * 35 F preleves au passage sortent bel et bien du patrimoine. Sans cette ligne,
 * le cout des retraits reste invisible.
 *
 * La reference derivee evite la collision avec l'index unique de l'operation.
 */
async function creerLigneDeFrais(
  db: SQLiteDatabase,
  transaction: ParsedTransaction,
  dateISO: string,
  compteSourceId: number | null,
  resultat: IngestionResult
): Promise<void> {
  if (!transaction.fraisCentimes || transaction.fraisCentimes <= 0) {
    return;
  }

  const fraisId = await insererTransaction(db, {
    categorie: null,
    compteDestinationId: null,
    compteSourceId,
    contrepartieCode: null,
    contrepartieNom: transaction.contrepartie?.nom ?? null,
    contrepartieNumero: null,
    contrepartieType: "operateur",
    dateISO,
    description: decrireTransaction({ ...transaction, kind: "frais" }),
    enveloppeType: null,
    fraisCentimes: null,
    kind: "frais",
    moisId: await trouverMoisPour(db, dateISO),
    montantCentimes: transaction.fraisCentimes,
    nature: "depense",
    operateur: transaction.operator,
    reference: transaction.reference ? `${transaction.reference}#frais` : null,
    statut: "a_classer",
    taxeCentimes: null,
    totalCentimes: null,
  });

  resultat.transactionIds.push(fraisId);
  resultat.creees += 1;
}

async function enregistrerSoldes(
  db: SQLiteDatabase,
  comptes: Map<CompteKey, number>,
  transaction: ParsedTransaction,
  transactionId: number,
  dateISO: string
): Promise<void> {
  for (const solde of transaction.soldes) {
    const compteId = await resoudreCompte(db, comptes, solde.compte);

    if (compteId === null) {
      continue;
    }

    await enregistrerSolde(db, compteId, transactionId, solde.montantCentimes, dateISO);
    await majSoldeCompte(db, compteId, solde.montantCentimes, dateISO);
  }
}

/**
 * Ingere un lot de messages.
 *
 * Chaque message est traite independamment : un format inattendu ne doit pas
 * faire echouer le rattrapage complet de la boite de reception.
 */
export async function ingestMessages(
  db: SQLiteDatabase,
  messages: RawMessage[]
): Promise<IngestionResult> {
  const resultat = resultatVide();
  const comptes = await chargerComptes(db);

  for (const message of messages) {
    try {
      await ingererUn(db, comptes, message, resultat);
    } catch (error) {
      console.error("Ingestion impossible pour un message:", error);
      resultat.erreurs += 1;
    }
  }

  return resultat;
}
