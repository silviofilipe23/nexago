/* eslint-disable */
/**
 * Decisão da fusão de duplas duplicadas — camada PURA, sem `firebase-admin` e
 * sem I/O, para que `functions/test/merge-pair-teams-plan.test.mjs` possa travar
 * a regra. O script `scripts/merge-duplicate-pair-teams.js` é só a casca de
 * leitura/escrita em cima daqui.
 *
 * Duas regras sustentam o desenho:
 *
 *  1. Sobrevive quem tem MAIS referências apontando para si — é o que minimiza
 *     reescrita de partida encerrada. Empate desempata pelo `createdAt` mais
 *     antigo, para a decisão ser determinística.
 *  2. Nem todo grupo de 2+ docs é duplicação: o par pode estar em duas
 *     categorias do MESMO torneio, e ali os docs separados existem de propósito
 *     (ver a decisão 2 da spec). Torneio em comum = grupo pulado.
 *
 * Ver `docs/superpowers/specs/2026-09-15-identidade-unica-da-dupla-design.md`.
 */

function buildPairKey(uidA, uidB) {
  const a = String(uidA ?? "").trim();
  const b = String(uidB ?? "").trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

function isPairTeamDoc(team) {
  if (!team) return false;
  const name = typeof team.teamName === "string" ? team.teamName.trim() : "";
  if (name) return false;
  const size = Number(team.teamSize ?? 0);
  if (Number.isFinite(size) && size >= 3) return false;
  return true;
}

function toMillis(value) {
  if (value && typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

/** `teams` = [{id, data}] -> Map<pairKey, [{id, createdAtMs, player1Id, player2Id}]>. */
function groupTeamsByPair(teams) {
  const groups = new Map();
  for (const team of teams) {
    const data = team.data || {};
    if (!isPairTeamDoc(data)) continue;
    const pairKey = buildPairKey(data.player1Id, data.player2Id);
    if (!pairKey) continue;
    if (!groups.has(pairKey)) groups.set(pairKey, []);
    groups.get(pairKey).push({
      id: team.id,
      createdAtMs: toMillis(data.createdAt),
      player1Id: String(data.player1Id ?? "").trim(),
      player2Id: String(data.player2Id ?? "").trim(),
    });
  }
  return groups;
}

/**
 * @param members [{id, createdAtMs}] do mesmo par
 * @param tournamentsByTeamId {teamId: [tournamentId]}
 * @param refCountByTeamId {teamId: quantos docs apontam para ele}
 */
function planGroupMerge({members, tournamentsByTeamId, refCountByTeamId}) {
  if (!Array.isArray(members) || members.length < 2) {
    return {survivorId: "", absorbedIds: [], skipped: true, reason: "sem-duplicado"};
  }

  const seen = new Set();
  for (const member of members) {
    for (const tournamentId of tournamentsByTeamId[member.id] || []) {
      if (seen.has(tournamentId)) {
        return {
          survivorId: "",
          absorbedIds: [],
          skipped: true,
          reason: "convivencia-legitima",
        };
      }
      seen.add(tournamentId);
    }
  }

  let survivor = null;
  for (const member of members) {
    const refs = refCountByTeamId[member.id] || 0;
    if (survivor == null) {
      survivor = {member, refs};
      continue;
    }
    const better =
      refs > survivor.refs ||
      (refs === survivor.refs && member.createdAtMs < survivor.member.createdAtMs) ||
      (refs === survivor.refs &&
        member.createdAtMs === survivor.member.createdAtMs &&
        member.id < survivor.member.id);
    if (better) survivor = {member, refs};
  }

  return {
    survivorId: survivor.member.id,
    absorbedIds: members.filter((m) => m.id !== survivor.member.id).map((m) => m.id),
    skipped: false,
    reason: "",
  };
}

/** Funde docs de `teamRankings`; resultado do mesmo torneio+categoria conta uma vez. */
function mergeTeamRankingDocs(survivorDoc, absorbedDocs) {
  const byKey = new Map();
  const docs = [survivorDoc, ...(absorbedDocs || [])].filter(Boolean);
  for (const doc of docs) {
    for (const result of doc.results || []) {
      const key = `${result.tournamentId}_${result.categoryId}`;
      if (!byKey.has(key)) byKey.set(key, result);
    }
  }

  const results = [...byKey.values()];
  const pointsByYear = {};
  let totalPoints = 0;
  const tournaments = new Set();
  for (const result of results) {
    const points = Number(result.points) || 0;
    const year = String(result.year ?? "");
    totalPoints += points;
    if (year) pointsByYear[year] = (pointsByYear[year] || 0) + points;
    tournaments.add(result.tournamentId);
  }

  return {
    totalPoints,
    pointsByYear,
    tournamentsCount: tournaments.size,
    results,
  };
}

module.exports = {
  buildPairKey,
  isPairTeamDoc,
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
};
