import type { RankingGender, RankingGenderFilter, RankingLevelFilter, RankingRow } from './athlete-ranking.models';

/** Espelha `AthleteProfileOptions.levels`/`volleyballLevels` — mesma escada pros dois. */
export const LEVEL_RANK_OPTIONS: readonly number[] = [0, 1, 2, 3, 5];

const LEVEL_RANK_LABEL: Record<number, string> = {
  0: 'Iniciante 1',
  1: 'Iniciante 2',
  2: 'Intermediário 1',
  3: 'Intermediário 2',
  5: 'Open',
};

export function levelLabelForRank(rank: number): string {
  return LEVEL_RANK_LABEL[rank] ?? 'Open';
}

/** Espelha `AthleteProfileOptions.levelRank` (`functions/src/category-level-eligibility.ts`
 *  `LEVEL_RANK`) — labels e códigos Firestore, com apelidos legados. */
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

/** Soma os `n` melhores valores (pontuação "melhores 5 do ano") — puro. */
export function sumBestNPoints(points: readonly number[], n = 5): number {
  return [...points]
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((sum, p) => sum + p, 0);
}

export function sortByPointsDesc<T extends { points: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points);
}

/** Reatribui rank 1..N pela posição no array — chamar sempre depois de ordenar/filtrar. */
export function assignRanks<T>(rows: readonly T[]): (T & { rank: number })[] {
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export function buildSubtitle(levelLabel: string | null, tournamentsCount: number): string {
  const count = `${tournamentsCount} torneio${tournamentsCount === 1 ? '' : 's'}`;
  return levelLabel ? `${levelLabel} · ${count}` : count;
}

function normalizeGenderCommon(raw: string | null | undefined): RankingGender | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'masculino' || v === 'male' || v === 'm') return 'male';
  if (v === 'feminino' || v === 'female' || v === 'f') return 'female';
  return null;
}

/** Gênero de um atleta individual — nunca "mixed" (isso só existe pra duplas). */
export function normalizeAthleteGender(raw: string | null | undefined): RankingGender | null {
  return normalizeGenderCommon(raw);
}

/** Gênero de uma dupla (`teams.gender`) — pode ser "misto". */
export function normalizeTeamGender(raw: string | null | undefined): RankingGender | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.includes('mist')) return 'mixed';
  return normalizeGenderCommon(raw);
}

export function matchesGenderFilter(filter: RankingGenderFilter, entityGender: RankingGender | null): boolean {
  if (filter === 'all') return true;
  return entityGender === filter;
}

/** Espelha `rankingDisplayName` — nome real, ou "Atleta {6 primeiros da uid}". */
export function displayNameFrom(fullName: string | null | undefined, entityId: string): string {
  const name = fullName?.trim();
  if (name) return name;
  return entityId.length >= 6 ? `Atleta ${entityId.slice(0, 6)}` : 'Atleta';
}

/** Espelha `rankingInitials` — iniciais do nome real, ou 2 primeiros chars da uid. */
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

/** Nome de exibição da dupla: nome do time, senão "Primeiro & Primeiro", senão um só, senão "Dupla". */
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

/** Uma inicial por jogador; sem nomes, cai pros 2 primeiros chars do id do time. */
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

export function podiumRows(rows: readonly RankingRow[]): RankingRow[] {
  return rows.filter((r) => r.rank <= 3);
}

export function restRows(rows: readonly RankingRow[]): RankingRow[] {
  return rows.filter((r) => r.rank > 3);
}

/** Ano atual + `pastYears` anos anteriores — espelha `rankingYearOptions` (Flutter). */
export function yearOptions(currentYear: number, pastYears = 2): number[] {
  return Array.from({ length: pastYears + 1 }, (_, i) => currentYear - i);
}

/** Pontuação bruta de uma linha (atleta ou dupla) antes de virar `RankingRow`. */
export interface RawPointsRow {
  entityId: string;
  points: number;
  tournamentsCount: number;
}

/** Fatia de `public_profiles/{uid}` usada só pro ranking — nome/gênero/nível/avatar. */
export interface RankingProfileLite {
  fullName: string | null;
  gender: string | null;
  primarySportId: string | null;
  levelsBySport: Readonly<Record<string, string>> | null;
  avatarUrl: string | null;
}

