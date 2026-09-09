import {
  LAND_MS,
  ROLL_MS,
  SPOTLIGHT_MS,
  countdownPartsOf,
  revealCycleMs,
  revealPhaseAt,
  spotlightProgressAt,
} from './draw-reveal-phase';

/**
 * O motor de fase é a ÚNICA fonte de tempo do sorteio, e a âncora é o `at`
 * gravado pelo servidor — não um timer local. É isso que faz o telão da TV e o
 * espelho do console ficarem em fase mesmo quando um deles conecta no meio da
 * revelação, e que faz um F5 na TV cair no ponto certo do show.
 */
const AT = 1_700_000_000_000;

describe('revealPhaseAt', () => {
  it('sem revelação nenhuma, a tela é a grade', () => {
    expect(revealPhaseAt(null, AT)).toBe('grid');
  });

  it('no instante da revelação, os dados começam a rolar', () => {
    expect(revealPhaseAt(AT, AT)).toBe('roll');
  });

  it('durante o rolamento continua em roll', () => {
    expect(revealPhaseAt(AT, AT + ROLL_MS - 1)).toBe('roll');
  });

  it('terminado o rolamento, os dados travam', () => {
    expect(revealPhaseAt(AT, AT + ROLL_MS)).toBe('land');
    expect(revealPhaseAt(AT, AT + ROLL_MS + LAND_MS - 1)).toBe('land');
  });

  it('depois de travar, a dupla toma a tela', () => {
    expect(revealPhaseAt(AT, AT + ROLL_MS + LAND_MS)).toBe('spotlight');
  });

  it('encerrado o ciclo, volta pra grade', () => {
    expect(revealPhaseAt(AT, AT + revealCycleMs())).toBe('grid');
  });

  it('conectar muito depois cai direto na grade — o telão que reconecta não repete o show', () => {
    expect(revealPhaseAt(AT, AT + 60_000)).toBe('grid');
  });

  it('relógio atrasado em relação ao servidor não quebra a fase', () => {
    // O relógio do navegador pode estar atrás do servidor por alguns segundos.
    // Tratar como "acabou de sair" é melhor que pular a revelação inteira.
    expect(revealPhaseAt(AT, AT - 2_000)).toBe('roll');
  });
});

describe('spotlightProgressAt', () => {
  it('começa em 0 no início do spotlight', () => {
    expect(spotlightProgressAt(AT, AT + ROLL_MS + LAND_MS)).toBe(0);
  });

  it('chega em 1 no fim do ciclo', () => {
    expect(spotlightProgressAt(AT, AT + revealCycleMs())).toBe(1);
  });

  it('fica na metade no meio do spotlight', () => {
    expect(spotlightProgressAt(AT, AT + ROLL_MS + LAND_MS + SPOTLIGHT_MS / 2)).toBeCloseTo(0.5, 5);
  });

  it('fora do spotlight fica preso nos extremos', () => {
    expect(spotlightProgressAt(AT, AT)).toBe(0);
    expect(spotlightProgressAt(AT, AT + 60_000)).toBe(1);
    expect(spotlightProgressAt(null, AT)).toBe(0);
  });
});

describe('countdownPartsOf', () => {
  it('quebra o tempo restante em horas, minutos e segundos', () => {
    const parts = countdownPartsOf(AT + 3_723_000, AT);
    expect(parts).toEqual({ hours: 1, minutes: 2, seconds: 3, done: false });
  });

  it('zera e marca done quando o horário chegou', () => {
    expect(countdownPartsOf(AT, AT)).toEqual({ hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it('horário já passado continua done, sem número negativo na tela', () => {
    expect(countdownPartsOf(AT - 5_000, AT)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      done: true,
    });
  });

  it('sem horário agendado não há contagem', () => {
    expect(countdownPartsOf(null, AT)).toBeNull();
  });

  it('mais de um dia continua contando em horas — o telão não mostra "dias"', () => {
    expect(countdownPartsOf(AT + 30 * 3_600_000, AT)?.hours).toBe(30);
  });
});
