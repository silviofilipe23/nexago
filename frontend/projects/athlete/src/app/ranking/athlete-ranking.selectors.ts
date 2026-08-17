import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { FilterFormat, FilterGender, FilterLevel, RankingGender, RankingParticipant, TeamFormat } from './athlete-ranking.models';

export interface RankingRow extends RankingParticipant {
  rank: number;
}

/** Recorte que define QUAL ranking está na tela. A busca não entra aqui de propósito:
 *  posição é propriedade do ranking, não do que o atleta digitou na caixa de busca. */
export interface RankingSlice {
  sport: ArenaSportChip;
  level: FilterLevel;
  city: string;
  gender: FilterGender;
  format: FilterFormat;
}

export const CITY_ALL = 'all';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** A posição nasce aqui — esporte + categoria + cidade + gênero + formato renumeram
 *  (é outro ranking), então "1º de Goiânia na Iniciante 1" é uma leitura válida do pódio.
 *  Gênero/formato desconhecidos (null) só aparecem com o filtro em "Todos". */
export function rankParticipants(all: readonly RankingParticipant[], slice: RankingSlice): RankingRow[] {
  return all
    .filter((p) => p.sport === slice.sport)
    .filter((p) => slice.level === 'all' || p.level === slice.level)
    .filter((p) => slice.city === CITY_ALL || p.city === slice.city)
    .filter((p) => slice.gender === 'all' || p.gender === slice.gender)
    .filter((p) => slice.format === 'all' || p.format === slice.format)
    .sort((a, b) => b.points - a.points)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Grafias reais dos docs ("Masculino"/"Feminino"/"Misto"/"Mista", "m"/"f", inglês) —
 *  paridade com `normalizeRankingGender` do app (Flutter, `ranking_logic.dart`). */
export function normalizeRankingGender(raw: string | null | undefined): RankingGender | null {
  const n = (raw ?? '').trim().toLowerCase();
  if (n.length === 0) return null;
  if (n.startsWith('masc') || n === 'm' || n === 'male') return 'male';
  if (n.startsWith('fem') || n === 'f' || n === 'female') return 'female';
  if (n.startsWith('mist') || n.startsWith('mix') || n === 'x') return 'mixed';
  return null;
}

/** Gênero do time: o campo `gender` do doc vence; sem ele, deriva dos perfis do elenco
 *  (todos iguais mantém, diferentes vira misto) — paridade com `resolveTeamDiscoverGender`
 *  do app. Perfil sem gênero declarado não bloqueia a derivação. */
export function deriveTeamGender(teamGender: string | null, memberGenders: readonly (string | null)[]): RankingGender | null {
  const fromTeam = normalizeRankingGender(teamGender);
  if (fromTeam != null) return fromTeam;
  const known = memberGenders.map(normalizeRankingGender).filter((g): g is RankingGender => g != null);
  if (known.length === 0) return null;
  return known.every((g) => g === known[0]) ? known[0]! : 'mixed';
}

/** `teamSize` (3–5, equipes nomeadas) vence; sem ele o tamanho do elenco decide.
 *  Dupla legada não grava nenhum dos dois — cai no formato dupla. */
export function teamFormatOf(teamSize: number | null, memberCount: number): TeamFormat {
  const size = teamSize ?? memberCount;
  if (size >= 5) return 'quinteto';
  if (size === 4) return 'quarteto';
  if (size === 3) return 'trio';
  return 'dupla';
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
