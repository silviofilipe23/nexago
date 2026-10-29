/* eslint-disable */
/**
 * Funde duas contas do MESMO atleta: a absorvida (`--from`, já sem login)
 * some, e tudo que apontava para ela passa a apontar para a que fica
 * (`--into`).
 *
 * POR QUE existe: conta de login apagada por fora do app (console do Auth)
 * deixa `users/{uid}` para trás — o perfil público e a busca continuam
 * funcionando. O organizador acha o perfil órfão na busca, inscreve por ele, e
 * a história do atleta fica partida em dois perfis: ranking, rating e equipe
 * de um lado, login do outro. A exclusão pelo app (`deleteOwnAccount`) não
 * gera isso: ela apaga `users/{uid}` antes do login.
 *
 * O QUE FAZ, nesta ordem (decisões puras em `lib/merge-athlete-accounts-plan.js`):
 *  0. Preflight: `--from` NÃO pode ter login (fundir uma conta viva deixaria um
 *     login apontando para perfil apagado); `--into` precisa ter.
 *  1. Descoberta: varre por `collectionGroup` todo nome de coleção que existe
 *     (topo, subcoleções de `${base}`, dos dois perfis e as aninhadas
 *     conhecidas) atrás do uid absorvido — o mesmo método da checagem de
 *     cobertura do `merge-duplicate-pair-teams.js`.
 *  2. Planeja cada doc. Qualquer `blocked` aborta ANTES de gravar.
 *  3. (--apply) Backup em JSON de todo doc que será alterado ou apagado, antes
 *     da primeira escrita.
 *  4. Repontar equipes, inscrições, `ratingEvents` etc. e somar o ranking no
 *     doc da conta que fica. `update` com `lastUpdateTime` (o batch falha se o
 *     doc mudou desde a leitura) e `create` para doc novo.
 *  5. Apagar os docs de ranking/rating do absorvido, `athlete_profiles`,
 *     `public_profiles` e `users/{from}` com as subcoleções.
 *  6. Replay do rating da conta que fica (`replayAthleteLedger`, o mesmo do
 *     callable `recomputeAthleteRating`) em cada esporte que ganhou partidas.
 *  7. Verificação: nova varredura não pode achar o uid absorvido.
 *
 * O QUE NÃO FAZ:
 *  - Gamificação (XP, missões, conquistas) e notificações do absorvido saem
 *    com ele, não somam: são eventos com chave de idempotência por conta, e a
 *    conta que fica já tem os dela.
 *  - Equipe duplicada: se a troca deixar duas equipes da mesma dupla, o script
 *    avisa. Rode `merge-duplicate-pair-teams.js` em seguida (e o que o
 *    cabeçalho dele pede para o ranking por esporte).
 *  - Storage (foto) do absorvido.
 *
 * Requer lib/ compilada (rode `npm run build` na pasta functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/merge-athlete-accounts.js --project volley-track-dev-4596c --from <uid> --into <uid>
 *   node scripts/merge-athlete-accounts.js --project <id> --from <uid> --into <uid> --apply
 */
