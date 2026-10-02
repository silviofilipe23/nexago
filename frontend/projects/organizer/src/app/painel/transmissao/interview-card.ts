import { levelDisplayLabel } from '@nexago/levels';
import {
  INTERVIEW_BADGES,
  INTERVIEW_CAMPAIGN_MAX,
  INTERVIEW_MEMBERS_MAX,
  type BroadcastInterview,
  type InterviewCampaign,
  type InterviewCampaignRow,
  type InterviewChip,
  type InterviewKind,
  type InterviewReporter,
} from '../data/broadcast-control';
import type { InterviewQueueItem } from '../data/interview-queue';
import { kocFinalTable } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { rankingEntryOf, type RankingParticipant } from '../data/ranking-positions';
import { levelCodeFor } from '../data/team-level-score';
import { teamIdsOfMatch, type RosterMember, type TeamRoster } from './transmissao-selectors';

/** Montagem do card de entrevista que vai ao ar. Roda NO PAINEL, no clique: o overlay recebe o
 *  card pronto (`broadcast/control.interview`) e só desenha. Ranking e perfis completos não têm
 *  leitura pública, e o OBS não tem login. */

/** Dados do perfil que o card usa além de nome e foto (`public_profiles`). */
export interface AthleteDetails {
  city: string | null;
  state: string | null;
  levelsBySport: Record<string, string>;
  legacyLevel: string | null;
}

/** Quem vai ao ar: um atleta (`uid`) ou o time inteiro. */
export interface InterviewSubject {
  kind: InterviewKind;
  teamId: string;
  uid: string | null;
}

/** Identidade do entrevistado — a `key` do card no ar e o `id` do item na fila. */
export function interviewKeyOf(s: InterviewSubject): string {
  return s.kind === 'atleta' ? `atleta:${s.teamId}:${s.uid ?? ''}` : `${s.kind}:${s.teamId}`;
}

export interface InterviewCardSource {
  matches: readonly TournamentMatch[];
  rosters: ReadonlyMap<string, TeamRoster>;
  details: ReadonlyMap<string, AthleteDetails>;
  categories: readonly { id: string; name: string; teamSize: number | null }[];
  /** Torneio que é etapa de liga chama a campanha de "na etapa". */
  inLeague: boolean;
  /** Código de esporte do perfil (`VOLEI_PRAIA`) — o nível exibido é o DESTE esporte. */
  levelSportCode: string | null;
  athleteRanking: readonly RankingParticipant[];
  teamRanking: readonly RankingParticipant[];
}

export interface InterviewAirOptions {
  durationSec: number | null;
  shownAt: number;
  showCampaign: boolean;
  /** Da fila do painel — a pauta e o repórter não saem dos dados do torneio. */
  question: string | null;
  reporter: InterviewReporter | null;
}

function namedMembers(roster: TeamRoster): RosterMember[] {
  return roster.members.filter((m) => m.name.trim() !== '');
}

function categoryIdOfTeam(teamId: string, matches: readonly TournamentMatch[]): string | null {
  return matches.find((m) => teamIdsOfMatch(m).includes(teamId))?.categoryId ?? null;
}

function isTeamCategory(teamId: string, src: InterviewCardSource): boolean {
  const categoryId = categoryIdOfTeam(teamId, src.matches);
  const size = src.categories.find((c) => c.id === categoryId)?.teamSize ?? null;
  const roster = src.rosters.get(teamId);
  return (size != null && size >= 3) || (roster != null && namedMembers(roster).length >= 3);
}

/** O que dá pra pôr no ar a partir de um time: sempre o atleta; o time inteiro só com o elenco
 *  completo — "dupla" de um nome só seria a tarja de atleta com outro selo. */
export function interviewKindsFor(teamId: string, src: InterviewCardSource): InterviewKind[] {
  const roster = src.rosters.get(teamId);
  if (!roster || namedMembers(roster).length < 2) return ['atleta'];
  return ['atleta', isTeamCategory(teamId, src) ? 'equipe' : 'dupla'];
}

/** Uma forma de pôr alguém deste time no ar: cada atleta, ou o time inteiro. */
export interface SubjectOption extends InterviewSubject {
  label: string;
}

/** Opções de formato de um time, na ordem do elenco, com o time inteiro por último — é o que o
 *  operador troca depois de escalar ("Lord | Muralha | Dupla"). */
export function subjectOptionsFor(teamId: string, src: InterviewCardSource): SubjectOption[] {
  const roster = src.rosters.get(teamId);
  if (!roster) return [];
  const athletes = namedMembers(roster).map<SubjectOption>((m) => ({ kind: 'atleta', teamId, uid: m.uid, label: m.name }));
  const team = interviewKindsFor(teamId, src).find((k) => k !== 'atleta');
  return team ? [...athletes, { kind: team, teamId, uid: null, label: team === 'dupla' ? 'Dupla' : 'Equipe' }] : athletes;
}

