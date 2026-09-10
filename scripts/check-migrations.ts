/**
 * Verification des migrations contre un vrai moteur SQLite.
 *
 * On execute le code de migration reel (`runMigrations`, `syncLegacyDepenses`)
 * via un adaptateur minimal au-dessus de `node:sqlite`, plutot qu'une copie du
 * SQL : une migration testee sur une copie ne prouve rien sur celle qui tourne.
 *
 * Lance avec `npm run check:db`.
 */
import { DatabaseSync } from "node:sqlite";

import { runMigrations, syncLegacyDepenses } from "../src/database/migrations";
import { SCHEMA_QUERIES } from "../src/database/schema";
import { adaptSqlite } from "./sqlite-adapter";

let echecs = 0;

function verifie(titre: string, condition: boolean, detail?: string): void {
  console.log(`${condition ? "OK  " : "KO  "} ${titre}`);

  if (!condition) {
    echecs += 1;

    if (detail) {
      console.log(`       ${detail}`);
    }
  }
}

function lance(titre: string, action: () => void, doitEchouer: boolean): void {
  let aEchoue = false;

  try {
    action();
  } catch {
    aEchoue = true;
  }

  verifie(titre, aEchoue === doitEchouer, doitEchouer ? "aucune erreur levee" : "erreur levee");
}

