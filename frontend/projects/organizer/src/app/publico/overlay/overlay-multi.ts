import { applyGamesPoint, effectiveScoringProfile, isPointsSetWon, isSuperTiebreakSet, setPointsTarget } from '@nexago/sports';
import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { matchClosedSets, matchLiveCurrentSet, matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';

/** Multi-quadras: uma partida por quadra, escolhida pelas regras abaixo. Puro — a tela só desenha.
 *
 *  Por quadra: ao vivo (a que começou por último, é a que está na areia) → recém-encerrada (fica
 *  como "Final" por `MULTI_FINAL_KEEP_MS`) → próxima agendada → quadra livre. */

export const MULTI_MAX_COURTS = 6;
/** Quanto uma partida encerrada segue como "Final" na quadra, se nada mais começou. */
export const MULTI_FINAL_KEEP_MS = 15 * 60_000;

export type MultiStatus = 'live' | 'setpoint' | 'matchpoint' | 'final' | 'scheduled' | 'free';
type Side = 'A' | 'B';

export interface MultiTeam {
  teamId: string;
  label: string;
  serving: boolean;
}

export interface MultiCard {
  courtId: string;
  number: number;
  courtName: string;
  /** "Masculino B · Semifinal". */
  context: string;
  status: MultiStatus;
  /** "15:40" — horário do próximo jogo. */
  time: string | null;
  matchId: string;
  a: MultiTeam;
  b: MultiTeam;
  /** Sets fechados, em ordem. */
  sets: { a: number; b: number }[];
  /** Pontos do set em andamento (partida de games: os GAMES do set); `null` fora do ao vivo. */
  live: { a: number; b: number } | null;
  /** Partida de games (tênis/beach tennis): o quadro grande mostra o ponto do game. */
  games: boolean;
  /** Ponto do game em andamento (0/15/30/40/AD, ou a contagem do tie-break); `null` em vôlei. */
  liveGame: { a: string; b: string } | null;
  /** Set em andamento decidido em tie-break / super tie-break. */
  tiebreak: 'tiebreak' | 'super' | null;
  /** "2º set" — set em andamento (ou o último, no final). */
  setNumber: number;
  setsA: number;
  setsB: number;
  winner: Side | null;
  /** Quem está em set point / match point; `null` fora desses momentos. */
  pointSide: Side | null;
}

/** Número da quadra: dígitos do nome ("Quadra 3" → 3); sem dígitos, a posição. */
export function courtNumberOf(court: Pick<OrganizerTournamentCourt, 'name'>, index: number): number {
  const m = /(\d+)/.exec(court.name);
  return m ? Number(m[1]) : index + 1;
}

/** Quem pode fechar o set com o próximo ponto — e se isso fecha a partida. Só partida de pontos
 *  (vôlei); games não tem "set point" por contagem simples. */
export function pointSituationOf(
  match: TournamentMatch,
  live: { setNumber: number; a: number; b: number },
  setsWon: { a: number; b: number },
): { side: Side | null; matchPoint: boolean } {
  const profile = effectiveScoringProfile(match.scoringProfile, match.bestOf);
  if (profile.kind === 'sets_games') {
    // Games: simula o próximo ponto de cada lado com o MESMO motor da mesa — set point é o ponto
    // que fecha o set, match point o que fecha a partida (cobre vantagem, no-ad e tie-breaks).
    const state = {
      sets: match.sets,
      currentSetIndex: match.currentSetIndex ?? Math.max(0, live.setNumber - 1),
      currentGame: match.currentGame ?? { a: 0, b: 0 },
      servingTeamId: match.servingTeamId,
    };
    const teams = { teamAId: match.teamAId, teamBId: match.teamBId };
    const ra = applyGamesPoint(state, 'A', profile, teams);
    const rb = applyGamesPoint(state, 'B', profile, teams);
    const closes = (c: string) => c === 'set' || c === 'match';
    const aCloses = closes(ra.closed);
    const bCloses = closes(rb.closed);
    if (aCloses === bCloses) return { side: null, matchPoint: false };
    const r = aCloses ? ra : rb;
    return { side: aCloses ? 'A' : 'B', matchPoint: r.closed === 'match' };
  }
  if (profile.kind !== 'sets_points') return { side: null, matchPoint: false };
  const idx = Math.max(0, live.setNumber - 1);
  const target = setPointsTarget(profile, idx);
  const wins = (a: number, b: number) => isPointsSetWon(a, b, target, profile.winBy, profile.pointCap);
  const aWins = wins(live.a + 1, live.b);
  const bWins = wins(live.a, live.b + 1);
  // Os dois lados com set point ao mesmo tempo só acontece em placar degenerado: não destaca.
  if (aWins === bWins) return { side: null, matchPoint: false };
  const side: Side = aWins ? 'A' : 'B';
  const needed = Math.floor(profile.bestOf / 2) + 1;
  const matchPoint = (side === 'A' ? setsWon.a : setsWon.b) + 1 >= needed;
  return { side, matchPoint };
}

function pickMatch(matches: readonly TournamentMatch[], courtId: string, nowMs: number): { match: TournamentMatch | null; kind: 'live' | 'final' | 'scheduled' | 'free' } {
  const onCourt = matches.filter((m) => m.courtId === courtId && m.status !== 'canceled' && !isKingOfCourtMatchType(m.matchType));
  const live = onCourt
    .filter((m) => m.status === 'in_progress')
    .sort((a, b) => (b.matchStartedAt?.getTime() ?? 0) - (a.matchStartedAt?.getTime() ?? 0))[0];
  if (live) return { match: live, kind: 'live' };
  const final = onCourt
    .filter((m) => m.status === 'completed' && m.matchEndedAt != null && nowMs - m.matchEndedAt.getTime() < MULTI_FINAL_KEEP_MS)
    .sort((a, b) => b.matchEndedAt!.getTime() - a.matchEndedAt!.getTime())[0];
  if (final) return { match: final, kind: 'final' };
  const next = onCourt
    .filter((m) => m.status === 'scheduled' && m.teamAId !== '' && m.teamBId !== '')
    .sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity) || a.matchNumber - b.matchNumber)[0];
  if (next) return { match: next, kind: 'scheduled' };
  return { match: null, kind: 'free' };
}

