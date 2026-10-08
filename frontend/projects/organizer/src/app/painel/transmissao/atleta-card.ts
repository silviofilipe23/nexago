import { effectiveScoringProfile, setsWonBy } from '@nexago/sports';
import { ATLETA_GAMES_MAX, type AtletaCard, type AtletaJogo, type AtletaTemporada } from '../data/broadcast-atleta';
import type { TournamentMatch } from '../data/matches-repository';
import { rankingEntryOf, type RankingParticipant } from '../data/ranking-positions';
import { nomeCurtoDe } from '../../publico/overlay/overlay-nome';
import type { AthleteDetails } from './interview-card';
import { teamIdsOfMatch, type TeamRoster } from './transmissao-selectors';

/** Montagem do card do Atleta. Roda NO PAINEL; o overlay só desenha `broadcast/control.atleta`.
 *  Função pura — a busca das partidas da dupla (temporada e confronto direto) fica na tela. */

export interface AtletaSource {
  /** Partidas deste torneio. */
  matches: readonly TournamentMatch[];
  /** Partidas da dupla em qualquer torneio (temporada e confronto direto). */
  history: readonly TournamentMatch[];
  rosters: ReadonlyMap<string, TeamRoster>;
  details: ReadonlyMap<string, AthleteDetails>;
  athleteRanking: readonly RankingParticipant[];
  categoryName: string | null;
  courtName: string | null;
  /** Ano da temporada (relógio do painel). */
  year: number;
}

const timeOf = (m: TournamentMatch): number => (m.matchEndedAt ?? m.matchStartedAt ?? m.scheduledAt)?.getTime() ?? 0;
const mineSide = (m: TournamentMatch, teamId: string): 'a' | 'b' | null => (m.teamAId === teamId ? 'a' : m.teamBId === teamId ? 'b' : null);
const decided = (m: TournamentMatch) => m.status === 'completed' && m.winnerSide != null && !m.koc;
const wonBy = (m: TournamentMatch, side: 'a' | 'b') => m.winnerSide === (side === 'a' ? 1 : 2);

/** "Nunes / Alves": sobrenome de cada atleta do adversário; sem elenco, o rótulo da partida. */
function opponentOf(m: TournamentMatch, side: 'a' | 'b', rosters: ReadonlyMap<string, TeamRoster>): string {
  const theirs = side === 'a' ? m.teamBId : m.teamAId;
  const names = (rosters.get(theirs)?.members ?? []).map((p) => p.name.trim().split(/\s+/).pop() ?? '').filter((n) => n !== '');
  if (names.length > 0) return names.join(' / ');
  return (side === 'a' ? m.team2Label : m.team1Label).split(/\s*\/\s*/).map(nomeCurtoDe).join(' / ');
}

function temporadaOf(teamId: string, history: readonly TournamentMatch[], year: number): AtletaTemporada | null {
  const jogos = history
    .filter((m) => decided(m) && mineSide(m, teamId) && timeOf(m) > 0 && new Date(timeOf(m)).getFullYear() === year)
    .sort((x, y) => timeOf(x) - timeOf(y));
  if (jogos.length === 0) return null;
  const resultados = jogos.map((m) => (wonBy(m, mineSide(m, teamId)!) ? ('V' as const) : ('D' as const)));
  const wins = resultados.filter((r) => r === 'V').length;
  const kind = resultados[resultados.length - 1]!;
  let n = 0;
  for (let i = resultados.length - 1; i >= 0 && resultados[i] === kind; i--) n++;
  return { year, winPct: Math.round((wins / resultados.length) * 100), wins, losses: resultados.length - wins, streak: { kind, n }, last: resultados.slice(-5) };
}

function jogoOf(m: TournamentMatch, side: 'a' | 'b', rosters: ReadonlyMap<string, TeamRoster>): AtletaJogo {
  const other = side === 'a' ? 'b' : 'a';
  const won = setsWonBy(m.sets, effectiveScoringProfile(m.scoringProfile, m.bestOf));
  return {
    phase: m.round ?? '',
    opponent: opponentOf(m, side, rosters),
    partials: m.sets.map((s) => `${s[side]}-${s[other]}`).join(' '),
    score: `${won[side]}–${won[other]}`,
    won: wonBy(m, side),
  };
}

/** `null` quando o atleta não está no elenco da equipe. `match` = a partida de hoje da dupla
 *  (dá o adversário do confronto direto); pode ser `null`. */
export function atletaCardOf(
  src: AtletaSource,
  teamId: string,
  uid: string,
  match: TournamentMatch | null,
  key: string,
): AtletaCard | null {
  const roster = src.rosters.get(teamId);
  const me = roster?.members.find((m) => m.uid === uid && m.name.trim() !== '');
  if (!roster || !me) return null;
  const partner = roster.members.find((m) => m.uid !== uid && m.name.trim() !== '');
  const rank = rankingEntryOf(src.athleteRanking, uid);
  const d = src.details.get(uid);

  const doTorneio = src.matches
    .filter((m) => decided(m) && teamIdsOfMatch(m).includes(teamId) && mineSide(m, teamId))
    .sort((x, y) => timeOf(x) - timeOf(y));
  let setsWon = 0;
  let setsLost = 0;
  for (const m of doTorneio) {
    const side = mineSide(m, teamId)!;
    const w = setsWonBy(m.sets, effectiveScoringProfile(m.scoringProfile, m.bestOf));
    setsWon += w[side];
    setsLost += w[side === 'a' ? 'b' : 'a'];
  }

  const rivalId = match ? (match.teamAId === teamId ? match.teamBId : match.teamBId === teamId ? match.teamAId : '') : '';
  let h2h: AtletaCard['h2h'] = null;
  if (match && rivalId !== '') {
    const duelos = src.history.filter((m) => m.id !== match.id && decided(m) && mineSide(m, teamId) && (m.teamAId === rivalId || m.teamBId === rivalId));
    if (duelos.length > 0) {
      const wins = duelos.filter((m) => wonBy(m, mineSide(m, teamId)!)).length;
      const rival = (src.rosters.get(rivalId)?.members ?? []).map((p) => p.name.trim().split(/\s+/).pop() ?? '').filter((n) => n !== '');
      h2h = { wins, losses: duelos.length - wins, vs: rival.length > 0 ? rival.join(' / ') : (match.teamAId === teamId ? match.team2Label : match.team1Label) };
    }
  }

  return {
    key,
    name: me.name.trim(),
    partner: partner ? nomeCurtoDe(partner.name) : null,
    photoUrl: me.photoUrl,
    court: src.courtName,
    category: src.categoryName,
    rankPos: rank?.position ?? null,
    rankPoints: rank ? Math.round(rank.points) : null,
    city: d?.city ?? null,
    state: d?.state ?? null,
    season: temporadaOf(teamId, src.history, src.year),
    games: doTorneio.slice(-ATLETA_GAMES_MAX).map((m) => jogoOf(m, mineSide(m, teamId)!, src.rosters)),
    setsWon,
    setsLost,
    h2h,
  };
}
