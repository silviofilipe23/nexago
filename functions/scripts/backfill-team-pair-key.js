/* eslint-disable */
/**
 * Backfill da chave do par: grava `pairKey` nas equipes de DUPLA que já existem.
 *
 * POR QUE existe: `resolvePairTeamTx` (functions/src/tournament-pair-team.ts)
 * encontra a equipe do par consultando `pairKey`. Sem este backfill o campo não
 * existe em doc nenhum, a consulta volta vazia e o sistema segue criando uma
 * equipe nova a cada inscrição — o bug que a entrega conserta.
 *
 * ORDEM DE ROLLOUT (importa): ESTE script -> deploy das Functions e das rules
 * -> merge-duplicate-pair-teams.js.
 *
 * Equipe nomeada (trio/quarteto/quinteto) NUNCA recebe `pairKey`: ela é escopada
 * ao torneio de propósito e não pode ser deduplicada.
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c
 *   node scripts/backfill-team-pair-key.js --project <id> --apply
 */
const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Cópia de `buildPairKey` (functions/src/tournament-pair-uniqueness.ts). */
function buildPairKey(uidA, uidB) {
  const a = String(uidA ?? "").trim();
  const b = String(uidB ?? "").trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

/** Cópia de `isPairTeamDoc` (functions/src/tournament-pair-team.ts). */
function isPairTeamDoc(team) {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  // `memberUids` é o elenco canônico no resto do código. Um doc histórico com
  // 3+ membros, sem nome e sem `teamSize`, passaria pelos dois testes acima e
  // ganharia aqui um `pairKey` dos 2 primeiros players — carimbando uma equipe
  // de verdade como dupla, visível pro helper de reaproveitamento.
  if (Array.isArray(team.memberUids) && team.memberUids.length >= 3) return false;
  return true;
}

(async () => {
  const snap = await db.collection(`${base}/teams`).get();
  const pending = [];
  let named = 0;
  let incomplete = 0;
  let already = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isPairTeamDoc(data)) {
      named += 1;
      continue;
    }
    const pairKey = buildPairKey(data.player1Id, data.player2Id);
    if (!pairKey) {
      incomplete += 1;
      continue;
    }
    if (data.pairKey === pairKey) {
      already += 1;
      continue;
    }
    pending.push({ref: doc.ref, id: doc.id, pairKey});
  }

  console.log(`equipes=${snap.size} nomeadas=${named} incompletas=${incomplete} ja_tinham=${already}`);
  console.log(`a gravar: ${pending.length}`);
  for (const item of pending.slice(0, 20)) {
    console.log(`  ${item.id} -> ${item.pairKey}`);
  }
  if (pending.length > 20) console.log(`  ... e mais ${pending.length - 20}`);

  if (!apply) {
    console.log("\n(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  let written = 0;
  while (written < pending.length) {
    const chunk = pending.slice(written, written + 400);
    const batch = db.batch();
    for (const item of chunk) batch.update(item.ref, {pairKey: item.pairKey});
    await batch.commit();
    written += chunk.length;
    console.log(`gravadas ${written}/${pending.length}`);
  }
  console.log("pronto.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