const timeOf = (d: Date | null): string | null =>
  d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;

export function multiCardsOf(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categoryNameOf: (categoryId: string | null) => string | null,
  nowMs: number,
): MultiCard[] {
  const ordered = [...courts].sort((x, y) => x.order - y.order).slice(0, MULTI_MAX_COURTS);
  return ordered.map((court, i) => {
    const { match: m, kind } = pickMatch(matches, court.id, nowMs);
    const number = courtNumberOf(court, i);
    if (!m) {
      return {
        courtId: court.id, number, courtName: court.name, context: '', status: 'free', time: null, matchId: '',
        a: { teamId: '', label: '', serving: false }, b: { teamId: '', label: '', serving: false },
        sets: [], live: null, games: false, liveGame: null, tiebreak: null, setNumber: 1, setsA: 0, setsB: 0, winner: null, pointSide: null,
      } satisfies MultiCard;
    }
    const [setsA, setsB] = matchSetWins(m);
    const live = kind === 'live' ? matchLiveCurrentSet(m) : null;
    const profile = effectiveScoringProfile(m.scoringProfile, m.bestOf);
    const games = profile.kind === 'sets_games';
    // Super tie-break fechado vale 1×0 no doc: a coluna mostra os pontos dele (10–8).
    const closed = matchClosedSets(m).map((s, i) =>
      profile.kind === 'sets_games' && s.tb && isSuperTiebreakSet(profile, i) ? { a: s.tb.a, b: s.tb.b } : { a: s.a, b: s.b },
    );
    let status: MultiStatus = kind === 'live' ? 'live' : kind === 'final' ? 'final' : 'scheduled';
    let pointSide: Side | null = null;
    if (live) {
      const sit = pointSituationOf(m, live, { a: setsA, b: setsB });
      pointSide = sit.side;
      if (sit.side) status = sit.matchPoint ? 'matchpoint' : 'setpoint';
    }
    const winner: Side | null = kind === 'final' ? (m.winnerSide === 1 ? 'A' : m.winnerSide === 2 ? 'B' : setsA > setsB ? 'A' : setsB > setsA ? 'B' : null) : null;
    return {
      courtId: court.id,
      number,
      courtName: court.name,
      context: [categoryNameOf(m.categoryId), m.round?.trim() || null].filter((p): p is string => !!p).join(' · '),
      status,
      time: kind === 'scheduled' ? timeOf(m.scheduledAt) : null,
      matchId: m.id,
      a: { teamId: m.teamAId, label: m.team1Label, serving: m.teamAId !== '' && m.teamAId === m.servingTeamId },
      b: { teamId: m.teamBId, label: m.team2Label, serving: m.teamBId !== '' && m.teamBId === m.servingTeamId },
      sets: closed,
      live: live ? { a: live.a, b: live.b } : null,
      games,
      liveGame: live?.game ?? null,
      tiebreak: live?.superTiebreak ? 'super' : live?.tiebreak ? 'tiebreak' : null,
      setNumber: live?.setNumber ?? Math.max(1, closed.length),
      setsA,
      setsB,
      winner,
      pointSide,
    } satisfies MultiCard;
  });
}

/** 2 ou 4 quadras → 2 colunas; 3, 5 ou 6 → 3; 1 → 1. */
export function multiColumnsOf(count: number): number {
  if (count <= 1) return 1;
  return count === 2 || count === 4 ? 2 : 3;
}
