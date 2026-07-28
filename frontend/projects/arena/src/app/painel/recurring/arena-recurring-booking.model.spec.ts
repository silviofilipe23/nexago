import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaRecurringBookingFromDoc, estimateMonthlyReais } from './arena-recurring-booking.model';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('arenaRecurringBookingFromDoc — status/pagamento/pausa', () => {
  it('status paused é reconhecido (hoje só active/canceled eram tratados)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s1', { status: 'paused' }));
    expect(s.status).toBe('paused');
  });

  it('status desconhecido cai em active (mesmo fallback de hoje)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s2', { status: 'algo-invalido' }));
    expect(s.status).toBe('active');
  });

  it('doc antigo sem paymentType vira per_occurrence (retrocompatibilidade)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s3', {}));
    expect(s.paymentType).toBe('per_occurrence');
  });

  it('paymentType monthly é preservado', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s4', { paymentType: 'monthly' }));
    expect(s.paymentType).toBe('monthly');
  });

  it('pausedAt vira Date quando é Timestamp, e null quando ausente', () => {
    const when = new Date('2026-07-20T12:00:00Z');
    const paused = arenaRecurringBookingFromDoc(fakeDoc('s5', { pausedAt: Timestamp.fromDate(when) }));
    const notPaused = arenaRecurringBookingFromDoc(fakeDoc('s6', {}));
    expect(paused.pausedAt?.getTime()).toBe(when.getTime());
    expect(notPaused.pausedAt).toBeNull();
  });
});

describe('estimateMonthlyReais', () => {
  it('multiplica pela média de ocorrências por mês (~4,33)', () => {
    expect(estimateMonthlyReais(100)).toBeCloseTo(433.33, 1);
  });

  it('valor zero ou negativo retorna 0', () => {
    expect(estimateMonthlyReais(0)).toBe(0);
    expect(estimateMonthlyReais(-10)).toBe(0);
  });
});
