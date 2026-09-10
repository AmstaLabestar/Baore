import type { ParseFailureReason, RawMessage, TransactionKind, TransactionNature } from "../domain/types";

/**
 * Messages reels fournis par l'utilisateur (Burkina Faso, septembre 2026).
 * Numeros et noms conserves tels que transmis : ils servent a verifier que
 * l'extraction de contrepartie fonctionne sur de vraies chaines.
 */
export interface Attendu {
  contrepartie?: string;
  dateISO?: string | null;
  fraisCentimes?: number | null;
  kind?: TransactionKind;
  montantCentimes?: number;
  nature?: TransactionNature;
  reference?: string | null;
  /** Soldes attendus, par compte, en centimes. */
  soldes?: Record<string, number>;
  totalCentimes?: number | null;
}

export interface Fixture {
  attendu: Attendu | { echec: ParseFailureReason };
  message: RawMessage;
  titre: string;
}

export const FIXTURES: Fixture[] = [
  {
    titre: "Orange - envoi de credit a un tiers",
    message: {
      sender: "OrangeMoney",
      body: "Vous avez envoye 250.00 FCFA d unites Orange au numero 67361577. Gagnez 100% de bonus sur toutes vos recharges Orange Money. Bonus valable 7 jours et utilisable vers tous les reseaux nationaux. Votre solde est de 1826.8 FCFA. TRANS ID: RC260908.2040.71377212. Rendez-vous sur Max it : http://urlz.fr/bpmE pour profiter de nos meilleures offres.",
    },
    attendu: {
      contrepartie: "67361577",
      dateISO: "2026-09-08T20:40:00",
      kind: "achat_credit_tiers",
      montantCentimes: 25000,
      nature: "depense",
      reference: "RC260908.2040.71377212",
      soldes: { orange_money_normal: 182680 },
    },
  },
  {
    titre: "Orange - transfert Coffre Fort vers Normal",
    message: {
      sender: "OrangeMoney",
      body: "Vous avez transfere 35,000.00 FCFA vers votre Normal. Solde Normal : 36826.8 FCFA. Solde Coffre Fort:400000.0 FCFA. ID Tran: IR260908.2041.2966407.",
    },
    attendu: {
      dateISO: "2026-09-08T20:41:00",
      kind: "transfert_interne",
      montantCentimes: 3500000,
      nature: "transfert",
      reference: "IR260908.2041.2966407",
      soldes: { orange_money_coffre: 40000000, orange_money_normal: 3682680 },
    },
  },
  {
    titre: "Orange - recharge de son propre credit",
    message: {
      sender: "OrangeMoney",
      body: "Vous avez recharge 105.00 FCFA d unites. Gagnez 100% de bonus sur toutes vos recharges Orange Money. Bonus valable 7 jours et utilisable vers tous les reseaux nationaux. Votre solde est de 2076.8 FCFA. TRANS ID: RC260908.1511.42115894. Rendez-vous sur Max it : http://urlz.fr/bpmE pour profiter de nos meilleures offres.",
    },
    attendu: {
      dateISO: "2026-09-08T15:11:00",
      kind: "achat_credit",
      montantCentimes: 10500,
      nature: "depense",
      reference: "RC260908.1511.42115894",
      soldes: { orange_money_normal: 207680 },
    },
  },
  {
    titre: "Orange - paiement marchand (nom duplique)",
    message: {
      sender: "OrangeMoney",
      body: "Votre paiement de 2,800.00 FCFA a PHARMACIE UNIVERS SIRIBIE ALIMATA PHARMACIE UNIVERS SIRIBIE ALIMATA a ete effectue avec succes. Votre solde est de : 3704.3 Trans id: MP260827.1822.2966897.",
    },
    attendu: {
      contrepartie: "PHARMACIE UNIVERS SIRIBIE ALIMATA",
      dateISO: "2026-08-27T18:22:00",
      kind: "paiement_marchand",
      montantCentimes: 280000,
      nature: "depense",
      reference: "MP260827.1822.2966897",
      soldes: { orange_money_normal: 370430 },
    },
  },
  {
    titre: "Orange - reception avec frais et taxe vides",
    message: {
      sender: "OrangeMoney",
      body: "Vous avez recu 260000.0 FCFA, Frais:  FCFA, Taxe:  FCFA du 64598258,DRAMANE. Le solde de votre compte est de 260257.6 FCFA Trans ID: PP260820.0955.2972248. Flashez le QR CODE marchand avec Max it pour plus de facilite : https://onelink.to/nn64xw",
    },
    attendu: {
      contrepartie: "DRAMANE",
      dateISO: "2026-08-20T09:55:00",
      fraisCentimes: null,
      kind: "reception",
      montantCentimes: 26000000,
      nature: "revenu",
      reference: "PP260820.0955.2972248",
      soldes: { orange_money_normal: 26025760 },
    },
  },
  {
    titre: "UBA - reception (format inconnu, doit tomber en file d'attente)",
    message: {
      sender: "UBA",
      body: `Vous avez recu 20.000F
De Badini loukmane (56489203)
14/08/2026  22:47

+infos: 80001257
Avec UBA
TY7AGVX2BPF3Q2ILQ`,
    },
    attendu: { echec: "format_non_reconnu" },
  },
  {
    titre: "Moov - achat de credit (le solde baisse malgre le mot \"recu\")",
    message: {
      sender: "MooV Money",
      body: "Ref : DHB9HRDXDV, Vous avez recu 250,00 FCFA de credit du 22670321860 via MOOV Money. GAGNEZ 200% de bonus sur toutes vos recharges.Bonus valable 10 jours avec une periode de grace de 10 jours apres expiration. Votre solde est de 37,75 FCFA.",
    },
    attendu: {
      contrepartie: "22670321860",
      dateISO: null,
      kind: "achat_credit",
      montantCentimes: 25000,
      nature: "depense",
      reference: "DHB9HRDXDV",
      soldes: { moov_money: 3775 },
    },
  },
  {
    titre: "Moov - paiement marchand (format etiquete)",
    message: {
      sender: "MooV Money",
      body: `Paiement reussi auprés du marchand INTOUCH BURKINA 
Montant: 200,00 FCFA
Frais: 0,00 FCFA
Total: 200,00 FCFA
Date: 10/08/2026 19:46
TID: DHA2HQM6ME
Solde: 287,75 FCFA`,
    },
    attendu: {
      contrepartie: "INTOUCH BURKINA",
      dateISO: "2026-08-10T19:46:00",
      fraisCentimes: 0,
      kind: "paiement_marchand",
      montantCentimes: 20000,
      nature: "depense",
      reference: "DHA2HQM6ME",
      soldes: { moov_money: 28775 },
      totalCentimes: 20000,
    },
  },
  {
    titre: "Moov - retrait cash chez un agent",
    message: {
      sender: "MooV Money",
      body: `Retrait reussi auprès de l'Agent ALEXANDRE SEGUEDA
Code d'agent: 0029456
Montant: 3 500,00 FCFA 
Frais: 35,00 FCFA
Total: 3 535,00 FCFA
Date: 08/08/2026 18:58:26
Txn ID: DH82HMDOZG
Solde: 487,75 FCFA`,
    },
    attendu: {
      contrepartie: "ALEXANDRE SEGUEDA",
      dateISO: "2026-08-08T18:58:26",
      fraisCentimes: 3500,
      kind: "retrait",
      montantCentimes: 350000,
      nature: "transfert",
      reference: "DH82HMDOZG",
      soldes: { moov_money: 48775 },
      totalCentimes: 353500,
    },
  },
  {
    titre: "Moov - depot d'argent (sans date ni frais)",
    message: {
      sender: "MooV Money",
      body: `Depot d'argent reussi aupres de: Tapsoba Awa
Code agent: 1101381
Montant: 4 000,00 FCFA
TID: DH58HF9XG8
Solde: 4 022,75 FCFA`,
    },
    attendu: {
      contrepartie: "Tapsoba Awa",
      dateISO: null,
      fraisCentimes: null,
      kind: "depot",
      montantCentimes: 400000,
      nature: "transfert",
      reference: "DH58HF9XG8",
      soldes: { moov_money: 402275 },
    },
  },
  {
    titre: "Coris - retrait chez un agent (suffixe F, pas FCFA)",
    message: {
      sender: "CORISMONEY",
      body: "Vous avez effectue un retrait de 175000.0F, Frais : 1750.0F, Total: 176750.0F  aupres de l'agent 8348992 0174 - IMA THOMAS le 30/05/2026 13:30:09. TID: 20265309.WZ8348992.862. Votre solde est de 252.00F",
    },
    attendu: {
      contrepartie: "IMA THOMAS",
      dateISO: "2026-05-30T13:30:09",
      fraisCentimes: 175000,
      kind: "retrait",
      montantCentimes: 17500000,
      nature: "transfert",
      reference: "20265309.WZ8348992.862",
      soldes: { coris_money: 25200 },
      totalCentimes: 17675000,
    },
  },
  {
    titre: "Coris - reception (TID sans deux-points, motif colle au nom)",
    message: {
      sender: "CORISMONEY",
      body: "Vous avez recu 176750.0F  de FOSER Chargementaide2emesession20252026F le 30/05/2026 10:18:59. TID 202653059.HA0001291.306. Votre solde est de 177002.00F. Chargement aide 2eme session 2025 2026 F FAITES VOS RETRAITS AUPRES DES DISTRIBUTEURS CORIS MONEY ET DANS LES GAB CBI. Coris Money, Simple et Cool",
    },
    attendu: {
      contrepartie: "FOSER",
      dateISO: "2026-05-30T10:18:59",
      fraisCentimes: null,
      kind: "reception",
      montantCentimes: 17675000,
      nature: "revenu",
      reference: "202653059.HA0001291.306",
      soldes: { coris_money: 17700200 },
      totalCentimes: null,
    },
  },
];
