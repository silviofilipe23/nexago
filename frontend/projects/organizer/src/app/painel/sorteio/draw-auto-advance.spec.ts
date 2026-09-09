import { crossesPotBoundary, shouldAutoDraw } from './draw-auto-advance';
import { revealCycleMs } from './draw-reveal-phase';

const AT = 1_700_000_000_000;
const INTERVAL = 6000;
/** Instante em que o ciclo da última revelação terminou. */
const AFTER_CYCLE = AT + revealCycleMs();

const base = {
  playing: true,
  lastRevealAt: AT as number | null,
  intervalMs: INTERVAL,
  now: AFTER_CYCLE + INTERVAL,
  pending: false,
  done: false,
};

describe('shouldAutoDraw', () => {
  it('dispara quando o ciclo terminou e o intervalo passou', () => {
    expect(shouldAutoDraw(base)).toBe(true);
  });

  it('não dispara com o automático pausado', () => {
    expect(shouldAutoDraw({ ...base, playing: false })).toBe(false);
  });

  it('NÃO dispara durante o show da revelação anterior', () => {
    // O ponto: o intervalo conta a partir do FIM do ciclo, não do começo. Sem
    // isso, um intervalo de 3 s atropelaria o spotlight de 3,5 s e a revelação
    // seguinte entraria por cima da anterior no telão.
    expect(shouldAutoDraw({ ...base, now: AT + 1000, intervalMs: 500 })).toBe(false);
  });

  it('espera o intervalo mesmo com o ciclo já encerrado', () => {
    expect(shouldAutoDraw({ ...base, now: AFTER_CYCLE + INTERVAL - 1 })).toBe(false);
  });

  it('não dispara com uma chamada em voo — senão sortearia duas vezes', () => {
    expect(shouldAutoDraw({ ...base, pending: true })).toBe(false);
  });

  it('não dispara com o sorteio encerrado', () => {
    expect(shouldAutoDraw({ ...base, done: true })).toBe(false);
  });

  it('sem revelação nenhuma, a primeira sai assim que o automático liga', () => {
    expect(shouldAutoDraw({ ...base, lastRevealAt: null })).toBe(true);
  });
});

describe('crossesPotBoundary', () => {
  const pots = [
    { index: 1, teamIds: ['a', 'b'] },
    { index: 2, teamIds: ['c', 'd'] },
  ];

  it('a revelação seguinte à última do pote 1 abre o pote 2', () => {
    expect(crossesPotBoundary(pots, 2)).toBe(true);
  });

  it('dentro do mesmo pote não há fronteira', () => {
    expect(crossesPotBoundary(pots, 1)).toBe(false);
    expect(crossesPotBoundary(pots, 3)).toBe(false);
  });

  it('a primeira revelação de todas não é fronteira — o pote 1 está começando', () => {
    expect(crossesPotBoundary(pots, 0)).toBe(false);
  });

  it('o fim do sorteio não é fronteira de pote', () => {
    expect(crossesPotBoundary(pots, 4)).toBe(false);
  });

  it('pote único nunca tem fronteira — é o caso da dupla eliminatória', () => {
    expect(crossesPotBoundary([{ index: 1, teamIds: ['a', 'b', 'c'] }], 1)).toBe(false);
  });
});