/** Item de fila de quem vai ao ar — rótulo e foto só pra listar; a pauta começa vazia. */
export function queueItemFor(subject: InterviewSubject, src: InterviewCardSource): InterviewQueueItem | null {
  const roster = src.rosters.get(subject.teamId);
  if (!roster) return null;
  const member = subject.kind === 'atleta' ? namedMembers(roster).find((m) => m.uid === subject.uid) : null;
  if (subject.kind === 'atleta' && !member) return null;
  return {
    id: interviewKeyOf(subject),
    kind: subject.kind,
    teamId: subject.teamId,
    uid: subject.kind === 'atleta' ? subject.uid : null,
    label: member ? member.name : (rosterLabelOf(roster) ?? ''),
    photoUrl: member ? member.photoUrl : (namedMembers(roster)[0]?.photoUrl ?? null),
    questions: [],
  };
}

/** "Ana Souza / Bia Lima" — ou o nome que a equipe escolheu. */
export function rosterLabelOf(roster: TeamRoster | undefined): string | null {
  if (!roster) return null;
  if (roster.teamName) return roster.teamName;
  const names = namedMembers(roster).map((m) => m.name);
  return names.length > 0 ? names.join(' / ') : null;
}

function timeOf(m: TournamentMatch): number {
  return (m.matchEndedAt ?? m.scheduledAt ?? m.matchStartedAt)?.getTime() ?? 0;
}

function chronological(matches: readonly TournamentMatch[]): TournamentMatch[] {
  return [...matches].sort((a, b) => timeOf(a) - timeOf(b));
}

/** Fase em que o time está AGORA: a partida ao vivo; senão a última encerrada; senão a próxima. */
export function teamPhaseOf(teamId: string, matches: readonly TournamentMatch[]): string | null {
  const own = chronological(matches.filter((m) => m.status !== 'canceled' && teamIdsOfMatch(m).includes(teamId)));
  const live = own.find((m) => m.status === 'in_progress');
  const done = own.filter((m) => m.status === 'completed').at(-1);
  const next = own.find((m) => m.status === 'scheduled');
  return (live ?? done ?? next)?.round ?? null;
}

/** Placar do ponto de vista do entrevistado: set único mostra os pontos, MD3 mostra os sets. */
function scoreFor(m: TournamentMatch, mine: 'a' | 'b'): string {
  const theirs = mine === 'a' ? 'b' : 'a';
  if (m.sets.length === 1) return `${m.sets[0]![mine]}–${m.sets[0]![theirs]}`;
  if (m.sets.length > 1) {
    const won = m.sets.filter((s) => s[mine] > s[theirs]).length;
    const lost = m.sets.filter((s) => s[theirs] > s[mine]).length;
    return `${won}–${lost}`;
  }
  return m.score ?? '';
}

function duelRowOf(m: TournamentMatch, teamId: string, rosters: ReadonlyMap<string, TeamRoster>): InterviewCampaignRow | null {
  const side = m.teamAId === teamId ? 1 : m.teamBId === teamId ? 2 : null;
  if (side == null || m.winnerSide == null) return null;
  const won = m.winnerSide === side;
  const opponentId = side === 1 ? m.teamBId : m.teamAId;
  const opponent = rosterLabelOf(rosters.get(opponentId)) ?? (side === 1 ? m.team2Label : m.team1Label);
  return { mark: won ? 'V' : 'D', won, opponent, phase: m.round ?? '', score: scoreFor(m, side === 1 ? 'a' : 'b') };
}

/** Rodada KOTC não tem UM adversário: o que conta é a colocação na tabela oficial da rodada. */
function kocRowOf(m: TournamentMatch, teamId: string): InterviewCampaignRow | null {
  if (!m.koc) return null;
  const row = kocFinalTable(m.koc).find((r) => r.teamId === teamId);
  if (!row) return null;
  return { mark: `${row.place}º`, won: row.place === 1, opponent: 'King of the Court', phase: m.round ?? '', score: `${row.points} pts` };
}

function summaryOf(rows: readonly InterviewCampaignRow[]): string {
  const duels = rows.filter((r) => r.mark === 'V' || r.mark === 'D');
  const rounds = rows.length - duels.length;
  const parts: string[] = [];
  if (duels.length > 0) {
    const v = duels.filter((r) => r.won).length;
    parts.push(`${v}V · ${duels.length - v}D`);
  }
  if (rounds > 0) {
    const firsts = rows.filter((r) => r.mark === '1º').length;
    parts.push(`${rounds} ${rounds === 1 ? 'rodada' : 'rodadas'}${firsts > 0 ? ` · ${firsts}× 1º` : ''}`);
  }
  return parts.join(' · ');
}

/** Partidas encerradas e decididas do time, em ordem. O resumo conta TODAS; no ar cabem as
 *  `INTERVIEW_CAMPAIGN_MAX` mais recentes. */
export function campaignOf(teamId: string, src: InterviewCardSource): InterviewCampaign | null {
  const rows = chronological(src.matches.filter((m) => m.status === 'completed'))
    .map((m) => (m.koc ? (m.koc.teamIds.includes(teamId) ? kocRowOf(m, teamId) : null) : duelRowOf(m, teamId, src.rosters)))
    .filter((r): r is InterviewCampaignRow => r != null);
  if (rows.length === 0) return null;
  return {
    title: src.inLeague ? 'Campanha na etapa' : 'Campanha no torneio',
    summary: summaryOf(rows),
    rows: rows.slice(-INTERVIEW_CAMPAIGN_MAX),
  };
}

function rankingChips(entry: ReturnType<typeof rankingEntryOf>): InterviewChip[] {
  if (!entry) return [];
  return [
    { label: 'Ranking', value: `${entry.position}º` },
    { label: 'Pontos', value: entry.points.toLocaleString('pt-BR') },
  ];
}

function cityOf(d: AthleteDetails | undefined): string | null {
  if (!d?.city) return null;
  return d.state ? `${d.city}/${d.state}` : d.city;
}

function athleteChips(uid: string, src: InterviewCardSource): { chips: InterviewChip[]; pos: number | null } {
  const entry = rankingEntryOf(src.athleteRanking, uid);
  const details = src.details.get(uid);
  const level = details ? levelDisplayLabel(levelCodeFor(details, src.levelSportCode)) : '';
  const city = cityOf(details);
  const chips = [...rankingChips(entry)];
  if (level) chips.push({ label: 'Nível', value: level });
  if (city) chips.push({ label: 'Cidade', value: city });
  return { chips, pos: entry?.position ?? null };
}

function teamChips(teamId: string, src: InterviewCardSource): { chips: InterviewChip[]; pos: number | null } {
  const entry = rankingEntryOf(src.teamRanking, teamId);
  const chips = rankingChips(entry);
  if (entry) chips.push({ label: 'Torneios', value: String(entry.tournaments) });
  return { chips, pos: entry?.position ?? null };
}

/** O card inteiro, com TODOS os campos definidos: `setDoc` com merge funde mapas, então campo
 *  omitido deixaria o valor do entrevistado anterior no ar — e `undefined` derruba a escrita. */
export function interviewCardOf(subject: InterviewSubject, src: InterviewCardSource, air: InterviewAirOptions): BroadcastInterview | null {
  const roster = src.rosters.get(subject.teamId);
  if (!roster) return null;
  const named = namedMembers(roster);
  const categoryId = categoryIdOfTeam(subject.teamId, src.matches);
  const categoryName = src.categories.find((c) => c.id === categoryId)?.name ?? null;
  const context = [categoryName, teamPhaseOf(subject.teamId, src.matches)].filter((p): p is string => !!p).join(' · ') || null;
  const campaign = campaignOf(subject.teamId, src);
  const isTeam = isTeamCategory(subject.teamId, src);
  const base = {
    durationSec: air.durationSec,
    shownAt: air.shownAt,
    showCampaign: air.showCampaign,
    question: air.question,
    reporter: air.reporter,
    categoryName,
    context,
    campaign,
  };

  if (subject.kind === 'atleta') {
    const me = named.find((m) => m.uid === subject.uid);
    if (!me) return null;
    const partner = !isTeam && named.length === 2 ? (named.find((m) => m.uid !== me.uid)?.name ?? null) : null;
    const subtitle = isTeam ? roster.teamName : partner ? `Dupla com ${partner}` : null;
    const { chips, pos } = athleteChips(me.uid, src);
    return {
      ...base,
      name: me.name,
      photoUrl: me.photoUrl,
      partnerName: partner,
      kind: 'atleta',
      key: interviewKeyOf({ kind: 'atleta', teamId: subject.teamId, uid: me.uid }),
      names: [me.name],
      photos: [me.photoUrl],
      members: [],
      badge: INTERVIEW_BADGES.atleta,
      subtitle,
      rankingPos: pos,
      chips,
    };
  }

  if (named.length < 2) return null;
  const { chips, pos } = teamChips(subject.teamId, src);
  if (subject.kind === 'dupla') {
    const pair = named.slice(0, 2);
    return {
      ...base,
      name: pair.map((m) => m.name).join(' / '),
      photoUrl: pair[0]!.photoUrl,
      partnerName: null,
      kind: 'dupla',
      key: interviewKeyOf(subject),
      names: pair.map((m) => m.name),
      photos: pair.map((m) => m.photoUrl),
      members: [],
      badge: INTERVIEW_BADGES.dupla,
      subtitle: null,
      rankingPos: pos,
      chips,
    };
  }

  const teamName = rosterLabelOf(roster)!;
  return {
    ...base,
    name: teamName,
    photoUrl: null,
    partnerName: null,
    kind: 'equipe',
    key: interviewKeyOf(subject),
    names: [teamName],
    photos: [],
    members: named.slice(0, INTERVIEW_MEMBERS_MAX).map((m) => ({ name: m.name, photoUrl: m.photoUrl })),
    badge: INTERVIEW_BADGES.equipe,
    subtitle: null,
    rankingPos: pos,
    chips,
  };
}
