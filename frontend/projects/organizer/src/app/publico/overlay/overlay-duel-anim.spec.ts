import { duelAnimEventsOf, duelSnapOf } from './overlay-duel-anim';
import type { OverlayDuelView } from './overlay-selectors';

function duel(overrides: Partial<OverlayDuelView> = {}): OverlayDuelView {
  return {
    kind: 'duel',
    phase: 'live',
    a: { teamId: 'ta', label: 'A', serving: false },
    b: { teamId: 'tb', label: 'B', serving: true },
    setsA: 0,
    setsB: 0,
    pointsA: 10,
    pointsB: 11,
    alert: null,
    showSets: true,
    pointsLead: 'B',
    currentSetNumber: 1,
    targetPoints: 21,
    setColumns: [{ index: 0, label: 'SET 1', a: null, b: null, active: true }],
    roundLabel: 'Semifinal',
    winnerSide: null,
    servingPlayerSlot: 1,
    ...overrides,
  };
}

describe('duelAnimEventsOf', () => {
  it('marca ponto do lado que subiu o placar', () => {
    const prev = duelSnapOf(duel({ pointsA: 10, pointsB: 11 }));
    const events = duelAnimEventsOf(
      prev,
      duel({
        pointsA: 11,
        pointsB: 11,
        a: { teamId: 'ta', label: 'A', serving: true },
        b: { teamId: 'tb', label: 'B', serving: false },
        servingPlayerSlot: 1,
      }),
    );
    expect(events.some((e) => e.type === 'point' && e.side === 'A')).toBeTrue();
  });

  it('anima a bolinha quando o saque muda de atleta na mesma dupla', () => {
    const prev = duelSnapOf(duel({ servingPlayerSlot: 1 }));
    const events = duelAnimEventsOf(prev, duel({ servingPlayerSlot: 2 }));
    expect(events).toContain({ type: 'serve', side: 'B', slot: 2 });
  });

  it('anima a bolinha quando a outra dupla recupera o saque', () => {
    const prev = duelSnapOf(duel({ servingPlayerSlot: 1 }));
    const events = duelAnimEventsOf(
      prev,
      duel({
        a: { teamId: 'ta', label: 'A', serving: true },
        b: { teamId: 'tb', label: 'B', serving: false },
        servingPlayerSlot: 2,
      }),
    );
    expect(events.some((e) => e.type === 'serve' && e.side === 'A' && e.slot === 2)).toBeTrue();
  });

  it('detecta fim de set pelo aumento de sets ganhos', () => {
    const prev = duelSnapOf(duel({ setsA: 0, setsB: 0, pointsA: 20, pointsB: 18 }));
    const events = duelAnimEventsOf(
      prev,
      duel({
        setsA: 1,
        setsB: 0,
        pointsA: 0,
        pointsB: 0,
        setColumns: [
          { index: 0, label: 'SET 1', a: 21, b: 18, active: false },
          { index: 1, label: 'SET 2', a: null, b: null, active: true },
        ],
      }),
    );
    expect(events.some((e) => e.type === 'setEnd')).toBeTrue();
  });

  it('detecta fim de jogo na transição pra final', () => {
    const prev = duelSnapOf(duel({ setsA: 1, setsB: 0, phase: 'live' }));
    const events = duelAnimEventsOf(
      prev,
      duel({ phase: 'final', setsA: 2, setsB: 0, winnerSide: 'A', pointsLead: 'A' }),
    );
    expect(events).toEqual([{ type: 'matchEnd', winner: 'A' }]);
  });
});
