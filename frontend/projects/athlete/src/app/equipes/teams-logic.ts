import type { TeamGenderFilter } from './athlete-equipes.models';

// Espelha ranking-logic.ts (feature Ranking) — cópia local deliberada, não importada de lá,
// pra cada branch de feature do portal do atleta ficar buildável/mergeável de forma
// independente enquanto as duas ainda não estão em main.

type Gender = 'male' | 'female' | 'mixed';

const LEVEL_RANK_LABEL: Record<number, string> = {
  0: 'Iniciante 1',
  1: 'Iniciante 2',
  2: 'Intermediário 1',
  3: 'Intermediário 2',
  5: 'Open',
};

export const LEVEL_RANK_OPTIONS: readonly number[] = [0, 1, 2, 3, 5];

export function levelLabelForRank(rank: number): string {
  return LEVEL_RANK_LABEL[rank] ?? 'Open';
}

export function levelRankFromLabel(raw: string | null | undefined): number | null {
  const normalized = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i');
  switch (normalized) {
    case 'iniciante':
    case 'basico':
    case 'iniciante 1':
    case 'iniciante_1':
      return 0;
    case 'iniciante 2':
    case 'iniciante_2':
      return 1;
    case 'intermediario':
    case 'intermediario 1':
    case 'intermediario_1':
      return 2;
    case 'intermediario 2':
    case 'intermediario_2':
      return 3;
    case 'open':
    case 'livre':
      return 5;
    default:
      return null;
  }
}

function normalizeGenderCommon(raw: string | null | undefined): Gender | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'masculino' || v === 'male' || v === 'm') return 'male';
  if (v === 'feminino' || v === 'female' || v === 'f') return 'female';
  return null;
}

export function normalizeAthleteGender(raw: string | null | undefined): Gender | null {
  return normalizeGenderCommon(raw);
}

export function normalizeTeamGender(raw: string | null | undefined): Gender | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.includes('mist')) return 'mixed';
  return normalizeGenderCommon(raw);
}

export function matchesGenderFilter(filter: TeamGenderFilter, entityGender: Gender | null): boolean {
  if (filter === 'all') return true;
  return entityGender === filter;
}

export function displayNameFrom(fullName: string | null | undefined, entityId: string): string {
  const name = fullName?.trim();
  if (name) return name;
  return entityId.length >= 6 ? `Atleta ${entityId.slice(0, 6)}` : 'Atleta';
}

export function initialsFrom(fullName: string | null | undefined, entityId: string): string {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    const initials = (first + last).toUpperCase();
    if (initials) return initials;
  }
  return entityId.length >= 2 ? entityId.slice(0, 2).toUpperCase() : 'AT';
}

export function teamDisplayName(
  teamName: string | null | undefined,
  player1Name: string | null | undefined,
  player2Name: string | null | undefined,
): string {
  const name = teamName?.trim();
  if (name) return name;
  const p1 = player1Name?.trim().split(/\s+/)[0];
  const p2 = player2Name?.trim().split(/\s+/)[0];
  if (p1 && p2) return `${p1} & ${p2}`;
  if (p1) return p1;
  if (p2) return p2;
  return 'Dupla';
}

export function teamInitials(
  player1Name: string | null | undefined,
  player2Name: string | null | undefined,
  teamId: string,
): string {
  const p1 = player1Name?.trim()[0];
  const p2 = player2Name?.trim()[0];
  if (p1 && p2) return (p1 + p2).toUpperCase();
  if (p1) return initialsFrom(player1Name, teamId);
  if (p2) return initialsFrom(player2Name, teamId);
  return initialsFrom(null, teamId);
}

export function filterBySearch<T extends { displayName: string }>(rows: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) => r.displayName.toLowerCase().includes(q));
}

// --- Específico de partidas/recorde de uma dupla ---

export interface MatchRaw {
  matchId: string;
  teamAId: string;
  teamBId: string;
  winnerId: string | null;
  resultA: string;
  resultB: string;
  status: string;
  endedAtMs: number | null;
}

function isDecidedMatch(m: MatchRaw): boolean {
  return m.status === 'completed' && m.winnerId != null && m.winnerId.length > 0;
}

/** Ganhas/perdidas contando só partidas decididas (`completed` + `winnerId` preenchido) —
 *  partidas em andamento/futuras não contam pro recorde. */
export function computeRecord(matches: readonly MatchRaw[], teamId: string): { wins: number; losses: number } {
  const decided = matches.filter(isDecidedMatch);
  return {
    wins: decided.filter((m) => m.winnerId === teamId).length,
    losses: decided.filter((m) => m.winnerId !== teamId).length,
  };
}

function formatMatchDate(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function buildMatchRow(match: MatchRaw, teamId: string, opponentName: string): { matchId: string; opponentName: string; result: 'win' | 'loss'; scoreLabel: string; dateLabel: string } {
  const isTeamA = match.teamAId === teamId;
  const scoreLabel = isTeamA ? `${match.resultA} x ${match.resultB}` : `${match.resultB} x ${match.resultA}`;
  return {
    matchId: match.matchId,
    opponentName,
    result: match.winnerId === teamId ? 'win' : 'loss',
    scoreLabel,
    dateLabel: match.endedAtMs != null ? formatMatchDate(match.endedAtMs) : '',
  };
}
