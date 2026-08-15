import { applyPoint, lastUndoablePoint, setsWonOf, undoPoint, validateScoreSubmission, type LivePointEvent, type LiveSet } from '@nexago/live-scoring';

/** O motor da mesa é compartilhado com o portal do organizador (`@nexago/live-scoring`) e já
 *  tem os casos de regra lá. Aqui provamos o que ESTA tela faz com ele: a sequência real de
 *  pontos até o fim da partida (é o par `resultA`/`resultB` que a mesa grava), o desfazer com
 *  replay de `pointEvents` e a validação do placar por sets. */
describe('mesa (portal do atleta) — escrita de placar', () => {
  const ids = { teamAId: 'time-a', teamBId: 'time-b' };

  function playSet(sets: LiveSet[], currentSetIndex: number, side: 'A' | 'B', times: number): { sets: LiveSet[]; currentSetIndex: number; winnerId: string | null } {
    let state = { sets, currentSetIndex, winnerId: null as string | null };
    for (let i = 0; i < times; i++) {
      state = applyPoint({ sets: state.sets, currentSetIndex: state.currentSetIndex, side, ...ids, bestOf: 3 });
    }
    return state;
  }

  it('21 pontos seguidos fecham o set e a mesa passa a gravar 1×0', () => {
    const state = playSet([], 0, 'A', 21);
    expect(setsWonOf(state.sets, 3)).toEqual({ a: 1, b: 0 });
    expect(state.currentSetIndex).toBe(1);
    expect(state.winnerId).toBeNull();
  });

  it('MD3 fechado em 2×0 devolve o vencedor — é o ponto que grava Completed + winnerId', () => {
    const first = playSet([], 0, 'A', 21);
    const second = playSet(first.sets, first.currentSetIndex, 'A', 21);
    expect(second.winnerId).toBe('time-a');
    expect(setsWonOf(second.sets, 3)).toEqual({ a: 2, b: 0 });
  });

  it('desfazer o ponto que abriu o 2º set volta pro set anterior', () => {
    const first = playSet([], 0, 'A', 21);
    const opened = applyPoint({ sets: first.sets, currentSetIndex: first.currentSetIndex, side: 'B', ...ids, bestOf: 3 });
    expect(opened.sets.length).toBe(2);

    const undone = undoPoint({ sets: opened.sets, currentSetIndex: opened.currentSetIndex, side: 'B' });
    expect(undone.sets.length).toBe(1);
    expect(undone.currentSetIndex).toBe(0);
  });

  it('dois "desfazer" seguidos não revertem o mesmo ponto duas vezes', () => {
    const events: LivePointEvent[] = [
      { id: 'e1', seq: 1, type: 'point', side: 'A', setIndex: 0, scoreA: 1, scoreB: 0, ts: null },
      { id: 'e2', seq: 2, type: 'point', side: 'B', setIndex: 0, scoreA: 1, scoreB: 1, ts: null },
    ];
    expect(lastUndoablePoint(events)?.side).toBe('B');

    const afterUndo: LivePointEvent[] = [...events, { id: 'e3', seq: 3, type: 'undo-point', side: 'B', setIndex: 0, scoreA: 1, scoreB: 0, ts: null }];
    expect(lastUndoablePoint(afterUndo)?.side).toBe('A');

    const afterSecondUndo: LivePointEvent[] = [...afterUndo, { id: 'e4', seq: 4, type: 'undo-point', side: 'A', setIndex: 0, scoreA: 0, scoreB: 0, ts: null }];
    expect(lastUndoablePoint(afterSecondUndo)).toBeNull();
  });

  describe('placar por sets', () => {
    it('aceita um MD3 válido', () => {
      expect(
        validateScoreSubmission(
          [
            { a: 21, b: 15 },
            { a: 18, b: 21 },
            { a: 15, b: 12 },
          ],
          3,
        ),
      ).toEqual([]);
    });

    it('recusa set sem vantagem de 2 com a mensagem do app', () => {
      const issues = validateScoreSubmission([{ a: 21, b: 20 }], 1);
      expect(issues.length).toBe(1);
      expect(issues[0]!.message).toBe('Set 1: vitória exige 21 pontos com vantagem de 2.');
    });

    it('recusa placar que ainda não decide a partida', () => {
      const issues = validateScoreSubmission([{ a: 21, b: 15 }], 3);
      expect(issues.map((i) => i.message)).toEqual(['Complete o placar: nenhuma dupla venceu ainda.']);
    });

    it('recusa lista vazia', () => {
      expect(validateScoreSubmission([], 3).map((i) => i.message)).toEqual(['Informe ao menos um set.']);
    });
  });
});
