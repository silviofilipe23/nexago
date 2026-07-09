/**
 * Elos ("sand rank") — escada de gamificação derivada 100% do XP.
 *
 * Porte 1:1 do catálogo em
 * nexago_app/lib/features/athlete/domain/sand_rank/*.dart
 * (sand_rank_catalog.dart, sand_rank_reward_catalog.dart).
 * Mantém os dois lados em paridade — qualquer mudança de degrau/recompensa
 * precisa ser aplicada aqui também.
 *
 * Regra de manutenção da curva: thresholds NUNCA sobem e degraus nunca são
 * removidos (ninguém pode ser rebaixado); só é permitido baixar thresholds
 * ou adicionar elos acima do topo atual.
 *
 * Não confundir com o rating técnico (Glicko, rating-engine.ts): o elo mede
 * engajamento, não habilidade.
 */

export interface SandRankStep {
  /** Índice absoluto na trilha (0..15) — fonte de verdade p/ comparações. */
  trackIndex: number;
  rankCode: string;
  /** Nome de exibição em PT-BR. */
  rankName: string;
  /** 3 | 2 | 1; 0 = elo sem divisão (Lenda). */
  division: number;
  /** XP cumulativo mínimo para alcançar o degrau. */
  minXp: number;
}

export const SAND_RANK_TRACK: SandRankStep[] = [
  {trackIndex: 0, rankCode: "INICIANTE", rankName: "Iniciante", division: 3, minXp: 0},
  {trackIndex: 1, rankCode: "INICIANTE", rankName: "Iniciante", division: 2, minXp: 100},
  {trackIndex: 2, rankCode: "INICIANTE", rankName: "Iniciante", division: 1, minXp: 250},
  {trackIndex: 3, rankCode: "COMPETIDOR", rankName: "Competidor", division: 3, minXp: 450},
  {trackIndex: 4, rankCode: "COMPETIDOR", rankName: "Competidor", division: 2, minXp: 700},
  {trackIndex: 5, rankCode: "COMPETIDOR", rankName: "Competidor", division: 1, minXp: 1000},
  {trackIndex: 6, rankCode: "DESAFIANTE", rankName: "Desafiante", division: 3, minXp: 1400},
  {trackIndex: 7, rankCode: "DESAFIANTE", rankName: "Desafiante", division: 2, minXp: 1900},
  {trackIndex: 8, rankCode: "DESAFIANTE", rankName: "Desafiante", division: 1, minXp: 2500},
  {trackIndex: 9, rankCode: "ELITE", rankName: "Elite", division: 3, minXp: 3300},
  {trackIndex: 10, rankCode: "ELITE", rankName: "Elite", division: 2, minXp: 4200},
  {trackIndex: 11, rankCode: "ELITE", rankName: "Elite", division: 1, minXp: 5300},
  {trackIndex: 12, rankCode: "MESTRE", rankName: "Mestre", division: 3, minXp: 6600},
  {trackIndex: 13, rankCode: "MESTRE", rankName: "Mestre", division: 2, minXp: 8200},
  {trackIndex: 14, rankCode: "MESTRE", rankName: "Mestre", division: 1, minXp: 10000},
  {trackIndex: 15, rankCode: "LENDA", rankName: "Lenda", division: 0, minXp: 12500},
];

export const SAND_RANK_TOP_TRACK_INDEX =
  SAND_RANK_TRACK[SAND_RANK_TRACK.length - 1].trackIndex;

export function sandRankStepFromXp(xp: number): SandRankStep {
  const safeXp = Number.isNaN(xp) ? 0 : Math.max(0, xp);
  let current = SAND_RANK_TRACK[0];
  for (const step of SAND_RANK_TRACK) {
    if (safeXp >= step.minXp) current = step;
    else break;
  }
  return current;
}

const DIVISION_ROMAN: Record<number, string> = {3: "III", 2: "II", 1: "I"};

export function sandRankLabel(step: SandRankStep): string {
  const roman = DIVISION_ROMAN[step.division];
  return roman ? `${step.rankName} ${roman}` : step.rankName;
}

// —— Recompensas ——

export type SandRankRewardType =
  | "avatarFrame"
  | "title"
  | "emblem"
  | "perk"
  | "partnerVoucher";

export interface SandRankReward {
  id: string;
  type: SandRankRewardType;
  trackIndex: number;
  title: string;
  description: string;
}

