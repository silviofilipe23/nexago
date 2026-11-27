import type { TournamentMatch } from '../data/matches-repository';

/**
 * Linhas do aviso "a chave ficou desatualizada".
 *
 * Na chave por campanha (grupos + mata-mata com folgas), corrigir o placar de um
 * jogo de grupo muda a classificação entre grupos. O servidor refaz a ordem das
 * vagas enquanto nenhum jogo do mata-mata começou; depois disso ele não mexe em
 * ninguém e grava em cada partida afetada quem a classificação ATUAL poria ali
 * (`qualifierDrift` → `seedingDrift`). Aqui isso vira texto para o organizador.
 *
 * Quem folga ocupa duas partidas (a de folga e a da rodada seguinte), então a
 * mesma troca aparece duas vezes — sai como uma linha só, com os dois jogos.
 * O nome de quem deveria estar na vaga vem dos outros jogos da categoria: toda
 * classificada jogou a fase de grupos.
 */
export function seedingDriftNotes(knockout: readonly TournamentMatch[], all: readonly TournamentMatch[]): string[] {
  const names = new Map<string, string>();
  for (const m of all) {
    if (m.teamAId) names.set(m.teamAId, m.team1Label);
    if (m.teamBId) names.set(m.teamBId, m.team2Label);
  }

  /** Uma troca = "esta dupla deveria estar onde aquela está", em um ou mais jogos. */
  const swaps = new Map<string, { expected: string; current: string; matchNumbers: number[] }>();
  for (const m of knockout) {
    const sides = [
      { expectedId: m.seedingDrift?.teamAId ?? null, currentId: m.teamAId, current: m.team1Label },
      { expectedId: m.seedingDrift?.teamBId ?? null, currentId: m.teamBId, current: m.team2Label },
    ];
    for (const { expectedId, currentId, current } of sides) {
      if (!expectedId) continue;
      const key = `${currentId}>${expectedId}`;
      const swap = swaps.get(key) ?? { expected: names.get(expectedId) ?? 'outra dupla', current, matchNumbers: [] };
      swaps.set(key, { ...swap, matchNumbers: [...swap.matchNumbers, m.matchNumber] });
    }
  }

  return [...swaps.values()]
    .map((swap) => ({ ...swap, matchNumbers: [...swap.matchNumbers].sort((a, b) => a - b) }))
    .sort((a, b) => (a.matchNumbers[0] ?? 0) - (b.matchNumbers[0] ?? 0))
    .map((swap) => `${matchNumbersLabel(swap.matchNumbers)}: ${swap.expected} no lugar de ${swap.current}`);
}

/** "Jogo #13" · "Jogos #10 e #14" · "Jogos #10, #14 e #17". */
function matchNumbersLabel(numbers: readonly number[]): string {
  const tags = numbers.map((n) => `#${n}`);
  if (tags.length <= 1) return `Jogo ${tags[0] ?? ''}`.trim();
  return `Jogos ${tags.slice(0, -1).join(', ')} e ${tags[tags.length - 1]}`;
}
