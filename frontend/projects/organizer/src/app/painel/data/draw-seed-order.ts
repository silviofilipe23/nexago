import type { DrawSession } from './draw-session.model';

/**
 * Ordem de força das duplas — o que o organizador reordena quando a sugestão
 * automática por nível não bate com o que ele sabe do torneio.
 *
 * A ordem é UMA só e serve aos dois formatos: em grupos as primeiras formam o
 * pote 1, na dupla eliminatória ocupam os seeds travados. Quem transforma a
 * ordem em potes é o servidor (`resequenceSession`), pela mesma regra que a
 * criação usa — aqui é só a manipulação da lista na tela.
 */

/**
 * Ordem atual da sessão: cabeças travadas primeiro (na ordem do seed), depois
 * os potes, e por último qualquer dupla que tenha ficado de fora dos dois.
 *
 * O último passo não é paranoia: uma dupla fora dos potes some da tela de
 * reordenação, e some da tela é o caminho mais curto pra sumir do sorteio.
 */
export function currentSeedOrder(session: DrawSession): string[] {
  const locked = session.entrants
    .filter((e) => e.lockedSeed != null)
    .sort((a, b) => (a.lockedSeed ?? 0) - (b.lockedSeed ?? 0))
    .map((e) => e.teamId);

  const seen = new Set(locked);
  const out = [...locked];

  for (const teamId of session.pots.flatMap((p) => p.teamIds)) {
    if (seen.has(teamId)) continue;
    seen.add(teamId);
    out.push(teamId);
  }
  for (const entrant of session.entrants) {
    if (seen.has(entrant.teamId)) continue;
    seen.add(entrant.teamId);
    out.push(entrant.teamId);
  }
  return out;
}

/** Troca a dupla de posição com a vizinha. Fora dos limites, devolve a lista intacta. */
export function movedSeedOrder(
  order: readonly string[],
  index: number,
  delta: number,
): string[] {
  const target = index + delta;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return [...order];
  }
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Reordena por arraste: tira de `fromIndex` e encaixa em `toIndex`. */
export function reorderedSeedOrder(
  order: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length
  ) {
    return [...order];
  }
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return next;
}

/**
 * Volta à sugestão automática: maior pontuação primeiro, duplas sem nível no
 * fim. Empate PRESERVA a ordem atual — sem isso, clicar duas vezes embaralharia
 * quem já estava do jeito que o organizador queria.
 */
export function sortedByStrength(
  order: readonly string[],
  pointsOf: (teamId: string) => number | null,
): string[] {
  return order
    .map((teamId, index) => ({ teamId, index, points: pointsOf(teamId) }))
    .sort((a, b) => {
      if (a.points !== b.points) {
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return b.points - a.points;
      }
      return a.index - b.index;
    })
    .map((row) => row.teamId);
}

/**
 * Quantas duplas do topo são "cabeça": o pote 1 em grupos, as travadas na
 * dupla eliminatória. `draftLocked` é o valor em edição, que pode diferir do
 * gravado enquanto o organizador ainda não salvou.
 */
export function headCountOf(session: DrawSession, draftLocked: number): number {
  return session.format === 'double_elimination' ?
    draftLocked :
    (session.pots[0]?.teamIds.length ?? 0);
}
