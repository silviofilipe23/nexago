/* eslint-disable */
/**
 * Devolve o `reminder15mAt` às ocorrências futuras de horário fixo que o perderam. Antes da
 * correção, editar ou retomar a série regravava a ocorrência no mesmo id sem o campo, e o gatilho
 * de criação (`prepareArenaBookingReminder15m`) não rodava de novo: sem lembrete de 15 min.
 * Daqui pra frente a própria materialização grava o campo. Grava só `reminder15mAt` (merge);
 * pula quem já tem o campo, o que não é de série, o que não está ativo e lembrete que já passou.
 * Idempotente.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-recurring-reminder-15m.js --project volley-track-dev-4596c          # simulação
 *   node scripts/backfill-recurring-reminder-15m.js --project volley-track-dev-4596c --yes    # grava
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
const apply = process.argv.includes("--yes");
admin.initializeApp({projectId});
const {Timestamp} = require("firebase-admin/firestore");
const {missingRecurringReminder15mAt} = require("../lib/recurring-reminder-backfill");
const {dayKeyFromEventDate} = require("../lib/event-timezone");

const BATCH_LIMIT = 400;

async function main() {
  const db = admin.firestore();
  const now = new Date();
  const todayKey = dayKeyFromEventDate(now);
  // Ocorrência de série grava `date` como string YYYY-MM-DD: o range por string já cobre todas.
  const snap = await db.collection("arenaBookings").where("date", ">=", todayKey).get();

  const fixes = [];
  for (const doc of snap.docs) {
    const at = missingRecurringReminder15mAt(doc.data(), now);
    if (at) fixes.push({ref: doc.ref, at, date: doc.get("date"), startTime: doc.get("startTime")});
  }

  for (const f of fixes) console.log(`+ ${f.ref.id}  ${f.date} ${f.startTime}  lembrete ${f.at.toISOString()}`);

  if (apply) {
    for (let i = 0; i < fixes.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      for (const f of fixes.slice(i, i + BATCH_LIMIT)) {
        batch.set(f.ref, {reminder15mAt: Timestamp.fromDate(f.at)}, {merge: true});
      }
      await batch.commit();
    }
  }

  console.log(apply
    ? `${snap.size} reserva(s) de hoje em diante; lembrete gravado em ${fixes.length} ocorrência(s) de horário fixo.`
    : `${snap.size} reserva(s) de hoje em diante; ${fixes.length} ocorrência(s) sem lembrete. Simulação — rode com --yes para gravar.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
