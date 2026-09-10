/**
 * Verification de bout en bout : des messages reels jusqu'aux lignes en base.
 *
 * Lance avec `npm run check:ingest`.
 */
import { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../src/database/migrations";
import { ingestMessages } from "../src/modules/sms-ingestion/application/ingest-messages";
import { FIXTURES } from "../src/modules/sms-ingestion/__fixtures__/samples";
import type { RawMessage } from "../src/modules/sms-ingestion/domain/types";
import { adaptSqlite } from "./sqlite-adapter";

let echecs = 0;

function verifie(titre: string, obtenu: unknown, attendu: unknown): void {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  console.log(`${ok ? "OK  " : "KO  "} ${titre}`);

  if (!ok) {
    echecs += 1;
    console.log(`       attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
  }
}

/**
 * Deux messages Moov n'ont aucune date dans leur corps. On leur donne un
 * horodatage de reception explicite pour que le test soit deterministe :
 * c'est exactement ce que fournira la capture SMS.
 */
const HORODATAGES: Record<string, string> = {
  "Moov - achat de credit (le solde baisse malgre le mot \"recu\")": "2026-08-12T08:00:00.000Z",
  "Moov - depot d'argent (sans date ni frais)": "2026-08-05T09:00:00.000Z",
};

function messages(decalageMs = 0): RawMessage[] {
  return FIXTURES.map((fixture) => {
    const horodatage = HORODATAGES[fixture.titre];

    if (!horodatage && decalageMs === 0) {
      return fixture.message;
    }

    const base = horodatage ? new Date(horodatage) : new Date("2026-09-09T12:00:00.000Z");

    return { ...fixture.message, receivedAt: new Date(base.getTime() + decalageMs) };
  });
}

async function main(): Promise<void> {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");
  const db = adaptSqlite(raw);

  await runMigrations(db);
  raw.exec(`
    INSERT INTO mois (id, label, salaire, date_debut, statut)
    VALUES (1, 'aout 2026', 300000, '2026-08-01T00:00:00.000Z', 'en_cours');
  `);

  // --- Premiere ingestion.
  const premier = await ingestMessages(db, messages());

  verifie("transactions creees (11 messages lus + 2 lignes de frais)", premier.creees, 13);
  verifie("messages non reconnus (UBA)", premier.nonReconnus, 1);
  verifie("aucun doublon au premier passage", premier.doublons, 0);
  verifie("aucune erreur", premier.erreurs, 0);

  const parNature = raw
    .prepare("SELECT nature, COUNT(*) AS n, SUM(montant_centimes) AS total FROM transactions GROUP BY nature ORDER BY nature;")
    .all() as Array<{ n: number; nature: string; total: number }>;

  verifie(
    "repartition par nature",
    parNature.map((row) => `${row.nature}:${row.n}`),
    ["depense:7", "revenu:2", "transfert:4"]
  );

  // Le chiffre qui justifie tout le modele : sans la distinction de nature,
  // un parser naif afficherait 41 890 FCFA de depenses au lieu de 3 390.
  const depenses = parNature.find((row) => row.nature === "depense");
  verifie("total des vraies depenses = 5 390 FCFA", depenses?.total, 539000);

  const revenus = parNature.find((row) => row.nature === "revenu");
  verifie("total des revenus = 436 750 FCFA", revenus?.total, 43675000);

  const transferts = parNature.find((row) => row.nature === "transfert");
  verifie("total des transferts = 217 500 FCFA", transferts?.total, 21750000);

  // --- La ligne de frais derivee du retrait.
  const frais = raw
    .prepare("SELECT montant_centimes, nature, reference, statut FROM transactions WHERE kind = 'frais';")
    .all() as Array<{ montant_centimes: number; nature: string; reference: string; statut: string }>;

  verifie("deux lignes de frais (le paiement Moov est a 0)", frais.length, 2);
  verifie("frais du retrait Moov = 35 FCFA", frais[0]?.montant_centimes, 3500);
  verifie("frais du retrait Coris = 1 750 FCFA", frais[1]?.montant_centimes, 175000);
  verifie("les frais sont une depense", frais[0]?.nature, "depense");
  verifie("reference derivee, sans collision", frais[0]?.reference, "DH82HMDOZG#frais");

  // --- Ce qui atterrit dans la file de classement.
  const parStatut = raw
    .prepare("SELECT statut, COUNT(*) AS n FROM transactions GROUP BY statut ORDER BY statut;")
    .all() as Array<{ n: number; statut: string }>;

  verifie(
    "seuls depenses et revenus demandent un classement",
    parStatut.map((row) => `${row.statut}:${row.n}`),
    ["a_classer:9", "classee:4"]
  );

  const rattachees = raw
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE mois_id = 1;")
    .get() as { n: number };
  verifie("les transactions du mois ouvert y sont rattachees", rattachees.n, 10);

  const horsPeriode = raw
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE mois_id IS NULL;")
    .get() as { n: number };
  verifie("les operations de mai restent hors du mois budgetaire", horsPeriode.n, 3);

  // --- Soldes des comptes : le releve le plus recent gagne.
  const soldes = raw
    .prepare("SELECT cle, solde_centimes FROM comptes WHERE solde_constate_le IS NOT NULL ORDER BY cle;")
    .all() as Array<{ cle: string; solde_centimes: number }>;

  verifie(
    "soldes issus du releve le plus recent",
    soldes.map((row) => `${row.cle}:${row.solde_centimes}`),
    ["coris_money:25200", "moov_money:3775", "orange_money_coffre:40000000", "orange_money_normal:3682680"]
  );

  const actifs = raw
    .prepare("SELECT COUNT(*) AS n FROM comptes WHERE actif = 1;")
    .get() as { n: number };
  verifie("Coris s'active, UBA et Wave restent inactifs", actifs.n, 5);

  // --- Rejouer le meme lot : la boite de reception est relue a chaque scan.
  const second = await ingestMessages(db, messages());
  verifie("rien de recree au second passage", second.creees, 0);
  verifie("les 12 messages sont reconnus comme deja vus", second.dejaVus, 12);

  // --- Meme contenu, horodatage different : c'est la reference operateur
  //     qui doit alors empecher le doublon.
  const troisieme = await ingestMessages(db, messages(60_000));
  verifie("aucune transaction creee malgre une empreinte differente", troisieme.creees, 0);
  verifie("11 doublons rattrapes par la reference", troisieme.doublons, 11);

  const totalFinal = raw.prepare("SELECT COUNT(*) AS n FROM transactions;").get() as { n: number };
  verifie("le total reste de 13 transactions", totalFinal.n, 13);

  raw.close();
  console.log(`\n${echecs === 0 ? "Toutes les verifications passent." : `${echecs} verification(s) en echec.`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

void main();
