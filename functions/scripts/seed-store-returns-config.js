/* eslint-disable */
/**
 * Grava a configuração de Trocas & devoluções em `storeConfig/returns`.
 *
 *   { windowDays, arenaReturnFree, carrierLabelCents, storePaysReasons[] }
 *
 * Sem o doc, servidor e backoffice usam o padrão de `DEFAULT_RETURNS_CONFIG`
 * (functions/src/store-returns.ts) — rodar isto só é preciso para mudar valores.
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-store-returns-config.js --project <id>                          # mostra o atual
 *   node scripts/seed-store-returns-config.js --project <id> --window 30 --label 2490 --yes
 * Flags: --window <dias> · --label <centavos da etiqueta> · --arena-paid (devolver na arena cobra etiqueta)
 *        --store-pays defeito,avaria
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}
admin.initializeApp({projectId});
const ref = admin.firestore().collection("storeConfig").doc("returns");

const REASONS = ["tamanho", "defeito", "nao_gostei", "avaria", "outro"];

async function main() {
  const current = (await ref.get()).data() ?? null;
  console.log(`\nstoreConfig/returns em ${projectId}:`, current ?? "(não existe — vale o padrão do código)");
  const next = {};
  if (argValue("--window")) next.windowDays = Number(argValue("--window"));
  if (argValue("--label")) next.carrierLabelCents = Number(argValue("--label"));
  if (process.argv.includes("--arena-paid")) next.arenaReturnFree = false;
  if (argValue("--store-pays")) next.storePaysReasons = argValue("--store-pays").split(",").filter((r) => REASONS.includes(r));
  if (Object.keys(next).length === 0) return;
  if (!Number.isInteger(next.windowDays ?? 1) || (next.windowDays ?? 1) < 1) throw new Error("--window inválido");
  if (!Number.isInteger(next.carrierLabelCents ?? 0) || (next.carrierLabelCents ?? 0) < 0) throw new Error("--label inválido");
  console.log("Gravaria:", next);
  if (APPLY) {
    await ref.set(next, {merge: true});
    console.log("Gravado.");
  } else {
    console.log("DRY-RUN — use --yes para gravar.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
