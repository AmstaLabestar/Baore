/**
 * Verification des parsers SMS contre les messages reels.
 *
 * Lance avec `npm run check:sms`. Aucune dependance de test : le projet n'en a
 * pas, et en ajouter une pour dix fixtures ne se justifie pas encore.
 */
import { parseMessage } from "../src/modules/sms-ingestion/application/parse-message";
import { formatCentimes } from "../src/modules/sms-ingestion/domain/amount";
import { FIXTURES } from "../src/modules/sms-ingestion/__fixtures__/samples";
import type { Attendu } from "../src/modules/sms-ingestion/__fixtures__/samples";
import type { ParsedTransaction } from "../src/modules/sms-ingestion/domain/types";

interface Ecart {
  attendu: unknown;
  champ: string;
  obtenu: unknown;
}

function compare(transaction: ParsedTransaction, attendu: Attendu): Ecart[] {
  const ecarts: Ecart[] = [];
  const verifie = (champ: string, obtenu: unknown, espere: unknown) => {
    if (espere !== undefined && obtenu !== espere) {
      ecarts.push({ attendu: espere, champ, obtenu });
    }
  };

  verifie("kind", transaction.kind, attendu.kind);
  verifie("nature", transaction.nature, attendu.nature);
  verifie("montantCentimes", transaction.montantCentimes, attendu.montantCentimes);
  verifie("fraisCentimes", transaction.fraisCentimes, attendu.fraisCentimes);
  verifie("totalCentimes", transaction.totalCentimes, attendu.totalCentimes);
  verifie("reference", transaction.reference, attendu.reference);
  verifie("dateISO", transaction.dateISO, attendu.dateISO);
  verifie("contrepartie", transaction.contrepartie?.nom ?? null, attendu.contrepartie);

  if (attendu.soldes) {
    const obtenus = Object.fromEntries(
      transaction.soldes.map((solde) => [solde.compte, solde.montantCentimes])
    );

    for (const [compte, montant] of Object.entries(attendu.soldes)) {
      verifie(`solde.${compte}`, obtenus[compte] ?? null, montant);
    }

    for (const compte of Object.keys(obtenus)) {
      if (!(compte in attendu.soldes)) {
        ecarts.push({ attendu: "aucun", champ: `solde.${compte}`, obtenu: obtenus[compte] });
      }
    }
  }

  return ecarts;
}

let echecs = 0;

for (const fixture of FIXTURES) {
  const resultat = parseMessage(fixture.message);
  const attendu = fixture.attendu;

  if ("echec" in attendu) {
    const conforme = !resultat.ok && resultat.reason === attendu.echec;
    echecs += conforme ? 0 : 1;
    console.log(`${conforme ? "OK  " : "KO  "} ${fixture.titre}`);

    if (!conforme) {
      console.log(`       attendu un echec "${attendu.echec}", obtenu :`, resultat);
    }

    continue;
  }

  if (!resultat.ok) {
    echecs += 1;
    console.log(`KO   ${fixture.titre}`);
    console.log(`       parsing echoue : ${resultat.reason}`);
    continue;
  }

  const ecarts = compare(resultat.transaction, attendu);
  echecs += ecarts.length > 0 ? 1 : 0;
  console.log(`${ecarts.length === 0 ? "OK  " : "KO  "} ${fixture.titre}`);

  if (ecarts.length === 0) {
    const { contrepartie, kind, montantCentimes, nature } = resultat.transaction;
    const cible = contrepartie ? ` <- ${contrepartie.nom}` : "";
    console.log(`       ${nature.padEnd(9)} ${kind.padEnd(19)} ${formatCentimes(montantCentimes)}${cible}`);
  }

  for (const ecart of ecarts) {
    console.log(`       ${ecart.champ} : attendu ${JSON.stringify(ecart.attendu)}, obtenu ${JSON.stringify(ecart.obtenu)}`);
  }
}

console.log(`\n${FIXTURES.length - echecs}/${FIXTURES.length} fixtures conformes.`);
process.exit(echecs === 0 ? 0 : 1);
