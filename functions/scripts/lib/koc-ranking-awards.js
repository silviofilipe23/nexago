/* eslint-disable */
/**
 * Colocação de uma categoria King of the Court para o ranking global — usada
 * SÓ por `scripts/award-koc-tournament-ranking.js`. O motor NÃO pontua KOTC
 * (decisão de 20/09, travada em `src/koc-no-ranking.test.ts`); isto é a
 * ferramenta da exceção, e por isso mora em scripts/, não em src/.
 *
 * Regra (decisão do dono em 30/09, 1º torneio a usar: SiDr6BiPlrKCW0JX5IPj):
 *   - Pódio: a tabela (`kocStandings`) da rodada `koc_final` — nunca o
 *     `winnerId`, que só aponta o 1º. Lugar acima de 4 (final de 5) = quartas.
 *   - Caiu numa fase intermediária: degrau pela faixa de colocação que a fase
 *     implica, com a mesma `tierForTopPosition` do mata-mata. Na planta de 12
 *     (6+6 → 8 → 4), os 4 que param na semifinal são 5º–8º = quartas.
 *   - Caiu na 1ª fase: participação (`groups`) — ela é a classificatória, como
 *     a fase de grupos.
 */

const {tierForTopPosition} = require("./bracket-placement-tiers");

function isCompleted(match) {
  return String(match.status ?? "").trim().toLowerCase() === "completed";
}

/**
 * @param {Array<Record<string, unknown>>} matches partidas de UMA categoria.
 * @returns {Array<{teamId: string, place?: number, bucket?: string}>} mesmo
 *   formato de `LeaguePlacementAward` (src/league-ranking.ts).
 */
function kocRankingAwards(matches) {
  const rounds = matches.filter((m) =>
    String(m.matchType ?? "").startsWith("koc_"),
  );
  const finals = rounds.filter((m) => m.matchType === "koc_final");
  if (finals.length !== 1) {
    throw new Error(`esperava 1 rodada koc_final, achei ${finals.length}`);
  }
  const pending = rounds.filter((m) => !isCompleted(m));
  if (pending.length > 0) {
    throw new Error(`${pending.length} rodada(s) KOTC ainda não concluída(s)`);
  }

  const final = finals[0];
  const standings = Array.isArray(final.kocStandings) ? final.kocStandings : [];
  if (standings.length === 0) throw new Error("koc_final sem kocStandings");
  // Remoção por lesão na final não tem regra de pontuação definida: parar e
  // decidir à mão é melhor que premiar ou zerar em silêncio.
  if (standings.some((s) => s.removed === true)) {
    throw new Error("final com equipe removida por lesão — decidir à mão");
  }

  const reachedPhase = new Map();
  for (const round of rounds) {
    const phase = Number(round.kocPhase) || 0;
    for (const teamId of round.kocTeamIds ?? []) {
      reachedPhase.set(teamId, Math.max(reachedPhase.get(teamId) ?? 0, phase));
    }
  }
  const finalPhase = Number(final.kocPhase) || 0;
  const teamsReaching = (phase) =>
    [...reachedPhase.values()].filter((reached) => reached >= phase).length;

  const awards = [];
  const onPodium = new Set();
  for (const standing of standings) {
    const place = Number(standing.place);
    if (!standing.teamId || !Number.isInteger(place) || place < 1) {
      throw new Error(`linha inválida na tabela da final: ${JSON.stringify(standing)}`);
    }
    onPodium.add(standing.teamId);
    awards.push(
      place <= 4
        ? {teamId: standing.teamId, place}
        : {teamId: standing.teamId, bucket: "quarters"},
    );
  }

  for (const [teamId, phase] of reachedPhase) {
    if (onPodium.has(teamId)) continue;
    if (phase >= finalPhase) {
      throw new Error(`${teamId} jogou a final e não está na tabela dela`);
    }
    awards.push({
      teamId,
      bucket:
        phase <= 1 ? "groups" : tierForTopPosition(teamsReaching(phase + 1) + 1),
    });
  }
  return awards;
}

module.exports = {kocRankingAwards};
