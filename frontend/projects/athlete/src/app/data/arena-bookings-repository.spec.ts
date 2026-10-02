import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  ArenaBookingError,
  bookingFromSnapshot,
  bookingPixPaymentFromResponse,
  bookingPixPaymentPayload,
} from './arena-bookings-repository';

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

describe('bookingPixPaymentPayload', () => {
  it('manda useCashback só quando o toggle está ligado — sem ele o corpo é o de antes', () => {
    expect(
      bookingPixPaymentPayload({ bookingId: 'b1', cpfCnpj: '123.456.789-09', paymentFraction: 1, useCashback: true }),
    ).toEqual({ bookingId: 'b1', cpfCnpj: '12345678909', paymentFraction: 1, useCashback: true });
    expect(bookingPixPaymentPayload({ bookingId: 'b1', paymentFraction: 0.5 })).toEqual({
      bookingId: 'b1',
      paymentFraction: 0.5,
    });
    expect('useCashback' in bookingPixPaymentPayload({ bookingId: 'b1', useCashback: false })).toBeFalse();
  });
});

describe('bookingPixPaymentFromResponse', () => {
  const base = {
    paymentId: 'pay_1',
    qrCode: '00020126BR.GOV.BCB.PIX',
    qrCodeBase64: '',
    expiresAt: '2026-10-12T22:00:00.000Z',
    amountToPayNowReais: 120,
  };

  it('lê o valor cobrado e o cashback aplicado; o preço continua em amountToPayNowReais', () => {
    const pix = bookingPixPaymentFromResponse({ ...base, cashbackAppliedReais: 12.4, chargedReais: 107.6 });
    expect(pix.amountToPayNowReais).toBe(120);
    expect(pix.cashbackAppliedReais).toBe(12.4);
    expect(pix.chargedReais).toBe(107.6);
  });

  it('backend antigo, sem os campos: o QR vale o preço', () => {
    const pix = bookingPixPaymentFromResponse(base);
    expect(pix.cashbackAppliedReais).toBe(0);
    expect(pix.chargedReais).toBe(120);
  });

  it('resposta sem QR é recusada como antes', () => {
    expect(() => bookingPixPaymentFromResponse({ ...base, qrCode: '' })).toThrowError(ArenaBookingError);
  });
});
