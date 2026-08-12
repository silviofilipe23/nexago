/* eslint-disable */
/**
 * Confere managerId + staff ativo (role manager) de um ou mais torneios — o mesmo cálculo de
 * tournamentManagerUids() (functions/src/tournament-acl.ts), pra depurar por que uma
 * notificação do organizador não achou destinatário. Só leitura.
 *
 * Uso: node scripts/check-tournament-managers.js --project volley-track-dev-4596c <tournamentId...>
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}

const tournamentIds = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== projectId);
if (tournamentIds.length === 0) {
  console.error("Informe pelo menos um tournamentId: node scripts/check-tournament-managers.js --project <id> <tournamentId...>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function main() {
  for (const id of tournamentIds) {
    const snap = await db.doc(`tournaments/${id}`).get();
    if (!snap.exists) {
      console.log(`\n=== ${id} === NÃO EXISTE`);
      continue;
    }
    const data = snap.data();
    console.log(`\n=== ${id} (${data.name ?? "sem nome"}) ===`);
    console.log("managerId:", JSON.stringify(data.managerId));

    const staffSnap = await db
      .collection(`tournaments/${id}/staff`)
      .where("status", "==", "active")
      .where("role", "==", "manager")
      .get();
    console.log(`staff manager ativo (${staffSnap.size}):`);
    staffSnap.forEach((d) => console.log(" -", d.id, JSON.stringify(d.data())));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
