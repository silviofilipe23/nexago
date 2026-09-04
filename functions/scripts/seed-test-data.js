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
 * `--categories <n>` e `--teams-per-category <n>` cortam esse volume (ex.:
 * `--categories 5 --teams-per-category 12` → 5 categorias × 12 duplas). O
 * corte vale só na CRIAÇÃO do torneio: num torneio reutilizado valem as
 * categorias já gravadas nele.
 *
 * `--categories` só sabe cortar as PRIMEIRAS da ordem nível×gênero, então
 * quem escolhe QUAIS categorias são `--levels <códigos>` e `--genders
 * <male|female>` (listas separadas por vírgula). Ex.: um torneio só de Open
 * masculino com 10 duplas:
 *   --levels open --genders male --teams-per-category 10 --count 20
 * O recorte vale também para os atletas: sem ele, `--count 20` criaria 200
 * contas para usar 20.
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
 * `--project` é OBRIGATÓRIO e não tem fallback de env, e produção é bloqueada
 * — as mesmas guardas de `delete-test-data.js`, pelo motivo simétrico: o alias
 * `default` do .firebaserc aponta para produção, e este script cria 321 contas
 * no Auth mais um torneio `publicListing`/`open`, que apareceria na listagem
 * de usuários reais. Pior: a limpeza se RECUSA a rodar em produção, então o
 * estrago só se desfaz à mão.
 *
 * Limpeza: node scripts/delete-test-data.js --project <id> --yes
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {generateKeywords, seedAthletes} = require("./seed-athletes-lib");
const {
  LEVELS,
  GENDERS,
  TOTAL_CATEGORIES,
  MAX_TEAMS_PER_CATEGORY,
  assertReusableSeedTournament,
  buildCategories,
  buildTournamentDocFuture,
  buildTournamentDocToday,
  runTournamentEnrollmentSeed,
} = require("./seed-tournament-enrollments-lib");

const DEFAULT_TOURNAMENT_NAME = "Torneio seed nexaGO";
const ORGANIZER_EMAIL = "seed-organizer@nexago.test";
const ORGANIZER_NAME = "Organizador seed nexaGO";
const CITY = "Goiânia";
const STATE = "GO";
const DEFAULT_SEED_PASSWORD = "Senha123!";
const PROD_PROJECT_ID = "volley-track-2dd3b";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

/** Inteiro opcional com faixa; ausente vira `undefined` (mantém o default). */
function optionalIntArg(flag, min, max) {
  const raw = argValue(flag);
  if (raw === undefined) return undefined;
  const value = parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`${flag} precisa ser um inteiro entre ${min} e ${max}.`);
    process.exit(1);
  }
  return value;
}

/**
 * Lista separada por vírgula, validada contra `allowed`; ausente vira
 * `undefined` (mantém o default). Valor fora da lista aborta: um typo que
 * virasse "recorte vazio" produziria um torneio sem categoria nenhuma.
 */
