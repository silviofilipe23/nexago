/* eslint-disable */
/**
 * Remove o campo legado `role` de users/{uid}, public_profiles/{uid} e dos
 * custom claims do Auth, garantindo `roles[]` como única fonte de papéis.
 *
 * Passe A — usuários do Auth: resolve papéis efetivos como a UNIÃO de
 *   (claims.roles ou [claims.role]) com (doc.roles ou [doc.role]); vazio
 *   vira ['athlete'] (ajustado 15/07 na review final: união em vez de
 *   claims-first, evita rebaixamento silencioso quando claims e doc
 *   discordam), regrava claims sem `role` e o doc com roles[]/
 *   hasAthleteRole/hasOrganizerRole. Cria doc mínimo quando não existe
 *   (mesmo formato que o app novo grava no cadastro).
 * Passe B — varredura de users/: docs sem conta no Auth (ex.: pré-cadastro
 *   de parceiro) que ainda tenham `role` ou estejam sem `roles[]`.
 * Passe C — varredura de public_profiles/: deleta `role` remanescente.
 *
 * Rode DEPOIS do deploy das functions novas (o sync antigo re-espelharia
 * `role` de volta).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-remove-legacy-role.js --project volley-track-dev-4596c
 *   node scripts/backfill-remove-legacy-role.js --project <projectId> --yes
 *   node scripts/backfill-remove-legacy-role.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

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

const ALLOWED_ROLES = ["admin", "organizer", "athlete", "arena", "coach"];

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

function legacyRoleOf(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return ALLOWED_ROLES.includes(v) ? v : null;
}

function roleFlags(roles) {
  return {
    hasAthleteRole: roles.includes("athlete"),
    hasOrganizerRole: roles.includes("organizer"),
  };
}

/**
 * União de (claims.roles ou [claims.role]) com (doc.roles ou [doc.role]);
 * vazio vira ['athlete']. Decisão de 15/07 pós-review: união em vez de
 * claims-first, pra não rebaixar silenciosamente um usuário cujos claims
 * ficaram desatualizados mas cujo doc já tem papéis extras (ex.: claims
 * só ['organizer'], doc ['athlete','organizer'] → mantém os dois).
 */
function effectiveRoles(claims, docData) {
  const claimsRoles = normalizeRoles(claims && claims.roles);
  const legacyClaim = legacyRoleOf(claims && claims.role);
  const claimsResolved = claimsRoles.length > 0 ? claimsRoles : (legacyClaim ? [legacyClaim] : []);

  const docRoles = normalizeRoles(docData && docData.roles);
  const legacyDoc = legacyRoleOf(docData && docData.role);
  const docResolved = docRoles.length > 0 ? docRoles : (legacyDoc ? [legacyDoc] : []);

  const union = normalizeRoles([...claimsResolved, ...docResolved]);
  return union.length > 0 ? union : ["athlete"];
}

