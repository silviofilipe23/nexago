import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { AthleteLevelLabel } from '../data/athlete-level';

export type RankingMode = 'individual' | 'doubles';
/** Os 5 tiers reais da escada (`data/athlete-level.ts`) — "Avançado"/"Profissional"
 *  eram sinônimos legados que o backend já normaliza pra Intermediário/Open, não tiers à parte. */
export type RankingLevel = AthleteLevelLabel;
export type FilterLevel = 'all' | RankingLevel;
export type RankingPeriod = 'geral' | 'temporada';
export type RankingGender = 'male' | 'female' | 'mixed';
export type FilterGender = 'all' | RankingGender;
/** Dupla é o formato legado sem `teamSize`; trio/quarteto/quinteto são as equipes
 *  nomeadas (`teams/{id}.teamSize` 3–5, gravado na criação da inscrição). */
export type TeamFormat = 'dupla' | 'trio' | 'quarteto' | 'quinteto';
export type FilterFormat = 'all' | TeamFormat;

/** Foto pública do atleta (`public_profiles/{uid}.avatarUrl`); `url` nulo cai nas iniciais. */
export interface RankingAvatar {
  url: string | null;
  initials: string;
}

export interface RankingParticipant {
  id: string;
  name: string;
  city: string;
  points: number;
  level: RankingLevel | null;
  sport: ArenaSportChip;
  /** Gênero do atleta (Individual) ou do time (Duplas) — null quando desconhecido,
   *  e aí a linha só aparece com o filtro em "Todos". */
  gender: RankingGender | null;
  /** Só linha de time tem formato; no Individual fica null (o filtro nem aparece lá). */
  format: TeamFormat | null;
  /** Variação de posição — sem dado real no backend hoje (sempre 0, sem seta). */
  trend: number;
  /** Uma foto no modo Individual, duas no de Duplas — a linha é o time, não um atleta. */
  avatars: readonly RankingAvatar[];
}

export interface RankingSelfEntry {
  rank: number;
  name: string;
  city: string;
  points: number;
  level: RankingLevel | null;
  trend: number;
}

export interface RankingScoringRule {
  id: string;
  title: string;
  detail: string;
}

/** Tabela real de pontos por colocação (`DEFAULT_GLOBAL_POINTS` em
 *  `functions/src/tournament-ranking.ts`). "Melhores 5" só vale no modo
 *  Temporada; no modo Geral soma tudo que o atleta já ganhou. */
export const RANKING_SCORING_RULES: readonly RankingScoringRule[] = [
  { id: 'rule-1', title: '1º lugar (campeão)', detail: '100 pts' },
  { id: 'rule-2', title: '2º lugar (vice)', detail: '80 pts' },
  { id: 'rule-3', title: '3º lugar', detail: '60 pts' },
  { id: 'rule-4', title: '4º lugar', detail: '50 pts' },
  {
    id: 'rule-quarters',
    title: 'Eliminado no mata-mata antes da semi',
    detail: '33 pts',
  },
  {
    id: 'rule-groups',
    title: 'Eliminado na fase de grupos',
    detail: '10 pts',
  },
];
