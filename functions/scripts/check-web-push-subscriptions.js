/* eslint-disable */
/**
 * Lista as assinaturas de Web Push salvas (`users/{uid}/webPushSubscriptions`) de um usuário —
 * pra comparar com o endpoint ativo no navegador (`PushSubscription.endpoint`). Só leitura.
 *
 * Uso: node scripts/check-web-push-subscriptions.js --project volley-track-dev-4596c <uid>
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const uid = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== projectId);
if (!projectId || !uid) {
  console.error("Uso: node scripts/check-web-push-subscriptions.js --project <projectId> <uid>");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

async function main() {
  const snap = await db.collection(`users/${uid}/webPushSubscriptions`).get();
  console.log(`${snap.size} assinatura(s) para ${uid}:\n`);
  snap.forEach((d) => {
    const data = d.data();
    console.log(`- doc=${d.id}`);
    console.log(`  endpoint=${data.endpoint}`);
    console.log(`  createdAt=${data.createdAt ? data.createdAt.toDate().toISOString() : "—"}`);
    console.log("");
  });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
