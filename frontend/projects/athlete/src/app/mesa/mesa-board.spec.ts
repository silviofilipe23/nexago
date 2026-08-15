import type { LiveMatch } from '@nexago/live-scoring';
import { bestOfLabelOf, courtLabelOf, currentSetOf, flagOf, phaseLabelOf, scoreText, setPillsOf, setRuleLineOf } from './mesa-board';

function board(partial: Partial<LiveMatch> = {}): LiveMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    teamAId: 'time-a',
    teamBId: 'time-b',
    teamADescription: null,
    teamBDescription: null,
    status: 'in_progress',
    matchType: 'knockout',
    round: 2,
    poolId: '',
    matchNumber: 5,
    sets: [{ a: 0, b: 0 }],
    currentSetIndex: 0,
    bestOf: 3,
    servingTeamId: 'time-a',
    matchStartedAt: null,
    winnerId: null,
    courtName: null,
    scheduleTime: null,
    ...partial,
  };
}

describe('mesa-board', () => {
  describe('scoreText', () => {
    it('sempre dois dígitos, como o painel de quadra', () => {
      expect(scoreText(0)).toBe('00');
      expect(scoreText(7)).toBe('07');
      expect(scoreText(21)).toBe('21');
    });
  });

  describe('currentSetOf', () => {
    it('índice fora da faixa do formato cai no último set válido', () => {
      const m = board({ bestOf: 1, sets: [{ a: 9, b: 4 }], currentSetIndex: 2 });
      expect(currentSetOf(m)).toEqual({ a: 9, b: 4 });
    });

    it('set ainda não criado conta como 0×0', () => {
      expect(currentSetOf(board({ sets: [], currentSetIndex: 0 }))).toEqual({ a: 0, b: 0 });
    });
  });

  describe('flagOf', () => {
    it('acende SET POINT quando o próximo ponto fecha o set', () => {
      const m = board({ sets: [{ a: 20, b: 15 }] });
      expect(flagOf(m, 'A')).toBe('set');
      expect(flagOf(m, 'B')).toBeNull();
    });

    it('não acende sem a vantagem de 2', () => {
      expect(flagOf(board({ sets: [{ a: 20, b: 20 }] }), 'A')).toBeNull();
    });

    it('vira MATCH POINT quando o set que fecha decide a partida', () => {
      const m = board({ sets: [{ a: 21, b: 15 }, { a: 20, b: 10 }], currentSetIndex: 1 });
      expect(flagOf(m, 'A')).toBe('match');
    });

    it('set decisivo de MD3 usa o alvo 15', () => {
      const m = board({ sets: [{ a: 21, b: 15 }, { a: 10, b: 21 }, { a: 14, b: 9 }], currentSetIndex: 2 });
      expect(flagOf(m, 'A')).toBe('match');
    });

    it('fora do ao vivo, nenhuma bandeira', () => {
      expect(flagOf(board({ status: 'scheduled', sets: [{ a: 20, b: 15 }] }), 'A')).toBeNull();
      expect(flagOf(board({ status: 'completed', sets: [{ a: 20, b: 15 }] }), 'A')).toBeNull();
    });
  });

  describe('setPillsOf', () => {
    it('uma pilha por set do formato: fechado, corrente e o que falta', () => {
      const m = board({ sets: [{ a: 21, b: 17 }, { a: 18, b: 16 }], currentSetIndex: 1 });
      expect(setPillsOf(m)).toEqual([
        { label: 'Set 1', score: '21–17', state: 'closed' },
        { label: 'Set 2', score: '18–16', state: 'current' },
        { label: 'Set 3', score: null, state: 'upcoming' },
      ]);
    });

    it('set único mostra uma pilha só', () => {
      expect(setPillsOf(board({ bestOf: 1, sets: [{ a: 5, b: 3 }] })).length).toBe(1);
    });

    it('encerrada não deixa nenhuma pilha acesa', () => {
      const m = board({ status: 'completed', sets: [{ a: 21, b: 17 }, { a: 21, b: 16 }], currentSetIndex: 1 });
      expect(setPillsOf(m).map((p) => p.state)).toEqual(['closed', 'closed', 'upcoming']);
    });
  });

  describe('phaseLabelOf', () => {
    it('partida de grupo mostra o grupo', () => {
      expect(phaseLabelOf(board({ poolId: 'Grupo A', matchType: 'group' }))).toBe('Grupo A');
    });

    it('mata-mata conhecido vira o nome da fase', () => {
      expect(phaseLabelOf(board({ matchType: 'semifinal' }))).toBe('Semifinal');
      expect(phaseLabelOf(board({ matchType: 'Final' }))).toBe('Final');
      expect(phaseLabelOf(board({ matchType: 'third place' }))).toBe('3º lugar');
    });

    it('tipo desconhecido cai na rodada — a mesa abre uma partida só, sem a chave inteira pra adivinhar a fase', () => {
      expect(phaseLabelOf(board({ matchType: 'knockout', round: 3 }))).toBe('Rodada 3');
      expect(phaseLabelOf(board({ matchType: '', round: 0 }))).toBe('Partida');
    });
  });

  describe('rótulos auxiliares', () => {
    it('quadra numérica ganha o prefixo; nomeada fica como está', () => {
      expect(courtLabelOf('2')).toBe('Quadra 2');
      expect(courtLabelOf('Quadra Central')).toBe('Quadra Central');
      expect(courtLabelOf(null)).toBeNull();
    });

    it('formato e regra do set', () => {
      expect(bestOfLabelOf(3)).toBe('melhor de 3');
      expect(bestOfLabelOf(1)).toBe('set único');
      expect(setRuleLineOf(board({ currentSetIndex: 0 }))).toBe('1º set · até 21');
      expect(setRuleLineOf(board({ currentSetIndex: 2 }))).toBe('3º set · até 15');
    });
  });
});