async function passA() {
  let processed = 0;
  let claimsUpdated = 0;
  let docsUpdated = 0;
  let docsCreated = 0;
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (LIMIT > 0 && processed >= LIMIT) return {processed, claimsUpdated, docsUpdated, docsCreated};
      processed += 1;

      const claims = u.customClaims || {};
      const docRef = db.doc(`users/${u.uid}`);
      const docSnap = await docRef.get();
      const docData = docSnap.exists ? docSnap.data() || {} : null;
      const roles = effectiveRoles(claims, docData);

      const claimsClean =
        JSON.stringify(normalizeRoles(claims.roles)) === JSON.stringify(roles) &&
        !("role" in claims);
      if (!claimsClean) {
        claimsUpdated += 1;
        console.log(`[claims] ${u.uid}: roles=${JSON.stringify(roles)} (antes: roles=${JSON.stringify(claims.roles)}, role=${JSON.stringify(claims.role)})`);
        if (APPLY) {
          const next = {...claims, roles};
          delete next.role;
          if (!roles.includes("admin")) delete next.superAdmin;
          await auth.setCustomUserClaims(u.uid, next);
        }
      }

      if (docData) {
        // Doc "limpo" exige também que o array RAW já seja igual ao normalizado — senão
        // duplicatas/case errado (ex.: ['athlete','athlete'], ['Athlete']) passariam batido
        // e quebrariam a igualdade/`in` exigida pelas rules depois do backfill.
        const rawRolesMatchNormalized =
          JSON.stringify(docData.roles) === JSON.stringify(normalizeRoles(docData.roles));
        const docClean =
          rawRolesMatchNormalized &&
          JSON.stringify(normalizeRoles(docData.roles)) === JSON.stringify(roles) &&
          docData.role === undefined &&
          docData.hasAthleteRole === roles.includes("athlete") &&
          docData.hasOrganizerRole === roles.includes("organizer");
        if (!docClean) {
          docsUpdated += 1;
          console.log(`[doc] users/${u.uid}: roles=${JSON.stringify(roles)} (antes roles=${JSON.stringify(docData.roles)}), deleta role=${JSON.stringify(docData.role)}`);
          if (APPLY) {
            await docRef.set(
              {roles, role: FieldValue.delete(), ...roleFlags(roles)},
              {merge: true},
            );
          }
        }
      } else {
        docsCreated += 1;
        console.log(`[doc] users/${u.uid}: criando doc mínimo roles=${JSON.stringify(roles)}`);
        if (APPLY) {
          const payload = {roles, ...roleFlags(roles), createdAt: FieldValue.serverTimestamp()};
          if (u.email) payload.email = u.email.trim().toLowerCase();
          if (u.displayName) payload.fullName = u.displayName;
          await docRef.set(payload);
        }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return {processed, claimsUpdated, docsUpdated, docsCreated};
}

async function scanCollection(name, fixer) {
  let fixed = 0;
  let scanned = 0;
  let last;
  for (;;) {
    let q = db.collection(name).orderBy("__name__").limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      scanned += 1;
      if (await fixer(doc)) fixed += 1;
    }
    last = snap.docs[snap.docs.length - 1];
  }
  return {scanned, fixed};
}

async function passB() {
  return scanCollection("users", async (doc) => {
    const data = doc.data();
    const roles = normalizeRoles(data.roles);
    const hasLegacy = data.role !== undefined;
    const flags = roleFlags(roles.length > 0 ? roles : ["athlete"]);
    const flagsWrong =
      data.hasAthleteRole !== flags.hasAthleteRole ||
      data.hasOrganizerRole !== flags.hasOrganizerRole;
    // Mesmo endurecimento do Passe A: array RAW diferente do normalizado (duplicatas,
    // case errado) também é sujeira, mesmo sem `role` legado e com as flags corretas.
    const rawRolesDirty = JSON.stringify(data.roles) !== JSON.stringify(roles);
    if (!hasLegacy && roles.length > 0 && !flagsWrong && !rawRolesDirty) return false;
    const nextRoles = roles.length > 0 ? roles : effectiveRoles(null, data);
    console.log(`[users-scan] ${doc.id}: roles=${JSON.stringify(nextRoles)}, deleta role=${JSON.stringify(data.role)}`);
    if (APPLY) {
      await doc.ref.set(
        {roles: nextRoles, role: FieldValue.delete(), ...roleFlags(nextRoles)},
        {merge: true},
      );
    }
    return true;
  });
}

async function passC() {
  return scanCollection("public_profiles", async (doc) => {
    if (doc.data().role === undefined) return false;
    console.log(`[mirror] ${doc.id}: deleta role`);
    if (APPLY) {
      await doc.ref.set({role: FieldValue.delete()}, {merge: true});
    }
    return true;
  });
}

(async () => {
  console.log(`Projeto: ${projectId} | modo: ${APPLY ? "APLICAR" : "dry-run"}${LIMIT ? ` | limit=${LIMIT}` : ""}`);
  const a = await passA();
  console.log(`Passe A (Auth): processados=${a.processed} claims=${a.claimsUpdated} docsAtualizados=${a.docsUpdated} docsCriados=${a.docsCreated}`);
  const b = await passB();
  console.log(`Passe B (users/): escaneados=${b.scanned} corrigidos=${b.fixed}`);
  const c = await passC();
  console.log(`Passe C (public_profiles/): escaneados=${c.scanned} corrigidos=${c.fixed}`);
  if (!APPLY) console.log("Dry-run: nada foi gravado. Rode com --yes para aplicar.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
