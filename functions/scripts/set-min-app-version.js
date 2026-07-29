/* eslint-disable */
/**
 * Publica a versão mínima do app em `appConfig/appVersion` — o doc que o gate
 * de atualização obrigatória (nexago_app/lib/core/app_update/) lê ao vivo.
 *
 * Formato gravado:
 *   appConfig/appVersion {
 *     android: { minBuildNumber, storeUrl?, title?, message? },
 *     ios:     { minBuildNumber, storeUrl?, title?, message? }
 *   }
 *
 * Cada plataforma é escrita de forma independente (merge): rodar com
 * `--platform android` não mexe no bloco `ios`.
 *
 * ATENÇÃO: `minBuildNumber` é o build number (`+N` do pubspec / versionCode),
 * NÃO o versionName. Todo mundo abaixo dele trava na tela de atualização e só
 * sai de lá instalando a nova versão. Publique o build na loja ANTES de
 * apertar o número aqui, senão a base fica sem para onde ir.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/set-min-app-version.js --project <projectId> --platform android --min 101
 *   node scripts/set-min-app-version.js --project <projectId> --platform android --min 101 --yes
 *   node scripts/set-min-app-version.js --project <projectId> --show
 *
 * Sem --yes é DRY-RUN: mostra o estado atual e o que seria gravado.
 *
 * Flags opcionais:
 *   --store-url <url>   link da loja (default: o embutido no app)
 *   --title <texto>     título da tela de bloqueio
 *   --message <texto>   corpo da tela de bloqueio
 *   --clear-text        remove title/message gravados (volta pro texto do app)
 *
 * Para DESLIGAR o bloqueio sem publicar app novo: --min 0
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const SHOW_ONLY = process.argv.includes("--show");
const CLEAR_TEXT = process.argv.includes("--clear-text");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const platform = argValue("--platform");
const minRaw = argValue("--min");
const storeUrl = argValue("--store-url");
const title = argValue("--title");
const message = argValue("--message");

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DOC_PATH = "appConfig/appVersion";

async function readCurrent() {
  const snap = await db.doc(DOC_PATH).get();
  return snap.exists ? snap.data() : null;
}

function printCurrent(current) {
  console.log(`\nEstado atual de ${DOC_PATH} (${projectId}):`);
  if (!current) {
    console.log("  (doc não existe — nenhum bloqueio ativo)");
    return;
  }
  for (const key of ["android", "ios"]) {
    const block = current[key];
    if (!block) {
      console.log(`  ${key}: (não configurado)`);
      continue;
    }
    console.log(`  ${key}: minBuildNumber=${block.minBuildNumber ?? 0}` +
      (block.storeUrl ? ` storeUrl=${block.storeUrl}` : "") +
      (block.title ? ` title=${JSON.stringify(block.title)}` : "") +
      (block.message ? ` message=${JSON.stringify(block.message)}` : ""));
  }
}

async function run() {
  const current = await readCurrent();
  printCurrent(current);

  if (SHOW_ONLY) return;

  if (platform !== "android" && platform !== "ios") {
    console.error("\nInforme --platform android|ios (ou use --show).");
    process.exit(1);
  }

  const min = Number(minRaw);
  if (!Number.isInteger(min) || min < 0) {
    console.error("\nInforme --min <inteiro >= 0> (build number mínimo).");
    process.exit(1);
  }

  const block = {minBuildNumber: min};
  if (storeUrl) block.storeUrl = storeUrl;
  if (CLEAR_TEXT) {
    block.title = admin.firestore.FieldValue.delete();
    block.message = admin.firestore.FieldValue.delete();
  } else {
    if (title) block.title = title;
    if (message) block.message = message;
  }

  const currentMin = current?.[platform]?.minBuildNumber ?? 0;
  console.log(
    `\nMudança em ${platform}: minBuildNumber ${currentMin} -> ${min}` +
    (min === 0 ? "  (bloqueio DESLIGADO)" : "")
  );
  if (storeUrl) console.log(`  storeUrl -> ${storeUrl}`);
  if (CLEAR_TEXT) console.log("  title/message -> removidos");
  else {
    if (title) console.log(`  title -> ${JSON.stringify(title)}`);
    if (message) console.log(`  message -> ${JSON.stringify(message)}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada foi gravado. Rode de novo com --yes para aplicar.");
    return;
  }

  await db.doc(DOC_PATH).set({[platform]: block}, {merge: true});
  console.log("\nGravado.");
  printCurrent(await readCurrent());
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
