import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaBookingFromDoc } from './arena-booking.model';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('arenaBookingFromDoc — cupom', () => {
  it('parseia couponCode e couponDiscountReais quando presentes', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b1', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 85,
        couponCode: 'VERAO10',
        couponDiscountReais: 15,
      }),
    );

    expect(booking.couponCode).toBe('VERAO10');
    expect(booking.couponDiscountReais).toBe(15);
  });

  it('reserva sem cupom vira null nos dois campos', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b2', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 100,
      }),
    );

    expect(booking.couponCode).toBeNull();
    expect(booking.couponDiscountReais).toBeNull();
  });

  it('couponCode em branco vira null (mesmo tratamento de optionalTrimmed)', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b3', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        couponCode: '   ',
      }),
    );

    expect(booking.couponCode).toBeNull();
  });
});

describe('arenaBookingFromDoc — observação do gestor', () => {
  it('parseia managerNote da reserva de balcão', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b4', {
        arenaId: 'a1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        customerName: 'João Silva',
        managerNote: 'pagou em dinheiro na recepção',
      }),
    );

    expect(booking.managerNote).toBe('pagou em dinheiro na recepção');
  });

  it('reserva sem observação vira null', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b5', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
      }),
    );

    expect(booking.managerNote).toBeNull();
  });

  it('observação em branco vira null (mesmo tratamento de optionalTrimmed)', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b6', {
        arenaId: 'a1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        managerNote: '   ',
      }),
    );

    expect(booking.managerNote).toBeNull();
  });
});
