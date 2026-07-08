import type { ArenaSportChip } from '@nexago/arena-discovery';
import { MOCK_DISCOVER_TEAMS, MOCK_MY_TEAMS } from './athlete-equipes.mock';
import type { DiscoverTeam, MyTeam, TeamStatus } from './athlete-equipes.models';
import type { TeamPublicProfile } from './team-profile.models';

const SPORT_LABEL: Partial<Record<ArenaSportChip, string>> = {
  beachVolleyball: 'vôlei de praia',
  beachTennis: 'beach tênis',
  tennis: 'tênis',
  padel: 'padel',
  volleyball: 'vôlei',
  football: 'futebol',
};

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

const RAFA_TONHO: TeamPublicProfile = {
  id: 'dt-1',
  teamName: 'Rafa & Tonho',
  sport: 'beachVolleyball',
  level: 'Avançado',
  city: 'Goiânia, GO',
  status: 'fixed',
  wins: 18,
  losses: 3,
  currentStreakWins: 7,
  rankingPosition: 1,
  rankingPoints: 5210,
  togetherSinceLabel: 'Mar 2024',
  bio: 'Dupla formada em 2024, especializada em torneios de vôlei de praia avançado. Treinam juntos três vezes por semana e disputam o circuito estadual.',
  members: [
    { handle: 'rafanunes', fullName: 'Rafaela Nunes', role: 'Ataque · capitã', levelNumber: 6 },
    { handle: 'tonhoreis', fullName: "Antônio 'Tonho' Reis", role: 'Levantamento', levelNumber: 5 },
  ],
  titles: [
    { id: 't1', name: 'Open Goiânia Beach', resultLabel: 'Campeões', dateLabel: '28/06' },
    { id: 't2', name: 'Copa Goiás Beach', resultLabel: 'Etapa 1 · Campeões', dateLabel: '14/03' },
    { id: 't3', name: 'Circuito Estadual', resultLabel: 'Vice-campeões', dateLabel: 'Nov/2025' },
    { id: 't4', name: 'Desafio de Verão', resultLabel: 'Campeões', dateLabel: 'Jan/2025' },
  ],
  matches: [
    { id: 'dt1-m1', opponent: 'Ana R. & Beto L.', contextLabel: 'Open Goiânia Beach · Final', result: 'W', score: '2-0', dateLabel: '28/06' },
    { id: 'dt1-m2', opponent: 'Carla M. & Igor M.', contextLabel: 'Open Goiânia Beach · Semi', result: 'W', score: '2-1', dateLabel: '27/06' },
    { id: 'dt1-m3', opponent: 'Diego & Luiz', contextLabel: 'Desafio de ranking', result: 'W', score: '2-0', dateLabel: '19/06' },
    { id: 'dt1-m4', opponent: 'Bruno & Carla A.', contextLabel: 'Copa Goiás Beach · Etapa 2', result: 'L', score: '1-2', dateLabel: '07/06' },
  ],
  availabilitySlots: ['Terça · Noite', 'Quinta · Noite', 'Sábado · Manhã'],
};

const RAFAELA_CARLAM: TeamPublicProfile = {
  id: 'rafaela-carlam',
  teamName: 'Rafaela & Carla M.',
  sport: 'beachVolleyball',
  level: 'Avançado',
  city: 'Goiânia, GO',
  status: 'fixed',
  wins: 4,
  losses: 2,
  currentStreakWins: 2,
  rankingPosition: 12,
  rankingPoints: 1450,
  togetherSinceLabel: 'Jan 2025',
  bio: 'Parceria formada pra reforçar duplas femininas em torneios específicos. Jogam juntas quando a agenda permite, com foco em campeonatos de categoria feminina.',
  members: [
    { handle: 'rafanunes', fullName: 'Rafaela Nunes', role: 'Ataque', levelNumber: 6 },
    { handle: 'carlam', fullName: 'Carla Menezes', role: 'Defesa', levelNumber: 5 },
  ],
  titles: [],
  matches: [],
  availabilitySlots: ['Domingo · Tarde'],
};

const CURATED_TEAM_PROFILES: Record<string, TeamPublicProfile> = {
  'dt-1': RAFA_TONHO,
  'rafaela-carlam': RAFAELA_CARLAM,
};

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 100000;
  }
  return h;
}

function splitTeamName(name: string): [string, string] {
  const [a, b] = name.split('&').map((part) => part.trim());
  return [a || name, b || ''];
}

function isMyTeam(source: DiscoverTeam | MyTeam): source is MyTeam {
  return 'status' in source;
}

function buildFallbackTeamProfile(source: DiscoverTeam | MyTeam): TeamPublicProfile {
  const seed = hashSeed(source.id);
  const [nameA, nameB] = splitTeamName(source.name);
  const city = isMyTeam(source) ? 'Aparecida de Goiânia, GO' : source.city;
  const status: TeamStatus = isMyTeam(source) ? source.status : 'fixed';
  const rankingPosition = source.doublesRank ?? 50 + (seed % 200);
  const rankingPoints = Math.max(300, 6000 - rankingPosition * 40 + (seed % 300));
  const togetherSinceLabel = `${MONTHS_SHORT[seed % 12]} ${2023 + (seed % 3)}`;
  const sportLabel = SPORT_LABEL[source.sport] ?? source.sport;

  return {
    id: source.id,
    teamName: source.name,
    sport: source.sport,
    level: source.level,
    city,
    status,
    wins: source.wins,
    losses: source.losses,
    currentStreakWins: source.wins > 0 && source.losses === 0 ? source.wins : 1 + (seed % 6),
    rankingPosition,
    rankingPoints,
    togetherSinceLabel,
    bio: `Dupla de ${sportLabel}, nível ${source.level}, ativa na região de ${city}.`,
    members: [
      { handle: null, fullName: nameA, role: 'Atleta', levelNumber: 3 + (seed % 5) },
      { handle: null, fullName: nameB || nameA, role: 'Atleta', levelNumber: 3 + ((seed + 7) % 5) },
    ],
    titles: [],
    matches: [],
    availabilitySlots: [],
  };
}

export function getTeamProfile(id: string): TeamPublicProfile | null {
  const curated = CURATED_TEAM_PROFILES[id];
  if (curated) {
    return curated;
  }
  const fromDiscover = MOCK_DISCOVER_TEAMS.find((t) => t.id === id);
  if (fromDiscover) {
    return buildFallbackTeamProfile(fromDiscover);
  }
  const fromMine = MOCK_MY_TEAMS.find((t) => t.id === id);
  if (fromMine) {
    return buildFallbackTeamProfile(fromMine);
  }
  return null;
}
