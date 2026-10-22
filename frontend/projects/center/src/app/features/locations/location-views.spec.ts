import type { ClassSession } from '../../domain/models';
import { locationsSubtitle, locationUsage, weekByLocation, windowsFromDrafts } from './location-views';

type S = Pick<ClassSession, 'id' | 'locationId' | 'date' | 'startTime' | 'status'>;
const s = (id: string, date: string, startTime: string, locationId: string, status: S['status'] = 'scheduled'): S => ({ id, date, startTime, locationId, status });

describe('location-views', () => {
  it('locationUsage conta aulas futuras marcadas e turmas vivas do local', () => {
    const sessions = [s('a', '2026-10-21', '07:00', 'pepe'), s('b', '2026-10-22', '07:00', 'pepe'), s('c', '2026-10-23', '07:00', 'pepe', 'cancelled'), s('d', '2026-10-24', '07:00', 'sede')];
    const classes = [
      { locationId: 'pepe', status: 'active' as const },
      { locationId: 'pepe', status: 'closed' as const },
      { locationId: 'pepe', status: 'draft' as const },
    ];
    expect(locationUsage('pepe', classes, sessions, '2026-10-22')).toEqual({ futureSessions: 1, classes: 2 });
  });

  it('locationsSubtitle agrupa ativos por tipo e soma arquivados', () => {
    expect(locationsSubtitle([])).toBe('Nenhum local cadastrado');
    expect(
      locationsSubtitle([
        { type: 'own', status: 'active' },
        { type: 'partner', status: 'active' },
        { type: 'partner', status: 'active' },
        { type: 'own', status: 'archived' },
      ]),
    ).toBe('1 próprio · 2 parceiros · 1 arquivado');
  });

  it('weekByLocation ordena por horário, marca troca de local e esconde domingo vazio', () => {
    const week = weekByLocation(
      [
        s('2', '2026-10-19', '19:00', 'b'),
        s('1', '2026-10-19', '07:00', 'a'),
        s('3', '2026-10-19', '20:00', 'b'),
        s('4', '2026-10-20', '07:00', 'a', 'cancelled'),
        s('5', '2026-10-26', '07:00', 'a'),
      ],
      '2026-10-19',
    );
    expect(week.days.length).toBe(6);
    expect(week.days[0]!.items.map((i) => [i.session.id, i.moved])).toEqual([
      ['1', false],
      ['2', true],
      ['3', false],
    ]);
    expect(week.days[1]!.items).toEqual([]);
    expect(week.perLocation.get('a')).toBe(1);
    expect(week.perLocation.get('b')).toBe(2);
  });

  it('weekByLocation: troca de local é por professor', () => {
    const t = (id: string, startTime: string, loc: string, coachUid: string) => ({ ...s(id, '2026-10-19', startTime, loc), coachUid });
    const week = weekByLocation([t('1', '07:00', 'a', 'ana'), t('2', '08:00', 'b', 'bia'), t('3', '19:00', 'a', 'bia'), t('4', '20:00', 'a', 'ana')], '2026-10-19');
    expect(week.days[0]!.items.map((i) => [i.session.id, i.moved])).toEqual([
      ['1', false],
      ['2', false],
      ['3', true],
      ['4', false],
    ]);
  });

  it('weekByLocation mostra domingo com aula', () => {
    expect(weekByLocation([s('x', '2026-10-25', '08:00', 'a')], '2026-10-19').days.length).toBe(7);
  });

  it('windowsFromDrafts valida dia e horário', () => {
    expect(windowsFromDrafts([{ weekdays: [4, 2], times: '18:00-22:00' }])).toEqual({ windows: [{ weekdays: [2, 4], start: '18:00', end: '22:00' }] });
    expect(windowsFromDrafts([{ weekdays: [], times: '18:00–22:00' }])).toEqual({ error: 'Janela: escolha pelo menos um dia.' });
    expect('error' in windowsFromDrafts([{ weekdays: [1], times: '22:00–18:00' }])).toBeTrue();
    expect(windowsFromDrafts([])).toEqual({ windows: [] });
  });
});
