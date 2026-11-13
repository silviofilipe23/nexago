/* eslint-disable */
/**
 * Alinha as cópias do nome/foto do professor dentro das arenas ao perfil (`users/{uid}`):
 *   - arenas/{arenaId}/classTeachers/{id}      (userId → name, photoUrl)
 *   - arenas/{arenaId}/publicProfessors/{uid}  (professorUserId → name, photoUrl)
 *   - arenaProfessors/{linkId}                 (professorUserId → professorName, professorPhotoUrl)
 *
 * Mesma regra do gatilho `onUserWrittenSyncPublicProfile` (functions/src/professor-display-sync.ts),
 * que só reage a escritas NOVAS em `users`: as cópias gravadas antes dele ficam com a foto do dia
 * do vínculo (e o token dela morre quando o upload sobrescrevia `profiles/{uid}/avatar.jpg`).
 *
 * Pré-requisitos: credenciais admin (gcloud auth application-default login) e lib/ compilada
 * (`npm run build` em functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-professor-display-copies.js --project volley-track-dev-4596c --dry-run  # lista
 *   node scripts/backfill-professor-display-copies.js --project volley-track-dev-4596c --yes      # grava
 *   ... --only <uid>   # um professor só
 *
 * Sem `--yes` nada é gravado (`--dry-run` é o padrão; o flag existe para deixar explícito).
 */

const admin = require("firebase-admin");
const {
  PROFESSOR_COPY_KINDS,
  PROFESSOR_COPY_SPECS,
  professorCopyPatch,
  professorDisplayOf,
} = require("../lib/professor-display-sync");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
if (APPLY && process.argv.includes("--dry-run")) {
  console.error("Use --dry-run OU --yes, não os dois.");
  process.exit(1);
}
const ONLY = argValue("--only");
const projectId = argValue("--project");
if (!projectId) {
  console.error("Informe o projeto: --project <projectId>.");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

const BATCH_LIMIT = 400;
const GET_ALL_CHUNK = 100;

function shortUrl(url) {
  if (typeof url !== "string") return String(url);
  const path = url.split("?")[0];
  const token = /[?&]token=([^&]+)/.exec(url);
  const tail = decodeURIComponent(path.split("/o/")[1] ?? path).slice(-48);
  return token ? `${tail} (token ${token[1].slice(0, 8)}…)` : tail;
}

function arenaOf(kind, doc) {
  if (kind === "professorLink") return String(doc.data()["arenaId"] ?? "?");
  return doc.ref.parent.parent ? doc.ref.parent.parent.id : "?";
}

async function copiesOf(kind) {
  const spec = PROFESSOR_COPY_SPECS[kind];
  const source = spec.topLevel ? db.collection(spec.collectionGroup) : db.collectionGroup(spec.collectionGroup);
  const snap = ONLY ? await source.where(spec.userField, "==", ONLY).get() : await source.get();
  return snap.docs
    .map((doc) => ({kind, doc, uid: doc.data()[spec.userField]}))
    .filter((c) => typeof c.uid === "string" && c.uid);
}

async function usersById(uids) {
  const out = new Map();
  for (let i = 0; i < uids.length; i += GET_ALL_CHUNK) {
    const refs = uids.slice(i, i + GET_ALL_CHUNK).map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) out.set(snap.id, snap.exists ? snap.data() : undefined);
  }
  return out;
}

async function main() {
  console.log(`Projeto ${projectId} — ${APPLY ? "GRAVANDO" : "simulação (dry-run)"}${ONLY ? ` — só ${ONLY}` : ""}\n`);

  const copies = (await Promise.all(PROFESSOR_COPY_KINDS.map(copiesOf))).flat();
  const users = await usersById([...new Set(copies.map((c) => c.uid))]);

  const writes = [];
  const counts = {total: copies.length, noUser: 0, aligned: 0};
  for (const c of copies) {
    const display = professorDisplayOf(users.get(c.uid));
    if (!display) {
      counts.noUser += 1;
      continue;
    }
    const patch = professorCopyPatch(c.kind, c.doc.data(), display);
    if (!patch) {
      counts.aligned += 1;
      continue;
    }
    writes.push({kind: c.kind, ref: c.doc.ref, patch});
    const spec = PROFESSOR_COPY_SPECS[c.kind];
    console.log(`• ${c.kind} arena=${arenaOf(c.kind, c.doc)} uid=${c.uid}  ${c.doc.ref.path}`);
    for (const [field, value] of Object.entries(patch)) {
      const before = c.doc.data()[field];
      const fmt = field === spec.photoField ? shortUrl : (v) => JSON.stringify(v ?? null);
      console.log(`    ${field}: ${fmt(before)}  →  ${fmt(value)}`);
    }
  }

  const byKind = {};
  for (const w of writes) {
    byKind[w.kind] = (byKind[w.kind] ?? 0) + 1;
  }
  console.log(
    `\nCópias lidas: ${counts.total} · alinhadas: ${counts.aligned} · sem users/{uid}: ${counts.noUser} · ` +
    `divergentes: ${writes.length} ${JSON.stringify(byKind)}`,
  );

  if (!APPLY) {
    console.log("\nNada gravado. Rode com --yes para corrigir.");
    return;
  }
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.update(w.ref, w.patch);
    await batch.commit();
  }
  console.log(`\nGravadas ${writes.length} cópias.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
