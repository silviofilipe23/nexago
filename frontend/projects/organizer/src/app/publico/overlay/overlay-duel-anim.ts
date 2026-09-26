import type { OverlayDuelView } from './overlay-selectors';

/** Eventos de animação do placar Dupla×Dupla — puro pra testar sem DOM. */
export type DuelAnimEvent =
  | { type: 'point'; side: 'A' | 'B' }
  | { type: 'serve'; side: 'A' | 'B'; slot: 1 | 2 }
  | { type: 'setEnd' }
  | { type: 'matchEnd'; winner: 'A' | 'B' };

type Snap = {
  pointsA: number | null;
  pointsB: number | null;
  setsA: number;
  setsB: number;
  serving: 'A' | 'B' | null;
  servingSlot: 0 | 1 | 2;
  phase: OverlayDuelView['phase'];
  setCols: number;
};

function servingOf(v: OverlayDuelView): 'A' | 'B' | null {
  if (v.a.serving) return 'A';
  if (v.b.serving) return 'B';
  return null;
}

export function duelSnapOf(v: OverlayDuelView): Snap {
  return {
    pointsA: v.pointsA,
    pointsB: v.pointsB,
    setsA: v.setsA,
    setsB: v.setsB,
    serving: servingOf(v),
    servingSlot: v.servingPlayerSlot,
    phase: v.phase,
    setCols: v.setColumns.length,
  };
}

export function duelAnimEventsOf(prev: Snap | null, next: OverlayDuelView): DuelAnimEvent[] {
  if (!prev) return [];
  const events: DuelAnimEvent[] = [];
  const curr = duelSnapOf(next);

  if (curr.phase === 'final' && prev.phase !== 'final') {
    const winner: 'A' | 'B' =
      next.winnerSide ?? (curr.setsA >= curr.setsB ? 'A' : 'B');
    events.push({ type: 'matchEnd', winner });
    return events;
  }

  const setsClosed = curr.setsA + curr.setsB > prev.setsA + prev.setsB;
  if (setsClosed || curr.setCols > prev.setCols) {
    events.push({ type: 'setEnd' });
  }

  const aUp = (curr.pointsA ?? 0) > (prev.pointsA ?? 0);
  const bUp = (curr.pointsB ?? 0) > (prev.pointsB ?? 0);
  if (aUp && !bUp) events.push({ type: 'point', side: 'A' });
  if (bUp && !aUp) events.push({ type: 'point', side: 'B' });

  // Bolinha nova: troca de dupla OU de atleta dentro da dupla (rodízio / Saque atleta).
  if (
    curr.serving &&
    (curr.servingSlot === 1 || curr.servingSlot === 2) &&
    (curr.serving !== prev.serving || curr.servingSlot !== prev.servingSlot)
  ) {
    events.push({ type: 'serve', side: curr.serving, slot: curr.servingSlot });
  }

  return events;
}
