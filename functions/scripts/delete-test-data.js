/* eslint-disable */
/**
 * Apaga TODOS os dados de teste criados por `seed-test-data.js`, em cascata:
 * matches → inscriptions → teams → tournaments → users → public_profiles → Auth.
 *
 * Filho antes do pai, para nunca deixar documento órfão. Preserva atletas seed
 * que estejam inscritos em torneios reais, e aborta se achar atleta real
 * inscrito num torneio seed.
 *
 * Pré-requisitos:
 *   npm run build                              # lê ../lib/test-data-cleanup
 *   gcloud auth application-default login      # ADC
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c        # DRY-RUN
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c --yes  # apaga
 *
 * `--project` é OBRIGATÓRIO e não tem fallback de env: o alias `default` do
 * .firebaserc aponta para produção, e um fallback silencioso poderia apagar
 * dados reais. Produção é bloqueada de qualquer forma.
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {chunkList, partitionCleanupTargets} = require("../lib/test-data-cleanup");

const PROD_PROJECT_ID = "volley-track-2dd3b";
/** Limite do operador `in` do Firestore. */
const IN_QUERY_LIMIT = 30;
/** Margem sob o teto de 500 operações por batch. */
const BATCH_LIMIT = 450;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const FORCE = process.argv.includes("--force");

  // Sem fallback de env: ver o comentário do topo.
  const projectId = (argValue("--project") || "").trim();
  if (!projectId) {
    console.error("Informe o projeto explicitamente: --project <projectId>.");
    console.error("Este script não lê GCLOUD_PROJECT — o default do .firebaserc é produção.");
    process.exit(1);
  }
  if (projectId === PROD_PROJECT_ID) {
    console.error(`BLOQUEADO: ${projectId} é o projeto de PRODUÇÃO.`);
    console.error("Este script existe para limpar dados de teste; não rode em produção.");
    process.exit(1);
  }

  const credentialsPath = (
    argValue("--credentials") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  ).trim();

  if (credentialsPath) {
    if (!fs.existsSync(credentialsPath)) {
      console.error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return {APPLY, FORCE, projectId};
}

function inscriptionsPath(pid) {
  return `artifacts/${pid}/public/data/inscriptions`;
}
function teamsPath(pid) {
  return `artifacts/${pid}/public/data/teams`;
}
function matchesPath(pid) {
  return `artifacts/${pid}/public/data/matches`;
}

/** Docs de `matches` dos torneios seed, respeitando o limite do `in`. */
async function findSeedMatches(db, projectId, tournamentIds) {
  const docs = [];
  for (const part of chunkList(tournamentIds, IN_QUERY_LIMIT)) {
    const snap = await db
      .collection(matchesPath(projectId))
      .where("tournamentId", "in", part)
      .get();
    docs.push(...snap.docs);
  }
  return docs;
}

/**
 * Lê tudo que a decisão de limpeza precisa. As inscrições são lidas por
 * completo (não só as dos torneios seed) porque é a presença de um atleta
 * seed numa inscrição de torneio REAL que o torna impossível de apagar.
 */
async function discover(db, projectId) {
  const [tournamentsSnap, athletesSnap, organizersSnap, inscriptionsSnap] =
    await Promise.all([
      db.collection("tournaments").where("seedTestTournament", "==", true).get(),
      db.collection("users").where("seedTestAthlete", "==", true).get(),
      db.collection("users").where("seedTestOrganizer", "==", true).get(),
      db.collection(inscriptionsPath(projectId)).get(),
    ]);

  const seedTournamentIds = tournamentsSnap.docs.map((d) => d.id);
  const seedAthleteUids = athletesSnap.docs.map((d) => d.id);
  const organizerUids = organizersSnap.docs.map((d) => d.id);

  const inscriptions = inscriptionsSnap.docs.map((d) => ({
    id: d.id,
    tournamentId: String(d.data().tournamentId ?? ""),
    teamId: d.data().teamId,
    participantUids: d.data().participantUids,
    player1Id: d.data().player1Id,
  }));

  const plan = partitionCleanupTargets({
    inscriptions,
    seedAthleteUids,
    seedTournamentIds,
  });

  const matchDocs = seedTournamentIds.length ?
    await findSeedMatches(db, projectId, seedTournamentIds) :
    [];

  return {
    projectId,
    seedTournamentIds,
    organizerUids,
    matchIds: matchDocs.map((d) => d.id),
    ...plan,
  };
}

function printReport(d) {
  console.log("\nEncontrado:");
  console.log(`  matches ................. ${d.matchIds.length}`);
  console.log(`  inscriptions ............ ${d.seedInscriptionIds.length}`);
  console.log(`  teams ................... ${d.teamIds.length}`);
  console.log(`  tournaments ............. ${d.seedTournamentIds.length}`);
  console.log(`  atletas seed (apagáveis)  ${d.deletableAthleteUids.length}`);
  console.log(`  organizadores seed ...... ${d.organizerUids.length}`);

  if (d.preservedAthleteUids.length) {
    console.log(
      `\nPRESERVADOS: ${d.preservedAthleteUids.length} atleta(s) seed estão inscritos em`,
    );
    console.log("torneios REAIS. Doc, espelho e conta Auth serão mantidos:");
    for (const uid of d.preservedAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.preservedAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.preservedAthleteUids.length - 20}`);
    }
  }

  if (d.realAthleteUids.length) {
    console.log(
      `\nATENÇÃO: ${d.realAthleteUids.length} atleta(s) REAIS estão inscritos no torneio seed:`,
    );
    for (const uid of d.realAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.realAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.realAthleteUids.length - 20}`);
    }
  }
}

