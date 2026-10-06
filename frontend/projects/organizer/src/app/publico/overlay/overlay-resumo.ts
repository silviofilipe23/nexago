import type { LivePointEvent } from '@nexago/live-scoring';
import { effectiveScoringProfile, isSuperTiebreakSet } from '@nexago/sports';
import { matchClosedSets, matchLiveCurrentSet } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { finalKindOf } from '../../painel/telao/telao-final-mode';
import type { OverlayDuelView } from './overlay-selectors';

/** Tela de Resumo: fim de jogo, campeões (final) ou parcial (aberto no meio da partida).
 *
 *  Tudo aqui é puro — a tela só desenha. As estatísticas saem do log `pointEvents` da partida
 *  (replay com o desfazer), que NÃO grava quem sacava: no vôlei de praia (ponto corrido) quem
 *  saca é quem fez o ponto anterior, e é daí que saem "pontos no saque" e "side-outs". O 1º
 *  ponto de cada set fica de fora dessas duas contas — ninguém sabe quem sacou. Em partida de
 *  games o saque muda por game, não por ponto, mas o evento de ponto grava o estado ANTERIOR em
 *  `prev` (inclusive `servingTeamId`): é de lá que saem saque, devolução e quebras. Evento antigo
 *  ou partida sem saque declarado entra só nos totais. */

export const RESUMO_AUTO_DELAY_MS = 4500;
/** Resumo aberto sozinho no fim do jogo sai depois disto (o manual fica até o painel desligar). */
export const RESUMO_AUTO_MAX_MS = 45_000;

type Side = 'A' | 'B';

export interface ResumoSetCard {
  label: string;
  a: number;
  b: number;
  winner: Side | null;
}

export interface ResumoStatRow {
  label: string;
  a: number;
  b: number;
}

export interface ResumoFlowSet {
  label: string;
  /** Saldo (A − B) ponto a ponto, zerado no início do set. */
  diffs: number[];
}

export interface ResumoView {
  key: string;
  selo: 'Fim de jogo' | 'Campeões' | 'Resumo parcial';
  partial: boolean;
  contexto: string;
  duracao: string | null;
  a: { teamId: string; label: string; winner: boolean };
  b: { teamId: string; label: string; winner: boolean };
  setsA: number;
  setsB: number;
  sets: ResumoSetCard[];
  flow: ResumoFlowSet[];
  stats: ResumoStatRow[];
  games: boolean;
}

/** Pontos válidos de cada set depois de aplicar os desfazer. */
export function replayPointSides(events: readonly LivePointEvent[]): Map<number, Side[]> {
  const bySet = new Map<number, Side[]>();
  for (const e of [...events].sort((x, y) => x.seq - y.seq)) {
    if (e.side == null) continue;
    const pts = bySet.get(e.setIndex) ?? [];
    if (e.type === 'point') pts.push(e.side);
    else if (e.type === 'undo-point') pts.pop();
    else continue;
    bySet.set(e.setIndex, pts);
  }
  return bySet;
}

/** Log sintético de um set a partir do placar: intercala os pontos proporcionalmente, pra o resumo
 *  de uma partida lançada sem ponto a ponto nunca ficar vazio. */
export function syntheticSetPoints(a: number, b: number): Side[] {
  const n = a + b;
  const out: Side[] = [];
  let ga = 0;
  for (let k = 0; k < n; k++) {
    const wantA = Math.floor(((k + 1) * a) / n);
    if (wantA > ga) {
      out.push('A');
      ga = wantA;
    } else out.push('B');
  }
  return out;
}

export interface GamesPoint {
  side: Side;
  /** Quem sacava o ponto; `null` = saque não declarado. */
  server: Side | null;
  /** O ponto fechou um game (o placar de games do set subiu). */
  closesGame: boolean;
}

/** Replay do log de games com o desfazer. `closesGame` sai da subida de scoreA+scoreB (games do
 *  set) entre dois lances válidos seguidos — o tie-break e o super tie-break também contam. */
export function replayGamesPoints(
  events: readonly LivePointEvent[],
  teams: { teamAId: string; teamBId: string },
): Map<number, GamesPoint[]> {
  type Entry = GamesPoint & { sum: number };
  const bySet = new Map<number, Entry[]>();
  for (const e of [...events].sort((x, y) => x.seq - y.seq)) {
    if (e.side == null) continue;
    const stack = bySet.get(e.setIndex) ?? [];
    if (e.type === 'point') {
      const serving = typeof e.prev?.['servingTeamId'] === 'string' ? (e.prev['servingTeamId'] as string) : '';
      const server: Side | null = serving !== '' && serving === teams.teamAId ? 'A' : serving !== '' && serving === teams.teamBId ? 'B' : null;
      stack.push({ side: e.side, server, closesGame: false, sum: e.scoreA + e.scoreB });
    } else if (e.type === 'undo-point') stack.pop();
    else continue;
    bySet.set(e.setIndex, stack);
  }
  const out = new Map<number, GamesPoint[]>();
  for (const [i, stack] of bySet) {
    let prev = 0;
    out.set(
      i,
      stack.map((p) => {
        const closes = p.sum > prev;
        prev = p.sum;
        return { side: p.side, server: p.server, closesGame: closes };
      }),
    );
  }
  return out;
}

export function maxStreak(points: readonly Side[]): { a: number; b: number } {
  const best = { a: 0, b: 0 };
  let run = 0;
  let last: Side | null = null;
  for (const p of points) {
    run = p === last ? run + 1 : 1;
    last = p;
    if (p === 'A') best.a = Math.max(best.a, run);
    else best.b = Math.max(best.b, run);
  }
  return best;
}

export function flowDiffs(points: readonly Side[]): number[] {
  let d = 0;
  return points.map((p) => (d += p === 'A' ? 1 : -1));
}

function durationOf(match: TournamentMatch, events: readonly LivePointEvent[]): string | null {
  const ts = events.filter((e) => e.type === 'point' && e.ts != null).map((e) => e.ts!.getTime());
  let ms = ts.length >= 2 ? Math.max(...ts) - Math.min(...ts) : 0;
  if (ms <= 0 && match.matchStartedAt && match.matchEndedAt) ms = match.matchEndedAt.getTime() - match.matchStartedAt.getTime();
  const min = Math.round(ms / 60_000);
  return min > 0 ? `${min} min` : null;
}

function setCardsOf(match: TournamentMatch, partial: boolean, games: boolean): ResumoSetCard[] {
  const profile = effectiveScoringProfile(match.scoringProfile, match.bestOf);
  const sets = [...matchClosedSets(match)];
  const live = partial ? matchLiveCurrentSet(match) : null;
  const rows = sets.map((s) => ({ a: s.a, b: s.b }));
  if (live) rows.push({ a: live.a, b: live.b });
  return rows.map((s, i) => {
    let label = `Set ${i + 1}`;
    if (games && profile.kind === 'sets_games' && isSuperTiebreakSet(profile, i)) label = 'Super TB';
    else if (!games && match.bestOf === 3 && i === 2) label = 'Tie-break';
    return { label, a: s.a, b: s.b, winner: s.a > s.b ? 'A' : s.b > s.a ? 'B' : null };
  });
}

export function resumoOf(
  match: TournamentMatch | null,
  duel: OverlayDuelView | null,
  events: readonly LivePointEvent[],
  names: { categoryName: string | null; courtName: string | null },
): ResumoView | null {
  if (!match || !duel || match.status === 'scheduled' || match.status === 'canceled') return null;
  const partial = match.status !== 'completed';
  const games = effectiveScoringProfile(match.scoringProfile, match.bestOf).kind === 'sets_games';
  const cards = setCardsOf(match, partial, games);
  if (cards.length === 0) return null;

  const real = replayPointSides(events);
  // Por set: log real quando bate com o placar; senão (vôlei) sintético. Games usa só o real.
  const perSet: Side[][] = cards.map((c, i) => {
    const r = real.get(i) ?? [];
    if (games) return r;
    return r.length === c.a + c.b ? r : syntheticSetPoints(c.a, c.b);
  });

  const stats: ResumoStatRow[] = [];
  const all = perSet.flat();
  if (games) {
    if (all.length > 0) {
      const gp = [...replayGamesPoints(events, { teamAId: match.teamAId, teamBId: match.teamBId }).values()];
      const flat = gp.flat();
      const count = (f: (p: GamesPoint) => boolean, side: Side) => flat.filter((p) => p.side === side && f(p)).length;
      const known = flat.some((p) => p.server != null);
      const streak = perSet.map(maxStreak);
      stats.push({ label: 'Pontos totais', a: all.filter((p) => p === 'A').length, b: all.filter((p) => p === 'B').length });
      if (known) {
        stats.push(
          { label: 'Pontos no saque', a: count((p) => p.server === 'A', 'A'), b: count((p) => p.server === 'B', 'B') },
          { label: 'Pontos na devolução', a: count((p) => p.server === 'B', 'A'), b: count((p) => p.server === 'A', 'B') },
          { label: 'Quebras de saque', a: count((p) => p.closesGame && p.server === 'B', 'A'), b: count((p) => p.closesGame && p.server === 'A', 'B') },
        );
      }
      stats.push({ label: 'Maior sequência', a: Math.max(...streak.map((s) => s.a)), b: Math.max(...streak.map((s) => s.b)) });
    }
  } else {
    const serve = { a: 0, b: 0 };
    const sideOut = { a: 0, b: 0 };
    const lead = { a: 0, b: 0 };
    const streak = { a: 0, b: 0 };
    let totalA = 0;
    let totalB = 0;
    for (const pts of perSet) {
      pts.forEach((p, k) => {
        if (k === 0) return;
        const mine = p === 'A' ? 'a' : 'b';
        if (pts[k - 1] === p) serve[mine]++;
        else sideOut[mine]++;
      });
      let d = 0;
      for (const p of pts) {
        d += p === 'A' ? 1 : -1;
        lead.a = Math.max(lead.a, d);
        lead.b = Math.max(lead.b, -d);
      }
      const s = maxStreak(pts);
      streak.a = Math.max(streak.a, s.a);
      streak.b = Math.max(streak.b, s.b);
    }
    for (const c of cards) {
      totalA += c.a;
      totalB += c.b;
    }
    stats.push(
      { label: 'Pontos totais', a: totalA, b: totalB },
      { label: 'Pontos no saque', a: serve.a, b: serve.b },
      { label: 'Side-outs', a: sideOut.a, b: sideOut.b },
      { label: 'Maior sequência', a: streak.a, b: streak.b },
      { label: 'Maior vantagem', a: lead.a, b: lead.b },
    );
  }

  const flow: ResumoFlowSet[] = perSet.map((pts, i) => ({ label: `SET ${i + 1}`, diffs: flowDiffs(pts) })).filter((f) => f.diffs.length > 0);
  // No parcial, quem lidera em sets ganha o destaque (laranja, "Vencedores", faíscas) — como no
  // protótipo; empate não destaca ninguém.
  const winner = partial ? (duel.setsA > duel.setsB ? 'A' : duel.setsB > duel.setsA ? 'B' : null) : duel.winnerSide;
  const selo = partial ? 'Resumo parcial' : finalKindOf(match.matchType) === 'final' ? 'Campeões' : 'Fim de jogo';
  return {
    key: `${match.id}:${partial ? 'parcial' : 'fim'}`,
    selo,
    partial,
    contexto: [names.categoryName, duel.roundLabel, names.courtName].map((p) => p?.trim() ?? '').filter((p) => p !== '').join(' · '),
    duracao: durationOf(match, events),
    a: { teamId: duel.a.teamId, label: duel.a.label, winner: winner === 'A' },
    b: { teamId: duel.b.teamId, label: duel.b.label, winner: winner === 'B' },
    setsA: duel.setsA,
    setsB: duel.setsB,
    sets: cards,
    flow,
    stats,
    games,
  };
}
