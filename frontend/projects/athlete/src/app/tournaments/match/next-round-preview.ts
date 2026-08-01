import { buildBracketColumns, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';

/** "Quem vencer pega X ou Y" — quem espera o vencedor na fase seguinte.
 *
 *  A fiação real da chave (`winnerAdvance`) só é lida server-side pela Cloud Function que
 *  preenche a próxima partida; no client a posição é derivada, como no resto do portal. A
 *  derivação vale para eliminação simples, onde a partida `i` de uma coluna alimenta a partida
 *  `i/2` da coluna seguinte. Fora desse formato (chave dupla, colunas que não reduzem pela
 *  metade) devolvemos `null` em vez de arriscar uma informação errada. */

export interface NextRoundPreview {
  /** Oponentes possíveis: dois nomes enquanto a outra semi não terminou, um só depois. */
  opponentNames: string[];
  roundLabel: string;
  match: TournamentMatch;
}

export function nextRoundPreviewOf(
  matches: readonly TournamentMatch[],
  match: TournamentMatch,
  nameOf: (teamId: string, fallback: string | null) => string,
): NextRoundPreview | null {
  if (match.poolId || match.isGroupMatch) return null;

  const columns = buildBracketColumns(matches);
  const columnIndex = columns.findIndex((c) => c.matches.some((m) => m.id === match.id));
  if (columnIndex < 0) return null;

  const column = columns[columnIndex]!;
  const nextColumn = columns[columnIndex + 1];
  if (!nextColumn) return null;
  // Só uma coluna que reduz exatamente pela metade tem o encaixe posicional previsível.
  if (nextColumn.matches.length * 2 !== column.matches.length) return null;

  const position = column.matches.findIndex((m) => m.id === match.id);
  const nextMatch = nextColumn.matches[Math.floor(position / 2)];
  if (!nextMatch) return null;

  // O outro finalista sai da partida irmã — a que divide o mesmo par nesta coluna.
  const siblingIndex = position % 2 === 0 ? position + 1 : position - 1;
  const sibling = column.matches[siblingIndex];
  if (!sibling) return null;

  const names = opponentNamesOf(sibling, nameOf);
  return names.length > 0 ? { opponentNames: names, roundLabel: nextColumn.label, match: nextMatch } : null;
}

function opponentNamesOf(sibling: TournamentMatch, nameOf: (teamId: string, fallback: string | null) => string): string[] {
  if (matchIsCompleted(sibling) && sibling.winnerId) {
    const description = sibling.winnerId === sibling.teamAId ? sibling.teamADescription : sibling.teamBDescription;
    return [nameOf(sibling.winnerId, description)];
  }
  return [
    sibling.teamAId ? nameOf(sibling.teamAId, sibling.teamADescription) : null,
    sibling.teamBId ? nameOf(sibling.teamBId, sibling.teamBDescription) : null,
  ].filter((n): n is string => n != null);
}