function nothingToDo(d) {
  return (
    d.matchIds.length === 0 &&
    d.seedInscriptionIds.length === 0 &&
    d.teamIds.length === 0 &&
    d.seedTournamentIds.length === 0 &&
    d.deletableAthleteUids.length === 0 &&
    d.organizerUids.length === 0
  );
}

/** Apaga refs em lotes, respeitando o teto de operações por batch. */
async function deleteRefs(db, refs) {
  for (const part of chunkList(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of part) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

/**
 * Apaga os docs de usuário com `recursiveDelete`, que também remove as
 * subcoleções (`notifications`, `tokens`, `favorites`). Um `batch.delete`
 * do doc-pai deixaria essas subcoleções órfãs e invisíveis — mesmo motivo
 * pelo qual `deleteOwnAccount` usa recursiveDelete
 * (`functions/src/account-deletion.ts:23`).
 */
async function deleteUsersRecursively(db, uids, log) {
  let done = 0;
  for (const uid of uids) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    done += 1;
    if (done % 50 === 0) log(`  ... ${done}/${uids.length} usuários`);
  }
  return done;
}

/**
 * Varre o espelho público explicitamente. O trigger
 * `onUserWrittenSyncPublicProfile` já apaga `public_profiles/{uid}` quando
 * `users/{uid}` some, mas só se estiver deployado naquele projeto — e o
 * script não tem como verificar isso. A varredura é barata e torna a
 * limpeza independente do estado de deploy.
 */
async function deletePublicProfiles(db, uids) {
  const refs = uids.map((uid) => db.doc(`public_profiles/${uid}`));
  return deleteRefs(db, refs);
}

async function deleteAuthAccounts(auth, uids, log) {
  let deleted = 0;
  let failed = 0;
  for (const part of chunkList(uids, 1000)) {
    const res = await auth.deleteUsers(part);
    deleted += res.successCount;
    failed += res.failureCount;
    for (const err of res.errors) {
      log(`  Falha Auth: ${part[err.index]} — ${err.error.message}`);
    }
  }
  return {deleted, failed};
}

/** Cascata: filho antes do pai, para nunca deixar órfão. */
async function applyCleanup(db, auth, d) {
  const log = console.log;

  const matchRefs = d.matchIds.map((id) => db.doc(`${matchesPath(d.projectId)}/${id}`));
  log(`\nmatches: ${await deleteRefs(db, matchRefs)} apagados`);

  const inscriptionRefs = d.seedInscriptionIds.map((id) =>
    db.doc(`${inscriptionsPath(d.projectId)}/${id}`),
  );
  log(`inscriptions: ${await deleteRefs(db, inscriptionRefs)} apagadas`);

  const teamRefs = d.teamIds.map((id) => db.doc(`${teamsPath(d.projectId)}/${id}`));
  log(`teams: ${await deleteRefs(db, teamRefs)} apagadas`);

  const tournamentRefs = d.seedTournamentIds.map((id) => db.doc(`tournaments/${id}`));
  log(`tournaments: ${await deleteRefs(db, tournamentRefs)} apagados`);

  const userUids = [...d.deletableAthleteUids, ...d.organizerUids];
  log(`users: apagando ${userUids.length} (recursivo)...`);
  log(`users: ${await deleteUsersRecursively(db, userUids, log)} apagados`);

  log(`public_profiles: ${await deletePublicProfiles(db, userUids)} apagados`);

  const {deleted, failed} = await deleteAuthAccounts(auth, userUids, log);
  log(`Auth: ${deleted} contas removidas, ${failed} falha(s).`);

  if (d.preservedAthleteUids.length) {
    log(`\nPreservados (inscritos em torneio real): ${d.preservedAthleteUids.length}`);
    for (const uid of d.preservedAthleteUids) log(`  - ${uid}`);
  }
}

async function run() {
  const {APPLY, FORCE, projectId} = parseArgs();
  const db = admin.firestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);

  const discovery = await discover(db, projectId);
  printReport(discovery);

  if (nothingToDo(discovery)) {
    console.log("\nNada a apagar.");
    return;
  }

  if (discovery.realAthleteUids.length && !FORCE) {
    console.error(
      "\nABORTADO: há atleta real inscrito no torneio seed (lista acima).",
    );
    console.error(
      "Apagar o torneio destruiria a inscrição dele. Rode com --force para prosseguir:",
    );
    console.error(
      "o torneio e as inscrições saem (inclusive a dele), mas o perfil e a conta dele ficam.",
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi apagado. Rode com --yes para remover.");
    return;
  }

  await applyCleanup(db, admin.auth(), discovery);
  console.log("\nLimpeza concluída.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });
