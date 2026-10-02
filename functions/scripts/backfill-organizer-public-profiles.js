/* eslint-disable */
/**
 * Cria/atualiza organizerPublicProfiles/{uid} para todo usuário com papel de organizador:
 * identidade, selo, números (com atletas) e contagem de seguidores. Mesma lógica dos gatilhos
 * de functions/src/organizer-public-profile-sync.ts — eles só reagem a escritas NOVAS.
 *
 * Também semeia a trava do push (`organizerFollowerPushes/{tournamentId}`, `skipped`) para todo
 * evento listado que JÁ está aberto ou fechado: sem ela, um fechado→aberto depois do deploy
 * avisaria os seguidores no meio de um evento antigo.
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
  computeOrganizerStats,
  isListedTournament,
  realizedListedTournamentIds,
  ORGANIZER_FOLLOWER_PUSHES_COLLECTION,
  ORGANIZER_PUBLIC_PROFILES_COLLECTION,
  tournamentListingStatus,
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

function preExistingLockIds(rows) {
  return rows
    .filter((row) => isListedTournament(row.data) && ["open", "closed"].includes(tournamentListingStatus(row.data)))
    .map((row) => row.id);
}

async function seedSkippedLocks(uid, tournamentIds) {
  let created = 0;
  for (const tournamentId of tournamentIds) {
    try {
      await db.collection(ORGANIZER_FOLLOWER_PUSHES_COLLECTION).doc(tournamentId).create({
        organizerId: uid,
        tournamentId,
        status: "skipped",
        skippedReason: "pre_existing",
        createdAt: admin.firestore.Timestamp.now(),
      });
      created += 1;
    } catch (error) {
      if (error && error.code !== 6) throw error; // 6 = ALREADY_EXISTS: trava já existe, ok
    }
  }
  return created;
}

async function countFollowers(uid) {
  const snap = await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).collection("followers").count().get();
  return snap.data().count;
}

async function backfillOne(userDoc) {
  const uid = userDoc.id;
  const identity = buildOrganizerIdentity(userDoc.data());
  const verified = (await db.collection("organizers").doc(uid).get()).exists;
  const tournaments = await db.collection("tournaments").where("managerId", "==", uid).get();
  const rows = tournaments.docs.map((d) => ({id: d.id, data: d.data()}));
  const lockIds = preExistingLockIds(rows);

  if (!APPLY) {
    const nowMs = Date.now();
    const athletes = await countOrganizerAthletes(db, uid, realizedListedTournamentIds(rows, nowMs), projectId);
    const stats = computeOrganizerStats(rows, athletes, nowMs);
    console.log(
      `${uid} | ${identity.name}${verified ? " ✓" : ""} | eventos ${stats.listedEvents} (realizados ${stats.eventsCompleted}, abertos ${stats.openEvents})` +
      ` | atletas ${stats.athletes} | seguidores ${await countFollowers(uid)} | travas a semear ${lockIds.length}`,
    );
    return;
  }

  // Identidade primeiro: é ela que marca `isOrganizer`, e o recálculo dos números usa isso no `listed`.
  await syncOrganizerIdentity(db, uid, null, userDoc.data());
  await syncOrganizerVerified(db, uid);
  const stats = await recomputeOrganizerStats(db, uid, {recountAthletes: true, projectId});
  const followersCount = await countFollowers(uid);
  await db.collection(ORGANIZER_PUBLIC_PROFILES_COLLECTION).doc(uid).set({followersCount}, {merge: true});
  const seeded = await seedSkippedLocks(uid, lockIds);
  console.log(
    `${uid} | ${identity.name}${verified ? " ✓" : ""} | eventos ${stats.listedEvents} (realizados ${stats.eventsCompleted}, abertos ${stats.openEvents})` +
    ` | atletas ${stats.athletes} | seguidores ${followersCount} | travas semeadas ${seeded}`,
  );
}

async function run() {
  const docs = await organizerDocs();
  console.log(`${docs.length} organizador(es) em ${projectId}. Modo: ${APPLY ? "GRAVAR" : "simulação"}`);
  const failures = [];
  for (const userDoc of docs) {
    // Um organizador com dado estranho não interrompe os outros; o script é idempotente.
    try {
      await backfillOne(userDoc);
    } catch (error) {
      failures.push(userDoc.id);
      console.error(`${userDoc.id} | FALHOU:`, error && error.message ? error.message : error);
    }
  }
  console.log(`${docs.length - failures.length} ok, ${failures.length} com falha${failures.length ? `: ${failures.join(", ")}` : ""}.`);
  console.log(APPLY ? "Concluído." : "Simulação concluída. Rode com --yes para gravar.");
  if (failures.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
