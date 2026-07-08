import type { AthleteDirectoryEntry } from '../atletas/athlete-directory.models';
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';
import type { PublicAthleteProfile } from './athlete-public-profile.component';
import type { ProfileDemoExtras } from './public-profile-demo.models';

const SPORT_LABEL: Record<string, string> = {
  beachVolleyball: 'Vôlei de praia',
  beachTennis: 'Beach tênis',
  tennis: 'Tênis',
  padel: 'Padel',
  volleyball: 'Vôlei',
  football: 'Futebol',
};

function cityOnly(cityState: string): string {
  return cityState.split(',')[0]?.trim() || cityState;
}

export function buildMockPublicAthleteProfile(entry: AthleteDirectoryEntry): PublicAthleteProfile {
  const sportLabel = SPORT_LABEL[entry.sport] ?? entry.sport;
  const [city, state] = entry.city.split(',').map((s) => s.trim());
  return {
    uid: `mock-${entry.id}`,
    fullName: entry.fullName,
    handle: entry.handle,
    headline: `Atleta de ${sportLabel} em ${entry.city}`,
    bio: `Atleta ativo(a) no hub NexaGO — ${sportLabel}, nível ${entry.level}, na região de ${entry.city}.`,
    city: city ?? entry.city,
    state: state ?? '',
    country: 'Brasil',
    locationLabel: entry.city,
    coverPhotoUrl: null,
    profilePhotoUrl: null,
    sports: [sportLabel],
    primarySport: sportLabel,
    level: entry.level,
    category: entry.level,
    favoritePosition: null,
    dominantHand: null,
    heightLabel: null,
    preferredCourtSide: null,
    partnerName: null,
    instagram: null,
    instagramUrl: null,
    availabilityNote: null,
    availabilitySlots: [],
    goals: null,
    achievements: [],
    lookingForPartner: false,
    openToTournaments: entry.suggestionReason != null,
    openToCasualGames: true,
    completionScore: 72,
    profileStrength: 'Perfil promissor',
    rankings: [
      {
        scope: 'global',
        scopeRef: null,
        label: 'NexaGO geral',
        positionLabel: `#${entry.rankingPosition}`,
        pointsLabel: null,
        categoryLabel: cityOnly(entry.city),
      },
    ],
  };
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) % 100000;
  }
  return h;
}

const WIN_RATIO_BY_LEVEL: Record<string, number> = {
  Profissional: 0.78,
  Avançado: 0.68,
  Intermediário: 0.55,
  Iniciante: 0.42,
};

const AVAILABILITY_POOL = [
  'Segunda · Noite',
  'Terça · Noite',
  'Quarta · Manhã',
  'Quinta · Noite',
  'Sexta · Tarde',
  'Sábado · Manhã',
  'Domingo · Tarde',
] as const;

function buildFallbackExtras(entry: AthleteDirectoryEntry): ProfileDemoExtras {
  const seed = hashSeed(entry.handle);
  const totalGames = 18 + (seed % 55);
  const winRatio = WIN_RATIO_BY_LEVEL[entry.level] ?? 0.5;
  const wins = Math.round(totalGames * winRatio);
  const xp = ((seed % 8) + 1) * 100 + (seed % 100);
  const levelNumber = Math.floor(xp / 100);
  const xpInLevel = xp % 100;
  const streakDays = 1 + (seed % 7);
  const unlockedCount = 6 + (seed % 15);
  const unlockedIds = new Set(ACHIEVEMENT_CATALOG.slice(0, unlockedCount).map((a) => a.id));
  const slot1 = AVAILABILITY_POOL[seed % AVAILABILITY_POOL.length]!;
  const slot2 = AVAILABILITY_POOL[(seed + 3) % AVAILABILITY_POOL.length]!;

  return {
    levelNumber,
    xpInLevel,
    xpForNextLevel: 100 - xpInLevel,
    xpProgressPercent: xpInLevel,
    totalGames,
    wins,
    streakDays,
    achievementViewModels: buildAchievementViewModels(unlockedIds),
    unlockedCount,
    achievementTotal: ACHIEVEMENT_CATALOG.length,
    teams: [],
    matches: [],
  };
}

const RAFANUNES_EXTRAS: ProfileDemoExtras = {
  levelNumber: 6,
  xpInLevel: 78,
  xpForNextLevel: 22,
  xpProgressPercent: 78,
  totalGames: 86,
  wins: 61,
  streakDays: 6,
  achievementViewModels: buildAchievementViewModels(
    new Set(ACHIEVEMENT_CATALOG.slice(0, 19).map((a) => a.id)),
  ),
  unlockedCount: 19,
  achievementTotal: ACHIEVEMENT_CATALOG.length,
  teams: [
    { id: 'rn-t1', teamId: 'dt-1', teamName: 'Rafa & Tonho', detailLabel: '#1 no ranking de duplas · 18 vitórias' },
    { id: 'rn-t2', teamId: 'rafaela-carlam', teamName: 'Rafaela & Carla M.', detailLabel: 'Reserva · torneios femininos' },
  ],
  matches: [
    { id: 'rn-m1', opponent: 'Ana R. & Beto L.', contextLabel: 'Open Goiânia Beach · Final', result: 'W', score: '2-0', dateLabel: '28/06' },
    { id: 'rn-m2', opponent: 'Carla M. & Igor M.', contextLabel: 'Open Goiânia Beach · Semi', result: 'W', score: '2-1', dateLabel: '27/06' },
    { id: 'rn-m3', opponent: 'Diego & Luiz', contextLabel: 'Desafio de ranking', result: 'W', score: '2-0', dateLabel: '19/06' },
    { id: 'rn-m4', opponent: 'Bruno & Carla A.', contextLabel: 'Copa Goiás Beach · Etapa 2', result: 'L', score: '1-2', dateLabel: '07/06' },
  ],
};

const CURATED_EXTRAS: Record<string, ProfileDemoExtras> = {
  rafanunes: RAFANUNES_EXTRAS,
};

const CURATED_BIO: Record<string, string> = {
  rafanunes:
    'Compito em torneios de vôlei de praia há 4 anos. Treino terças, quintas e sábados. Aberta a desafios de qualquer nível — gosto de jogar com iniciantes também.',
};

const CURATED_AVAILABILITY: Record<string, readonly string[]> = {
  rafanunes: ['Terça · Noite', 'Quinta · Noite', 'Sábado · Manhã'],
};

export function applyCuratedProfileOverrides(entry: AthleteDirectoryEntry, profile: PublicAthleteProfile): PublicAthleteProfile {
  const bio = CURATED_BIO[entry.handle];
  const availabilitySlots = CURATED_AVAILABILITY[entry.handle];
  if (!bio && !availabilitySlots) {
    return profile;
  }
  return {
    ...profile,
    bio: bio ?? profile.bio,
    availabilitySlots: availabilitySlots ? [...availabilitySlots] : profile.availabilitySlots,
  };
}

export function getMockProfileExtras(entry: AthleteDirectoryEntry): ProfileDemoExtras {
  return CURATED_EXTRAS[entry.handle] ?? buildFallbackExtras(entry);
}
