/* eslint-disable */
/**
 * Relatório da lista de espera do nexaGO+ (`athletePlusWaitlist/{uid}`), Fase 0 da spec
 * docs/superpowers/specs/2026-11-03-nexago-plus-atleta-design.md. Só leitura.
 *
 * Conta quem entrou na lista e quem dispensou, os interesses marcados e as faixas de preço.
 * A taxa de conversão (entrou ÷ card exibido) sai do Analytics: `athlete_plus_card_shown`
 * conta 1× por sessão, então o denominador certo é usuários únicos do evento, não eventos.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/athlete-plus-waitlist-report.js --project <projectId>
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

const INTERESTS = ["savings", "evolution", "status", "priority"];
const PRICE_BANDS = ["up_to_10", "up_to_15", "up_to_20", "up_to_30", "unsure"];

function pct(part, total) {
  return total === 0 ? "—" : `${((part / total) * 100).toFixed(1)}%`;
}

async function run() {
  const snap = await db.collection("athletePlusWaitlist").get();
  let joined = 0;
  let dismissed = 0;
  const interests = Object.fromEntries(INTERESTS.map((k) => [k, 0]));
  const bands = Object.fromEntries(PRICE_BANDS.map((k) => [k, 0]));
  let noBand = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status !== "joined") {
      dismissed++;
      continue;
    }
    joined++;
    for (const key of data.interests || []) {
      if (key in interests) interests[key]++;
    }
    if (data.priceBand in bands) bands[data.priceBand]++;
    else noBand++;
  }

  const answered = joined + dismissed;
  console.log(`\nLista de espera do nexaGO+ (${projectId})`);
  console.log(`Responderam: ${answered}`);
  console.log(`  Entraram na lista: ${joined} (${pct(joined, answered)})`);
  console.log(`  Dispensaram:       ${dismissed} (${pct(dismissed, answered)})`);

  console.log(`\nInteresses (entre os ${joined} da lista; marca mais de um):`);
  for (const key of INTERESTS) {
    console.log(`  ${key.padEnd(10)} ${interests[key]} (${pct(interests[key], joined)})`);
  }

  console.log(`\nQuanto faz sentido pagar por mês:`);
  for (const key of PRICE_BANDS) {
    console.log(`  ${key.padEnd(10)} ${bands[key]} (${pct(bands[key], joined)})`);
  }
  console.log(`  sem resposta ${noBand} (${pct(noBand, joined)})`);
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
