import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaBookingFromDoc, formatMemberMinutes, memberHoursFields } from './arena-booking.model';

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

describe('arenaBookingFromDoc — esporte', () => {
  const base = {
    arenaId: 'a1',
    athleteId: 'u1',
    courtId: 'c1',
    date: '2026-10-20',
    startTime: '19:00',
    endTime: '20:00',
  };

  it('rótulo do esporte escolhido pelo atleta', () => {
    expect(arenaBookingFromDoc(fakeDoc('b1', { ...base, sport: 'beachTennis' })).sportLabel).toBe('Beach tennis');
    expect(arenaBookingFromDoc(fakeDoc('b2', { ...base, sport: 'Pickleball' })).sportLabel).toBe('Pickleball');
  });

  it('reserva sem esporte (antiga, manual) fica null', () => {
    expect(arenaBookingFromDoc(fakeDoc('b3', base)).sportLabel).toBeNull();
    expect(arenaBookingFromDoc(fakeDoc('b4', { ...base, sport: null })).sportLabel).toBeNull();
  });
});

describe('banco de horas do mensalista na reserva', () => {
  it('lê os minutos e o desconto; ausente = 0', () => {
    expect(memberHoursFields({})).toEqual({ memberHoursMinutes: 0, memberHoursDiscountReais: null });
    expect(memberHoursFields({ memberHoursMinutes: 90, memberHoursDiscountReais: 225 })).toEqual({
      memberHoursMinutes: 90,
      memberHoursDiscountReais: 225,
    });
  });

  it('formata as horas', () => {
    expect(formatMemberMinutes(90)).toBe('1h30');
    expect(formatMemberMinutes(60)).toBe('1h');
    expect(formatMemberMinutes(30)).toBe('30min');
    expect(formatMemberMinutes(180)).toBe('3h');
  });
});
