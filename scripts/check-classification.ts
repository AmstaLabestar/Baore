/**
 * Verification de la file de classement, en partant des messages reels.
 *
 * Lance avec `npm run check:classify`.
 */
import { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../src/database/migrations";
import { FIXTURES } from "../src/modules/sms-ingestion/__fixtures__/samples";
import { ingestMessages } from "../src/modules/sms-ingestion/application/ingest-messages";
import {
  construireFile,
  suggerer,
  validerClassement,
} from "../src/modules/classification/application/suggest-classification";
import {
  compterAClasser,
  compterRevenusAConfirmer,
  ignorer,
} from "../src/modules/classification/infrastructure/classification-repository";
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

async function main(): Promise<void> {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");
  const db = adaptSqlite(raw);

  await runMigrations(db);
  await ingestMessages(
    db,
    FIXTURES.map((fixture) => ({
      ...fixture.message,
      receivedAt: fixture.message.receivedAt ?? new Date("2026-09-09T12:00:00.000Z"),
    }))
  );

  verifie("7 depenses a classer", await compterAClasser(db), 7);
  verifie("2 revenus comptes a part", await compterRevenusAConfirmer(db), 2);

  const file = await construireFile(db);
  verifie("la file ne contient que des depenses", [...new Set(file.map((e) => e.transaction.nature))], ["depense"]);

  const parLibelle = new Map(file.map((entree) => [entree.transaction.description, entree.suggestion]));

  verifie(
    "la pharmacie est reconnue par mot-cle",
    parLibelle.get("PHARMACIE UNIVERS SIRIBIE ALIMATA"),
    { categorie: "Sante", enveloppe: "charges", origine: "mot_cle" }
  );
  verifie(
    "la recharge de credit est reconnue",
    parLibelle.get("Recharge de credit"),
    { categorie: "Communication", enveloppe: "charges", origine: "mot_cle" }
  );
  verifie(
    "les frais sont ranges par type d'operation",
    parLibelle.get("Frais - ALEXANDRE SEGUEDA"),
    { categorie: "Autre", enveloppe: "charges", origine: "type_operation" }
  );
  verifie(
    "un marchand inconnu retombe sur le defaut",
    parLibelle.get("INTOUCH BURKINA"),
    { categorie: "Autre", enveloppe: "charges", origine: "defaut" }
  );

  // --- Le choix de l'utilisateur doit primer sur la regle ecrite a l'avance.
  const pharmacie = file.find((entree) => entree.transaction.description.startsWith("PHARMACIE"));

  if (!pharmacie) {
    throw new Error("fixture pharmacie introuvable");
  }

  // Volontairement different de la suggestion (urgence, pas charges).
  const valide = await validerClassement(db, pharmacie.transaction.id, "urgence", "Sante");
  verifie("le classement est enregistre", valide, true);
  verifie("la file se vide d'autant", await compterAClasser(db), 6);

  raw.exec(`
    INSERT INTO transactions (nature, kind, montant_centimes, description, contrepartie_nom, date, source, statut, cree_le)
    VALUES ('depense', 'paiement_marchand', 150000, 'PHARMACIE UNIVERS SIRIBIE ALIMATA',
            'PHARMACIE UNIVERS SIRIBIE ALIMATA', '2026-09-10T09:00:00', 'sms', 'a_classer', '2026-09-10');
  `);

  const nouvelle = (await construireFile(db)).find(
    (entree) => entree.transaction.date === "2026-09-10T09:00:00"
  );

  verifie(
    "la meme contrepartie reprend le choix de l'utilisateur, pas la regle",
    nouvelle?.suggestion,
    { categorie: "Sante", enveloppe: "urgence", origine: "historique" }
  );

  // --- Ecarter une ligne sans la perdre.
  const aEcarter = file.find((entree) => entree.transaction.description === "INTOUCH BURKINA");

  if (!aEcarter) {
    throw new Error("fixture INTOUCH introuvable");
  }

  verifie("une transaction peut etre ecartee", await ignorer(db, aEcarter.transaction.id), true);

  const restante = raw
    .prepare("SELECT statut FROM transactions WHERE id = ?;")
    .get(aEcarter.transaction.id) as { statut: string };
  verifie("elle reste en base, marquee ignoree", restante.statut, "ignoree");

  const total = raw.prepare("SELECT COUNT(*) AS n FROM transactions;").get() as { n: number };
  verifie("aucune transaction n'a ete supprimee", total.n, 14);

  raw.close();
  console.log(`\n${echecs === 0 ? "Toutes les verifications passent." : `${echecs} verification(s) en echec.`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

void main();
