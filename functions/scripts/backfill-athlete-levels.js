/* eslint-disable */
/**
 * Backfill: migra níveis legados da galera antiga para a escada de 5 degraus
 * (`iniciante_1` / `iniciante_2` / `intermediario_1` / `intermediario_2` / `open`).
 *
 * Espelha o callable `migrateAthleteLevels` (`functions/src/rating-triggers.ts`)
 * e ainda cobre docs que só têm o campo global `level` (sem
 * `sportOnboarding.levelsBySport`).
 *
 * Mapeamento (degrau INFERIOR do split — ninguém fica trancado fora de
 * categorias; a promoção sobe quem joga forte):
 *   iniciante | basico | básico  → iniciante_1
 *   intermediario                → intermediario_1
 *   livre                        → open
 *
 * Escreve em `users/{uid}.sportOnboarding.levelsBySport` (merge) e audita em
 * `users/{uid}/levelHistory`. O espelho `public_profiles` atualiza via trigger
 * `onUserWrittenSyncPublicProfile`.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-athlete-levels.js --project volley-track-dev-4596c
 *   node scripts/backfill-athlete-levels.js --project <id> --yes
 *   node scripts/backfill-athlete-levels.js --project <id> --yes --limit 50
 *   node scripts/backfill-athlete-levels.js --project <id> --yes --uid <uid>
 *
 * Sem --yes é DRY-RUN: só lista o que mudaria, sem escrever.
 */

const admin = require("firebase-admin");

/** Mesmo conjunto de `RATED_SPORT_CODES` em rating-triggers.ts. */
const RATED_SPORT_CODES = ["VOLEI_PRAIA", "VOLEI_QUADRA"];

/** Mesmo mapa de `LEGACY_LEVEL_MIGRATION` em rating-triggers.ts. */
const LEGACY_LEVEL_MIGRATION = {
  iniciante: "iniciante_1",
  basico: "iniciante_1",
  básico: "iniciante_1",
  intermediario: "intermediario_1",
  livre: "open",
};

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
const SINGLE_UID = argValue("--uid");

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

function normalizeLevelKey(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

function mapLegacyLevel(raw) {
  const key = normalizeLevelKey(raw);
  if (!key) return null;
  // Já na escada nova — nada a fazer.
  if (
    key === "iniciante_1" ||
    key === "iniciante_2" ||
    key === "intermediario_1" ||
    key === "intermediario_2" ||
    key === "open"
  ) {
    return null;
  }
  return LEGACY_LEVEL_MIGRATION[key] ?? LEGACY_LEVEL_MIGRATION[raw.trim().toLowerCase()] ?? null;
}

function levelsBySportOf(data) {
  const out = {};
  const onboarding = data?.sportOnboarding;
  if (onboarding && typeof onboarding === "object") {
    const bySport = onboarding.levelsBySport;
    if (bySport && typeof bySport === "object") {
      for (const [k, v] of Object.entries(bySport)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
      }
    }
  }
  // Campo legado paralelo (alguns docs antigos).
  const legacy = data?.levelsBySportFirestore;
  if (legacy && typeof legacy === "object") {
    for (const [k, v] of Object.entries(legacy)) {
      if (out[k]) continue;
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  }
  return out;
}

/**
 * Monta updates de levelsBySport para um user doc.
 * @returns {{ updates: Record<string, string>, from: Record<string, string>, source: string }}
 */
function planUpdates(data) {
  const bySport = levelsBySportOf(data);
  /** @type {Record<string, string>} */
  const updates = {};
  /** @type {Record<string, string>} */
  const from = {};

  for (const sportCode of RATED_SPORT_CODES) {
    const raw = bySport[sportCode] ?? "";
    const mapped = mapLegacyLevel(raw);
    if (mapped && mapped !== normalizeLevelKey(raw)) {
      updates[sportCode] = mapped;
      from[sportCode] = raw;
    }
  }

  // Galera antiga: só `level` / `nivel` global, sem levelsBySport por esporte.
  if (Object.keys(updates).length === 0) {
    const globalRaw =
      (typeof data?.level === "string" && data.level) ||
      (typeof data?.nivel === "string" && data.nivel) ||
      "";
    const mapped = mapLegacyLevel(globalRaw);
    if (mapped) {
      const primary =
        data?.sportOnboarding && typeof data.sportOnboarding === "object"
          ? String(data.sportOnboarding.primarySportId || "").trim()
          : "";
      const targets = RATED_SPORT_CODES.includes(primary)
        ? [primary]
        : Object.keys(bySport).length === 0
          ? ["VOLEI_PRAIA"]
          : [];

      for (const sportCode of targets) {
        const existing = bySport[sportCode];
        if (existing && !mapLegacyLevel(existing)) continue; // já moderno
        updates[sportCode] = mapped;
        from[sportCode] = existing || globalRaw;
      }
    }
  }

  const source =
    Object.keys(from).some((k) => !bySport[k] && (data?.level || data?.nivel))
      ? "global+levelsBySport"
      : "levelsBySport";

  return {updates, from, source};
}

async function* iterateUserDocs() {
  if (SINGLE_UID) {
    const snap = await db.collection("users").doc(SINGLE_UID).get();
    if (snap.exists) yield snap;
    return;
  }
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

async function applyMigration(uid, plan) {
  const {updates, from} = plan;
  const batch = db.batch();
  const userRef = db.collection("users").doc(uid);

  batch.set(
    userRef,
    {sportOnboarding: {levelsBySport: updates}, updatedAt: admin.firestore.FieldValue.serverTimestamp()},
    {merge: true},
  );

  for (const [sportCode, toLevel] of Object.entries(updates)) {
    const histRef = userRef.collection("levelHistory").doc();
    batch.set(histRef, {
      sportCode,
      fromLevel: String(from[sportCode] ?? ""),
      toLevel,
      reason: "migration",
      actor: "script:backfill-athlete-levels",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
}

async function run() {
  let scanned = 0;
  let pending = 0;
  let migrated = 0;
  const sample = [];

  console.log(
    APPLY
      ? `Aplicando migração de níveis em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  for await (const doc of iterateUserDocs()) {
    scanned += 1;
    const data = doc.data() ?? {};
    const plan = planUpdates(data);
    const sportKeys = Object.keys(plan.updates);
    if (sportKeys.length === 0) continue;

    pending += 1;
    if (sample.length < 25) {
      sample.push({
        uid: doc.id,
        source: plan.source,
        changes: sportKeys.map((s) => `${s}: ${plan.from[s] || "(vazio)"} → ${plan.updates[s]}`).join(", "),
      });
    }

    if (APPLY) {
      await applyMigration(doc.id, plan);
      migrated += 1;
      if (migrated % 50 === 0) {
        console.log(`... ${migrated} usuário(s) migrado(s)`);
      }
      if (LIMIT > 0 && migrated >= LIMIT) break;
    } else if (LIMIT > 0 && pending >= LIMIT) {
      break;
    }
  }

  console.log("\nAmostra (até 25):");
  for (const row of sample) {
    console.log(`  ${row.uid} [${row.source}] ${row.changes}`);
  }

  console.log("\nResumo:");
  console.log(`  escaneados: ${scanned}`);
  console.log(`  com migração pendente: ${pending}`);
  if (APPLY) {
    console.log(`  migrados: ${migrated}`);
  } else {
    console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
