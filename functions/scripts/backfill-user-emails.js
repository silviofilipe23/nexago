/* eslint-disable */
/**
 * Backfill: copia o e-mail do Firebase Auth para `users/{uid}.email`
 * quando o campo está ausente ou vazio no Firestore.
 *
 * Casos típicos: cadastro web que só criou Auth; onboarding que não
 * espelhou o e-mail; docs antigos sem o campo.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-user-emails.js --project volley-track-dev-4596c
 *   node scripts/backfill-user-emails.js --project <id> --yes
 *   node scripts/backfill-user-emails.js --project <id> --yes --limit 50
 *   node scripts/backfill-user-emails.js --project <id> --yes --create-missing
 *
 * Seguro por padrão: sem --yes, só lista (dry-run).
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const CREATE_MISSING = process.argv.includes("--create-missing");
const LIMIT_RAW = argValue("--limit");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10)) : null;

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

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function hasEmail(data) {
  return normalizeEmail(data?.email).length > 0;
}

/**
 * @typedef {{
 *   uid: string,
 *   authEmail: string,
 *   action: 'update' | 'create' | 'skip-disabled' | 'skip-no-auth-email',
 *   currentEmail: string | null,
 * }} PlanItem
 */

async function plan() {
  /** @type {PlanItem[]} */
  const items = [];
  let pageToken;
  let scanned = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      scanned += 1;
      const authEmail = normalizeEmail(user.email);
      if (!authEmail) {
        items.push({
          uid: user.uid,
          authEmail: "",
          action: "skip-no-auth-email",
          currentEmail: null,
        });
        continue;
      }
      if (user.disabled) {
        items.push({
          uid: user.uid,
          authEmail,
          action: "skip-disabled",
          currentEmail: null,
        });
        continue;
      }

      const snap = await db.doc(`users/${user.uid}`).get();
      if (!snap.exists) {
        if (CREATE_MISSING) {
          items.push({
            uid: user.uid,
            authEmail,
            action: "create",
            currentEmail: null,
          });
        }
        continue;
      }

      const current = normalizeEmail(snap.data()?.email) || null;
      if (hasEmail(snap.data())) continue;

      items.push({
        uid: user.uid,
        authEmail,
        action: "update",
        currentEmail: current,
      });

      if (LIMIT != null) {
        const actionable = items.filter((i) => i.action === "update" || i.action === "create");
        if (actionable.length >= LIMIT) {
          return {scanned, items};
        }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return {scanned, items};
}

async function applyItem(item) {
  const ref = db.doc(`users/${item.uid}`);
  if (item.action === "update") {
    await ref.set(
      {
        email: item.authEmail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }
  if (item.action === "create") {
    await ref.set(
      {
        email: item.authEmail,
        roles: ["athlete"],
        hasAthleteRole: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
}

async function run() {
  console.log(`Projeto: ${projectId}`);
  console.log(APPLY ? "Modo: APLICAR (--yes)" : "Modo: DRY-RUN (sem --yes)");
  if (CREATE_MISSING) console.log("Opção: --create-missing (cria users/{uid} mínimo se não existir)");
  if (LIMIT) console.log(`Limit: ${LIMIT} ações`);

  const {scanned, items} = await plan();
  const toUpdate = items.filter((i) => i.action === "update");
  const toCreate = items.filter((i) => i.action === "create");
  const skipNoEmail = items.filter((i) => i.action === "skip-no-auth-email").length;
  const skipDisabled = items.filter((i) => i.action === "skip-disabled").length;

  console.log(`Auth varrido: ${scanned}`);
  console.log(`Sem e-mail no Auth: ${skipNoEmail}`);
  console.log(`Auth disabled (ignorados): ${skipDisabled}`);
  console.log(`Precisam update (doc existe, email vazio): ${toUpdate.length}`);
  console.log(`Precisam create (--create-missing): ${toCreate.length}`);

  const preview = [...toUpdate, ...toCreate].slice(0, 20);
  for (const item of preview) {
    console.log(`  [${item.action}] ${item.uid} → ${item.authEmail}`);
  }
  const remaining = toUpdate.length + toCreate.length - preview.length;
  if (remaining > 0) console.log(`  … e mais ${remaining}`);

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi gravado. Rode com --yes para aplicar.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const item of [...toUpdate, ...toCreate]) {
    try {
      await applyItem(item);
      ok += 1;
    } catch (err) {
      fail += 1;
      console.warn(`Falha ${item.uid} (${item.authEmail}):`, err.message || err);
    }
  }
  console.log(`Concluído: ${ok} ok, ${fail} falha(s).`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });
