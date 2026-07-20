/* eslint-disable */
/**
 * Remove contas cujo e-mail contém "seed-" (ex.: seed-iniciante_1-m-01@nexago.test).
 *
 * Varre Auth (paginado), filtra pelo e-mail e, com --yes:
 *   1) apaga users/{uid} (recursivo: subcoleções)
 *   2) apaga athlete_profiles/{uid} e public_profiles/{uid} se existirem
 *   3) apaga a conta no Firebase Auth
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-users-seed-email.js --project volley-track-dev-4596c
 *   node scripts/delete-users-seed-email.js --project <projectId> --yes
 *   node scripts/delete-users-seed-email.js --project <projectId> --yes --limit 20
 *
 * Seguro por padrão: sem --yes, só lista (dry-run).
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const LIMIT_RAW = argValue("--limit");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10)) : null;
const EMAIL_NEEDLE = (argValue("--needle") || "test").toLowerCase();

const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isSeedEmail(email) {
  return typeof email === "string" && email.toLowerCase().includes(EMAIL_NEEDLE);
}

async function listSeedAuthUsers() {
  /** @type {{ uid: string, email: string }[]} */
  const matches = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = user.email || "";
      if (!isSeedEmail(email)) continue;
      matches.push({uid: user.uid, email});
      if (LIMIT != null && matches.length >= LIMIT) {
        return matches;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return matches;
}

async function deleteFirestoreForUid(uid) {
  const userRef = db.doc(`users/${uid}`);
  try {
    await db.recursiveDelete(userRef);
  } catch (err) {
    // Doc pode não existir; tenta delete simples.
    const snap = await userRef.get();
    if (snap.exists) throw err;
  }

  for (const path of [`athlete_profiles/${uid}`, `public_profiles/${uid}`]) {
    const ref = db.doc(path);
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
  }
}

async function run() {
  console.log(`Projeto: ${projectId}`);
  console.log(`Filtro: e-mail contém "${EMAIL_NEEDLE}"${LIMIT ? ` (limit=${LIMIT})` : ""}`);
  console.log(APPLY ? "Modo: APLICAR (--yes)" : "Modo: DRY-RUN (sem --yes)");

  const matches = await listSeedAuthUsers();
  console.log(`Encontrados ${matches.length} usuário(s) no Auth.`);

  if (matches.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  const preview = matches.slice(0, 15);
  for (const m of preview) {
    console.log(`  - ${m.email}  (${m.uid})`);
  }
  if (matches.length > preview.length) {
    console.log(`  … e mais ${matches.length - preview.length}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi apagado. Rode com --yes para remover.");
    return;
  }

  let firestoreOk = 0;
  let firestoreFail = 0;
  for (const m of matches) {
    try {
      await deleteFirestoreForUid(m.uid);
      firestoreOk += 1;
    } catch (err) {
      firestoreFail += 1;
      console.warn(`Firestore falhou para ${m.email} (${m.uid}):`, err.message || err);
    }
  }
  console.log(`Firestore: ${firestoreOk} ok, ${firestoreFail} falha(s).`);

  let authDeleted = 0;
  let authFailed = 0;
  for (const part of chunk(matches.map((m) => m.uid), 1000)) {
    const res = await auth.deleteUsers(part);
    authDeleted += res.successCount;
    authFailed += res.failureCount;
    for (const err of res.errors) {
      console.warn("Auth falhou:", part[err.index], err.error.message);
    }
  }
  console.log(`Auth: ${authDeleted} removidas, ${authFailed} falha(s).`);
  console.log("Limpeza concluída.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });
