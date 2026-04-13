import type { TournamentGenderCat } from './tournament-discovery.models';

export type LeagueSeasonUiStatus = 'in_progress' | 'next_soon' | 'between' | 'ended';

export type LeagueTimelineStatus = 'finished' | 'current' | 'future';

export interface LeagueDetailHero {
  /** Vídeo em loop (ex.: `/media/login-brand-bg.mp4`) */
  videoSrc?: string;
  name: string;
  city: string;
  seasonLabel: string;
  uiStatus: LeagueSeasonUiStatus;
  /** Ex.: "Temporada em andamento" */
  statusHeadline: string;
  /** Ex.: "Próxima etapa em 5 dias" */
  statusSubline: string;
}

export interface LeagueTimelineStage {
  id: string;
  name: string;
  shortLabel: string;
  dateLabel: string;
  dateRangeDetail: string;
  status: LeagueTimelineStatus;
  categoriesSummary: string;
  enrolledApprox: number;
  /** Torneio principal para CTAs de inscrição / detalhe */
  primaryTournamentId: string | null;
}

export interface LeagueRankingRow {
  rank: number;
  name: string;
  points: number;
  /** Variação de posição desde a última etapa (+ sobe, − desce) */
  deltaPositions: number;
  avatarLetter: string;
  genderScope: TournamentGenderCat;
  mode: 'pair' | 'individual';
}

export interface LeagueStatCard {
  id: string;
  label: string;
  value: number;
  suffix?: string;
}

export interface LeagueNextStageCard {
  stageName: string;
  dateLabel: string;
  location: string;
  city: string;
  categoriesLine: string;
  spotsLeft: number;
  spotsTotal: number;
  tournamentId: string;
  /** ISO 8601 — countdown de fim de inscrições */
  registrationEndsAt: string;
  urgent: boolean;
}

export interface LeagueFeedPost {
  id: string;
  athleteName: string;
  text: string;
  hashtag: string;
  likes: number;
  comments: number;
  mediaGradient: string;
}

export interface LeaguePodiumEntry {
  place: 1 | 2 | 3;
  name: string;
  subtitle: string;
}

export interface LeagueProgressionPreview {
  yourRank: number;
  yourPoints: number;
  pointsToTop10: number;
  topLabel: string;
}

export interface LeagueDetailBundle {
  hero: LeagueDetailHero;
  timeline: LeagueTimelineStage[];
  rankingPairs: LeagueRankingRow[];
  rankingIndividuals: LeagueRankingRow[];
  stats: LeagueStatCard[];
  nextStage: LeagueNextStageCard;
  feed: LeagueFeedPost[];
  lastStagePodium: LeaguePodiumEntry[];
  lastStageTitle: string;
  progression: LeagueProgressionPreview | null;
  regulationParagraphs: string[];
  athletesPreview: { id: string; name: string; handle: string; letter: string }[];
}
