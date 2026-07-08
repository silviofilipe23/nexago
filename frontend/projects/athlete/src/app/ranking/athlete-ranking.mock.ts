import type { RankingParticipant, RankingScoringRule, RankingSelfEntry } from './athlete-ranking.models';

export const MOCK_RANKING_INDIVIDUAL: readonly RankingParticipant[] = [
  { id: 'ri-1', name: 'Rafaela Nunes', city: 'Goiânia, GO', points: 4180, level: 'Profissional', sport: 'beachVolleyball', trend: 0 },
  { id: 'ri-2', name: 'Igor Mendes', city: 'Aparecida de Goiânia, GO', points: 3920, level: 'Profissional', sport: 'beachVolleyball', trend: 0 },
  { id: 'ri-3', name: 'Carla Menezes', city: 'Goiânia, GO', points: 3760, level: 'Profissional', sport: 'beachVolleyball', trend: 0 },
  { id: 'ri-4', name: 'Bruno Ramos', city: 'Goiânia, GO', points: 3510, level: 'Avançado', sport: 'beachVolleyball', trend: 1 },
  { id: 'ri-5', name: 'Diego Torres', city: 'Trindade, GO', points: 3402, level: 'Avançado', sport: 'beachVolleyball', trend: -1 },
  { id: 'ri-6', name: 'Luiz Farias', city: 'Goiânia, GO', points: 3288, level: 'Intermediário', sport: 'beachVolleyball', trend: 0 },
  { id: 'ri-7', name: 'Carla Almeida', city: 'Senador Canedo, GO', points: 3105, level: 'Intermediário', sport: 'beachVolleyball', trend: 2 },
  { id: 'ri-8', name: 'Jorge Ribeiro', city: 'Goiânia, GO', points: 2988, level: 'Intermediário', sport: 'beachTennis', trend: -1 },
  { id: 'ri-9', name: 'Enzo Ribeiro', city: 'Goiânia, GO', points: 2840, level: 'Intermediário', sport: 'beachTennis', trend: 3 },
];

export const MOCK_RANKING_DOUBLES: readonly RankingParticipant[] = [
  { id: 'rd-1', name: 'Rafa & Tonho', city: 'Goiânia, GO', points: 3980, level: 'Profissional', sport: 'beachVolleyball', trend: 0 },
  { id: 'rd-2', name: 'Silva & Costa', city: 'Aparecida de Goiânia, GO', points: 3710, level: 'Profissional', sport: 'beachVolleyball', trend: 1 },
  { id: 'rd-3', name: 'Almeida & Nunes', city: 'Goiânia, GO', points: 3460, level: 'Avançado', sport: 'beachVolleyball', trend: -1 },
  { id: 'rd-4', name: 'Ramos & Torres', city: 'Trindade, GO', points: 3190, level: 'Avançado', sport: 'beachVolleyball', trend: 0 },
  { id: 'rd-5', name: 'Farias & Ribeiro', city: 'Goiânia, GO', points: 2905, level: 'Intermediário', sport: 'beachTennis', trend: 2 },
  { id: 'rd-6', name: 'Menezes & Canedo', city: 'Senador Canedo, GO', points: 2718, level: 'Intermediário', sport: 'beachTennis', trend: -2 },
];

export const MOCK_SELF_INDIVIDUAL: RankingSelfEntry = {
  rank: 412,
  name: 'Marcelo Antunes',
  city: 'Aparecida de Goiânia, GO',
  points: 340,
  level: 'Iniciante',
  trend: 12,
};

export const MOCK_SELF_DOUBLES: RankingSelfEntry = {
  rank: 58,
  name: 'Marcelo Antunes & Bruno V.',
  city: 'Aparecida de Goiânia, GO',
  points: 1200,
  level: 'Intermediário',
  trend: 3,
};

export const RANKING_SCORING_RULES: readonly RankingScoringRule[] = [
  { id: 'rule-tournament', title: 'Vitória em torneio', detail: '+ 80 a 320 pts, conforme fase' },
  { id: 'rule-challenge', title: 'Vitória em desafio', detail: '+ 15 a 45 pts, conforme adversário' },
  { id: 'rule-league', title: 'Etapa de liga', detail: '+ 60 pts por etapa disputada' },
];
