import type { ArenaSportChip } from '@nexago/arena-discovery';
import type { RankingLevel } from '../ranking/athlete-ranking.models';

export interface AthleteDirectoryEntry {
  id: string;
  handle: string;
  nickname: string | null;
  fullName: string;
  city: string;
  sport: ArenaSportChip;
  level: RankingLevel | null;
  /** `null` = atleta ainda sem pontuação em torneios (não aparece no ranking geral). */
  rankingPosition: number | null;
  /** Foto pública (`profilePhotoUrl`/`avatarUrl`/`photoURL`); null = iniciais. */
  avatarUrl: string | null;
}
