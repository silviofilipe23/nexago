import { defaultSportChipFromProfile } from '@nexago/arena-discovery';
import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { deriveTeamGender, normalizeRankingGender, teamFormatOf, type RankingParticipant } from './ranking-positions';
import { chunkedByIds, teamMemberIds } from './teams-repository';

/** Ranking geral do nexaGO (`artifacts/{projectId}/public/data/athleteRankings` e
 *  `.../teamRankings`) como a tela Ranking do app/portal do atleta monta — só o que a posição
 *  precisa: pontos, esporte e gênero de cada participante, e o formato dos times. Porte de
 *  `loadRanking` (`projects/athlete/src/app/ranking/athlete-ranking.component.ts`).
 *
 *  Lê as coleções INTEIRAS (é assim que o app numera), então quem chama carrega uma vez por
 *  sessão e só quando precisa. */

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export interface RankingTotals {
  points: number;
  tournaments: number;
}

export function rankingTotalsFromDoc(data: Record<string, unknown>): RankingTotals {
  return {
    points: typeof data['totalPoints'] === 'number' ? data['totalPoints'] : 0,
    tournaments: typeof data['tournamentsCount'] === 'number' ? data['tournamentsCount'] : 0,
  };
}

export interface RankingProfile {
  sport: string;
  gender: string | null;
}

/** Esporte e gênero como o perfil público do atleta resolve (`athletePublicProfileFromDoc`). */
export function rankingProfileFromDoc(data: Record<string, unknown>): RankingProfile {
  const sport = optionalStr(data['sport']);
  const primary = optionalStr(record(data['sportOnboarding'])['primarySportId']) ?? optionalStr(data['primarySport']) ?? sport;
  return { sport: defaultSportChipFromProfile({ primarySport: primary, sport }), gender: optionalStr(data['gender']) };
}

export interface RankingTeamDoc {
  player1Id: string;
  player2Id: string;
  memberUids: string[];
  gender: string | null;
  teamSize: number | null;
  isLookingForPartner: boolean;
}

export function rankingTeamFromDoc(data: Record<string, unknown>): RankingTeamDoc {
  const members = Array.isArray(data['memberUids']) ? data['memberUids'].map(optionalStr).filter((u): u is string => !!u) : [];
  return {
    player1Id: optionalStr(data['player1Id']) ?? '',
    player2Id: optionalStr(data['player2Id']) ?? '',
    memberUids: members,
    gender: optionalStr(data['gender']),
    teamSize: typeof data['teamSize'] === 'number' ? data['teamSize'] : null,
    isLookingForPartner: data['isLookingForPartner'] === true,
  };
}

/** Sem perfil (atleta excluído — o ranking sobrevive à exclusão) cai no esporte padrão do app. */
export function athleteParticipantOf(id: string, totals: RankingTotals, profile: RankingProfile | undefined): RankingParticipant {
  return {
    id,
    ...totals,
    sport: profile?.sport ?? 'beachVolleyball',
    gender: normalizeRankingGender(profile?.gender),
    format: null,
  };
}

/** Esporte do 1º integrante com perfil; dupla incompleta fica no padrão, como no app. */
export function teamParticipantOf(
  id: string,
  totals: RankingTotals,
  team: RankingTeamDoc,
  profiles: ReadonlyMap<string, RankingProfile>,
): RankingParticipant {
  const members = teamMemberIds(team);
  const sport = team.isLookingForPartner
    ? 'beachVolleyball'
    : (members.map((uid) => profiles.get(uid)?.sport).find((s): s is string => !!s) ?? 'beachVolleyball');
  return {
    id,
    ...totals,
    sport,
    gender: deriveTeamGender(team.gender, members.map((uid) => profiles.get(uid)?.gender ?? null)),
    format: teamFormatOf(team.teamSize, members.length),
  };
}

export interface RankingParticipants {
  athletes: RankingParticipant[];
  teams: RankingParticipant[];
}

export async function fetchRankingParticipants(db: Firestore, projectId: string): Promise<RankingParticipants> {
  const base = ['artifacts', projectId, 'public', 'data'] as const;
  const [athleteSnap, teamSnap] = await Promise.all([
    getDocs(collection(db, ...base, 'athleteRankings')),
    getDocs(collection(db, ...base, 'teamRankings')),
  ]);
  const athleteRows = athleteSnap.docs.map((d) => ({ id: d.id, totals: rankingTotalsFromDoc(d.data()) }));
  const teamRows = teamSnap.docs.map((d) => ({ id: d.id, totals: rankingTotalsFromDoc(d.data()) }));
  const teams = await chunkedByIds(db, [...base, 'teams'], teamRows.map((r) => r.id), rankingTeamFromDoc);
  const memberUids = [...teams.values()].flatMap((t) => teamMemberIds(t));
  const profiles = await chunkedByIds(db, ['public_profiles'], [...athleteRows.map((r) => r.id), ...memberUids], rankingProfileFromDoc);
  return {
    athletes: athleteRows.map((r) => athleteParticipantOf(r.id, r.totals, profiles.get(r.id))),
    teams: teamRows.filter((r) => teams.has(r.id)).map((r) => teamParticipantOf(r.id, r.totals, teams.get(r.id)!, profiles)),
  };
}
