/* eslint-disable */
/**
 * Relatório SÓ DE LEITURA do cashback do atleta: passivo atual (disponível +
 * pendente + reservado) e movimento do período (ganho, liberado, usado,
 * vencido, cancelado, estornado, devolvido). Nada é gravado.
 *
 * Pré-requisitos: gcloud auth application-default login
 * Uso (na pasta functions/):
 *   node scripts/cashback-report.js --project <projectId> [--from 2026-10-01] [--to 2026-11-01]
 * `--to` é exclusivo (o dia informado fica de fora do período).
 */

const admin = require('firebase-admin');
const { summarizeCashback } = require('./lib/cashback-report');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error('Informe o projeto: --project <projectId>');
  process.exit(1);
}
const fromMs = argValue('--from') ? Date.parse(`${argValue('--from')}T00:00:00-03:00`) : 0;
const toMs = argValue('--to') ? Date.parse(`${argValue('--to')}T00:00:00-03:00`) : Date.now() + 1;
if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
  console.error('Data inválida em --from/--to (use AAAA-MM-DD)');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const brl = (cents) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

async function main() {
  const walletsSnap = await db.collection('athleteWallets').get();
  const wallets = [];
  for (const doc of walletsSnap.docs) {
    const ledgerSnap = await doc.ref.collection('ledger')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(fromMs))
      .where('createdAt', '<', admin.firestore.Timestamp.fromMillis(toMs))
      .get();
    wallets.push({
      wallet: doc.data(),
      ledger: ledgerSnap.docs.map((d) => ({
        type: d.data().type,
        amountCents: d.data().amountCents,
        createdAtMs: d.data().createdAt.toMillis(),
      })),
    });
  }
  const s = summarizeCashback(wallets, { fromMs, toMs });
  console.log(`Projeto ${projectId}: ${s.wallets} carteiras`);
  console.log(`Passivo atual: ${brl(s.liabilityCents)} (disponível ${brl(s.current.availableCents)}, ` +
    `pendente ${brl(s.current.pendingCents)}, reservado ${brl(s.current.heldCents)})`);
  console.log(`Acumulado: ganho bruto (inclui cancelados/estornados) ${brl(s.lifetime.earnedCents)}, ` +
    `usado ${brl(s.lifetime.redeemedCents)}`);
  console.log('Período:', Object.fromEntries(Object.entries(s.period).map(([k, v]) => [k, brl(v)])));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