function optionalListArg(flag, allowed) {
  const raw = argValue(flag);
  if (raw === undefined) return undefined;
  const values = [
    ...new Set(
      raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const invalid = values.filter((v) => !allowed.includes(v));
  if (!values.length || invalid.length) {
    const problem = values.length ?
      `valor inválido (${invalid.join(", ")})` :
      "precisa de ao menos um valor";
    console.error(`${flag}: ${problem}. Aceitos: ${allowed.join(", ")}.`);
    process.exit(1);
  }
  return values;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const TODAY = process.argv.includes("--today");

  // Sem fallback de env e produção bloqueada: ver o comentário do topo.
  const projectId = (argValue("--project") || "").trim();
  if (!projectId) {
    console.error("Informe o projeto explicitamente: --project <projectId>.");
    console.error("Este script não lê GCLOUD_PROJECT — o default do .firebaserc é produção.");
    process.exit(1);
  }
  if (projectId === PROD_PROJECT_ID) {
    console.error(`BLOQUEADO: ${projectId} é o projeto de PRODUÇÃO.`);
    console.error("Este script cria dados de teste; não rode em produção.");
    console.error("delete-test-data.js se recusa a rodar em produção — a limpeza seria manual.");
    process.exit(1);
  }

  const managerUid = (argValue("--manager-uid") || "").trim();
  const tournamentName = argValue("--tournament-name") || DEFAULT_TOURNAMENT_NAME;
  const count = parseInt(argValue("--count") || process.env.COUNT || "32", 10);
  if (!Number.isInteger(count) || count < 1) {
    console.error("--count precisa ser um inteiro >= 1.");
    process.exit(1);
  }
  const password = process.env.SEED_PASSWORD || DEFAULT_SEED_PASSWORD;

  // Ausentes = volume padrão (10 categorias × 16 duplas). Só entram no
  // `categoryOptions` quando informadas, para nenhum comando existente mudar.
  const categories = optionalIntArg("--categories", 1, TOTAL_CATEGORIES);
  const teamsPerCategory = optionalIntArg("--teams-per-category", 1, 64);
  const levels = optionalListArg("--levels", LEVELS.map((l) => l.code));
  const genders = optionalListArg("--genders", GENDERS.map((g) => g.type));

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

  return {
    APPLY,
    TODAY,
    projectId,
    managerUid,
    tournamentName,
    count,
    password,
    categories,
    teamsPerCategory,
    levels,
    genders,
  };
}

/** Prefixos de busca — mesmo formato de `seed-athletes-lib.generateKeywords`. */
function organizerKeywords() {
  return generateKeywords([ORGANIZER_NAME, CITY]);
}

/**
 * Garante o organizador seed no Auth + `users/{uid}`. Idempotente.
 * `managerId === uid` é tudo que o ACL de torneio exige
 * (`functions/src/tournament-acl.ts:20`), mas o doc é criado completo para o
 * painel do organizador conseguir renderizar o perfil.
 */
async function ensureSeedOrganizer(db, auth, password) {
  let uid;
  try {
    const existing = await auth.getUserByEmail(ORGANIZER_EMAIL);
    uid = existing.uid;
  } catch (e) {
    // Só "não existe" justifica criar. Engolir qualquer erro aqui transforma
    // uma falha transitória de rede/permissão num `auth/email-already-exists`
    // vindo do `createUser` logo abaixo — sintoma que não aponta para a causa.
    if (!e || e.code !== "auth/user-not-found") throw e;
    const created = await auth.createUser({
      email: ORGANIZER_EMAIL,
      password,
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
  const {
    APPLY,
    TODAY,
    projectId,
    managerUid,
    tournamentName,
    count,
    password,
    categories,
    teamsPerCategory,
    levels,
    genders,
  } = parseArgs();
  const db = admin.firestore();
  const auth = admin.auth();

  const categoryOptions =
    categories === undefined &&
    teamsPerCategory === undefined &&
    levels === undefined &&
    genders === undefined ?
      undefined :
      {
        maxCategories: categories,
        maxTeamsPerCategory: teamsPerCategory,
        levels,
        genders,
      };

  // Os atletas nascem por (nível × gênero): o mesmo recorte que escolhe as
  // categorias encolhe o total de contas criadas.
  const athleteTotal =
    count *
    (levels ? levels.length : LEVELS.length) *
    (genders ? genders.length : GENDERS.length);

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);
  console.log(`Atletas por nível×gênero: ${count} (total ${athleteTotal})`);
  console.log(`Torneio: "${tournamentName}" (${TODAY ? "hoje" : "em 14 dias"})`);
  if (categoryOptions) {
    // Lista as categorias REAIS em vez de descrever o corte: com
    // `--levels`/`--genders` "as N primeiras da ordem" deixaria de ser verdade.
    const planned = buildCategories(categoryOptions);
    const teamsLabel = teamsPerCategory === undefined ?
      `${MAX_TEAMS_PER_CATEGORY} (padrão)` :
      String(teamsPerCategory);
    console.log(
      `Categorias: ${planned.length} de ${TOTAL_CATEGORIES} — ` +
      planned.map((c) => c.categoryName).join(", "),
    );
    console.log(`Duplas por categoria: ${teamsLabel}`);
    // O pool de atletas é por nível×gênero; duplas exigem 2 por vaga. Com
    // `--count` abaixo disso o seed grava menos duplas do que o pedido e não
    // falha — o aviso existe para isso não passar por "deu certo".
    const needed = (teamsPerCategory ?? MAX_TEAMS_PER_CATEGORY) * 2;
    if (count < needed) {
      console.log(
        `  AVISO: --count ${count} < ${needed} atletas necessários por categoria;` +
        ` cada categoria fica com ${Math.floor(count / 2)} duplas.`,
      );
    }
  }

  // ── 0. Pré-voo: o nome do torneio não pode casar com torneio real ─────────
  // Antes de criar organizador e atletas: se o nome casar com um torneio sem
  // `seedTestTournament`, aborta aqui, com o projeto ainda intocado.
  await assertReusableSeedTournament(db, tournamentName);

  // ── 1. Organizador ────────────────────────────────────────────────────────
  let organizerUid = managerUid;
  if (organizerUid) {
    console.log(`\nOrganizador: ${organizerUid} (informado via --manager-uid)`);
  } else if (!APPLY) {
    console.log(`\nOrganizador: seria criado como ${ORGANIZER_EMAIL}`);
    organizerUid = "<uid-do-organizador-seed>";
  } else {
    organizerUid = await ensureSeedOrganizer(db, auth, password);
    console.log(`\nOrganizador seed: ${organizerUid} (${ORGANIZER_EMAIL})`);
  }

  // ── 2. Atletas ────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\nAtletas: seriam criados/atualizados ${athleteTotal}.`);
  } else {
    console.log("\nCriando atletas...");
    // `password` precisa ser repassado: sem ele os atletas nasceriam com o
    // default da lib e o SEED_PASSWORD valeria só para o organizador — o
    // script imprimiria uma senha que não abre 320 dos 321 logins.
    const {total} = await seedAthletes({
      db,
      auth,
      count,
      password,
      city: CITY,
      state: STATE,
      levels,
      genders,
    });
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
    // A busca por nome casa por substring nos dois sentidos, então
    // `--tournament-name "Copa"` acharia a "Copa Goiás" REAL. Reutilizar um
    // torneio real seria irreversível: o seed grava inscrições e teams
    // dentro dele, `refreshTournamentStats` sobrescreve enrolledCount/
    // collectedCents, e como o doc nunca ganha `seedTestTournament: true` a
    // limpeza não desfaz nada — e ainda passa a preservar os 320 atletas para
    // sempre, por estarem "inscritos em torneio real".
    requireSeedFlagOnReuse: true,
    categoryOptions,
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
    console.log(`\nPronto. Senha dos logins seed: ${password}`);
    if (password !== DEFAULT_SEED_PASSWORD) {
      console.log(
        "(contas que já existiam mantêm a senha original: o seed é idempotente por",
      );
      console.log(" e-mail e não regrava a senha de conta existente no Auth.)",
      );
    }
    console.log("Para limpar: node scripts/delete-test-data.js --project " + projectId + " --yes");
  }
}

// Só executa quando chamado direto pela CLI; requerido por teste, apenas exporta.
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      // Abortos deliberados (ex.: torneio reutilizado sem flag de seed) já
      // carregam a explicação completa na mensagem; imprimir o objeto de erro
      // inteiro só enterraria o texto sob um stack trace irrelevante.
      if (err && err.seedAbort === true) {
        console.error(`\n${err.message}`);
      } else {
        console.error("Falha no seed de dados de teste:", err);
      }
      process.exit(1);
    });
}

module.exports = {run, DEFAULT_SEED_PASSWORD};
