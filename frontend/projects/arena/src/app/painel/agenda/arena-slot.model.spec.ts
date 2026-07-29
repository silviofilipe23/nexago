import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaSlotFromDoc } from './arena-slot.model';

/** O dia de calendário de um slot é definido pelos componentes LOCAIS da data — mesma regra
 *  do app Flutter (`ArenaSlot._parseDate`) e da lib compartilhada do atleta. Converter
 *  Timestamp via ISO/UTC desloca o dia pra frente quando o horário local passa de 21h (BRT). */

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('arenaSlotFromDoc — dateKey', () => {
  it('string YYYY-MM-DD passa direto', () => {
    const slot = arenaSlotFromDoc(
      fakeDoc('s1', { arenaId: 'a1', courtId: 'c1', date: '2026-07-29', startTime: '18:00', endTime: '19:00', status: 'blocked' }),
    );
    expect(slot.dateKey).toBe('2026-07-29');
  });

  it('Timestamp usa o dia LOCAL, não o dia UTC', () => {
    // 29/07 22:00 local (BRT) = 30/07 01:00 UTC — o dia de calendário é 29.
    const slot = arenaSlotFromDoc(
      fakeDoc('s2', {
        arenaId: 'a1',
        courtId: 'c1',
        date: Timestamp.fromDate(new Date(2026, 6, 29, 22, 0)),
        startTime: '22:00',
        endTime: '23:00',
        status: 'booked',
      }),
    );
    expect(slot.dateKey).toBe('2026-07-29');
  });

  it('Timestamp de meia-noite local mantém o mesmo dia', () => {
    const slot = arenaSlotFromDoc(
      fakeDoc('s3', {
        arenaId: 'a1',
        courtId: 'c1',
        date: Timestamp.fromDate(new Date(2026, 6, 29)),
        startTime: '08:00',
        endTime: '09:00',
        status: 'blocked',
      }),
    );
    expect(slot.dateKey).toBe('2026-07-29');
  });
});