const fs = require("fs");
const admin = require("firebase-admin");
const {FieldPath, FieldValue} = require("firebase-admin/firestore");
const {replayAthleteLedger} = require("../lib/rating-engine");
const {aggregateRankingResults} = require("../lib/tournament-ranking");
const {buildTeamSearchFields} = require("../lib/search-keywords");
const {
  classifyPath,
  mentionsUid,
  planGenericRemap,
  planTeamPatch,
  planRankingMerge,
} = require("./lib/merge-athlete-accounts-plan.js");
const {groupTeamsByPair} = require("./lib/merge-pair-teams-plan.js");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
const from = String(argValue("--from") ?? "").trim();
const into = String(argValue("--into") ?? "").trim();
const apply = process.argv.includes("--apply");
if (!projectId || !from || !into || from === into) {
  console.error("Uso: --project <id> --from <uid absorvido> --into <uid que fica> [--apply]");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;
const PAGE = 2000;
const BATCH = 400;
const OWNED_ROOTS = [`users/${from}`, `public_profiles/${from}`, `athlete_profiles/${from}`];

/**
 * Subcoleções aninhadas que não aparecem listando o topo, `${base}` nem os dois
 * perfis, e que guardam uid de atleta. Ver `KNOWN_NESTED_SUBCOLLECTIONS` no
 * `merge-duplicate-pair-teams.js` para o porquê de uma lista: o NOME não dá
 * para descobrir sem varrer todos os pais; conhecido o nome, `collectionGroup`
 * varre o projeto inteiro.
 */
const KNOWN_NESTED_SUBCOLLECTIONS = [
  "entries",
  "followers",
  "following",
  "followingTeams",
  "ledger",
  "pixPending",
  "auditLog",
  "pointEvents",
];

async function discoverCollectionNames() {
  const names = new Set(KNOWN_NESTED_SUBCOLLECTIONS);
  for (const col of await db.listCollections()) names.add(col.id);
  for (const col of await db.doc(base).listCollections()) names.add(col.id);
  for (const uid of [from, into]) {
    for (const col of await db.doc(`users/${uid}`).listCollections()) names.add(col.id);
  }
  return [...names];
}

/** Todo doc do projeto que cita `uid` no caminho ou no dado. */
async function findMentions(uid) {
  const names = await discoverCollectionNames();
  const found = new Map();
  let scanned = 0;
  const queue = [...names];
  const worker = async () => {
    while (queue.length > 0) {
      const name = queue.shift();
      let last = null;
      for (;;) {
        let query = db.collectionGroup(name).orderBy(FieldPath.documentId()).limit(PAGE);
        if (last) query = query.startAfter(last);
        const snap = await query.get();
        for (const doc of snap.docs) {
          scanned += 1;
          if (doc.ref.path.includes(uid) || mentionsUid(doc.id, doc.data(), uid)) {
            found.set(doc.ref.path, doc);
          }
        }
        if (snap.size < PAGE) break;
        last = snap.docs[snap.size - 1];
      }
    }
  };
  await Promise.all(Array.from({length: 8}, worker));
  return {found, scanned, collections: names.length};
}

async function authSummary(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    return {
      exists: true,
      providers: user.providerData.map((p) => p.providerId).join(", "),
      created: user.metadata.creationTime,
      lastSignIn: user.metadata.lastSignInTime,
    };
  } catch (e) {
    if (e.code === "auth/user-not-found") return {exists: false};
    throw e;
  }
}

function displayNameOf(profile) {
  for (const key of ["nickname", "fullName", "name"]) {
    const value = typeof profile?.[key] === "string" ? profile[key].trim() : "";
    if (value) return value;
  }
  return "";
}

/** Lê o doc e toda a árvore abaixo dele (para o backup). */
async function readTree(ref, out) {
  const snap = await ref.get();
  if (snap.exists) out[ref.path] = snap.data();
  for (const col of await ref.listCollections()) {
    for (const child of await col.listDocuments()) await readTree(child, out);
  }
}

/**
 * Regrava o doc inteiro com precondição. `update` por `FieldPath` (e não por
 * objeto) para que chave com ponto não vire caminho aninhado; campo que sumiu
 * no remap (chave de mapa no topo) sai com `FieldValue.delete()`.
 */
function queueWholeDocUpdate(ops, snap, next) {
  const args = [];
  for (const [key, value] of Object.entries(next)) args.push(new FieldPath(key), value);
  for (const key of Object.keys(snap.data())) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) {
      args.push(new FieldPath(key), FieldValue.delete());
    }
  }
  ops.push((batch) => batch.update(snap.ref, ...args, {lastUpdateTime: snap.updateTime}));
}

async function commitInBatches(ops) {
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH)) op(batch);
    await batch.commit();
  }
}

/** Soma o doc de ranking chaveado pelo absorvido no da conta que fica. */
async function planRankingDoc({fromSnap, intoRef, extra, writes, deletes, blocked, report}) {
  const intoSnap = await intoRef.get();
  const merged = planRankingMerge(intoSnap.exists ? intoSnap.data() : null, fromSnap.data());
  if (merged.blocked) {
    blocked.push(`${fromSnap.ref.path}: ${merged.blocked}`);
    return;
  }
  const next = {
    ...(intoSnap.exists ? intoSnap.data() : {}),
    ...extra,
    athleteId: into,
    results: merged.results,
    scaleVersion: merged.scaleVersion,
    ...aggregateRankingResults(merged.results),
    lastUpdated: FieldValue.serverTimestamp(),
  };
  if (intoSnap.exists) {
    queueWholeDocUpdate(writes, intoSnap, next);
  } else {
    writes.push((batch) => batch.create(intoRef, next));
  }
  deletes.push((batch) => batch.delete(fromSnap.ref, {lastUpdateTime: fromSnap.updateTime}));
  const before = intoSnap.exists ? Number(intoSnap.get("totalPoints")) || 0 : 0;
  report.push(
    `${intoRef.path}: ${before} → ${next.totalPoints} pontos, ` +
      `${next.tournamentsCount} resultado(s) (+${fromSnap.get("totalPoints") ?? 0} do absorvido)`,
  );
}

