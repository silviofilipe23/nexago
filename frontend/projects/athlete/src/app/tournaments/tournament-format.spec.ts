import { countdownLabelOf, elapsedLabelOf, ordinalOf, roundsProgressLabel, shortCourtLabelOf } from './tournament-format';

describe('roundsProgressLabel', () => {
  it('não diz "após 0 de N" antes de qualquer rodada acontecer', () => {
    expect(roundsProgressLabel(0, 3)).toBe('Antes da 1ª rodada');
    expect(roundsProgressLabel(0, 1)).toBe('Antes da 1ª rodada');
  });

  it('descreve o progresso no meio do grupo', () => {
    expect(roundsProgressLabel(1, 3)).toBe('Após 1 de 3 rodadas');
  });

  it('fecha o grupo sem contagem estranha', () => {
    expect(roundsProgressLabel(3, 3)).toBe('Todas as 3 rodadas disputadas');
    expect(roundsProgressLabel(1, 1)).toBe('Rodada única disputada');
  });

  it('degrada quando o grupo ainda não tem rodadas', () => {
    expect(roundsProgressLabel(0, 0)).toBe('Classificação do grupo');
  });
});

describe('countdownLabelOf', () => {
  const now = new Date('2026-08-29T15:00:00Z');

  it('conta em minutos abaixo de uma hora e em horas acima', () => {
    expect(countdownLabelOf(new Date('2026-08-29T15:42:00Z'), now)).toBe('começa em 42 min');
    expect(countdownLabelOf(new Date('2026-08-29T17:10:00Z'), now)).toBe('começa em 2h10');
    expect(countdownLabelOf(new Date('2026-08-29T17:00:00Z'), now)).toBe('começa em 2h');
  });

  it('avisa atraso em vez de mostrar tempo negativo', () => {
    expect(countdownLabelOf(new Date('2026-08-29T14:52:00Z'), now)).toBe('atrasada 8 min');
  });

  it('trata a partida iminente como "agora"', () => {
    expect(countdownLabelOf(new Date('2026-08-29T15:00:20Z'), now)).toBe('começa agora');
  });

  it('devolve null sem horário definido', () => {
    expect(countdownLabelOf(null, now)).toBeNull();
  });
});

describe('elapsedLabelOf', () => {
  it('formata o tempo em quadra como h:mm', () => {
    const start = new Date('2026-08-29T15:04:00Z');
    expect(elapsedLabelOf(start, new Date('2026-08-29T15:56:00Z'))).toBe('0:52');
    expect(elapsedLabelOf(start, new Date('2026-08-29T16:10:00Z'))).toBe('1:06');
  });

  it('nunca devolve tempo negativo se os relógios divergirem', () => {
    expect(elapsedLabelOf(new Date('2026-08-29T15:04:00Z'), new Date('2026-08-29T15:00:00Z'))).toBe('0:00');
  });
});

describe('shortCourtLabelOf', () => {
  it('abrevia a quadra para a coluna estreita da lista', () => {
    expect(shortCourtLabelOf('3')).toBe('Q3');
    expect(shortCourtLabelOf('Quadra 12')).toBe('Q12');
    expect(shortCourtLabelOf(null)).toBeNull();
  });
});

describe('ordinalOf', () => {
  it('usa o ordinal masculino do português', () => {
    expect(ordinalOf(1)).toBe('1º');
    expect(ordinalOf(3)).toBe('3º');
  });
});
