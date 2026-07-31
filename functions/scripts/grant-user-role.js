/* eslint-disable */
/**
 * Concede/remove papéis de um usuário escrevendo nos DOIS lugares que o
 * sistema usa: os custom claims do Auth (fonte de verdade — `firestore.rules`
 * e os clients leem `request.auth.token.roles` / `claims['roles']`) e o
 * espelho `users/{uid}.roles`.
 *
 * Editar `users/{uid}.roles` direto no console do Firestore NÃO funciona:
 * nenhum trigger sincroniza doc → claims (os triggers em `users/{userId}` são
 * de níveis, search-keywords e public_profiles). Sem o claim, nada muda para
 * as rules nem para o app.
 *
 * Mesma semântica dos callables em `functions/src/user-role-ops.ts`:
 * `roles` ordenado e sem duplicatas, campo legado `role` purgado do doc e dos
 * claims, `superAdmin` removido junto com o papel `admin`, e o usuário sempre
 * mantém ao menos um papel.
 *
 * Pré-requisitos (credenciais admin):
 *   firebase login  # ADC do Firebase CLI já basta
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/grant-user-role.js --project volley-track-dev-4596c --email fulano@x.com
 *   node scripts/grant-user-role.js --project <projectId> --uid <uid> --add organizer
 *   node scripts/grant-user-role.js --project <projectId> --email <e> --add arena --yes
 *   node scripts/grant-user-role.js --project <projectId> --uid <uid> --remove coach --yes
 *   node scripts/grant-user-role.js --project <projectId> --uid <uid> --set athlete,organizer --yes
 *   node scripts/grant-user-role.js --project <projectId> --uid <uid> --add arena --yes --revoke
 *
 * Sem --add/--remove/--set: só mostra o estado atual (claims vs doc).
 * Sem --yes: dry-run, nada é gravado.
 *
 * DEPOIS DE APLICAR o usuário precisa de um token novo: sair e entrar de novo
 * no app, ou `getIdTokenResult(true)`. Vários pontos do app leem o token EM
 * CACHE (`getIdTokenResult(false)`), que só renova sozinho ao expirar (~1h).
 * `--revoke` invalida os refresh tokens para forçar isso.
 */

const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const REVOKE = process.argv.includes("--revoke");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const uidArg = argValue("--uid");
const emailArg = argValue("--email");
const addArg = argValue("--add");
const removeArg = argValue("--remove");
const setArg = argValue("--set");

// Alinhado a ALLOWED_APP_ROLES em functions/src/auth-roles.ts
const ALLOWED_ROLES = ["admin", "organizer", "athlete", "arena", "coach"];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!projectId) {
  fail("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
}
if (!uidArg && !emailArg) {
  fail("Informe o usuário: --uid <uid> ou --email <email>.");
}
if (setArg && (addArg || removeArg)) {
  fail("--set não combina com --add/--remove. Use um ou outro.");
}

function parseRoles(raw, flag) {
  const parsed = String(raw)
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  if (parsed.length === 0) {
    fail(`${flag}: informe ao menos um papel.`);
  }
  for (const r of parsed) {
    if (!ALLOWED_ROLES.includes(r)) {
      fail(`${flag}: papel inválido '${r}'. Use: ${ALLOWED_ROLES.join(", ")}.`);
    }
  }
  return parsed;
}

const toAdd = addArg ? parseRoles(addArg, "--add") : [];
const toRemove = removeArg ? parseRoles(removeArg, "--remove") : [];
const toSet = setArg ? parseRoles(setArg, "--set") : null;

admin.initializeApp({projectId});
const auth = admin.auth();
const db = admin.firestore();

/** Espelha uniqueSortedRoles() de functions/src/auth-roles.ts. */
function normalizeRoles(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const v = r.trim().toLowerCase();
    if (ALLOWED_ROLES.includes(v) && !out.includes(v)) out.push(v);
  }
  return out.sort();
}

/** Espelha o cálculo das flags derivadas em functions/src/search-keywords.ts. */
function roleFlags(roles) {
  return {
    hasAthleteRole: roles.includes("athlete"),
    hasOrganizerRole: roles.includes("organizer"),
  };
}

