/* eslint-disable */
/**
 * Lista e-mails de todos os usuários do Firebase Auth (paginado).
 *
 * Opcionalmente cruza com Firestore `users/{uid}.email` quando o Auth
 * não tem e-mail (ex.: pré-cadastro / phone-only).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/list-user-emails.js --project volley-track-dev-4596c
 *   node scripts/list-user-emails.js --project <id> --csv
 *   node scripts/list-user-emails.js --project <id> --out emails.txt
 *   node scripts/list-user-emails.js --project <id> --include-firestore
 *   node scripts/list-user-emails.js --project <id> --needle seed-
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const CSV = process.argv.includes("--csv");
const INCLUDE_FIRESTORE = process.argv.includes("--include-firestore");
const NEEDLE = (argValue("--needle") || "").toLowerCase();
const OUT = argValue("--out");

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

/**
 * @typedef {{ uid: string, email: string, source: 'auth' | 'firestore', disabled: boolean }} Row
 */

async function listFromAuth() {
  /** @type {Row[]} */
  const rows = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const email = (user.email || "").trim();
      if (!email) continue;
      if (NEEDLE && !email.toLowerCase().includes(NEEDLE)) continue;
      rows.push({
        uid: user.uid,
        email,
        source: "auth",
        disabled: user.disabled === true,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return rows;
}

async function listFromFirestoreMissingAuth(authEmailsByUid) {
  /** @type {Row[]} */
  const rows = [];
  const snap = await db.collection("users").select("email").get();
  for (const doc of snap.docs) {
    if (authEmailsByUid.has(doc.id)) continue;
    const email = String(doc.data()?.email || "").trim();
    if (!email) continue;
    if (NEEDLE && !email.toLowerCase().includes(NEEDLE)) continue;
    rows.push({
      uid: doc.id,
      email,
      source: "firestore",
      disabled: false,
    });
  }
  return rows;
}

function formatRows(rows) {
  if (CSV) {
    const header = "email,uid,source,disabled";
    const lines = rows.map(
      (r) =>
        `${JSON.stringify(r.email)},${r.uid},${r.source},${r.disabled ? "true" : "false"}`,
    );
    return [header, ...lines].join("\n") + "\n";
  }
  return rows.map((r) => r.email).join("\n") + (rows.length ? "\n" : "");
}

async function run() {
  console.error(`Projeto: ${projectId}`);
  if (NEEDLE) console.error(`Filtro: e-mail contém "${NEEDLE}"`);

  const authRows = await listFromAuth();
  /** @type {Row[]} */
  let rows = [...authRows];

  if (INCLUDE_FIRESTORE) {
    const byUid = new Map(authRows.map((r) => [r.uid, r.email]));
    const extra = await listFromFirestoreMissingAuth(byUid);
    rows = rows.concat(extra);
    console.error(`Auth: ${authRows.length} | Firestore sem Auth: ${extra.length}`);
  } else {
    console.error(`Auth: ${authRows.length}`);
  }

  rows.sort((a, b) => a.email.localeCompare(b.email, "en", {sensitivity: "base"}));

  const uniqueEmails = new Set(rows.map((r) => r.email.toLowerCase()));
  console.error(`Total linhas: ${rows.length} | e-mails únicos: ${uniqueEmails.size}`);

  const body = formatRows(rows);
  if (OUT) {
    const outPath = path.resolve(OUT);
    fs.writeFileSync(outPath, body, "utf8");
    console.error(`Salvo em: ${outPath}`);
  } else {
    process.stdout.write(body);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha ao listar e-mails:", err);
    process.exit(1);
  });
