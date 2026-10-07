import { isKingOfCourtMatchType } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';

/** Partida de chave eliminatória: nem de grupo nem King of the Court. */
function isChaveMatch(m: TournamentMatch): boolean {
  const type = (m.matchType ?? '').trim().toLowerCase();
  if (!type || type === 'group' || isKingOfCourtMatchType(type)) return false;
  return !(m.round ?? '').trim().toLowerCase().startsWith('grupo ');
}

/** Categorias do torneio que têm chave eliminatória (simples ou dupla), na ordem cadastrada. */
export function categoriasComChave<T extends { id: string }>(matches: readonly TournamentMatch[], categorias: readonly T[]): T[] {
  const ids = new Set(matches.filter(isChaveMatch).map((m) => m.categoryId));
  return categorias.filter((c) => ids.has(c.id));
}
