import { DEFAULT_BROADCAST_LANCES, lanceContagemOf, lanceDisparo, lancesFromRaw } from './broadcast-lances';

describe('broadcast-lances', () => {
  it('lê valores inválidos como o padrão', () => {
    expect(lancesFromRaw(null)).toEqual(DEFAULT_BROADCAST_LANCES);
    const l = lancesFromRaw({ seq: 4, tipo: 'nada', lado: 1, atleta: 9, seg: 999, contagem: 7 });
    expect(l.tipo).toBeNull();
    expect(l.lado).toBe(1);
    expect(l.atleta).toBe(0);
    expect(l.seg).toBe(60);
    expect(l.contagem).toBe('{}');
  });

  it('cada disparo sobe o seq e a contagem do atleta', () => {
    const a = lanceDisparo(DEFAULT_BROADCAST_LANCES, { tipo: 'block', lado: 0, atleta: 1 });
    expect(a.seq).toBe(1);
    expect(a.count).toBe(1);
    const b = lanceDisparo({ ...DEFAULT_BROADCAST_LANCES, ...a, at: null }, { tipo: 'block', lado: 0, atleta: 1 });
    expect(b.seq).toBe(2);
    expect(b.count).toBe(2);
    const c = lanceDisparo({ ...DEFAULT_BROADCAST_LANCES, ...b, at: null }, { tipo: 'block', lado: 1, atleta: 0 });
    expect(c.count).toBe(1);
    expect(lanceContagemOf(c.contagem)).toEqual({ 'block|0|1': 2, 'block|1|0': 1 });
  });

  it('rally e on fire carregam o número e não contam por atleta', () => {
    const r = lanceDisparo(DEFAULT_BROADCAST_LANCES, { tipo: 'rally', lado: 1, atleta: 1, n: 18 });
    expect(r).toEqual(jasmine.objectContaining({ n: 18, count: 18, atleta: 0, contagem: '{}' }));
  });

  it('contagem corrompida vira vazia', () => {
    expect(lanceContagemOf('{x')).toEqual({});
    expect(lanceContagemOf('[1]')).toEqual({});
  });
});
