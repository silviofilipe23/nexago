/* eslint-disable */
/**
 * Backfill do sistema de elos ("sand rank") para todo users/{uid} — mesma
 * lógica do callable `backfillSandRanks` (functions/src/sand-rank-sync.ts),
 * rodada localmente via Admin SDK com `syncSandRankForUser(skipPush: true)`.
 *
 * O que faz por usuário: lê o XP do summary de gamificação, materializa os
 * campos de elo, concede as recompensas retroativas de todos os degraus já
 * alcançados (idempotente via gamification_events/rank_track_{i}) e espelha
 * o elo em users/{uid} (public_profiles sincroniza pelo trigger). Nunca
 * envia push — a celebração retroativa aparece no primeiro login com a flag
 * appConfig/sandRank ligada.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-sand-ranks.js --project volley-track-dev-4596c
 *   node scripts/backfill-sand-ranks.js --project <projectId> --yes
 *   node scripts/backfill-sand-ranks.js --project <projectId> --yes --limit 50
 *   node scripts/backfill-sand-ranks.js --project <projectId> --yes --uid <userId>
 *
 * Sem --yes é DRY-RUN: só imprime a distribuição de elos projetada e quantos
 * usuários têm degraus pendentes, sem escrever nada.
 */

const admin = require("firebase-admin");
const {syncSandRankForUser} = require("../lib/sand-rank-sync");
const {
  sandRankStepFromXp,
  sandRankLabel,
  SAND_RANK_TRACK,
} = require("../lib/sand-rank-engine");

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

async function* iterateUserIds() {
  if (SINGLE_UID) {
    yield SINGLE_UID;
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
    for (const doc of snap.docs) yield doc.id;
    lastId = snap.docs[snap.docs.length - 1].id;
  }
}

function asInt(value, fallback) {
  const n = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function run() {
  let scanned = 0;
  let pending = 0;
  let processed = 0;
  let promotions = 0;
  let rewardsGranted = 0;
  const distribution = new Map(); // label do degrau → contagem

  for await (const uid of iterateUserIds()) {
    scanned += 1;

    const summarySnap = await db.doc(`users/${uid}/gamification/summary`).get();
    const summary = summarySnap.data() ?? {};
    const xp = asInt(summary.xp, 0);
    const target = sandRankStepFromXp(xp);
    const storedTrack = asInt(summary.sandRankTrackIndex, -1);
    const storedHighest = asInt(summary.highestSandRankTrackIndex, -1);
    const isPending = storedTrack < target.trackIndex || storedHighest < target.trackIndex;

    const finalStep = SAND_RANK_TRACK[Math.max(target.trackIndex, storedTrack)];
    const label = sandRankLabel(finalStep);
    distribution.set(label, (distribution.get(label) ?? 0) + 1);

    if (!isPending) continue;
    pending += 1;

    if (APPLY) {
      const result = await syncSandRankForUser(db, uid, {skipPush: true});
      processed += 1;
      if (result.promoted) promotions += 1;
      rewardsGranted += result.grantedRewardIds.length;
      if (processed % 100 === 0) {
        console.log(`... ${processed} usuário(s) sincronizado(s)`);
      }
      if (LIMIT > 0 && processed >= LIMIT) break;
    } else if (pending <= 10) {
      console.log(
        `  pendente: ${uid} — xp=${xp} → ${sandRankLabel(target)} ` +
        `(trackIndex ${storedTrack} → ${target.trackIndex})`,
      );
    }
  }

  console.log(`\nVerificados ${scanned} doc(s) em users/ (${projectId}).`);
  console.log("Distribuição projetada por elo:");
  const byTrack = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
  for (const [label, count] of byTrack) {
    console.log(`  ${label.padEnd(16)} ${count}`);
  }
  console.log(`Usuários com degraus pendentes: ${pending}.`);

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi alterado. Rode com --yes para aplicar.");
    return;
  }

  console.log(
    `\nBackfill concluído: ${processed} usuário(s) sincronizado(s), ` +
    `${promotions} promoção(ões) reais (degrau > 0), ` +
    `${rewardsGranted} recompensa(s) concedida(s). Nenhuma push enviada.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no backfill:", err);
    process.exit(1);
  });