(async () => {
  // ── 0. Preflight ──────────────────────────────────────────────────────────
  const [fromUser, intoUser, fromAuth, intoAuth] = await Promise.all([
    db.doc(`users/${from}`).get(),
    db.doc(`users/${into}`).get(),
    authSummary(from),
    authSummary(into),
  ]);
  if (!fromUser.exists || !intoUser.exists) {
    console.error("users/{from} e users/{into} precisam existir.");
    process.exit(1);
  }
  if (fromAuth.exists) {
    console.error(`--from ${from} ainda tem login (${fromAuth.providers}). Só se funde conta sem login.`);
    process.exit(1);
  }
  if (!intoAuth.exists) {
    console.error(`--into ${into} não tem login — a conta que fica precisa ser a que entra no app.`);
    process.exit(1);
  }
  const describe = (label, uid, snap, auth) => {
    const p = snap.data();
    console.log(
      `${label} ${uid}: ${displayNameOf(p)} | ${p.fullName ?? ""} | ${p.phoneNumber ?? "-"} | ` +
        `${p.email ?? "-"} | login: ${auth.exists ? `${auth.providers} (último ${auth.lastSignIn})` : "NÃO"}`,
    );
  };
  describe("absorvida", from, fromUser, fromAuth);
  describe("fica     ", into, intoUser, intoAuth);
  const intoDisplayName = displayNameOf(intoUser.data());

  // ── 1. Descoberta ─────────────────────────────────────────────────────────
  const {found, scanned, collections} = await findMentions(from);
  console.log(`\nvarredura: ${collections} nomes de coleção, ${scanned} docs, ${found.size} citam o absorvido`);

  // ── 2. Plano ──────────────────────────────────────────────────────────────
  const writes = [];
  const deletes = [];
  const blocked = [];
  const report = [];
  const sports = new Set();
  const patchedTeams = new Map();
  let ownedCount = 0;

  for (const [path, snap] of found) {
    const target = classifyPath(path, {base, from});
    const data = snap.data();
    switch (target.kind) {
      case "owned":
        ownedCount += 1;
        break;
      case "ranking":
        await planRankingDoc({
          fromSnap: snap,
          intoRef: db.doc(`${base}/athleteRankings/${into}`),
          extra: {},
          writes, deletes, blocked, report,
        });
        break;
      case "rankingBySport":
        await planRankingDoc({
          fromSnap: snap,
          intoRef: db.doc(`${base}/athleteRankingsBySport/${into}_${target.sportCode}`),
          extra: {sport: target.sportCode},
          writes, deletes, blocked, report,
        });
        break;
      case "rating":
        sports.add(target.sportCode);
        deletes.push((batch) => batch.delete(snap.ref, {lastUpdateTime: snap.updateTime}));
        report.push(`${path}: apagado; rating de ${into} refeito pelo replay do ledger`);
        break;
      case "team": {
        const plan = planTeamPatch(snap.id, data, {from, to: into, toDisplayName: intoDisplayName});
        if (plan.blocked) {
          blocked.push(`${path}: ${plan.blocked}`);
          break;
        }
        if (Array.isArray(data.keywords)) plan.data.keywords = buildTeamSearchFields(plan.data).keywords;
        queueWholeDocUpdate(writes, snap, plan.data);
        patchedTeams.set(snap.id, plan.data);
        report.push(`${path}: ${plan.data.player1DisplayName ?? ""} + ${plan.data.player2DisplayName ?? ""}`);
        break;
      }
      case "generic": {
        const plan = planGenericRemap(snap.id, data, {from, to: into});
        if (plan.blocked) {
          blocked.push(`${path}: ${plan.blocked}`);
          break;
        }
        if (path.startsWith(`${base}/ratingEvents/`) && data.sportCode) sports.add(String(data.sportCode));
        queueWholeDocUpdate(writes, snap, plan.data);
        report.push(`${path}: uid trocado`);
        break;
      }
      default:
        blocked.push(`${path}: ${target.reason}`);
    }
  }

  console.log(`\nperfil absorvido (apagado com as subcoleções): ${ownedCount} doc(s) em ${OWNED_ROOTS.join(", ")}`);
  console.log(`\nalterações (${report.length}):`);
  for (const line of report.sort()) console.log(`  ${line}`);
  if (sports.size > 0) {
    for (const sportCode of sports) {
      const rating = await db.doc(`${base}/athleteRatings/${into}_${sportCode}`).get();
      console.log(
        `  replay ${sportCode}: rating atual de ${into} = ${rating.exists ? Math.round(rating.get("rating")) : "—"} ` +
          `(${rating.exists ? rating.get("ratedMatches") : 0} partidas); refeito com as do absorvido`,
      );
    }
  }

  // Duplas que a troca vai deixar duplicadas (mesmo critério do merge-duplicate-pair-teams).
  const teamsSnap = await db.collection(`${base}/teams`).get();
  const groups = groupTeamsByPair(
    teamsSnap.docs.map((doc) => ({id: doc.id, data: patchedTeams.get(doc.id) ?? doc.data()})),
  );
  const duplicatedPairs = [...groups.values()].filter(
    (members) => members.length > 1 && members.some((m) => patchedTeams.has(m.id)),
  );
  for (const members of duplicatedPairs) {
    console.log(`  ⚠ dupla duplicada após a troca: ${members.map((m) => m.id).join(" + ")}`);
  }

  if (blocked.length > 0) {
    console.error(`\nBLOQUEADO (${blocked.length}) — nada foi gravado:`);
    for (const line of blocked) console.error(`  ${line}`);
    process.exit(1);
  }
  if (!apply) {
    console.log("\n(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  // ── 3. Backup ─────────────────────────────────────────────────────────────
  const backup = {};
  for (const [path, snap] of found) backup[path] = snap.data();
  for (const root of OWNED_ROOTS) await readTree(db.doc(root), backup);
  for (const sportCode of sports) {
    const rating = await db.doc(`${base}/athleteRatings/${into}_${sportCode}`).get();
    if (rating.exists) backup[rating.ref.path] = rating.data();
  }
  for (const name of ["athleteRankings", "athleteRankingsBySport"]) {
    const snap = await db.collection(`${base}/${name}`).where("athleteId", "==", into).get();
    for (const doc of snap.docs) backup[doc.ref.path] = doc.data();
  }
  const file = `merge-athlete-${projectId}-${from}-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify({projectId, from, into, docs: backup}, null, 2));
  console.log(`\nbackup de ${Object.keys(backup).length} doc(s) em ${file} (antes de qualquer escrita)`);

  // ── 4. Repontar ───────────────────────────────────────────────────────────
  await commitInBatches(writes);
  console.log(`repontados/somados: ${writes.length}`);

  // ── 5. Apagar ─────────────────────────────────────────────────────────────
  await commitInBatches(deletes);
  for (const root of OWNED_ROOTS) await db.recursiveDelete(db.doc(root));
  console.log(`apagados: ${deletes.length} doc(s) de ranking/rating + perfil absorvido`);

  // ── 6. Replay do rating ───────────────────────────────────────────────────
  for (const sportCode of sports) {
    const state = await replayAthleteLedger(db, projectId, into, sportCode);
    console.log(
      `rating ${sportCode}: ${state ? `${Math.round(state.rating)} (${state.ratedMatches} partidas, ${state.wins}V ${state.losses}D)` : "sem eventos"}`,
    );
  }

  // ── 7. Verificação ────────────────────────────────────────────────────────
  const after = await findMentions(from);
  if (after.found.size > 0) {
    console.error(`\nSOBRA: ${after.found.size} doc(s) ainda citam ${from}:`);
    for (const path of after.found.keys()) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log(`\nverificação: ${after.scanned} docs varridos, nenhum cita ${from}.`);
  if (duplicatedPairs.length > 0) {
    console.log("PRÓXIMO PASSO: node scripts/merge-duplicate-pair-teams.js --project " + projectId);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
