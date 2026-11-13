/* eslint-disable */
/**
 * Grava `arenaBookings/{id}.resultPlayers` + `resultPlayerUids` (quem está no placar do pós-jogo,
 * sem o dono; os uids à parte para o CRM da arena consultar) nas
 * reservas cujos placares (`bookingResults/{bookingId}`) foram salvos antes de
 * `saveBookingResult` passar a espelhar a lista na reserva. Daqui pra frente quem mantém é a
 * callable. Só escreve quando a lista muda: idempotente.
 *
 * Uso (na pasta functions/, após `npm run build`):
 *   node scripts/backfill-booking-result-players.js --project volley-track-dev-4596c          # simulação
 *   node scripts/backfill-booking-result-players.js --project volley-track-dev-4596c --yes    # grava
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
const {bookingOwnerUid, bookingResultPlayersPatch} = require("../lib/booking-result");

async function main() {
  const db = admin.firestore();
  const results = await db.collection("bookingResults").get();
  let changed = 0;
  let missing = 0;
  for (const r of results.docs) {
    const bookingRef = db.collection("arenaBookings").doc(r.id);
    const booking = await bookingRef.get();
    if (!booking.exists) {
      missing++;
      console.log(`? ${r.id} (reserva não existe)`);
      continue;
    }
    const teams = Array.isArray(r.get("teams")) ? r.get("teams") : [];
    const normalized = teams.map((t) => ({
      players: (Array.isArray(t && t.players) ? t.players : []).map((p) => ({
        id: typeof p?.id === "string" ? p.id : "",
        name: typeof p?.name === "string" && p.name.trim() ? p.name.trim() : "Atleta",
        avatarUrl: typeof p?.avatarUrl === "string" && p.avatarUrl.trim() ? p.avatarUrl.trim() : null,
      })),
    }));
    const next = bookingResultPlayersPatch(normalized, bookingOwnerUid(booking.data()));
    const current = {resultPlayers: booking.get("resultPlayers"), resultPlayerUids: booking.get("resultPlayerUids")};
    if (JSON.stringify(current) === JSON.stringify(next)) {
      console.log(`= ${r.id}`);
      continue;
    }
    changed++;
    console.log(`+ ${r.id}: ${next.resultPlayerUids.join(", ") || "(ninguém além do dono)"}`);
    if (apply) await bookingRef.update(next);
  }
  console.log(apply
    ? `${results.size} placar(es); ${changed} reserva(s) atualizada(s); ${missing} sem reserva.`
    : `${results.size} placar(es); ${changed} reserva(s) a atualizar; ${missing} sem reserva. ` +
      "Simulação — rode com --yes para gravar.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