async function main(): Promise<void> {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");
  const db = adaptSqlite(raw);

  // --- Une installation existante : ancien schema, donnees reelles, version 0.
  for (const query of SCHEMA_QUERIES) {
    raw.exec(query);
  }

  raw.exec(`
    INSERT INTO mois (id, label, salaire, date_debut, statut)
    VALUES (1, 'septembre 2026', 250000, '2026-09-01T00:00:00.000Z', 'en_cours');
    INSERT INTO enveloppes (mois_id, type, montant_initial, pourcentage)
    VALUES (1, 'charges', 125000, 50), (1, 'epargne', 50000, 20);
    INSERT INTO depenses (mois_id, enveloppe_type, description, montant, categorie, date, heure)
    VALUES
      (1, 'charges', 'Pharmacie', 2800.5, 'Sante', '2026-09-02T10:00:00.000Z', '10:00'),
      (1, 'charges', 'Taxi', 105.7, 'Transport', '2026-09-03T08:30:00.000Z', '08:30'),
      (1, 'epargne', 'Mise de cote', 15000, 'Epargne', '2026-09-04T20:00:00.000Z', '20:00');
  `);
  raw.exec("PRAGMA user_version = 0;");

  await runMigrations(db);

  const version = raw.prepare("PRAGMA user_version;").get() as { user_version: number };
  verifie("user_version passe a 2", version.user_version === 2, `obtenu ${version.user_version}`);

  const tables = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
    .all()
    .map((row) => (row as { name: string }).name);

  for (const attendue of ["comptes", "messages_bruts", "soldes_rapportes", "transactions"]) {
    verifie(`table ${attendue} creee`, tables.includes(attendue), tables.join(", "));
  }

  const comptes = raw.prepare("SELECT COUNT(*) AS n FROM comptes;").get() as { n: number };
  verifie("7 comptes connus semes", comptes.n === 7, `obtenu ${comptes.n}`);

  const depensesConservees = raw.prepare("SELECT COUNT(*) AS n FROM depenses;").get() as { n: number };
  verifie("les depenses d'origine sont intactes", depensesConservees.n === 3, `obtenu ${depensesConservees.n}`);

  // --- Recopie des donnees historiques.
  const copiees = await syncLegacyDepenses(db);
  verifie("3 depenses recopiees en transactions", copiees === 3, `obtenu ${copiees}`);

  const montants = raw
    .prepare("SELECT description, montant_centimes FROM transactions ORDER BY id;")
    .all() as Array<{ description: string; montant_centimes: number }>;

  verifie(
    "2800.5 converti en 280050 centimes",
    montants[0]?.montant_centimes === 280050,
    `obtenu ${montants[0]?.montant_centimes}`
  );
  verifie(
    "105.7 converti en 10570 centimes (pas de derive flottante)",
    montants[1]?.montant_centimes === 10570,
    `obtenu ${montants[1]?.montant_centimes}`
  );
  verifie(
    "15000 converti en 1500000 centimes",
    montants[2]?.montant_centimes === 1500000,
    `obtenu ${montants[2]?.montant_centimes}`
  );

  const classees = raw
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE statut = 'classee' AND enveloppe_type IS NOT NULL;")
    .get() as { n: number };
  verifie("les lignes migrees gardent leur enveloppe", classees.n === 3, `obtenu ${classees.n}`);

  // --- Rejouer ne doit rien dupliquer : c'est ce qui evite la divergence
  //     tant que les ecrans ecrivent encore dans `depenses`.
  const secondPassage = await syncLegacyDepenses(db);
  verifie("second passage idempotent", secondPassage === 0, `obtenu ${secondPassage}`);

  await runMigrations(db);
  const apresRejeu = raw.prepare("SELECT COUNT(*) AS n FROM comptes;").get() as { n: number };
  verifie("relancer les migrations ne duplique pas les comptes", apresRejeu.n === 7, `obtenu ${apresRejeu.n}`);

  // --- Garde-fous du schema.
  lance(
    "un transfert sans compte de destination est refuse",
    () =>
      raw.exec(`
        INSERT INTO transactions (nature, kind, montant_centimes, compte_source_id, description, date, source, cree_le)
        VALUES ('transfert', 'retrait', 350000, 1, 'Retrait', '2026-09-05T10:00:00', 'sms', '2026-09-05');
      `),
    true
  );

  lance(
    "un transfert complet est accepte",
    () =>
      raw.exec(`
        INSERT INTO transactions (nature, kind, montant_centimes, compte_source_id, compte_destination_id, description, date, source, cree_le)
        VALUES ('transfert', 'retrait', 350000, 3, 7, 'Retrait agent', '2026-09-05T10:00:00', 'sms', '2026-09-05');
      `),
    false
  );

  lance(
    "une reference operateur en double est refusee (deduplication)",
    () =>
      raw.exec(`
        INSERT INTO transactions (nature, kind, montant_centimes, description, date, source, operateur, reference, cree_le)
        VALUES ('depense', 'paiement_marchand', 20000, 'Achat', '2026-09-05T10:00:00', 'sms', 'moov_money', 'DHA2HQM6ME', '2026-09-05');
        INSERT INTO transactions (nature, kind, montant_centimes, description, date, source, operateur, reference, cree_le)
        VALUES ('depense', 'paiement_marchand', 20000, 'Achat', '2026-09-05T10:00:00', 'sms', 'moov_money', 'DHA2HQM6ME', '2026-09-05');
      `),
    true
  );

  lance(
    "deux saisies manuelles sans reference restent possibles",
    () =>
      raw.exec(
        "INSERT INTO transactions (nature, kind, montant_centimes, description, date, source, cree_le)" +
          " VALUES ('depense', 'saisie_manuelle', 5000, 'Pain', '2026-09-05T10:00:00', 'manuelle', '2026-09-05');" +
          "INSERT INTO transactions (nature, kind, montant_centimes, description, date, source, cree_le)" +
          " VALUES ('depense', 'saisie_manuelle', 5000, 'Pain', '2026-09-05T10:00:00', 'manuelle', '2026-09-05');"
      ),
    false
  );

  lance(
    "une nature inconnue est refusee",
    () =>
      raw.exec(
        "INSERT INTO transactions (nature, kind, montant_centimes, description, date, source, cree_le)" +
          " VALUES ('cadeau', 'saisie_manuelle', 5000, 'Test', '2026-09-05T10:00:00', 'manuelle', '2026-09-05');"
      ),
    true
  );

  raw.close();
  console.log(
    `\n${echecs === 0 ? "Toutes les verifications passent." : `${echecs} verification(s) en echec.`}`
  );
  process.exit(echecs === 0 ? 0 : 1);
}

void main();
