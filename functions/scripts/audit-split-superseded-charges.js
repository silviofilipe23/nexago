/* eslint-disable */
/**
 * Auditoria SÓ DE LEITURA das reservas divididas: quem pagou a cobrança da reserva
 * inteira depois de dividir (pagou em dobro → estorno) e quem teve a reserva dividida
 * cancelada pelo vencimento do PIX antigo. Nada é gravado.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/audit-split-superseded-charges.js --project <projectId>
 */

const admin = require('firebase-admin');
const { classifySplitBooking, originalPaymentIdOf } = require('./lib/split-superseded-audit');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error('Informe o projeto: --project <projectId>');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const ATTENTION = new Set(['double_paid', 'stale_paid_refund_required', 'cancelled_by_stale_charge', 'legacy_original_open']);

async function main() {
  const snap = await db.collection('arenaBookings').where('hasSplitShares', '==', true).get();
  const counts = {};
  const rows = [];

  for (const doc of snap.docs) {
    const booking = doc.data();
    const originalPaymentId = originalPaymentIdOf(booking);
    let originalProcessed = null;
    if (originalPaymentId) {
      const processed = await db
        .doc(`artifacts/${projectId}/public/data/asaas_processed_payments/${originalPaymentId}`)
        .get();
      originalProcessed = processed.exists ? processed.data() : null;
    }
    const kind = classifySplitBooking({ booking, originalPaymentId, originalProcessed });
    counts[kind] = (counts[kind] || 0) + 1;
    if (ATTENTION.has(kind)) {
      rows.push({
        kind,
        bookingId: doc.id,
        arenaId: booking.arenaId || '',
        athleteId: booking.athleteId || '',
        date: booking.date || '',
        startTime: booking.startTime || '',
        status: booking.status || '',
        originalPaymentId,
        amountToPayNowReais: booking.amountToPayNowReais ?? null,
      });
    }
  }

  console.log(`Projeto ${projectId}: ${snap.size} reservas divididas`);
  console.log(counts);
  if (rows.length) console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