export const SAND_RANK_REWARD_CATALOG: SandRankReward[] = [
  // —— Iniciante ——
  {
    id: "EMBLEM_INICIANTE",
    type: "emblem",
    trackIndex: 0,
    title: "Emblema Iniciante",
    description: "Seu primeiro emblema de elo.",
  },
  {
    id: "FRAME_INICIANTE",
    type: "avatarFrame",
    trackIndex: 0,
    title: "Moldura Iniciante",
    description: "Moldura de avatar do elo Iniciante.",
  },
  {
    id: "TITLE_INICIANTE",
    type: "title",
    trackIndex: 1,
    title: "Pé na Areia",
    description: "Título exclusivo do Iniciante II.",
  },
  {
    id: "FRAME_INICIANTE_GOLD",
    type: "avatarFrame",
    trackIndex: 2,
    title: "Moldura Iniciante dourada",
    description: "Versão dourada da moldura Iniciante.",
  },
  // —— Competidor ——
  {
    id: "EMBLEM_COMPETIDOR",
    type: "emblem",
    trackIndex: 3,
    title: "Emblema Competidor",
    description: "Emblema do elo Competidor.",
  },
  {
    id: "FRAME_COMPETIDOR",
    type: "avatarFrame",
    trackIndex: 3,
    title: "Moldura Competidor",
    description: "Moldura de avatar do elo Competidor.",
  },
  {
    id: "TITLE_COMPETIDOR",
    type: "title",
    trackIndex: 4,
    title: "Ritmo de Jogo",
    description: "Título exclusivo do Competidor II.",
  },
  {
    id: "FRAME_COMPETIDOR_GOLD",
    type: "avatarFrame",
    trackIndex: 5,
    title: "Moldura Competidor dourada",
    description: "Versão dourada da moldura Competidor.",
  },
  // —— Desafiante ——
  {
    id: "EMBLEM_DESAFIANTE",
    type: "emblem",
    trackIndex: 6,
    title: "Emblema Desafiante",
    description: "Emblema do elo Desafiante.",
  },
  {
    id: "FRAME_DESAFIANTE",
    type: "avatarFrame",
    trackIndex: 6,
    title: "Moldura Desafiante",
    description: "Moldura de avatar do elo Desafiante.",
  },
  {
    id: "PERK_STREAK_SHIELD_1",
    type: "perk",
    trackIndex: 6,
    title: "Protetor de Sequência",
    description: "1 escudo por mês: um dia perdido não zera sua sequência.",
  },
  {
    id: "TITLE_DESAFIANTE",
    type: "title",
    trackIndex: 7,
    title: "Dono da Quadra",
    description: "Título exclusivo do Desafiante II.",
  },
  {
    id: "FRAME_DESAFIANTE_GOLD",
    type: "avatarFrame",
    trackIndex: 8,
    title: "Moldura Desafiante dourada",
    description: "Versão dourada da moldura Desafiante.",
  },
  // —— Elite ——
  {
    id: "EMBLEM_ELITE",
    type: "emblem",
    trackIndex: 9,
    title: "Emblema Elite",
    description: "Emblema do elo Elite.",
  },
  {
    id: "FRAME_ELITE",
    type: "avatarFrame",
    trackIndex: 9,
    title: "Moldura Elite",
    description: "Moldura de avatar do elo Elite.",
  },
  {
    id: "TITLE_ELITE",
    type: "title",
    trackIndex: 10,
    title: "Elite da Areia",
    description: "Título exclusivo do Elite II.",
  },
  {
    id: "FRAME_ELITE_GOLD",
    type: "avatarFrame",
    trackIndex: 11,
    title: "Moldura Elite dourada",
    description: "Versão dourada da moldura Elite.",
  },
  // —— Mestre ——
  {
    id: "EMBLEM_MESTRE",
    type: "emblem",
    trackIndex: 12,
    title: "Emblema Mestre",
    description: "Emblema do elo Mestre.",
  },
  {
    id: "FRAME_MESTRE",
    type: "avatarFrame",
    trackIndex: 12,
    title: "Moldura Mestre",
    description: "Moldura de avatar do elo Mestre.",
  },
  {
    id: "PERK_STREAK_SHIELD_2",
    type: "perk",
    trackIndex: 12,
    title: "Protetor de Sequência+",
    description: "2 escudos por mês para proteger sua sequência.",
  },
  {
    id: "TITLE_MESTRE",
    type: "title",
    trackIndex: 13,
    title: "Imparável",
    description: "Título exclusivo do Mestre II.",
  },
  {
    id: "FRAME_MESTRE_GOLD",
    type: "avatarFrame",
    trackIndex: 14,
    title: "Moldura Mestre dourada",
    description: "Versão dourada da moldura Mestre.",
  },
  // —— Lenda ——
  {
    id: "EMBLEM_LENDA",
    type: "emblem",
    trackIndex: 15,
    title: "Emblema Lenda",
    description: "O emblema lendário — o topo da trilha.",
  },
  {
    id: "FRAME_LENDA",
    type: "avatarFrame",
    trackIndex: 15,
    title: "Moldura Lenda",
    description: "Moldura dourada animada, exclusiva das Lendas.",
  },
  {
    id: "TITLE_LENDA",
    type: "title",
    trackIndex: 15,
    title: "Lenda",
    description: "O título máximo do NexaGO.",
  },
  {
    id: "VOUCHER_LENDA",
    type: "partnerVoucher",
    trackIndex: 15,
    title: "Recompensa de parceiro",
    description: "Benefício exclusivo de parceiros para Lendas. Em breve.",
  },
];

export function rewardsForTrackIndex(trackIndex: number): SandRankReward[] {
  return SAND_RANK_REWARD_CATALOG.filter((r) => r.trackIndex === trackIndex);
}

export function rankPromotionEventId(trackIndex: number): string {
  return `rank_track_${trackIndex}`;
}

/** Trilha de escudos mensais do perk Protetor de Sequência. */
export const SHIELD_TRACK_INDEX_ONE_PER_MONTH = 6; // Desafiante III
export const SHIELD_TRACK_INDEX_TWO_PER_MONTH = 12; // Mestre III

export function shieldsPerMonthForTrackIndex(
  highestTrackIndex: number,
): number {
  if (highestTrackIndex >= SHIELD_TRACK_INDEX_TWO_PER_MONTH) return 2;
  if (highestTrackIndex >= SHIELD_TRACK_INDEX_ONE_PER_MONTH) return 1;
  return 0;
}
