import { buildPointWrite, buildUndoWrite, lastUndoablePoint, liveMatchFromDoc, type LivePointEvent } from '@nexago/live-scoring';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 };

/** Doc → partida, como a transação da mesa lê. */
function matchDoc(extra: Record<string, unknown>): Record<string, unknown> {
  return { teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, scoringProfile: BT, servingTeamId: 'A', ...extra };
}

/** Aplica o `matchUpdate` sobre o doc (sem os sentinelas do Firestore). */
function applyUpdate(doc: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const next = { ...doc };
  for (const [k, v] of Object.entries(update)) {
    if (v && typeof v === 'object' && '_methodName' in (v as object)) {
      if ((v as { _methodName: string })._methodName === 'deleteField') delete next[k];
      continue;
    }
    next[k] = v;
  }
  return next;
}

describe('mesa · partida de games', () => {
  it('ponto que fecha o set grava currentGame zerado e o snapshot no evento; desfazer volta ao 40-0', () => {
    const before = matchDoc({ sets: [{ a: 5, b: 0 }], currentSetIndex: 0, currentGame: { a: 3, b: 0 } });
    const w = buildPointWrite(liveMatchFromDoc('m1', before), 'A')!;
    expect(w.matchUpdate['currentGame']).toEqual({ a: 0, b: 0 });
    expect(w.matchUpdate['sets']).toEqual([{ a: 6, b: 0, startedAt: jasmine.anything() }]);
    expect(w.matchUpdate['currentSetIndex']).toBe(1);
    expect(w.matchUpdate['servingTeamId']).toBe('');
    expect(w.pointEvent['scoreA']).toBe(6);
    expect(w.pointEvent['gameA']).toBe(0);
    const prev = w.pointEvent['prev'] as Record<string, unknown>;
    expect(prev['currentGame']).toEqual({ a: 3, b: 0 });

    const after = applyUpdate(before, w.matchUpdate);
    const u = buildUndoWrite(liveMatchFromDoc('m1', after), 'A', 0, prev)!;
    expect(u.matchUpdate['sets']).toEqual([{ a: 5, b: 0 }]);
    expect(u.matchUpdate['currentGame']).toEqual({ a: 3, b: 0 });
    expect(u.matchUpdate['currentSetIndex']).toBe(0);
    expect(u.matchUpdate['servingTeamId']).toBe('A');
    expect(u.pointEvent['type']).toBe('undo-point');
  });

  it('ponto que fecha a partida e o desfazer dele', () => {
    const before = matchDoc({ sets: [{ a: 6, b: 0 }, { a: 5, b: 0 }], currentSetIndex: 1, currentGame: { a: 3, b: 0 } });
    const w = buildPointWrite(liveMatchFromDoc('m1', before), 'A')!;
    expect(w.matchUpdate['status']).toBe('Completed');
    expect(w.matchUpdate['winnerId']).toBe('A');
    const after = applyUpdate(before, w.matchUpdate);
    const u = buildUndoWrite(liveMatchFromDoc('m1', after), 'A', 1, w.pointEvent['prev'] as Record<string, unknown>)!;
    expect(u.matchUpdate['status']).toBe('In Progress');
    expect(u.matchUpdate['sets']).toEqual([{ a: 6, b: 0 }, { a: 5, b: 0 }]);
    expect(u.matchUpdate['resultA']).toBe('1');
  });

  it('partida de games sem snapshot no evento: desfazer não faz nada', () => {
    const m = liveMatchFromDoc('m1', matchDoc({ sets: [{ a: 1, b: 0 }], currentSetIndex: 0, currentGame: { a: 0, b: 0 } }));
    expect(buildUndoWrite(m, 'A', 0, null)).toBeNull();
  });

  it('partida de pontos: nada de currentGame nem snapshot, desfazer igual a hoje', () => {
    const doc = { teamAId: 'A', teamBId: 'B', status: 'In Progress', bestOf: 3, servingTeamId: 'A', sets: [{ a: 10, b: 8 }], currentSetIndex: 0 };
    const w = buildPointWrite(liveMatchFromDoc('m1', doc), 'A')!;
    expect('currentGame' in w.matchUpdate).toBeFalse();
    expect('prev' in w.pointEvent).toBeFalse();
    const m = liveMatchFromDoc('m1', { ...doc, sets: [{ a: 11, b: 8 }] });
    expect(buildUndoWrite(m, 'A', 0, { anything: true })).toEqual(buildUndoWrite(m, 'A', 0));
  });

  it('desfazer com a timeline atrasada não repõe estado velho', () => {
    const landedOf = (w: { pointEvent: Record<string, unknown> }) => ({
      scoreA: w.pointEvent['scoreA'] as number,
      scoreB: w.pointEvent['scoreB'] as number,
      gameA: w.pointEvent['gameA'] as number,
      gameB: w.pointEvent['gameB'] as number,
    });
    const d0 = matchDoc({ sets: [{ a: 5, b: 0 }], currentSetIndex: 0, currentGame: { a: 1, b: 0 } });
    const p1 = buildPointWrite(liveMatchFromDoc('m1', d0), 'A')!;
    const d1 = applyUpdate(d0, p1.matchUpdate);
    const p2 = buildPointWrite(liveMatchFromDoc('m1', d1), 'A')!;
    const d2 = applyUpdate(d1, p2.matchUpdate);
    // Outra mesa já marcou P2; esta ainda acha que o último é P1.
    const stale = buildUndoWrite(liveMatchFromDoc('m1', d2), 'A', 0, p1.pointEvent['prev'] as Record<string, unknown>, landedOf(p1));
    expect(stale).toBeNull();
    const ok = buildUndoWrite(liveMatchFromDoc('m1', d2), 'A', 0, p2.pointEvent['prev'] as Record<string, unknown>, landedOf(p2))!;
    expect(ok.matchUpdate['currentGame']).toEqual({ a: 2, b: 0 });
  });

  it('dois desfazer seguidos miram pontos diferentes (replay da timeline)', () => {
    const ev = (seq: number, type: string, side: 'A' | 'B'): LivePointEvent => ({ id: `e${seq}`, seq, type, side, setIndex: 0, scoreA: 0, scoreB: 0, ts: null });
    const events = [ev(1, 'point', 'A'), ev(2, 'point', 'B'), ev(3, 'undo-point', 'B')];
    expect(lastUndoablePoint(events)?.seq).toBe(1);
  });
});
