import type { RankingScoringRule } from './athlete-ranking.models';

/** Copy estática de "como pontuar" — não é dado de atleta, fica fora do escopo de
 *  "mock → real" (não existe um endpoint disso, é conteúdo editorial fixo). */
export const RANKING_SCORING_RULES: readonly RankingScoringRule[] = [
  { id: 'rule-tournament', title: 'Vitória em torneio', detail: '+ 80 a 320 pts, conforme fase' },
  { id: 'rule-challenge', title: 'Vitória em desafio', detail: '+ 15 a 45 pts, conforme adversário' },
  { id: 'rule-league', title: 'Etapa de liga', detail: '+ 60 pts por etapa disputada' },
];
