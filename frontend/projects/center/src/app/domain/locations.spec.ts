import { daysOutsideWindow, mapsUrl, parseWindowTimes, placeLabel, sessionMoveChecks, windowLabel } from './locations';
import type { CenterLocation } from './models';

const pepe: CenterLocation = {
  id: 'pepe', name: 'Arena Pepê', type: 'partner', address: 'Praia do Pepê, quiosque 12', notes: '', isPrimary: false, status: 'active',
  windows: [{ weekdays: [2, 4], start: '18:00', end: '22:00' }], courtsLabel: 'A, B', contactName: '', contactPhone: '', archivedAt: null,
};
const sede: CenterLocation = { ...pepe, id: 'sede', name: 'Sede Barra', type: 'own', windows: [] };

describe('locations', () => {
  it('rótulos e link de mapa', () => {
    expect(windowLabel(pepe.windows)).toBe('Ter, Qui · 18:00–22:00');
    expect(placeLabel({ locationName: 'Sede Barra', courtName: 'Quadra 2' })).toBe('Sede Barra · Quadra 2');
    expect(placeLabel({ locationName: '', courtName: '' })).toBe('Local a definir');
    expect(mapsUrl('Av. Lúcio Costa, 3300')).toContain('Av.%20L%C3%BAcio%20Costa');
  });

  it('janela contratada só restringe parceiro', () => {
    expect(daysOutsideWindow(pepe, [2, 4], '19:00', 60)).toEqual([]);
    expect(daysOutsideWindow(pepe, [2, 6], '19:00', 60)).toEqual([6]);
    expect(daysOutsideWindow(pepe, [2], '21:30', 60)).toEqual([2]);
    expect(daysOutsideWindow(sede, [6], '05:00', 60)).toEqual([]);
  });

  it('lê janela digitada', () => {
    expect(parseWindowTimes('18:00–22:00')).toEqual({ start: '18:00', end: '22:00' });
    expect(parseWindowTimes('18:00 - 22:00')).toEqual({ start: '18:00', end: '22:00' });
    expect(parseWindowTimes('22:00-18:00')).toBeNull();
  });

  it('checagens de mudar o local de uma aula (L3)', () => {
    // 2026-10-22 é quinta.
    const s = { id: 's', date: '2026-10-22', startTime: '19:00', durationMin: 60, coachUid: 't', courtId: 'q2', locationId: 'sede', status: 'scheduled', className: 'BT B' };
    const prev = { ...s, id: 'p', startTime: '17:45', className: 'BT A', courtId: 'q1' };
    const checks = sessionMoveChecks(s, { location: pepe, courtId: '', courtName: '' }, [s, prev], 30);
    expect(checks.map((c) => [c.label.split(' ')[0], c.ok])).toEqual([
      ['Janela', true],
      ['Agenda', true],
      ['Deslocamento', false],
    ]);
    const own = sessionMoveChecks({ ...s, locationId: 'pepe' }, { location: sede, courtId: 'q1', courtName: 'Quadra 1' }, [{ ...prev, startTime: '19:30' }], 30);
    expect(own.find((c) => c.label.startsWith('Quadra'))!.ok).toBeFalse();
  });
});
