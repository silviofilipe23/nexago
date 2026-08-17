import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { FilterLevel, RankingParticipant } from './athlete-ranking.models';

export interface RankingRow extends RankingParticipant {
  rank: number;
}

/** Recorte que define QUAL ranking está na tela. A busca não entra aqui de propósito:
 *  posição é propriedade do ranking, não do que o atleta digitou na caixa de busca. */
export interface RankingSlice {
  sport: ArenaSportChip;
  level: FilterLevel;
  city: string;
}

export const CITY_ALL = 'all';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** A posição nasce aqui — esporte + categoria + cidade renumeram (é outro ranking),
 *  então "1º de Goiânia na Iniciante 1" é uma leitura válida do pódio. */
export function rankParticipants(all: readonly RankingParticipant[], slice: RankingSlice): RankingRow[] {
  return all
    .filter((p) => p.sport === slice.sport)
    .filter((p) => slice.level === 'all' || p.level === slice.level)
    .filter((p) => slice.city === CITY_ALL || p.city === slice.city)
    .sort((a, b) => b.points - a.points)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Consulta pura sobre o ranking já numerado: filtra linhas e preserva `rank`.
 *  Nunca renumera — era essa renumeração que jogava o buscado no pódio como 1º. */
export function searchRanking(ranked: readonly RankingRow[], query: string): RankingRow[] {
  const q = normalize(query);
  if (q.length === 0) return [];
  return ranked.filter((p) => normalize(p.name).includes(q) || normalize(p.city).includes(q));
}

export function hasSearchQuery(query: string): boolean {
  return normalize(query).length > 0;
}

/** Perfil por trás da foto no modo Individual. `hasPublicProfile` false = linha órfã
 *  (`athleteRankings` sobrevive à exclusão do atleta): sem espelho em `public_profiles` a
 *  rota só teria "perfil publico nao encontrado" pra mostrar, então não vira link. */
export function athleteProfileLink(uid: string, hasPublicProfile: boolean): readonly string[] | null {
  return uid.length > 0 && hasPublicProfile ? ['/atletas', uid] : null;
}

/** Perfil por trás das duas fotos no modo Duplas — a linha é o time, não um atleta.
 *  Dupla incompleta não vira link porque `TeamPublicProfileComponent` recusa carregá-la. */
export function teamProfileLink(teamId: string, isComplete: boolean): readonly string[] | null {
  return teamId.length > 0 && isComplete ? ['/equipes', teamId] : null;
}
