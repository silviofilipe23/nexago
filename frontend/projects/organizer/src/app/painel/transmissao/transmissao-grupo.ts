import type { TournamentMatch } from '../data/matches-repository';

const PREFIX = 'Grupo ';

/** Letras dos grupos de uma categoria (A, B, C…), lidas do round "Grupo X" das partidas. */
export function gruposDaCategoria(matches: readonly TournamentMatch[], categoryId: string | null): string[] {
  const letters = new Set<string>();
  for (const m of matches) {
    if (categoryId !== null && m.categoryId !== categoryId) continue;
    const round = m.round?.trim() ?? '';
    if (round.startsWith(PREFIX) && round.length > PREFIX.length) letters.add(round.slice(PREFIX.length).trim());
  }
  return [...letters].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

/** Categorias do torneio que têm fase de grupos, na ordem cadastrada. */
export function categoriasComGrupos<T extends { id: string }>(matches: readonly TournamentMatch[], categorias: readonly T[]): T[] {
  return categorias.filter((c) => gruposDaCategoria(matches, c.id).length > 0);
}
