/* eslint-disable */
/**
 * Remove contas cujo e-mail contém "qa" (case-insensitive).
 * Ex.: qa.teste@..., atleta+qa@..., qa@nexago.test
 *
 * Só remove se for atleta (`hasAthleteRole` / `roles` / `role` / claims).
 * Organizadores/arenas com "qa" no e-mail não são tocados.
 *
 * Com --yes:
 *   1) apaga users/{uid} (recursivo: subcoleções)
 *   2) apaga athlete_profiles/{uid} e public_profiles/{uid} se existirem
 *   3) apaga a conta no Firebase Auth
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-users-qa-email.js --project volley-track-dev-4596c
 *   node scripts/delete-users-qa-email.js --project <projectId> --yes
 *   node scripts/delete-users-qa-email.js --project <projectId> --yes --limit 20
 *   node scripts/delete-users-qa-email.js --project <id> --needle qa
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
const EMAIL_NEEDLE = (argValue("--needle") || "wes").toLowerCase();

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

function emailContainsNeedle(email) {
  return typeof email === "string" && email.toLowerCase().includes(EMAIL_NEEDLE);
}

function isAthleteFromData(data) {
  if (!data || typeof data !== "object") return false;
  if (data.hasAthleteRole === true) return true;
  if (data.role === "athlete") return true;
  if (Array.isArray(data.roles) && data.roles.includes("athlete")) return true;
  return false;
}

function isAthleteFromClaims(claims) {
  if (!claims || typeof claims !== "object") return false;
  if (claims.role === "athlete") return true;
  if (Array.isArray(claims.roles) && claims.roles.includes("athlete")) return true;
  return false;
}

/**
 * @typedef {{ uid: string, email: string, source: string }} Match
 */

async function collectFromAuth(byUid) {
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = (user.email || "").trim();
      if (!emailContainsNeedle(email)) continue;

      const athleteByClaims = isAthleteFromClaims(user.customClaims);
      byUid.set(user.uid, {
        uid: user.uid,
        email,
        source: athleteByClaims ? "auth" : "auth-pending",
        _athleteConfirmed: athleteByClaims,
      });
      if (LIMIT != null && countConfirmed(byUid) >= LIMIT) return;
    }
    pageToken = page.pageToken;
  } while (pageToken && (LIMIT == null || countConfirmed(byUid) < LIMIT));
}

function countConfirmed(byUid) {
  let n = 0;
  for (const m of byUid.values()) {
    if (m._athleteConfirmed) n += 1;
  }
  return n;
}

async function collectFromUsers(byUid) {
  let lastId = null;
  while (LIMIT == null || countConfirmed(byUid) < LIMIT) {
    let query = db
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const email = typeof data.email === "string" ? data.email.trim() : "";
      if (!emailContainsNeedle(email)) continue;
      if (!isAthleteFromData(data)) continue;

      const existing = byUid.get(doc.id);
      byUid.set(doc.id, {
        uid: doc.id,
        email: email || existing?.email || "",
        source: existing ? `${existing.source}+users` : "users",
        _athleteConfirmed: true,
      });
      if (LIMIT != null && countConfirmed(byUid) >= LIMIT) return;
    }

    lastId = snap.docs[snap.docs.length - 1].id;
    if (snap.size < 400) break;
  }
}

async function confirmPendingAthletes(byUid) {
  for (const [uid, match] of [...byUid.entries()]) {
    if (match._athleteConfirmed) continue;
    const snap = await db.doc(`users/${uid}`).get();
    if (snap.exists && isAthleteFromData(snap.data())) {
      const data = snap.data();
      byUid.set(uid, {
        ...match,
        source: `${String(match.source).replace("-pending", "")}+users`,
        _athleteConfirmed: true,
        email:
          (typeof data.email === "string" && data.email.trim()) || match.email,
      });
    } else {
      byUid.delete(uid);
    }
  }
}

async function deleteFirestoreForUid(uid) {
  const userRef = db.doc(`users/${uid}`);
  try {
    await db.recursiveDelete(userRef);
  } catch (err) {
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
  console.log(
    `Filtro: e-mail contém "${EMAIL_NEEDLE}" E role athlete${LIMIT ? ` (limit=${LIMIT})` : ""}`,
  );
  console.log(APPLY ? "Modo: APLICAR (--yes)" : "Modo: DRY-RUN (sem --yes)");

  /** @type {Map<string, Match & { _athleteConfirmed?: boolean }>} */
  const byUid = new Map();
  await collectFromAuth(byUid);
  await collectFromUsers(byUid);
  await confirmPendingAthletes(byUid);

  const matches = [...byUid.values()]
    .filter((m) => m._athleteConfirmed)
    .map(({_athleteConfirmed, ...rest}) => rest)
    .sort((a, b) => a.email.localeCompare(b.email, "en", {sensitivity: "base"}));

  const limited = LIMIT != null ? matches.slice(0, LIMIT) : matches;

  console.log(`Encontrados ${limited.length} atleta(s) com e-mail contendo "${EMAIL_NEEDLE}".`);
  if (limited.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  const preview = limited.slice(0, 20);
  for (const m of preview) {
    console.log(`  - ${m.email} | ${m.uid} [${m.source}]`);
  }
  if (limited.length > preview.length) {
    console.log(`  … e mais ${limited.length - preview.length}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi apagado. Rode com --yes para remover.");
    return;
  }

  let firestoreOk = 0;
  let firestoreFail = 0;
  for (const m of limited) {
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
  for (const part of chunk(
    limited.map((m) => m.uid),
    1000,
  )) {
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
