import { telasDiaLabelOf, telasRelogioOf } from './overlay-telas';

const NOW = Date.UTC(2026, 9, 7, 15, 0, 0);

describe('overlay-telas', () => {
  it('relógio MM:SS, progresso e arredondamento pra cima', () => {
    const inicio = new Date(NOW - 45_000);
    const r = telasRelogioOf(inicio, 600, NOW)!;
    expect(r.chars.join('')).toBe('09:15');
    expect(r.zerou).toBeFalse();
    expect(r.progresso).toBeCloseTo(0.075, 3);
    expect(telasRelogioOf(new Date(NOW), 600, NOW)!.chars.join('')).toBe('10:00');
  });

  it('zera sem passar de 00:00 e a barra fecha', () => {
    const r = telasRelogioOf(new Date(NOW - 700_000), 600, NOW)!;
    expect(r.zerou).toBeTrue();
    expect(r.chars.join('')).toBe('00:00');
    expect(r.progresso).toBe(1);
  });

  it('sem início ou sem duração não há contagem', () => {
    expect(telasRelogioOf(null, 600, NOW)).toBeNull();
    expect(telasRelogioOf(new Date(NOW), 0, NOW)).toBeNull();
  });

  it('dia do evento e fase do primeiro jogo', () => {
    const inicio = new Date(2026, 9, 6, 8);
    const hoje = new Date(2026, 9, 7, 15).getTime();
    expect(telasDiaLabelOf(inicio, 'Quartas de final', hoje)).toBe('Dia 2 · Quartas de final');
    expect(telasDiaLabelOf(inicio, null, hoje)).toBe('Dia 2');
    expect(telasDiaLabelOf(null, 'Semifinal', hoje)).toBe('Semifinal');
    expect(telasDiaLabelOf(null, '  ', hoje)).toBeNull();
    expect(telasDiaLabelOf(new Date(2026, 9, 9), null, hoje)).toBe('Dia 1'); // evento ainda não começou
  });
});
