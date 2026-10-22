import { layoutDay, nowOffset, weekDays } from './week-layout';

describe('week-layout', () => {
  it('weekDays começa na segunda', () => {
    const days = weekDays('2026-10-22'); // quinta
    expect(days[0]).toBe('2026-10-19');
    expect(days[6]).toBe('2026-10-25');
  });

  it('posiciona pelo horário a partir das 06h', () => {
    const [b] = layoutDay([{ startTime: '07:30', durationMin: 60 }]);
    expect(b!.top).toBe(90);
    expect(b!.height).toBe(60);
    expect(b!.lanes).toBe(1);
  });

  it('aulas sobrepostas dividem colunas; a seguinte sem sobreposição volta a 1 coluna', () => {
    const r = layoutDay([
      { startTime: '19:00', durationMin: 60, id: 'a' },
      { startTime: '19:30', durationMin: 60, id: 'b' },
      { startTime: '21:00', durationMin: 60, id: 'c' },
    ]);
    const by = (id: string) => r.find((x) => x.item.id === id)!;
    expect(by('a').lane).toBe(0);
    expect(by('b').lane).toBe(1);
    expect(by('a').lanes).toBe(2);
    expect(by('c').lanes).toBe(1);
    expect(by('c').height).toBe(60);
  });

  it('corta fora da faixa e ignora o que não aparece', () => {
    const r = layoutDay([
      { startTime: '05:30', durationMin: 60 },
      { startTime: '21:30', durationMin: 90 },
      { startTime: '23:00', durationMin: 60 },
    ]);
    expect(r.length).toBe(2);
    expect(r[0]!.top).toBe(0);
    expect(r[0]!.height).toBe(30);
    expect(r[1]!.height).toBe(30);
  });

  it('nowOffset', () => {
    expect(nowOffset('17:40')).toBe(11 * 60 + 40);
    expect(nowOffset('05:00')).toBeNull();
  });
});