function sameRoles(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

(async () => {
  const user = uidArg ?
    await auth.getUser(uidArg) :
    await auth.getUserByEmail(String(emailArg).trim().toLowerCase());

  const claims = user.customClaims || {};
  const claimRoles = normalizeRoles(claims.roles);
  const docRef = db.doc(`users/${user.uid}`);
  const docSnap = await docRef.get();
  const docData = docSnap.exists ? docSnap.data() || {} : null;
  const docRoles = normalizeRoles(docData && docData.roles);

  console.log(`Projeto: ${projectId} | modo: ${APPLY ? "APLICAR" : "dry-run"}`);
  console.log(`Usuário: ${user.uid} <${user.email || "sem e-mail"}>`);
  console.log(`  claims.roles (fonte de verdade): ${JSON.stringify(claimRoles)}`);
  console.log(`  users/${user.uid}.roles (espelho): ${docSnap.exists ? JSON.stringify(docRoles) : "DOC NÃO EXISTE"}`);
  if (claims.role !== undefined) {
    console.log(`  ATENÇÃO: claim legado role=${JSON.stringify(claims.role)} será removido.`);
  }
  if (docData && docData.role !== undefined) {
    console.log(`  ATENÇÃO: campo legado role=${JSON.stringify(docData.role)} no doc será removido.`);
  }
  if (!sameRoles(claimRoles, docRoles) && docSnap.exists) {
    console.log("  AVISO: claims e doc divergem — este script realinha os dois.");
  }

  if (!toSet && toAdd.length === 0 && toRemove.length === 0) {
    console.log("\nNenhuma alteração pedida (use --add / --remove / --set).");
    process.exit(0);
  }

  // Base = união claims ∪ doc, mesma decisão do backfill-remove-legacy-role.js:
  // evita rebaixar silenciosamente quem tem papéis só no doc (ou só no claim).
  const base = normalizeRoles([...claimRoles, ...docRoles]);
  const next = toSet ?
    normalizeRoles(toSet) :
    normalizeRoles([...base, ...toAdd]).filter((r) => !toRemove.includes(r));

  if (next.length === 0) {
    fail("Recusado: o usuário deve manter ao menos um papel.");
  }

  console.log(`\n  ${JSON.stringify(base)} → ${JSON.stringify(next)}`);

  const claimsUpToDate = sameRoles(claimRoles, next) && !("role" in claims);
  const docUpToDate =
    docSnap.exists &&
    sameRoles(docData.roles, next) &&
    docData.role === undefined &&
    docData.hasAthleteRole === next.includes("athlete") &&
    docData.hasOrganizerRole === next.includes("organizer");

  if (claimsUpToDate && docUpToDate) {
    console.log("Nada a fazer: claims e doc já estão nesse estado.");
    process.exit(0);
  }

  if (!APPLY) {
    if (!claimsUpToDate) console.log(`  [claims] gravaria roles=${JSON.stringify(next)}`);
    if (!docUpToDate) console.log(`  [doc] gravaria users/${user.uid} roles=${JSON.stringify(next)} + flags`);
    if (REVOKE) console.log("  [auth] revogaria os refresh tokens");
    console.log("\nDry-run: nada foi gravado. Rode com --yes para aplicar.");
    process.exit(0);
  }

  if (!claimsUpToDate) {
    const nextClaims = {...claims, roles: next};
    delete nextClaims.role;
    if (!next.includes("admin")) delete nextClaims.superAdmin;
    await auth.setCustomUserClaims(user.uid, nextClaims);
    console.log(`  [claims] roles=${JSON.stringify(next)} ✔`);
  }

  if (!docUpToDate) {
    const payload = {roles: next, role: FieldValue.delete(), ...roleFlags(next)};
    if (!docSnap.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
      if (user.email) payload.email = user.email.trim().toLowerCase();
      if (user.displayName) payload.fullName = user.displayName;
      console.log(`  [doc] users/${user.uid} não existia — criando doc mínimo.`);
    }
    await docRef.set(payload, {merge: true});
    console.log(`  [doc] users/${user.uid} roles=${JSON.stringify(next)} ✔`);
  }

  if (REVOKE) {
    await auth.revokeRefreshTokens(user.uid);
    console.log("  [auth] refresh tokens revogados ✔ (o usuário precisa entrar de novo)");
  }

  console.log(
    "\nPronto. O usuário só verá a mudança com um token NOVO: sair e entrar de novo " +
    "no app (ou getIdTokenResult(true)). O token em cache dura até ~1h.",
  );
  process.exit(0);
})().catch((e) => {
  if (e && e.code === "auth/user-not-found") {
    console.error("Usuário não encontrado no Auth deste projeto.");
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
