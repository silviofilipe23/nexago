import {
  kocBracketCountForRounds,
  kocMaxRoundsForField,
  kocMaxRoundsPerBracket,
  kocRoundCount,
  kocRoundsPerPhase,
  kocSchedule,
  kocSmallestBracket,
} from './tournament-create.model';

/** Espelho do `buildKingOfCourtRounds` do servidor: o wizard precisa mostrar o
 *  MESMO número de rodadas que a geração vai criar, senão a linha que responde
 *  "cabe na minha reserva?" mente. */
describe('rodadas por chave · conta do wizard', () => {
  it('a chave encolhe a cada rodada, e o mínimo do formato é o teto', () => {
    expect(kocMaxRoundsPerBracket(3)).toBe(1);
    expect(kocMaxRoundsPerBracket(4)).toBe(2);
    expect(kocMaxRoundsPerBracket(5)).toBe(3);
  });

  it('a menor chave é quem limita', () => {
    expect(kocSmallestBracket(16, 4)).toBe(4);
    expect(kocSmallestBracket(14, 4)).toBe(3);
  });

  it('16 duplas: 1 rodada por chave dá 4+2+1 rodadas', () => {
    expect(kocRoundsPerPhase(16, 4, 2, 1)).toEqual([4, 2, 1]);
  });

  it('16 duplas: 2 rodadas por chave dobram a classificatória', () => {
    // 4 chaves × 2 rodadas = 8; saem 8 classificadas, que é o mesmo campo de
    // semifinal de antes.
    expect(kocRoundsPerPhase(16, 4, 2, 2)).toEqual([8, 2, 1]);
  });

  it('config que a chave não aguenta não fecha', () => {
    // Chave de 4 com 3 rodadas: a última teria 2 duplas.
    expect(kocRoundsPerPhase(16, 4, 2, 3)).toEqual([]);
  });

  it('o dia inteiro cresce junto, e o wizard mostra isso', () => {
    const uma = kocSchedule(16, 4, 2, 900, 1, 1);
    const duas = kocSchedule(16, 4, 2, 900, 1, 2);
    expect(uma.totalRounds).toBe(7);
    expect(duas.totalRounds).toBe(11);
    expect(duas.totalSeconds).toBeGreaterThan(uma.totalSeconds);
    expect(duas.valid).toBeTrue();
  });
});

describe('rodadas por chave · campo que não é múltiplo da quadra', () => {
  it('14 duplas viram 3 chaves quando se pede 2 rodadas', () => {
    expect(kocRoundCount(14, 4)).toBe(4);
    expect(kocBracketCountForRounds(14, 4, 2)).toBe(3);
    expect(kocSmallestBracket(14, 4, 2)).toBe(4);
  });

  it('o teto do stepper é o maior R que o campo fecha', () => {
    // 14 duplas fechavam só 1 antes, porque a divisão em 4 chaves deixava uma de 3.
    expect(kocMaxRoundsForField(14, 4)).toBe(2);
    expect(kocMaxRoundsForField(16, 4)).toBe(2);
    // 6 duplas não fecham 2: juntar em 1 chave daria rodada de 6, acima do teto.
    expect(kocMaxRoundsForField(6, 4)).toBe(1);
  });

  it('a estimativa de rodadas deixa de zerar em 13, 14, 15', () => {
    for (const n of [13, 14, 15, 17, 22]) {
      const phases = kocRoundsPerPhase(n, 4, 2, 2);
      expect(phases.length).withContext(`${n} duplas`).toBeGreaterThan(0);
      expect(phases[0] % 2).withContext(`${n} duplas: fase 1 = chaves × 2`).toBe(0);
    }
  });

  it('com uma rodada por chave a divisão do campo não muda', () => {
    for (const n of [9, 13, 14, 17, 22]) {
      expect(kocBracketCountForRounds(n, 4, 1)).toBe(kocRoundCount(n, 4));
    }
  });
});
