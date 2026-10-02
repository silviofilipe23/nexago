/* eslint-disable */
/**
 * Cria/atualiza organizerPublicProfiles/{uid} para todo usuário com papel de organizador:
 * identidade, selo, números (com atletas) e contagem de seguidores. Mesma lógica dos gatilhos
 * de functions/src/organizer-public-profile-sync.ts — eles só reagem a escritas NOVAS.
 *
 * Pré-requisitos: credenciais admin (gcloud auth application-default login) e lib/ compilada
 * (`npm run build` em functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-organizer-public-profiles.js --project volley-track-dev-4596c          # simula
 *   node scripts/backfill-organizer-public-profiles.js --project volley-track-dev-4596c --yes    # grava
 *   ... --only <uid>   # um organizador só
 */

const admin = require("firebase-admin");
const {
  buildOrganizerIdentity,
  completedListedTournamentIds,
  computeOrganizerStats,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
} = require("../lib/organizer-public-profile");
const {
  countOrganizerAthletes,
  recomputeOrganizerStats,
  syncOrganizerIdentity,
  syncOrganizerVerified,
} = require("../lib/organizer-public-profile-sync");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const ONLY = argValue("--only");
const projectId = argValue("--project");
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function organizerDocs() {
  if (ONLY) {
    const snap = await db.collection("users").doc(ONLY).get();
    return snap.exists ? [snap] : [];
  }
  const snap = await db.collection("users").where("roles", "array-contains", "organizer").get();
  return snap.docs;
}

async function run() {
  const docs = await organizerDocs();
  console.log(`${docs.length} organizador(es) em ${projectId}. Modo: ${APPLY ? "GRAVAR" : "simulação"}`);
  for (const userDoc of docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const identity = buildOrganizerIdentity(data);
    const verified = (await db.collection("organizers").doc(uid).get()).exists;
    const tournaments = await db.collection("tournaments").where("managerId", "==", uid).get();
    const rows = tournaments.docs.map((d) => ({id: d.id, data: d.data()}));
    const athletes = await countOrganizerAthletes(db, uid, completedListedTournamentIds(rows), projectId);
    const stats = computeOrganizerStats(rows, athletes);
    const followers = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).collection("followers").count().get();
    const followersCount = followers.data().count;
    console.log(
      `${uid} | ${identity.name}${verified ? " ✓" : ""} | eventos ${stats.listedEvents} (realizados ${stats.eventsCompleted}, abertos ${stats.openEvents})` +
      ` | atletas ${stats.athletes} | seguidores ${followersCount}`,
    );
    if (!APPLY) continue;
    await syncOrganizerIdentity(db, uid, null, data);
    await syncOrganizerVerified(db, uid, verified);
    await recomputeOrganizerStats(db, uid, {recountAthletes: true, projectId});
    await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).set({followersCount}, {merge: true});
  }
  console.log(APPLY ? "Concluído." : "Simulação concluída. Rode com --yes para gravar.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