/** Fatia de `teams/{teamId}` usada só pro ranking. */
export interface RankingTeamLite {
  teamName: string | null;
  player1Id: string | null;
  player2Id: string | null;
  gender: string | null;
}

function athleteLevelRank(profile: RankingProfileLite | undefined): number | null {
  const sportId = profile?.primarySportId;
  if (!sportId) return null;
  return levelRankFromLabel(profile?.levelsBySport?.[sportId] ?? null);
}

/** Monta o ranking de atletas: ordena por pontos, filtra por gênero/nível (reatribuindo rank
 *  1..N no resultado final) e enriquece com o perfil público. Pura — recebe os dados já
 *  buscados do Firestore. */
export function buildAthleteRankingRows(
  raw: readonly RawPointsRow[],
  profiles: ReadonlyMap<string, RankingProfileLite>,
  genderFilter: RankingGenderFilter,
  levelFilter: RankingLevelFilter,
  currentUid: string | null,
): RankingRow[] {
  const filtered = sortByPointsDesc(raw).filter((row) => {
    const profile = profiles.get(row.entityId);
    if (!matchesGenderFilter(genderFilter, normalizeAthleteGender(profile?.gender))) return false;
    if (levelFilter != null && athleteLevelRank(profile) !== levelFilter) return false;
    return true;
  });

  return assignRanks(filtered).map((row) => {
    const profile = profiles.get(row.entityId);
    const levelRank = athleteLevelRank(profile);
    return {
      rank: row.rank,
      entityId: row.entityId,
      displayName: displayNameFrom(profile?.fullName, row.entityId),
      subtitle: buildSubtitle(levelRank != null ? levelLabelForRank(levelRank) : null, row.tournamentsCount),
      points: row.points,
      tournamentsCount: row.tournamentsCount,
      initials: initialsFrom(profile?.fullName, row.entityId),
      avatarUrl: profile?.avatarUrl ?? null,
      isCurrentUser: currentUid != null && row.entityId === currentUid,
    };
  });
}

/** Mesma ideia de `buildAthleteRankingRows`, pra duplas: nível da dupla = maior entre os dois
 *  jogadores (regra do anti-sandbagging — "vale o integrante mais forte"). */
export function buildTeamRankingRows(
  raw: readonly RawPointsRow[],
  teams: ReadonlyMap<string, RankingTeamLite>,
  profiles: ReadonlyMap<string, RankingProfileLite>,
  genderFilter: RankingGenderFilter,
  levelFilter: RankingLevelFilter,
  currentUid: string | null,
): RankingRow[] {
  const teamLevelRank = (team: RankingTeamLite | undefined): number | null => {
    const r1 = team?.player1Id ? athleteLevelRank(profiles.get(team.player1Id)) : null;
    const r2 = team?.player2Id ? athleteLevelRank(profiles.get(team.player2Id)) : null;
    if (r1 == null) return r2;
    if (r2 == null) return r1;
    return Math.max(r1, r2);
  };

  const filtered = sortByPointsDesc(raw).filter((row) => {
    const team = teams.get(row.entityId);
    if (!matchesGenderFilter(genderFilter, normalizeTeamGender(team?.gender))) return false;
    if (levelFilter != null && teamLevelRank(team) !== levelFilter) return false;
    return true;
  });

  return assignRanks(filtered).map((row) => {
    const team = teams.get(row.entityId);
    const p1 = team?.player1Id ? profiles.get(team.player1Id) : undefined;
    const p2 = team?.player2Id ? profiles.get(team.player2Id) : undefined;
    const levelRank = teamLevelRank(team);
    const isCurrentUser = currentUid != null && (team?.player1Id === currentUid || team?.player2Id === currentUid);
    return {
      rank: row.rank,
      entityId: row.entityId,
      displayName: teamDisplayName(team?.teamName, p1?.fullName, p2?.fullName),
      subtitle: buildSubtitle(levelRank != null ? levelLabelForRank(levelRank) : null, row.tournamentsCount),
      points: row.points,
      tournamentsCount: row.tournamentsCount,
      initials: teamInitials(p1?.fullName, p2?.fullName, row.entityId),
      avatarUrl: null,
      isCurrentUser,
    };
  });
}
