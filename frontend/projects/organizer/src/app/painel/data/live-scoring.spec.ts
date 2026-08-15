import { applyBestOfChange, applyPoint, canReduceBestOf, setPointHint, undoPoint } from '@nexago/live-scoring';

/** Casos espelhados de `match_scoring_logic_test.dart` (app) — a mesa web tem que fechar set,
 *  virar set decisivo e declarar vencedor exatamente como a mesa I1 do Flutter. */
describe('live-scoring', () => {
  const ids = { teamAId: 'time-a', teamBId: 'time-b' };

  describe('applyPoint', () => {
    it('soma ponto ao set atual sem fechar antes do target', () => {
      const r = applyPoint({ sets: [{ a: 10, b: 8 }], currentSetIndex: 0, side: 'A', ...ids, bestOf: 3 });
      expect(r.sets[0]).toEqual(jasmine.objectContaining({ a: 11, b: 8 }));
      expect(r.currentSetIndex).toBe(0);
      expect(r.winnerId).toBeNull();
    });

    it('cria o primeiro set quando a lista está vazia', () => {
      const r = applyPoint({ sets: [], currentSetIndex: 0, side: 'B', ...ids, bestOf: 3 });
      expect(r.sets.length).toBe(1);
      expect(r.sets[0]).toEqual(jasmine.objectContaining({ a: 0, b: 1 }));
    });

    it('fecha o set em 21 com vantagem de 2 e avança o índice', () => {
      const r = applyPoint({ sets: [{ a: 20, b: 15 }], currentSetIndex: 0, side: 'A', ...ids, bestOf: 3 });
      expect(r.sets[0]).toEqual(jasmine.objectContaining({ a: 21, b: 15 }));
      expect(r.currentSetIndex).toBe(1);
      expect(r.winnerId).toBeNull();
    });

    it('não fecha 21×20 (sem vantagem de 2) — segue no mesmo set', () => {
      const r = applyPoint({ sets: [{ a: 20, b: 20 }], currentSetIndex: 0, side: 'A', ...ids, bestOf: 3 });
      expect(r.currentSetIndex).toBe(0);
      expect(r.winnerId).toBeNull();
    });

    it('declara vencedor no 2º set de MD3 (2×0)', () => {
      const r = applyPoint({ sets: [{ a: 21, b: 15 }, { a: 20, b: 10 }], currentSetIndex: 1, side: 'A', ...ids, bestOf: 3 });
      expect(r.winnerId).toBe('time-a');
      expect(r.currentSetIndex).toBe(1);
    });

    it('3º set de MD3 fecha em 15 (tie-break)', () => {
      const r = applyPoint({ sets: [{ a: 21, b: 15 }, { a: 10, b: 21 }, { a: 14, b: 9 }], currentSetIndex: 2, side: 'A', ...ids, bestOf: 3 });
      expect(r.winnerId).toBe('time-a');
    });

    it('set único (bestOf 1) fecha a partida no 21º ponto', () => {
      const r = applyPoint({ sets: [{ a: 20, b: 18 }], currentSetIndex: 0, side: 'A', ...ids, bestOf: 1 });
      expect(r.winnerId).toBe('time-a');
    });

    it('preserva startedAt do set e carimba no primeiro ponto', () => {
      const stamp = { seconds: 1 };
      const r1 = applyPoint({ sets: [{ a: 3, b: 2, startedAt: stamp }], currentSetIndex: 0, side: 'A', ...ids, bestOf: 3 });
      expect(r1.sets[0]!.startedAt).toBe(stamp);
      const r2 = applyPoint({ sets: [], currentSetIndex: 0, side: 'A', ...ids, bestOf: 3 });
      expect(r2.sets[0]!.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('undoPoint', () => {
    it('tira o ponto do lado indicado', () => {
      const r = undoPoint({ sets: [{ a: 11, b: 8 }], currentSetIndex: 0, side: 'A' });
      expect(r.sets[0]).toEqual(jasmine.objectContaining({ a: 10, b: 8 }));
      expect(r.currentSetIndex).toBe(0);
    });

    it('não desce abaixo de zero', () => {
      const r = undoPoint({ sets: [{ a: 0, b: 0 }], currentSetIndex: 0, side: 'B' });
      expect(r.sets[0]).toEqual(jasmine.objectContaining({ a: 0, b: 0 }));
    });

    it('remove o set que zera e volta o índice (desfazer o ponto que abriu o set)', () => {
      const r = undoPoint({ sets: [{ a: 21, b: 15 }, { a: 1, b: 0 }], currentSetIndex: 1, side: 'A' });
      expect(r.sets.length).toBe(1);
      expect(r.currentSetIndex).toBe(0);
    });
  });

  describe('applyBestOfChange / canReduceBestOf', () => {
    it('bloqueia reduzir quando há mais sets pontuados que o novo formato', () => {
      expect(canReduceBestOf([{ a: 21, b: 15 }, { a: 3, b: 1 }], 1)).toBeFalse();
      expect(canReduceBestOf([{ a: 21, b: 15 }], 1)).toBeTrue();
    });

    it('reduzir pra set único com 1 set fechado conclui a partida', () => {
      const r = applyBestOfChange({ sets: [{ a: 21, b: 15 }], newBestOf: 1, ...ids });
      expect(r.completed).toBeTrue();
      expect(r.winnerId).toBe('time-a');
    });

    it('ampliar pra MD3 reabre a partida (1 set fechado não vence MD3)', () => {
      const r = applyBestOfChange({ sets: [{ a: 21, b: 15 }], newBestOf: 3, ...ids });
      expect(r.completed).toBeFalse();
      expect(r.currentSetIndex).toBe(1);
    });
  });

  describe('setPointHint', () => {
    it('acusa set point em 1 quando o próximo ponto fecha', () => {
      expect(setPointHint(20, 15, 0, 3)).toBe('set point em 1');
    });
    it('conta regressiva perto do target', () => {
      expect(setPointHint(18, 10, 0, 3)).toBe('set point em 3');
    });
    it('silencia longe do target', () => {
      expect(setPointHint(10, 8, 0, 3)).toBeNull();
    });
    it('usa target 15 no set decisivo de MD3', () => {
      expect(setPointHint(14, 10, 2, 3)).toBe('set point em 1');
    });
  });
});
