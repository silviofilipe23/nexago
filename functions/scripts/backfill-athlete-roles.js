/* eslint-disable */
/**
 * Atribui papel de atleta a usuários em users/{uid} sem `role` nem `roles`.
 *
 * Atualiza Firestore (`role`, `roles`, `hasAthleteRole`) e custom claims no Auth
 * quando o usuário ainda não tem papéis definidos em nenhum dos dois.
 *
 * Não altera contas que já têm organizer, arena, admin ou athlete.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-athlete-roles.js --project volley-track-dev-4596c
 *   node scripts/backfill-athlete-roles.js --project <projectId> --yes
 *   node scripts/backfill-athlete-roles.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

const ATHLETE_ROLE_PAYLOAD = {
  role: "athlete",
  roles: ["athlete"],
  hasAthleteRole: true,
};

function normalizeRoleList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function legacyRole(raw) {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/** Perfil Firestore sem papel definido. */
function firestoreNeedsAthleteRole(data) {
  const roles = normalizeRoleList(data.roles);
  const role = legacyRole(data.role);
  return roles.length === 0 && !role;
}

function claimsNeedAthleteRole(claims) {
  const roles = normalizeRoleList(claims?.roles);
  const role = legacyRole(claims?.role);
  return roles.length === 0 && !role;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function* iterateUserDocs() {
  let lastId = null;
  while (true) {
    let query = db
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(400);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) return;
    for (const doc of snap.docs) yield doc;
    lastId = snap.docs[snap.docs.length - 1].id;
  }
}

async function applyAthleteClaims(uid) {
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      return {status: "auth_missing"};
    }
    throw err;
  }

  const prev = user.customClaims || {};
  if (!claimsNeedAthleteRole(prev)) {
    return {status: "claims_skipped"};
  }

  await auth.setCustomUserClaims(uid, {
    ...prev,
    role: "athlete",
    roles: ["athlete"],
  });
  return {status: "claims_updated"};
}

async function run() {
  const candidates = [];
  for await (const doc of iterateUserDocs()) {
    if (!firestoreNeedsAthleteRole(doc.data())) continue;
    candidates.push(doc);
    if (LIMIT > 0 && candidates.length >= LIMIT) break;
  }

  console.log(
    `Encontrados ${candidates.length} usuário(s) sem role em ${projectId}.`,
  );
  if (candidates.length === 0) return;

  const preview = candidates.slice(0, 8).map((doc) => {
    const data = doc.data();
    const label =
      (typeof data.fullName === "string" && data.fullName.trim()) ||
      (typeof data.email === "string" && data.email.trim()) ||
      doc.id;
    return `${doc.id} (${label})`;
  });
  console.log("Exemplos:", preview.join(", "));

  if (!APPLY) {
    console.log("DRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  let firestoreUpdated = 0;
  let claimsUpdated = 0;
  let claimsSkipped = 0;
  let authMissing = 0;

  for (const part of chunk(candidates, 400)) {
    const batch = db.batch();
    for (const doc of part) {
      batch.set(
        doc.ref,
        {
          ...ATHLETE_ROLE_PAYLOAD,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
    await batch.commit();
    firestoreUpdated += part.length;
  }

  for (const doc of candidates) {
    const result = await applyAthleteClaims(doc.id);
    if (result.status === "claims_updated") claimsUpdated += 1;
    if (result.status === "claims_skipped") claimsSkipped += 1;
    if (result.status === "auth_missing") authMissing += 1;
  }

  console.log(`Firestore: ${firestoreUpdated} perfil(is) atualizado(s).`);
  console.log(
    `Auth claims: ${claimsUpdated} atualizado(s), ${claimsSkipped} já tinham papel, ${authMissing} sem conta Auth.`,
  );
  console.log("Backfill concluído.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });
