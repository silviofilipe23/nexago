import { effectiveScoringProfile, setsWonBy } from '@nexago/sports';
import type { BroadcastPrejogo, PrejogoCard, PrejogoConfronto, PrejogoRow, PrejogoSide, PrejogoTeam } from '../data/broadcast-prejogo';
import type { TournamentMatch } from '../data/matches-repository';
import { rankingEntryOf, type RankingParticipant } from '../data/ranking-positions';
import { spTimeLabel } from '../data/schedule-format';
import { compositeTeamRating, type AthleteRatingLite } from '../data/team-level-score';
import { teamIdsOfMatch, type TeamRoster } from './transmissao-selectors';

/** Montagem do card do Pré-jogo. Roda NO PAINEL: o overlay é público e só desenha o que vem em
 *  `broadcast/control.prejogo`. Função pura — a busca de ratings e de confrontos fica na tela. */

export interface PrejogoSource {
  /** Partidas do torneio (estatísticas da etapa). */
  matches: readonly TournamentMatch[];
  rosters: ReadonlyMap<string, TeamRoster>;
  teamRanking: readonly RankingParticipant[];
  /** Rating por atleta; vazio quando o esporte não tem engine. */
  ratings: ReadonlyMap<string, AthleteRatingLite>;
  /** Partidas de outros torneios/fases entre as duas duplas (a função refiltra e ordena). */
  previous: readonly TournamentMatch[];
  /** Nome do torneio por id, pro texto dos confrontos. */
  tournamentNames: ReadonlyMap<string, string>;
  categoryName: string | null;
  courtName: string | null;
}

const DASH = '–';

function named(roster: TeamRoster | undefined) {
  return (roster?.members ?? []).filter((m) => m.name.trim() !== '');
}

function teamOf(teamId: string, src: PrejogoSource): PrejogoTeam {
  const members = named(src.rosters.get(teamId));
  return {
    names: members.map((m) => m.name),
    photos: members.map((m) => m.photoUrl),
    rankPos: rankingEntryOf(src.teamRanking, teamId)?.position ?? null,
    club: null,
  };
}

/** "Melhor de 3 · 21 / 15", "Set único · 21", "Melhor de 3 sets" (games). */
export function prejogoRuleOf(m: TournamentMatch): string {
  const p = effectiveScoringProfile(m.scoringProfile, m.bestOf);
  if (p.kind === 'sets_games') return p.bestOf === 1 ? 'Set único' : `Melhor de ${p.bestOf} sets`;
  if (p.bestOf === 1) return `Set único · ${p.setTarget}`;
  return `Melhor de ${p.bestOf} · ${p.setTarget} / ${p.decidingSetTarget}`;
}

interface TeamStats {
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  points: number;
  setsPlayed: number;
}

function statsOf(teamId: string, matches: readonly TournamentMatch[]): TeamStats {
  const s: TeamStats = { wins: 0, losses: 0, setsWon: 0, setsLost: 0, points: 0, setsPlayed: 0 };
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const mine = m.teamAId === teamId ? 'a' : m.teamBId === teamId ? 'b' : null;
    if (!mine) continue;
    const theirs = mine === 'a' ? 'b' : 'a';
    if (m.winnerSide != null) {
      if (m.winnerSide === (mine === 'a' ? 1 : 2)) s.wins++;
      else s.losses++;
    }
    const won = setsWonBy(m.sets, effectiveScoringProfile(m.scoringProfile, m.bestOf));
    s.setsWon += won[mine];
    s.setsLost += won[theirs];
    for (const set of m.sets) {
      s.points += set[mine];
      s.setsPlayed++;
    }
  }
  return s;
}

/** Quem lidera: o maior valor; empate ou nenhum dado = `null`. Um lado só com dado leva. */
function leadOf(a: number | null, b: number | null): PrejogoSide | null {
  if (a == null && b == null) return null;
  if (b == null) return 'A';
  if (a == null) return 'B';
  if (a === b) return null;
  return a > b ? 'A' : 'B';
}

function row(label: string, a: string, b: string, pctA: number, pctB: number, lead: PrejogoSide | null): PrejogoRow {
  return { label, a, b, pctA, pctB, lead };
}

function relativeBars(a: number | null, b: number | null): [number, number] {
  const max = Math.max(a ?? 0, b ?? 0);
  if (max <= 0) return [0, 0];
  return [Math.round(((a ?? 0) / max) * 100), Math.round(((b ?? 0) / max) * 100)];
}

function ratio(won: number, lost: number): number | null {
  return won + lost > 0 ? won / (won + lost) : null;
}

/** Elo da dupla: composto (todos com rating firme); senão média simples dos disponíveis. */
function eloOf(teamId: string, src: PrejogoSource): number | null {
  const found = named(src.rosters.get(teamId))
    .map((m) => src.ratings.get(m.uid))
    .filter((r): r is AthleteRatingLite => r != null);
  const all = named(src.rosters.get(teamId)).map((m) => src.ratings.get(m.uid) ?? null);
  const composite = compositeTeamRating(all);
  if (composite != null) return composite;
  return found.length > 0 ? found.reduce((sum, r) => sum + r.rating, 0) / found.length : null;
}

function rowsOf(aId: string, bId: string, src: PrejogoSource): PrejogoRow[] {
  const posA = rankingEntryOf(src.teamRanking, aId)?.position ?? null;
  const posB = rankingEntryOf(src.teamRanking, bId)?.position ?? null;
  const [rankPctA, rankPctB] = relativeBars(posA == null ? null : 1 / posA, posB == null ? null : 1 / posB);
  const rankLead = leadOf(posA == null ? null : -posA, posB == null ? null : -posB);

  const eloA = eloOf(aId, src);
  const eloB = eloOf(bId, src);
  const [eloPctA, eloPctB] = relativeBars(eloA, eloB);

  const sa = statsOf(aId, src.matches);
  const sb = statsOf(bId, src.matches);
  const rateA = ratio(sa.wins, sa.losses);
  const rateB = ratio(sb.wins, sb.losses);
  const setRateA = ratio(sa.setsWon, sa.setsLost);
  const setRateB = ratio(sb.setsWon, sb.setsLost);
  const ppsA = sa.setsPlayed > 0 ? sa.points / sa.setsPlayed : null;
  const ppsB = sb.setsPlayed > 0 ? sb.points / sb.setsPlayed : null;
  const [ppsPctA, ppsPctB] = relativeBars(ppsA, ppsB);

  return [
    row('Ranking', posA == null ? DASH : `#${posA}`, posB == null ? DASH : `#${posB}`, rankPctA, rankPctB, rankLead),
    row(
      'Elo NexaGO',
      eloA == null ? DASH : String(Math.round(eloA)),
      eloB == null ? DASH : String(Math.round(eloB)),
      eloPctA,
      eloPctB,
      leadOf(eloA == null ? null : Math.round(eloA), eloB == null ? null : Math.round(eloB)),
    ),
    row('Vitórias na etapa', `${sa.wins}–${sa.losses}`, `${sb.wins}–${sb.losses}`, Math.round((rateA ?? 0) * 100), Math.round((rateB ?? 0) * 100), leadOf(rateA, rateB)),
    row('Sets na etapa', `${sa.setsWon}–${sa.setsLost}`, `${sb.setsWon}–${sb.setsLost}`, Math.round((setRateA ?? 0) * 100), Math.round((setRateB ?? 0) * 100), leadOf(setRateA, setRateB)),
    row(
      'Pontos por set',
      ppsA == null ? DASH : ppsA.toFixed(1),
      ppsB == null ? DASH : ppsB.toFixed(1),
      ppsPctA,
      ppsPctB,
      leadOf(ppsA == null ? null : Number(ppsA.toFixed(1)), ppsB == null ? null : Number(ppsB.toFixed(1))),
    ),
  ];
}

function timeOf(m: TournamentMatch): number {
  return (m.matchEndedAt ?? m.scheduledAt ?? m.matchStartedAt)?.getTime() ?? 0;
}

/** Último termo do nome em caixa alta: "Ana Souza" → "SOUZA". */
function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? '').toLocaleUpperCase('pt-BR');
}

/** Set único mostra os pontos do set; MD3 mostra os sets (vencedor × perdedor). */
function winnerScoreOf(m: TournamentMatch, winnerIsA: boolean): string {
  const w = winnerIsA ? 'a' : 'b';
  const l = winnerIsA ? 'b' : 'a';
  if (m.sets.length === 1) return `${m.sets[0]![w]}–${m.sets[0]![l]}`;
  const won = setsWonBy(m.sets, effectiveScoringProfile(m.scoringProfile, m.bestOf));
  return `${won[w]}–${won[l]}`;
}

/** Confrontos ENCERRADOS e decididos entre as duas duplas (identidade por `teamId`: se uma
 *  dupla foi refeita com outro id em outro torneio, o histórico dela não aparece), do mais novo
 *  pro mais antigo. Exclui a própria partida do card. */
function duelsOf(aId: string, bId: string, currentId: string, src: PrejogoSource): TournamentMatch[] {
  return src.previous
    .filter((m) => m.id !== currentId && m.status === 'completed' && m.winnerSide != null)
    .filter((m) => (m.teamAId === aId && m.teamBId === bId) || (m.teamAId === bId && m.teamBId === aId))
    .sort((x, y) => timeOf(y) - timeOf(x));
}

function confrontosOf(duels: readonly TournamentMatch[], aId: string, src: PrejogoSource): PrejogoConfronto[] {
  return duels.slice(0, 3).map((m) => {
    const winnerIsTeamA = m.winnerSide === 1;
    const winnerTeamId = winnerIsTeamA ? m.teamAId : m.teamBId;
    const surnames = named(src.rosters.get(winnerTeamId)).map((p) => surnameOf(p.name));
    const who = surnames.length > 0 ? surnames.join(' / ') : (winnerIsTeamA ? m.team1Label : m.team2Label).toLocaleUpperCase('pt-BR');
    const tournament = src.tournamentNames.get(m.tournamentId);
    const text = `${who} ${winnerScoreOf(m, winnerIsTeamA)}${tournament ? ` · ${tournament}` : ''}`;
    return { winner: winnerTeamId === aId ? 'A' : 'B', text };
  });
}

/** `null` quando a partida não tem as duas duplas definidas. `key` vem de fora pra função ficar
 *  pura (identidade da apresentação: mudou = o overlay anima de novo). */
export function prejogoCardOf(src: PrejogoSource, match: TournamentMatch, key: string): PrejogoCard | null {
  if (!match.teamAId || !match.teamBId || match.koc) return null;
  const duels = duelsOf(match.teamAId, match.teamBId, match.id, src);
  const winsA = duels.filter((m) => (m.winnerSide === 1 ? m.teamAId : m.teamBId) === match.teamAId).length;
  return {
    matchId: match.id,
    key,
    category: src.categoryName,
    phase: match.round,
    court: src.courtName ?? match.court,
    rule: prejogoRuleOf(match),
    startTime: match.scheduledAt ? spTimeLabel(match.scheduledAt) : null,
    a: teamOf(match.teamAId, src),
    b: teamOf(match.teamBId, src),
    h2h: duels.length > 0 ? { a: winsA, b: duels.length - winsA } : null,
    last: confrontosOf(duels, match.teamAId, src),
    rows: rowsOf(match.teamAId, match.teamBId, src),
  };
}

function flip(side: PrejogoSide | null): PrejogoSide | null {
  return side === 'A' ? 'B' : side === 'B' ? 'A' : null;
}

/** Inverte os lados do card (quem aparece à esquerda/direita), com identidade nova. */
export function swapPrejogoSides(card: PrejogoCard, key: string): PrejogoCard {
  return {
    ...card,
    key,
    a: card.b,
    b: card.a,
    h2h: card.h2h ? { a: card.h2h.b, b: card.h2h.a } : null,
    last: card.last.map((c) => ({ ...c, winner: flip(c.winner) })),
    rows: card.rows.map((r) => ({ ...r, a: r.b, b: r.a, pctA: r.pctB, pctB: r.pctA, lead: flip(r.lead) })),
  };
}

/** Partidas que dão pra apresentar: agendadas, duelo, com as duas duplas. */
export function prejogoCandidatesOf(matches: readonly TournamentMatch[]): TournamentMatch[] {
  return matches
    .filter((m) => m.status === 'scheduled' && !m.koc && m.teamAId !== '' && m.teamBId !== '' && teamIdsOfMatch(m).length >= 2)
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity) || a.matchNumber - b.matchNumber);
}

/** Estado novo do doc: o card completo, sem `undefined`. */
export function prejogoPatch(on: boolean, card: PrejogoCard | null): BroadcastPrejogo {
  return { on, card };
}
