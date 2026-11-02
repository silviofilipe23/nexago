import { DEFAULT_BROADCAST_LANCES, lanceContagemOf, lanceDisparo, lancesDoEsporte, lancesFromRaw, lanceTirada } from './broadcast-lances';

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

  it('tirar do ar sobe o seq sem tipo e mantém contagem, lado e tarja', () => {
    const atual = { ...DEFAULT_BROADCAST_LANCES, seq: 5, tipo: 'ace' as const, lado: 1 as const, seg: 10, contagem: '{"ace|1|0":2}', at: new Date() };
    expect(lanceTirada(atual)).toEqual({ seq: 6, tipo: null, lado: 1, atleta: 0, n: 0, count: 0, seg: 10, contagem: '{"ace|1|0":2}' });
  });

  it('Shark Attack só no futevôlei; o resto em todo esporte', () => {
    expect(lancesDoEsporte('footvolley')).toContain('shark');
    expect(lancesDoEsporte('Futevôlei')).toContain('shark');
    for (const sport of ['beachVolleyball', 'indoorVolleyball', 'beachTennis', null, undefined]) {
      expect(lancesDoEsporte(sport)).not.toContain('shark');
      expect(lancesDoEsporte(sport)).toEqual(['block', 'ace', 'fire', 'dig', 'cachorra', 'rally', 'onfire']);
    }
  });
});
