export type TournamentGender = 'masculino' | 'feminino' | 'misto';

export type TournamentUrgencyTone = 'last_spots' | 'deadline_soon';

export interface TournamentUrgency {
  tone: TournamentUrgencyTone;
  line: string;
}

export interface TournamentPreview {
  id: string;
  name: string;
  startDate: string;
  level: string;
  city: string;
  state: string;
  imageUrl: string;
  maxTeams: number;
  teamsRegistered: number;
  pricePerTeamReais: number;
  gender: TournamentGender;
  registeredAthletes: number;
  urgency?: TournamentUrgency;
}

export const MOCK_TOURNAMENTS: TournamentPreview[] = [
  {
    id: 't1',
    name: 'Open NexaGO Verão',
    startDate: '2026-05-12',
    level: 'Intermediário',
    city: 'Curitiba',
    state: 'PR',
    imageUrl: 'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=800&q=80&auto=format&fit=crop',
    maxTeams: 12,
    teamsRegistered: 10,
    pricePerTeamReais: 120,
    gender: 'masculino',
    registeredAthletes: 24,
    urgency: { tone: 'last_spots', line: 'Últimas vagas' },
  },
  {
    id: 't2',
    name: 'Circuito Duplas 2×2',
    startDate: '2026-05-24',
    level: 'Avançado',
    city: 'São Paulo',
    state: 'SP',
    imageUrl: 'https://images.unsplash.com/photo-1592652579629-a2e91534317b?w=800&q=80&auto=format&fit=crop',
    maxTeams: 16,
    teamsRegistered: 11,
    pricePerTeamReais: 180,
    gender: 'misto',
    registeredAthletes: 38,
    urgency: { tone: 'deadline_soon', line: 'Inscrições até 10 de maio' },
  },
  {
    id: 't3',
    name: 'Copa Arena Sul',
    startDate: '2026-06-02',
    level: 'Iniciante',
    city: 'Florianópolis',
    state: 'SC',
    imageUrl: 'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=800&q=80&auto=format&fit=crop',
    maxTeams: 10,
    teamsRegistered: 4,
    pricePerTeamReais: 80,
    gender: 'feminino',
    registeredAthletes: 12,
    urgency: { tone: 'deadline_soon', line: 'Inscrições abertas — corra' },
  },
  {
    id: 't4',
    name: 'NexaGO Night Series',
    startDate: '2026-06-18',
    level: 'Pro / A',
    city: 'Rio de Janeiro',
    state: 'RJ',
    imageUrl: 'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=800&q=80&auto=format&fit=crop',
    maxTeams: 8,
    teamsRegistered: 7,
    pricePerTeamReais: 240,
    gender: 'masculino',
    registeredAthletes: 18,
    urgency: { tone: 'last_spots', line: 'Últimas vagas' },
  },
  {
    id: 't5',
    name: 'Copa Iniciantes Praia',
    startDate: '2026-06-08',
    level: 'Iniciante',
    city: 'Goiânia',
    state: 'GO',
    imageUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop',
    maxTeams: 14,
    teamsRegistered: 6,
    pricePerTeamReais: 90,
    gender: 'masculino',
    registeredAthletes: 16,
  },
  {
    id: 't6',
    name: 'Open Feminino Litoral',
    startDate: '2026-06-22',
    level: 'Intermediário',
    city: 'Salvador',
    state: 'BA',
    imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80&auto=format&fit=crop',
    maxTeams: 12,
    teamsRegistered: 9,
    pricePerTeamReais: 110,
    gender: 'feminino',
    registeredAthletes: 22,
    urgency: { tone: 'deadline_soon', line: 'Inscrições até 1º de junho' },
  },
];
