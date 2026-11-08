/* eslint-disable */
/**
 * Backfill da liberação social (`socialUnlocked`) das reservas de PLANO DE HORÁRIO.
 *
 * Reserva de plano nasce com 0 pago (quem paga é a mensalidade), e o gatilho
 * `syncScheduleChargeSocialUnlock` só recalcula quando uma mensalidade muda. As mensalidades
 * pagas pelo app ANTES do deploy não mudam mais; sem este backfill, as reservas delas ficam
 * bloqueadas no app (a callable do placar decide certo, pois relê as mensalidades).
 *
 * Como funciona: acha as mensalidades pagas pelo app (`paidVia: "asaas"`), agrupa por
 * plano e mês, e recalcula as reservas daquele mês pela MESMA função do gatilho
 * (`syncSchedulePlanMonthBookings`). É idempotente: grava só o que mudou.
 *
 * ATENÇÃO — DEV é base viva: o app da loja aponta para este projeto. Rode o dry-run
 * imediatamente antes do `--yes`.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *   npm run build   (o script usa o código compilado em lib/)
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-plan-booking-social-unlock.js --project volley-track-dev-4596c
 *   node scripts/backfill-plan-booking-social-unlock.js --project volley-track-dev-4596c --yes
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const {
  bookingSocialUnlockPatch,
  resolveBookingSocialUnlock,
  syncSchedulePlanMonthBookings,
} = require("../lib/booking-app-payment");

async function main() {
  const charges = await db.collection("arenaScheduleCharges").where("paidVia", "==", "asaas").get();
  const months = new Map();
  for (const doc of charges.docs) {
    const c = doc.data();
    if (typeof c.subscriptionId !== "string" || typeof c.period !== "string") continue;
    months.set(`${c.subscriptionId}|${c.period}`, {planId: c.subscriptionId, month: c.period});
  }
  console.log(`${charges.size} mensalidades pagas pelo app em ${months.size} plano×mês (${projectId})`);

  let toChange = 0;
  for (const {planId, month} of months.values()) {
    if (APPLY) {
      const changed = await syncSchedulePlanMonthBookings(db, planId, month);
      if (changed) console.log(`  ${planId} ${month}: ${changed} reserva(s) atualizada(s)`);
      toChange += changed;
      continue;
    }
    const bookings = await db.collection("arenaBookings").where("scheduleSubscriptionId", "==", planId).get();
    for (const b of bookings.docs) {
      const data = b.data();
      const date = String(data.date || data.dateKey || "");
      if (!date.startsWith(month)) continue;
      const patch = bookingSocialUnlockPatch(data, await resolveBookingSocialUnlock(db, data));
      if (patch) {
        toChange++;
        console.log(`  [dry-run] ${b.id} (${planId} ${date}) →`, patch);
      }
    }
  }
  console.log(APPLY ? `Feito: ${toChange} reserva(s) atualizada(s).` : `Dry-run: ${toChange} reserva(s) mudariam. Rode com --yes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
