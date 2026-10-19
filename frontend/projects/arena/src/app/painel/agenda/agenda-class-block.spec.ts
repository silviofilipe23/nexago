import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaBookingFromDoc } from '../bookings/arena-booking.model';
import { isClassBlock } from './panel-agenda.component';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe('bloqueio de aula na agenda de reservas', () => {
  it('booking de aula traz o id da aula; reserva comum não', () => {
    const aula = arenaBookingFromDoc(
      fakeDoc('class_c1_2026-10-26', { isClassSession: true, classSessionId: 'class_c1_2026-10-26', source: 'class' }),
    );
    expect(aula.classSessionId).toBe('class_c1_2026-10-26');
    expect(arenaBookingFromDoc(fakeDoc('b1', { athleteId: 'u1' })).classSessionId).toBeNull();
  });

  it('reconhece a aula pelo booking ou, sem ele carregado, pelo id do slot', () => {
    expect(isClassBlock({ bookingId: 'b1' }, { classSessionId: 'class_c1_2026-10-26' })).toBeTrue();
    expect(isClassBlock({ bookingId: 'class_c1_2026-10-26' }, null)).toBeTrue();
    expect(isClassBlock({ bookingId: 'b1' }, { classSessionId: null })).toBeFalse();
    expect(isClassBlock({ bookingId: null }, null)).toBeFalse();
  });
});
