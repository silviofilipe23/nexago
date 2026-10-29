/* eslint-disable */
/**
 * Backfill do índice `userPhoneKeys/{uid}` (WhatsApp normalizado de cada conta).
 *
 * POR QUE existe: o gatilho `onUserWrittenSyncPublicProfile` só indexa quem
 * grava o perfil DEPOIS do deploy. Sem o backfill, o aviso "este WhatsApp já
 * está em outra conta" do cadastro fica cego para todas as contas antigas — que
 * são justamente as que a pessoa esqueceu que tinha.
 *
 * Ordem: deploy das functions (gatilho + `checkPhoneInOtherAccount`) e SÓ
 * ENTÃO este script — rodar antes funciona, mas quem editar o perfil no meio
 * fica com o índice velho até a próxima gravação.
 *
 * A trava da inscrição NÃO depende deste índice (compara a categoria direto).
 *
 *   node scripts/backfill-user-phone-keys.js --project volley-track-dev-4596c          # simulação
 *   node scripts/backfill-user-phone-keys.js --project volley-track-dev-4596c --apply
 *
 * Imprime só contagens — nenhum telefone sai no terminal.
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const {phoneIdentityKey} = require("../lib/athlete-twin-accounts");
const {USER_PHONE_KEYS_COLLECTION} = require("../lib/athlete-twin-account-lookup");

const PAGE = 400;

(async () => {
  let last = null;
  let users = 0;
  let indexed = 0;
  let withoutPhone = 0;
  const accountsByKey = new Map();

  for (;;) {
    let query = db.collection("users").orderBy("__name__").limit(PAGE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      users++;
      const key = phoneIdentityKey(doc.data().phoneNumber);
      if (!key) {
        withoutPhone++;
        continue;
      }
      indexed++;
      accountsByKey.set(key, (accountsByKey.get(key) ?? 0) + 1);
      batch.set(db.doc(`${USER_PHONE_KEYS_COLLECTION}/${doc.id}`), {
        phoneKey: key,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (apply) await batch.commit();
    last = snap.docs[snap.docs.length - 1];
  }

  const shared = [...accountsByKey.values()].filter((n) => n > 1);
  console.log({
    projectId,
    mode: apply ? "apply" : "dry-run",
    users,
    indexed,
    withoutPhone,
    numbersInMoreThanOneAccount: shared.length,
    accountsSharingANumber: shared.reduce((a, n) => a + n, 0),
  });
  if (!apply) console.log("Simulação: nada foi gravado. Rode com --apply.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
