/* eslint-disable */
/**
 * Conta a base instalada por build, lendo `users/{uid}/tokens`.
 *
 * Responde a pergunta que trava a decisão de apertar o `minBuildNumber` em
 * `appConfig/appVersion`: quanto da base está ABAIXO do build que trouxe o
 * gate de atualização obrigatória (101)? Quem está abaixo não tem o código do
 * gate e não é alcançável por bloqueio nenhum — só por push.
 *
 * O app grava `buildNumber`/`appVersion` no doc do token a cada boot
 * (nexago_app/lib/core/notifications/token_app_version.dart). Docs SEM esses
 * campos são instalações que não abrem o app desde que essa gravação subiu:
 * saem em `(sem buildNumber)`, separados de `abaixo do gate`, porque são
 * suspeita de base antiga e não prova.
 *
 * Read-only: não escreve nada, não tem --yes.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/count-app-builds.js --project <projectId>
 *   node scripts/count-app-builds.js --project <projectId> --gate 101
 */

const admin = require("firebase-admin");
const {summarizeTokenBuilds, DEFAULT_GATE} = require("./lib/app-build-histogram");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const gateRaw = argValue("--gate");
const gate = gateRaw === undefined ? DEFAULT_GATE : Number(gateRaw);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}
if (!Number.isInteger(gate) || gate < 0) {
  console.error("--gate precisa ser inteiro >= 0.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const PAGE = 500;

/** Todo doc de token do projeto, paginado por __name__. */
async function readAllTokens() {
  const docs = [];
  let cursor = null;
  for (;;) {
    let query = db
      .collectionGroup("tokens")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) docs.push(doc.data() || {});
    process.stderr.write(`\r  lidos: ${docs.length}`);
    if (snap.size < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  if (docs.length) process.stderr.write("\n");
  return docs;
}

function printSummary(summary) {
  console.log(`\nBase instalada por build (${projectId}) — gate ${summary.gate}:`);
  console.log(`  tokens lidos: ${summary.total}\n`);

  const names = Object.keys(summary.platforms).sort();
  if (names.length === 0) {
    console.log("  (nenhum token encontrado)");
    return;
  }

  for (const name of names) {
    const b = summary.platforms[name];
    console.log(`  ${name}  (${b.total})`);
    for (const {build, count} of b.builds) {
      const flag = build < summary.gate ? "  <- sem gate" : "";
      console.log(`    build ${String(build).padStart(4)}: ${count}${flag}`);
    }
    if (b.unknown) console.log(`    (sem buildNumber): ${b.unknown}`);
    console.log(
      `    -> abaixo do gate: ${b.belowGate} | no gate ou acima: ${b.atOrAboveGate} | sem info: ${b.unknown}`
    );
    console.log("");
  }

  console.log(
    "Leitura: 'abaixo do gate' é inalcançável por bloqueio (só push). 'sem info'\n" +
    "é instalação que não abre o app desde que a gravação da versão subiu."
  );
}

async function run() {
  const docs = await readAllTokens();
  printSummary(summarizeTokenBuilds(docs, {gate}));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    if (String(error && error.message).includes("index")) {
      console.error(
        "\nA query de collection group pediu índice. Crie pelo link do erro abaixo."
      );
    }
    console.error(error);
    process.exit(1);
  });
