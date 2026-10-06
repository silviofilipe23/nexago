import { defaultSportChipFromProfile } from '@nexago/arena-discovery';
import { tournamentSportToLevelSportCode } from '@nexago/levels';
import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { deriveTeamGender, normalizeRankingGender, teamFormatOf, type RankingGender, type RankingParticipant } from './ranking-positions';
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

/** Linha do doc por esporte (`{id}_{CODE}`, multiesporte fase 3a): o dono vem do CAMPO. */
export function bySportRankingRowOf(
  docId: string,
  data: Record<string, unknown>,
  idField: 'athleteId' | 'teamId',
  sportCode: string,
): { id: string; totals: RankingTotals } {
  const suffix = `_${sportCode}`;
  const id = optionalStr(data[idField]) ?? (docId.endsWith(suffix) ? docId.slice(0, -suffix.length) : docId);
  return { id, totals: rankingTotalsFromDoc(data) };
}

/** Ranking de UM esporte: o dado já é do esporte, então o esporte do perfil não recorta —
 *  todo participante fica com o código do esporte e `rankingEntryOf` compara só gênero/formato. */
export function inSport(participants: readonly RankingParticipant[], sportCode: string): RankingParticipant[] {
  return participants.map((p) => ({ ...p, sport: sportCode }));
}

/** Esporte do ranking do card: código de perfil do torneio; `null` = esporte não reconhecido
 *  (total somado, como antes); `undefined` = torneio ainda não carregado. */
export function rankingSportOf(tournament: { sportId: string | null } | null): string | null | undefined {
  if (!tournament) return undefined;
  return tournamentSportToLevelSportCode(tournament.sportId);
}

export interface RankingParticipants {
  athletes: RankingParticipant[];
  teams: RankingParticipant[];
}

/** `sportCode` (código de perfil) lê `athleteRankingsBySport`/`teamRankingsBySport` daquele
 *  esporte; `null` lê o ranking somado legado, como antes da fase 3b1. */
export async function fetchRankingParticipants(db: Firestore, projectId: string, sportCode: string | null): Promise<RankingParticipants> {
  const base = ['artifacts', projectId, 'public', 'data'] as const;
  let athleteRows: { id: string; totals: RankingTotals }[];
  let teamRows: { id: string; totals: RankingTotals }[];
  if (sportCode) {
    const [athleteSnap, teamSnap] = await Promise.all([
      getDocs(query(collection(db, ...base, 'athleteRankingsBySport'), where('sport', '==', sportCode))),
      getDocs(query(collection(db, ...base, 'teamRankingsBySport'), where('sport', '==', sportCode))),
    ]);
    athleteRows = athleteSnap.docs.map((d) => bySportRankingRowOf(d.id, d.data(), 'athleteId', sportCode));
    teamRows = teamSnap.docs.map((d) => bySportRankingRowOf(d.id, d.data(), 'teamId', sportCode));
  } else {
    const [athleteSnap, teamSnap] = await Promise.all([
      getDocs(collection(db, ...base, 'athleteRankings')),
      getDocs(collection(db, ...base, 'teamRankings')),
    ]);
    athleteRows = athleteSnap.docs.map((d) => ({ id: d.id, totals: rankingTotalsFromDoc(d.data()) }));
    teamRows = teamSnap.docs.map((d) => ({ id: d.id, totals: rankingTotalsFromDoc(d.data()) }));
  }
  const teams = await chunkedByIds(db, [...base, 'teams'], teamRows.map((r) => r.id), rankingTeamFromDoc);
  const memberUids = [...teams.values()].flatMap((t) => teamMemberIds(t));
  const profiles = await chunkedByIds(db, ['public_profiles'], [...athleteRows.map((r) => r.id), ...memberUids], rankingProfileFromDoc);
  const athletes = athleteRows.map((r) => athleteParticipantOf(r.id, r.totals, profiles.get(r.id)));
  const teamParticipants = teamRows.filter((r) => teams.has(r.id)).map((r) => teamParticipantOf(r.id, r.totals, teams.get(r.id)!, profiles));
  return sportCode
    ? { athletes: inSport(athletes, sportCode), teams: inSport(teamParticipants, sportCode) }
    : { athletes, teams: teamParticipants };
}

export interface RankingEntry {
  athleteId: string;
  totalPoints: number;
  /** Gênero do perfil público; `null` = sem perfil/sem gênero (fica fora do recorte por gênero). */
  gender: RankingGender | null;
  /** Pontos por etapa (`results[]` do doc por esporte). Vazio no ranking legado somado. */
  results: { tournamentId: string; points: number }[];
}

/** Só o que o card do overlay precisa de `results[]`: etapa e pontos (entradas sem etapa saem). */
export function rankingResultsOf(raw: unknown): RankingEntry['results'] {
  if (!Array.isArray(raw)) return [];
  const out: RankingEntry['results'] = [];
  for (const r of raw) {
    const d = record(r);
    const tournamentId = optionalStr(d['tournamentId']);
    if (tournamentId) out.push({ tournamentId, points: typeof d['points'] === 'number' ? d['points'] : 0 });
  }
  return out;
}

/** Ranking de atletas com `results[]` e gênero, pro card Top 10 da transmissão. `sportCode`
 *  `null` lê a coleção legada somada (sem `results`), como `fetchRankingParticipants`. */
export async function fetchRankingEntries(db: Firestore, projectId: string, sportCode: string | null): Promise<RankingEntry[]> {
  const base = ['artifacts', projectId, 'public', 'data'] as const;
  const snap = sportCode
    ? await getDocs(query(collection(db, ...base, 'athleteRankingsBySport'), where('sport', '==', sportCode)))
    : await getDocs(collection(db, ...base, 'athleteRankings'));
  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const id = sportCode ? bySportRankingRowOf(d.id, data, 'athleteId', sportCode).id : d.id;
    return { id, totalPoints: rankingTotalsFromDoc(data).points, results: rankingResultsOf(data['results']) };
  });
  const profiles = await chunkedByIds(db, ['public_profiles'], rows.map((r) => r.id), rankingProfileFromDoc);
  return rows.map((r) => ({
    athleteId: r.id,
    totalPoints: r.totalPoints,
    gender: normalizeRankingGender(profiles.get(r.id)?.gender),
    results: r.results,
  }));
}
