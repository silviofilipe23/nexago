/* eslint-disable */
/**
 * Libera horários presos por reservas JÁ canceladas: apaga os locks em
 * `arenaSlotLocks` cujo `bookingId` aponta para reserva cancelada e os docs
 * de `arenaSlots` dessas reservas.
 *
 * Motivo: até o trigger `onArenaBookingStatusChangedSyncSlotHold`
 * (functions/src/arena-booking-slot-release.ts) entrar em produção, todos os
 * cancelamentos avulsos (atleta/gestor, app/web) só atualizavam o status em
 * `arenaBookings` — locks e slots ficavam órfãos e o horário nunca mais podia
 * ser reservado. Este backfill limpa o estoque histórico; o trigger cuida dos
 * cancelamentos daqui pra frente.
 *
 * Segurança: um lock só é apagado se `lock.bookingId` for exatamente o id da
 * reserva cancelada (mesma checagem de dono do trigger) — locks de reservas
 * ativas ou de outra origem (clubinho, recorrência ativa) nunca são tocados.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/ se necessário).
 *
 * Uso (na pasta functions/) — dry-run por padrão, --yes aplica:
 *   node scripts/backfill-release-canceled-booking-holds.js --project volley-track-dev-4596c
 *   node scripts/backfill-release-canceled-booking-holds.js --project <projectId> --yes
 *   node scripts/backfill-release-canceled-booking-holds.js --project <projectId> --yes --limit 200
 */

const admin = require("firebase-admin");
const {computeSlotLockIds} = require("../lib/arena-booking-waitlist");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

const CANCELED_STATUSES = ["canceled", "cancelled"];

function parseDateKey(value) {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length >= 10 ? t.substring(0, 10) : null;
  }
  if (value && typeof value.toDate === "function") {
    const d = value.toDate();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${d.getUTCFullYear()}-${m}-${day}`;
  }
  return null;
}

/** Locks do booking ainda existentes e pertencentes a ele (checagem de dono). */
async function ownedLockRefs(bookingId, booking) {
  const arenaId = typeof booking.arenaId === "string" ? booking.arenaId.trim() : "";
  const courtId = typeof booking.courtId === "string" ? booking.courtId.trim() : "";
  const dateKey = parseDateKey(booking.date) || "";
  const startTime = typeof booking.startTime === "string" ? booking.startTime.trim() : "";
  const endTime = typeof booking.endTime === "string" ? booking.endTime.trim() : "";
  if (!arenaId || !courtId || !dateKey || startTime.length < 4 || endTime.length < 4) {
    return [];
  }
  const ids = computeSlotLockIds({arenaId, courtId, dateKey, startTime, endTime});
  if (ids.length === 0) return [];

  const refs = ids.map((id) => db.collection("arenaSlotLocks").doc(id));
  const snaps = await db.getAll(...refs);
  return snaps
    .filter((s) => s.exists && s.data().bookingId === bookingId)
    .map((s) => s.ref);
}

async function* iterateCanceledBookings(status) {
  let lastId = null;
  while (true) {
    let query = db
      .collection("arenaBookings")
      .where("status", "==", status)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(300);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) return;
    for (const doc of snap.docs) yield doc;
    lastId = snap.docs[snap.docs.length - 1].id;
  }
}

async function main() {
  console.log(
    `${APPLY ? "APLICANDO" : "DRY-RUN (use --yes para aplicar)"} em ${projectId}\n`,
  );

  let bookingsSeen = 0;
  let bookingsWithOrphans = 0;
  let locksDeleted = 0;
  let slotsDeleted = 0;

  for (const status of CANCELED_STATUSES) {
    for await (const doc of iterateCanceledBookings(status)) {
      if (LIMIT > 0 && bookingsSeen >= LIMIT) break;
      bookingsSeen++;
      const booking = doc.data();

      const lockRefs = await ownedLockRefs(doc.id, booking);
      const slotsSnap = await db
        .collection("arenaSlots")
        .where("bookingId", "==", doc.id)
        .get();

      if (lockRefs.length === 0 && slotsSnap.empty) continue;
      bookingsWithOrphans++;

      const when = `${parseDateKey(booking.date) || "?"} ${booking.startTime || "?"}–${booking.endTime || "?"}`;
      console.log(
        `booking ${doc.id} (${status}, ${when}): ` +
        `${lockRefs.length} lock(s) órfão(s), ${slotsSnap.size} slot(s) órfão(s)`,
      );

      if (!APPLY) continue;
      for (const ref of lockRefs) {
        await ref.delete();
        locksDeleted++;
      }
      for (const slotDoc of slotsSnap.docs) {
        await slotDoc.ref.delete();
        slotsDeleted++;
      }
    }
  }

  console.log(
    `\n${bookingsSeen} reserva(s) cancelada(s) verificada(s); ` +
    `${bookingsWithOrphans} com órfãos.`,
  );
  if (APPLY) {
    console.log(`Apagados: ${locksDeleted} lock(s), ${slotsDeleted} slot(s).`);
  } else {
    console.log("Nada foi apagado (dry-run). Rode com --yes para aplicar.");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
