/* eslint-disable */
/**
 * Libera o placar (e story/arte do resultado) de reservas pagas FORA do app, por cortesia.
 *
 * A regra é "metade da reserva paga pelo app" (`booking-app-payment.ts`). Reserva paga no balcão
 * fica bloqueada. Este script grava `socialUnlockGrantedAt` (+ quem e por quê) e `socialUnlocked:
 * true` na reserva. O valor pago pelo app não muda: financeiro e comissão seguem iguais. Reserva
 * cancelada ou estornada continua bloqueada, mesmo liberada.
 *
 * `--revoke` apaga a liberação e devolve a reserva à regra normal.
 *
 * ATENÇÃO: DEV é base viva (o app da loja aponta para ele). Rode o dry-run antes do `--yes`.
 *
 * Pré-requisito: gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/grant-booking-social-unlock.js --project volley-track-dev-4596c --booking <id> [--booking <id>] --reason "texto"
 *   node scripts/grant-booking-social-unlock.js --project volley-track-dev-4596c --booking <id> --reason "texto" --yes
 *   node scripts/grant-booking-social-unlock.js --project volley-track-dev-4596c --booking <id> --revoke --yes
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function argValues(flag) {
  return process.argv.flatMap((a, i) => (a === flag && process.argv[i + 1] ? [process.argv[i + 1]] : []));
}

const APPLY = process.argv.includes("--yes");
const REVOKE = process.argv.includes("--revoke");
const projectId = argValue("--project");
const bookingIds = argValues("--booking");
const reason = (argValue("--reason") || "").trim();

if (!projectId || bookingIds.length === 0) {
  console.error("Uso: --project <projectId> --booking <id> [--booking <id>] --reason \"...\" [--revoke] [--yes]");
  process.exit(1);
}
if (!REVOKE && !reason) {
  console.error("Informe o motivo da liberação: --reason \"...\"");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const {FieldValue} = admin.firestore;

async function main() {
  console.log(`${APPLY ? "APLICANDO" : "DRY-RUN"} em ${projectId} (${REVOKE ? "revogar" : "liberar"})`);
  for (const id of bookingIds) {
    const ref = db.collection("arenaBookings").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`- ${id}: não encontrada`);
      continue;
    }
    const b = snap.data();
    console.log(
      `- ${id}: ${b.arenaName || b.arenaId} · ${b.date} ${b.startTime}-${b.endTime} · ${b.courtName || ""} · ` +
      `status=${b.status} pago app=${b.amountPaidOnlineReais || 0}/${b.amountReais} socialUnlocked=${b.socialUnlocked}`,
    );
    if (!APPLY) continue;
    // Revogar só apaga a liberação: o gatilho `syncArenaBookingAppPayment` recalcula `socialUnlocked`.
    const patch = REVOKE ?
      {socialUnlockGrantedAt: FieldValue.delete(), socialUnlockGrantReason: FieldValue.delete()} :
      {socialUnlockGrantedAt: FieldValue.serverTimestamp(), socialUnlockGrantReason: reason, socialUnlocked: true};
    await ref.update(patch);
    console.log("  gravado");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
