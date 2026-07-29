import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { bookingFromSnapshot } from './arena-bookings-repository';

function fakeSnapshot(id: string, data: Record<string, unknown> | undefined): DocumentSnapshot<DocumentData> {
  return {
    id,
    data: () => data,
  } as unknown as DocumentSnapshot<DocumentData>;
}

describe('bookingFromSnapshot — cupom', () => {
  it('parseia couponCode e couponDiscountReais quando presentes', () => {
    const booking = bookingFromSnapshot(
      fakeSnapshot('b1', {
        arenaId: 'a1',
        arenaName: 'Arena Beach',
        courtId: 'c1',
        courtName: 'Quadra 1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 85,
        couponCode: 'VERAO10',
        couponDiscountReais: 15,
      }),
    );

    expect(booking?.couponCode).toBe('VERAO10');
    expect(booking?.couponDiscountReais).toBe(15);
  });

  it('reserva sem cupom: couponCode null e couponDiscountReais zero', () => {
    const booking = bookingFromSnapshot(
      fakeSnapshot('b2', {
        arenaId: 'a1',
        arenaName: 'Arena Beach',
        courtId: 'c1',
        courtName: 'Quadra 1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 100,
      }),
    );

    expect(booking?.couponCode).toBeNull();
    expect(booking?.couponDiscountReais).toBe(0);
  });
});
