import { findConflicts, occurrences, overlaps, suggestAlternatives, type ClassRule } from './schedule';

const base: ClassRule = {
  id: 'new',
  name: 'BT Intermediário C',
  coachUid: 'thiago',
  courtId: 'q2',
  weekdays: [2, 4],
  startTime: '19:00',
  durationMin: 60,
  startDate: '2026-11-03',
  endDate: null,
};

const existing: ClassRule[] = [
  { ...base, id: 'c2', name: 'BT Intermediário B', startDate: '2026-09-01', status: 'active' },
  { ...base, id: 'c1', name: 'BT Iniciante A', coachUid: 'juliana', courtId: 'q1', weekdays: [1, 3], startTime: '07:00', status: 'active' },
];

describe('schedule', () => {
  it('sobreposição de horário é estrita (fim de uma = início da outra não conflita)', () => {
    expect(overlaps('19:00', 60, '19:30', 60)).toBeTrue();
    expect(overlaps('19:00', 60, '20:00', 60)).toBeFalse();
    expect(overlaps('18:00', 90, '19:00', 60)).toBeTrue();
  });

  it('acusa conflito de professor e de quadra (W14)', () => {
    const c = findConflicts(base, existing);
    expect(c.map((x) => x.kind).sort()).toEqual(['coach', 'court']);
    expect(c[0]!.otherClassName).toBe('BT Intermediário B');
    expect(c[0]!.weekdays).toEqual([2, 4]);
  });

  it('ignora a própria turma, turmas encerradas e vigências que não se cruzam', () => {
    expect(findConflicts({ ...base, id: 'c2' }, existing)).toEqual([]);
    expect(findConflicts(base, [{ ...existing[0]!, status: 'closed' }])).toEqual([]);
    expect(findConflicts(base, [{ ...existing[0]!, endDate: '2026-10-31' }])).toEqual([]);
  });

  it('sugere alternativas sem conflito', () => {
    const s = suggestAlternatives(
      base,
      existing,
      [
        { id: 'q1', name: 'Quadra 1' },
        { id: 'q2', name: 'Quadra 2' },
      ],
      [
        { uid: 'thiago', name: 'Thiago Mendes' },
        { uid: 'juliana', name: 'Juliana Rocha' },
      ],
    );
    expect(s.length).toBeGreaterThan(0);
    for (const sug of s) {
      expect(findConflicts({ ...base, ...sug.patch }, existing)).toEqual([]);
    }
  });

  it('gera as datas da regra dentro da vigência', () => {
    // 03/11/2026 é terça.
    expect(occurrences(base, '2026-11-01', '2026-11-12')).toEqual(['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']);
    expect(occurrences({ ...base, endDate: '2026-11-05' }, '2026-11-01', '2026-11-30')).toEqual(['2026-11-03', '2026-11-05']);
  });
});
