/* eslint-disable */
/**
 * Recalcula `keywords`/`hasAthleteRole`/`hasOrganizerRole` em users/{uid} a
 * partir dos dados JÁ salvos no doc (role/roles/fullName/nickname/email).
 *
 * Corrige contas onde `hasAthleteRole` ficou desatualizado (ex.: gravado como
 * `false` num save antigo do app que não incluía `role`/`roles` no payload),
 * mesmo que `role`/`roles` já estejam corretos no doc. Só grava quando o
 * valor recalculado difere do atual (idempotente e seguro) — mesma lógica de
 * `applyUserSearchFields` em functions/src/search-keywords-sync.ts, só que
 * rodada localmente via Admin SDK em vez do callable `backfillSearchKeywords`.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/ se necessário).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-search-keywords-flags.js --project volley-track-dev-4596c
 *   node scripts/backfill-search-keywords-flags.js --project <projectId> --yes
 *   node scripts/backfill-search-keywords-flags.js --project <projectId> --yes --limit 50
 */

const admin = require("firebase-admin");
const {buildUserSearchFields, searchFieldsChanged} = require("../lib/search-keywords");

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
const db = admin.firestore();

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

async function run() {
  let scanned = 0;
  const stale = [];

  for await (const doc of iterateUserDocs()) {
    scanned += 1;
    const data = doc.data();
    const fields = buildUserSearchFields(data);
    const payload = {
      keywords: fields.keywords,
      hasAthleteRole: fields.hasAthleteRole,
      hasOrganizerRole: fields.hasOrganizerRole,
    };
    if (searchFieldsChanged(data, payload)) {
      stale.push({doc, payload});
      if (LIMIT > 0 && stale.length >= LIMIT) break;
    }
  }

  console.log(`Verificados ${scanned} doc(s) em users/ (${projectId}).`);
  console.log(`Encontrados ${stale.length} doc(s) com keywords/flags desatualizados.`);
  if (stale.length === 0) return;

  const preview = stale.slice(0, 10).map(({doc, payload}) => {
    const before = doc.data();
    const label =
      (typeof before.fullName === "string" && before.fullName.trim()) ||
      (typeof before.email === "string" && before.email.trim()) ||
      doc.id;
    return `${doc.id} (${label}): hasAthleteRole ${before.hasAthleteRole} -> ${payload.hasAthleteRole}, hasOrganizerRole ${before.hasOrganizerRole} -> ${payload.hasOrganizerRole}`;
  });
  console.log("Exemplos:\n" + preview.join("\n"));

  if (!APPLY) {
    console.log("DRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  let updated = 0;
  for (const part of chunk(stale, 400)) {
    const batch = db.batch();
    for (const {doc, payload} of part) {
      batch.update(doc.ref, payload);
    }
    await batch.commit();
    updated += part.length;
    console.log(`... ${updated}/${stale.length} atualizados`);
  }

  console.log(`Backfill concluído: ${updated} doc(s) atualizado(s).`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });
