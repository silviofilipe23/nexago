import type { TournamentMatch } from '../../painel/data/matches-repository';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';
import type { LivePointEvent } from '@nexago/live-scoring';
import { flowDiffs, maxStreak, replayPointSides, resumoOf, syntheticSetPoints } from './overlay-resumo';

const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Dupla A',
    team2Label: 'Dupla B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [{ a: 10, b: 8 }],
    courtId: 'Q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: 0,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const viewOf = (m: TournamentMatch) => overlayViewOf(m, NOW) as OverlayDuelView;
const ev = (seq: number, type: string, side: 'A' | 'B', setIndex = 0): LivePointEvent => ({
  id: `e${seq}`,
  seq,
  type,
  side,
  setIndex,
  scoreA: 0,
  scoreB: 0,
  ts: new Date(NOW + seq * 60_000),
});

describe('overlay-resumo', () => {
  it('replay aplica o desfazer', () => {
    const r = replayPointSides([ev(1, 'point', 'A'), ev(2, 'point', 'B'), ev(3, 'undo-point', 'B'), ev(4, 'point', 'A')]);
    expect(r.get(0)).toEqual(['A', 'A']);
  });

  it('sintético fecha com o placar do set', () => {
    const pts = syntheticSetPoints(21, 15);
    expect(pts.filter((p) => p === 'A').length).toBe(21);
    expect(pts.filter((p) => p === 'B').length).toBe(15);
  });

  it('sequência e fluxo', () => {
    expect(maxStreak(['A', 'A', 'B', 'A', 'A', 'A'])).toEqual({ a: 3, b: 1 });
    expect(flowDiffs(['A', 'A', 'B'])).toEqual([1, 2, 1]);
  });

  it('fim de jogo: vencedor, sets e estatísticas de vôlei (log sintético sem eventos)', () => {
    const m = match({ status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 10 }] });
    const r = resumoOf(m, viewOf(m), [], { categoryName: 'Masc A', courtName: 'Quadra 1' });
    expect(r?.selo).toBe('Fim de jogo');
    expect(r?.a.winner).toBeTrue();
    expect(r?.sets.map((s) => s.label)).toEqual(['Set 1', 'Set 2', 'Tie-break']);
    expect(r?.stats.map((s) => s.label)).toEqual(['Pontos totais', 'Pontos no saque', 'Side-outs', 'Maior sequência', 'Maior vantagem']);
    expect(r?.stats[0]).toEqual({ label: 'Pontos totais', a: 54, b: 46 });
    expect(r?.contexto).toBe('Masc A · Quadra 1');
  });

  it('parcial inclui o set em andamento; agendada não tem resumo', () => {
    const m = match();
    const r = resumoOf(m, viewOf(m), [], { categoryName: null, courtName: null });
    expect(r?.selo).toBe('Resumo parcial');
    expect(r?.sets.length).toBe(1);
    const ag = match({ status: 'scheduled', sets: [] });
    expect(resumoOf(ag, overlayViewOf(ag, NOW) as OverlayDuelView, [], { categoryName: null, courtName: null })).toBeNull();
  });

  it('usa o log real quando bate com o placar: saque e side-out', () => {
    const m = match({ sets: [{ a: 2, b: 1 }] });
    const events = [ev(1, 'point', 'A'), ev(2, 'point', 'A'), ev(3, 'point', 'B')];
    const r = resumoOf(m, viewOf(m), events, { categoryName: null, courtName: null });
    expect(r?.stats.find((s) => s.label === 'Pontos no saque')).toEqual({ label: 'Pontos no saque', a: 1, b: 0 });
    expect(r?.stats.find((s) => s.label === 'Side-outs')).toEqual({ label: 'Side-outs', a: 0, b: 1 });
    expect(r?.duracao).toBe('2 min');
  });
});
