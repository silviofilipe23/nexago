import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { arenaSlotFromFirestore, sameCalendarDay } from '@nexago/arena-discovery';

/** Regressão: `arenaSlots` grava `date` como string `YYYY-MM-DD` (Cloud Functions e painel
 *  da arena). Parse via `Date.parse` interpreta a string como meia-noite UTC, que em
 *  fusos negativos (Brasil, UTC-3) cai no dia ANTERIOR — slot bloqueado/reservado no dia D
 *  aparecia no dia D-1 na página de reservar do atleta, divergindo da agenda da arena. */

function fakeSnapshot(id: string, data: Record<string, unknown>): DocumentSnapshot<DocumentData> {
  return {
    id,
    data: () => data,
  } as unknown as DocumentSnapshot<DocumentData>;
}

describe('arenaSlotFromFirestore — date string YYYY-MM-DD', () => {
  it('mantém o dia do calendário no fuso local (sem deslocar pra véspera)', () => {
    const slot = arenaSlotFromFirestore(
      fakeSnapshot('s1', {
        arenaId: 'a1',
        courtId: 'c1',
        date: '2026-07-29',
        startTime: '18:00',
        endTime: '19:00',
        status: 'blocked',
      }),
    );

    expect(slot).not.toBeNull();
    expect(slot!.date.getFullYear()).toBe(2026);
    expect(slot!.date.getMonth()).toBe(6); // julho (0-based)
    expect(slot!.date.getDate()).toBe(29);
  });

  it('casa com o mesmo dia solicitado na consulta de slots', () => {
    const slot = arenaSlotFromFirestore(
      fakeSnapshot('s2', {
        arenaId: 'a1',
        courtId: 'c1',
        date: '2026-07-29',
        startTime: '18:00',
        endTime: '19:00',
        status: 'booked',
      }),
    );

    const requestedDay = new Date(2026, 6, 29);
    expect(sameCalendarDay(slot!.date, requestedDay)).toBeTrue();
  });

  it('aceita string ISO com hora, ignorando a parte de tempo', () => {
    const slot = arenaSlotFromFirestore(
      fakeSnapshot('s3', {
        arenaId: 'a1',
        courtId: 'c1',
        date: '2026-07-29T00:00:00.000Z',
        startTime: '08:00',
        endTime: '09:00',
        status: 'available',
      }),
    );

    expect(slot!.date.getDate()).toBe(29);
    expect(slot!.date.getMonth()).toBe(6);
  });
});
