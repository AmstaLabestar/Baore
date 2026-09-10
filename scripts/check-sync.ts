/**
 * Verification du rattrapage de la boite de reception.
 *
 * Le module natif est remplace par un lecteur simule : ce qui est teste ici,
 * c'est la logique de reprise (depuis quand relire, et que faire des doublons).
 *
 * Lance avec `npm run check:sync`.
 */
import { DatabaseSync } from "node:sqlite";

import { runMigrations } from "../src/database/migrations";
import { FIXTURES } from "../src/modules/sms-ingestion/__fixtures__/samples";
import {
  synchroniserBoiteReception,
  type LecteurBoiteReception,
} from "../src/modules/sms-ingestion/application/sync-inbox";
import { EXPEDITEURS_AUTORISES } from "../src/modules/sms-ingestion/infrastructure/parsers";
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

const BASE = new Date("2026-09-01T08:00:00.000Z").getTime();

/** Boite de reception simulee : les 12 messages reels, espaces d'une heure. */
const INBOX = FIXTURES.map((fixture, index) => ({
  body: fixture.message.body,
  receivedAt: BASE + index * 3_600_000,
  sender: fixture.message.sender,
}));

interface Appel {
  senders: string[];
  since?: number;
}

function lecteurSimule(messages: typeof INBOX, appels: Appel[]): LecteurBoiteReception {
  return {
    readInbox: async (options) => {
      appels.push({ senders: options.senders, since: options.since });

      return messages.filter((message) =>
        options.since === undefined ? true : message.receivedAt > options.since
      );
    },
  };
}

async function main(): Promise<void> {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");
  const db = adaptSqlite(raw);
  await runMigrations(db);

  const appels: Appel[] = [];

  // --- Premier lancement : aucun repere, tout l'historique est lu.
  const premier = await synchroniserBoiteReception(db, lecteurSimule(INBOX, appels));

  verifie("le premier scan ne borne pas la date", appels[0]?.since, undefined);
  verifie(
    "seuls les expediteurs declares sont demandes au natif",
    [...appels[0].senders].sort(),
    [...EXPEDITEURS_AUTORISES].sort()
  );
  verifie("13 transactions creees au rattrapage", premier.creees, 13);
  verifie("le message UBA reste en file d'attente", premier.nonReconnus, 1);

  // --- Deuxieme scan sans nouveau message.
  const deuxieme = await synchroniserBoiteReception(db, lecteurSimule(INBOX, appels));

  verifie("le second scan borne la date", typeof appels[1]?.since, "number");
  verifie("aucune transaction recreee", deuxieme.creees, 0);

  // Le recouvrement de 24 h fait relire des messages deja traites : ils doivent
  // etre reconnus, pas rejoues.
  verifie("les messages relus sont reconnus", deuxieme.dejaVus > 0, true);

  // --- Un nouveau message arrive apres le dernier scan.
  const nouveau = {
    body: "Votre paiement de 1,500.00 FCFA a STATION TOTAL OUAGA a ete effectue avec succes. Votre solde est de 2204.3 Trans id: MP260915.0930.2966999.",
    receivedAt: new Date("2026-09-15T09:30:00.000Z").getTime(),
    sender: "OrangeMoney",
  };

  const troisieme = await synchroniserBoiteReception(db, lecteurSimule([...INBOX, nouveau], appels));

  verifie("le nouveau message est ingere", troisieme.creees, 1);

  const derniere = raw
    .prepare("SELECT description, montant_centimes FROM transactions ORDER BY id DESC LIMIT 1;")
    .get() as { description: string; montant_centimes: number };

  verifie("libelle du nouveau paiement", derniere.description, "STATION TOTAL OUAGA");
  verifie("montant du nouveau paiement", derniere.montant_centimes, 150000);

  const total = raw.prepare("SELECT COUNT(*) AS n FROM transactions;").get() as { n: number };
  verifie("14 transactions au total", total.n, 14);

  raw.close();
  console.log(`\n${echecs === 0 ? "Toutes les verifications passent." : `${echecs} verification(s) en echec.`}`);
  process.exit(echecs === 0 ? 0 : 1);
}

void main();
