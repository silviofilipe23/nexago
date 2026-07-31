/* eslint-disable */
/**
 * Cria o cenário de teste completo num comando: organizador + atletas +
 * torneio + duplas + inscrições pagas.
 *
 * Orquestra os seeds existentes (`seed-athletes-lib.js` e
 * `seed-tournament-enrollments-lib.js`) na ordem certa, resolvendo o
 * pré-requisito que antes era manual: sem `--manager-uid`, cria um
 * organizador seed próprio.
 *
 * Volume no padrão (--count 32): 320 atletas → 10 categorias × 16 duplas.
 * O torneio nasce `open`, SEM chave gerada — gerar a chave pelo painel é o
 * fluxo que se quer testar.
 *
 * Pré-requisitos:
 *   npm run build                              # scripts leem de ../lib
 *   gcloud auth application-default login      # ADC
 *   # ou --credentials /caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-test-data.js --project volley-track-dev-4596c        # DRY-RUN
 *   node scripts/seed-test-data.js --project volley-track-dev-4596c --yes  # aplica
 *
 * Limpeza: node scripts/delete-test-data.js --project <id> --yes
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {seedAthletes} = require("./seed-athletes-lib");
const {
  buildTournamentDocFuture,
  buildTournamentDocToday,
  runTournamentEnrollmentSeed,
} = require("./seed-tournament-enrollments-lib");

const DEFAULT_TOURNAMENT_NAME = "Torneio seed nexaGO";
const ORGANIZER_EMAIL = "seed-organizer@nexago.test";
const ORGANIZER_NAME = "Organizador seed nexaGO";
const CITY = "Goiânia";
const STATE = "GO";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const TODAY = process.argv.includes("--today");
  const projectId =
    argValue("--project") ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
    process.exit(1);
  }

  const managerUid = (argValue("--manager-uid") || "").trim();
  const tournamentName = argValue("--tournament-name") || DEFAULT_TOURNAMENT_NAME;
  const count = parseInt(argValue("--count") || process.env.COUNT || "32", 10);
  if (!Number.isInteger(count) || count < 1) {
    console.error("--count precisa ser um inteiro >= 1.");
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

  return {APPLY, TODAY, projectId, managerUid, tournamentName, count};
}

/** Prefixos de busca — mesmo formato de `seed-athletes-lib.generateKeywords`. */
function organizerKeywords() {
  const {generateKeywords} = require("./seed-athletes-lib");
  return generateKeywords([ORGANIZER_NAME, CITY]);
}

/**
 * Garante o organizador seed no Auth + `users/{uid}`. Idempotente.
 * `managerId === uid` é tudo que o ACL de torneio exige
 * (`functions/src/tournament-acl.ts:20`), mas o doc é criado completo para o
 * painel do organizador conseguir renderizar o perfil.
 */
async function ensureSeedOrganizer(db, auth) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(ORGANIZER_EMAIL);
    uid = existing.uid;
  } catch (e) {
    const created = await auth.createUser({
      email: ORGANIZER_EMAIL,
      password: process.env.SEED_PASSWORD || "Senha123!",
      displayName: ORGANIZER_NAME,
      emailVerified: true,
    });
    uid = created.uid;
  }

  await auth.setCustomUserClaims(uid, {roles: ["organizer"]});

  await db.doc(`users/${uid}`).set(
    {
      fullName: ORGANIZER_NAME,
      email: ORGANIZER_EMAIL,
      roles: ["organizer"],
      hasOrganizerRole: true,
      city: CITY,
      state: STATE,
      isProfileComplete: true,
      onboardingCompleted: true,
      keywords: organizerKeywords(),
      seedTestOrganizer: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return uid;
}

async function run() {
  const {APPLY, TODAY, projectId, managerUid, tournamentName, count} = parseArgs();
  const db = admin.firestore();
  const auth = admin.auth();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);
  console.log(`Atletas por nível×gênero: ${count} (total ${count * 10})`);
  console.log(`Torneio: "${tournamentName}" (${TODAY ? "hoje" : "em 14 dias"})`);

  // ── 1. Organizador ────────────────────────────────────────────────────────
  let organizerUid = managerUid;
  if (organizerUid) {
    console.log(`\nOrganizador: ${organizerUid} (informado via --manager-uid)`);
  } else if (!APPLY) {
    console.log(`\nOrganizador: seria criado como ${ORGANIZER_EMAIL}`);
    organizerUid = "<uid-do-organizador-seed>";
  } else {
    organizerUid = await ensureSeedOrganizer(db, auth);
    console.log(`\nOrganizador seed: ${organizerUid} (${ORGANIZER_EMAIL})`);
  }

  // ── 2. Atletas ────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\nAtletas: seriam criados/atualizados ${count * 10}.`);
  } else {
    console.log("\nCriando atletas...");
    const {total} = await seedAthletes({db, auth, count, city: CITY, state: STATE});
    console.log(`Atletas criados/atualizados: ${total}`);
  }

  // ── 3. Torneio + duplas + inscrições ──────────────────────────────────────
  console.log("\nTorneio e inscrições:");
  await runTournamentEnrollmentSeed({
    defaultTournamentName: tournamentName,
    buildTournamentDoc: (categories, name) =>
      TODAY ?
        buildTournamentDocToday(categories, name) :
        buildTournamentDocFuture(categories, name, 14),
    args: {
      APPLY,
      projectId,
      MANAGER_UID: organizerUid,
      TOURNAMENT_NAME: tournamentName,
    },
  });

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi gravado. Rode com --yes para aplicar.");
  } else {
    console.log(`\nPronto. Senha dos logins seed: ${process.env.SEED_PASSWORD || "Senha123!"}`);
    console.log("Para limpar: node scripts/delete-test-data.js --project " + projectId + " --yes");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed de dados de teste:", err);
    process.exit(1);
  });
