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

  console.log("\n(apply ainda não implementado — Task 6)");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });
