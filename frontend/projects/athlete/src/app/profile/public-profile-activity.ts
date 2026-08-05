import type { Firestore } from 'firebase/firestore';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamRankingGeneral } from '../data/rankings-repository';
import {
  completedMatchSetWins,
  fetchMatchesForTeam,
  fetchTeamsByIds,
  fetchTeamsForAthlete,
  matchIsCompleted,
  roundFullLabel,
  type ArenaMatch,
  type ArenaTeam,
} from '../data/teams-repository';
import { fetchTournamentNamesByIds } from '../data/tournaments-repository';
import { initialsOf } from './profile-format';

/**
 * Atividade pública de um atleta — duplas e histórico de partidas do perfil público.
 *
 * Tudo vem de coleções com `allow read: if true` (`artifacts/{projectId}/public/data/teams`,
 * `.../matches`, `.../teamRankings`), então funciona pra QUALQUER atleta, não só pro dono do
 * perfil. É o oposto de `AthleteGamificationService` (XP/conquistas), que lê
 * `users/{uid}/gamification/**` e por regra só o próprio dono consegue ler.
 */

export interface PublicProfileTeamRow {
  /** id de `teams/{teamId}` — também a rota `/equipes/:teamId`. */
  id: string;
  teamName: string;
  detailLabel: string;
  initials: readonly [string, string];
}

export interface PublicProfileMatchRow {
  id: string;
  date: Date;
  result: 'W' | 'L';
  opponent: string;
  contextLabel: string;
  /** Sets na perspectiva do atleta ("2–0"), ou "—" quando a partida não tem placar gravado. */
  score: string;
  dateLabel: string;
  tournamentId: string;
}

export interface PublicProfileActivity {
  teams: readonly PublicProfileTeamRow[];
  /** Partidas concluídas, mais recentes primeiro. */
  matches: readonly PublicProfileMatchRow[];
  totalGames: number;
  wins: number;
  /** Vitórias seguidas contando da partida mais recente pra trás. */
  winStreak: number;
}

export const EMPTY_PUBLIC_PROFILE_ACTIVITY: PublicProfileActivity = {
  teams: [],
  matches: [],
  totalGames: 0,
  wins: 0,
  winStreak: 0,
};

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function teamDisplayName(
  team: Pick<ArenaTeam, 'teamName' | 'player1Id' | 'player2Id'>,
  p1: AthletePublicProfile | undefined,
  p2: AthletePublicProfile | undefined,
): string {
  if (team.teamName) return team.teamName;
  const a = p1?.displayName?.split(' ')[0] ?? 'Atleta';
  const b = p2?.displayName?.split(' ')[0] ?? 'Atleta';
  return `${a} / ${b}`;
}

/** Resolve o nome de uma dupla pelo id, igual ao `duoNameOf` do `TournamentLiveStore`.
 *
 *  O `teamDescription` do doc da partida NÃO serve como nome: nas partidas geradas pela planta
 *  ele guarda a origem da vaga ("2º Grupo C", "Vencedor J5"). Só entra como último recurso,
 *  quando o time nem existe mais em `teams`. */
export function duoNameOf(
  teamId: string,
  teams: ReadonlyMap<string, ArenaTeam>,
  profiles: ReadonlyMap<string, AthletePublicProfile>,
  fallback: string | null,
): string {
  const team = teamId ? teams.get(teamId) : undefined;
  if (!team) return fallback ?? 'Adversário';
  if (team.teamName) return team.teamName;
  const p1 = profiles.get(team.player1Id)?.displayName?.trim().split(/\s+/)[0];
  const p2 = profiles.get(team.player2Id)?.displayName?.trim().split(/\s+/)[0];
  if (!p1 && !p2) return fallback ?? 'Adversário';
  // Dupla ainda procurando parceiro grava o mesmo uid nos dois slots.
  if (team.player1Id === team.player2Id) return p1 ?? fallback ?? 'Adversário';
  return `${p1 ?? 'Atleta'} / ${p2 ?? 'Atleta'}`;
}

/** "#3 no ranking de duplas · 12 vitórias" — cai pro saldo quando a dupla ainda não pontuou. */
export function teamDetailLabel(rankPosition: number | null, wins: number, losses: number): string {
  const winsLabel = plural(wins, 'vitória', 'vitórias');
  if (rankPosition != null) return `#${rankPosition} no ranking de duplas · ${winsLabel}`;
  if (wins + losses === 0) return 'Sem partidas registradas ainda';
  return `${winsLabel} · ${plural(losses, 'derrota', 'derrotas')}`;
}

/** Placar em sets já na perspectiva do atleta ("2–0" numa vitória, "1–2" numa derrota). */
export function matchScoreLabel(match: ArenaMatch, athleteIsTeamA: boolean): string {
  const [setsA, setsB] = completedMatchSetWins(match);
  if (setsA + setsB === 0) return '—';
  const [mine, theirs] = athleteIsTeamA ? [setsA, setsB] : [setsB, setsA];
  return `${mine}–${theirs}`;
}

/** Linha do histórico. Devolve null quando a partida não é do atleta ou não tem data/vencedor. */
export function buildMatchRow(
  match: ArenaMatch,
  athleteTeamIds: ReadonlySet<string>,
  tournamentNames: ReadonlyMap<string, string>,
  resolveOpponentName: (teamId: string, fallback: string | null) => string,
): PublicProfileMatchRow | null {
  const athleteIsTeamA = athleteTeamIds.has(match.teamAId);
  const athleteTeamId = athleteIsTeamA ? match.teamAId : athleteTeamIds.has(match.teamBId) ? match.teamBId : null;
  if (!athleteTeamId || !match.winnerId) return null;
  const date = match.matchEndedAt ?? match.scheduleTime;
  if (!date) return null;

  const opponent = athleteIsTeamA
    ? resolveOpponentName(match.teamBId, match.teamBDescription)
    : resolveOpponentName(match.teamAId, match.teamADescription);
  const tournamentName = tournamentNames.get(match.tournamentId);
  return {
    id: match.id,
    date,
    result: match.winnerId === athleteTeamId ? 'W' : 'L',
    opponent,
    contextLabel: [tournamentName, roundFullLabel(match.matchType)].filter((part) => part).join(' · '),
    score: matchScoreLabel(match, athleteIsTeamA),
    dateLabel: DATE_FMT.format(date),
    tournamentId: match.tournamentId,
  };
}

export function winStreakOf(matchesDesc: readonly PublicProfileMatchRow[]): number {
  let streak = 0;
  for (const m of matchesDesc) {
    if (m.result !== 'W') break;
    streak++;
  }
  return streak;
}

/** Recorte "últimos N dias" usado pelo card de histórico (o botão "Ver tudo" mostra o resto). */
export function matchesWithinDays(
  matches: readonly PublicProfileMatchRow[],
  days: number,
  now = new Date(),
): PublicProfileMatchRow[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return matches.filter((m) => m.date.getTime() >= cutoff);
}

/** Duplas + partidas de um atleta a partir das coleções públicas. Nunca lança: qualquer falha
 *  de leitura vira atividade vazia (o perfil continua renderizando o resto). */
export async function loadPublicProfileActivity(db: Firestore, projectId: string, uid: string): Promise<PublicProfileActivity> {
  if (!projectId || !uid) return EMPTY_PUBLIC_PROFILE_ACTIVITY;

  try {
    const teams = await fetchTeamsForAthlete(db, projectId, uid);
    if (teams.length === 0) return EMPTY_PUBLIC_PROFILE_ACTIVITY;

    const [matchesByTeam, teamRanking] = await Promise.all([
      Promise.all(teams.map((team) => fetchMatchesForTeam(db, projectId, team.id))),
      fetchTeamRankingGeneral(db, projectId),
    ]);

    const rankByTeamId = new Map(teamRanking.map((row, index) => [row.id, index + 1]));
    const teamIds = new Set(teams.map((team) => team.id));

    // Um mesmo jogo aparece nas duas queries (teamA/teamB) quando as duas duplas são do atleta.
    const completedById = new Map<string, ArenaMatch>();
    for (const match of matchesByTeam.flat()) {
      if (matchIsCompleted(match)) completedById.set(match.id, match);
    }
    const completed = [...completedById.values()];

    // As duplas adversárias precisam ser resolvidas por id: o `teamDescription` da partida é a
    // origem da vaga na planta ("2º Grupo C"), não o nome de quem jogou.
    const opponentIds = [...new Set(completed.flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id && !teamIds.has(id)))];
    const [opponentTeams, tournamentNames] = await Promise.all([
      fetchTeamsByIds(db, projectId, opponentIds),
      fetchTournamentNamesByIds(db, completed.map((m) => m.tournamentId)),
    ]);

    const allTeams = new Map<string, ArenaTeam>([...opponentTeams, ...teams.map((team) => [team.id, team] as const)]);
    const profiles = await fetchPublicProfilesByIds(db, [...allTeams.values()].flatMap((team) => [team.player1Id, team.player2Id]));

    const matches = completed
      .map((match) => buildMatchRow(match, teamIds, tournamentNames, (id, fallback) => duoNameOf(id, allTeams, profiles, fallback)))
      .filter((row): row is PublicProfileMatchRow => row != null)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const teamRows: PublicProfileTeamRow[] = teams.map((team) => {
      const teamMatches = completed.filter((m) => m.teamAId === team.id || m.teamBId === team.id);
      const wins = teamMatches.filter((m) => m.winnerId === team.id).length;
      const p1 = profiles.get(team.player1Id);
      const p2 = profiles.get(team.player2Id);
      return {
        id: team.id,
        teamName: teamDisplayName(team, p1, p2),
        detailLabel: teamDetailLabel(rankByTeamId.get(team.id) ?? null, wins, teamMatches.length - wins),
        initials: [initialsOf(p1?.displayName ?? 'Atleta'), initialsOf(p2?.displayName ?? 'Atleta')] as const,
      };
    });

    return {
      teams: teamRows,
      matches,
      totalGames: matches.length,
      wins: matches.filter((m) => m.result === 'W').length,
      winStreak: winStreakOf(matches),
    };
  } catch {
    return EMPTY_PUBLIC_PROFILE_ACTIVITY;
  }
}
