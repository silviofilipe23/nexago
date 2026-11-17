import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaRecurringBookingFromDoc, estimateMonthlyReais, recurringCustomerLabel } from './arena-recurring-booking.model';

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

  it('bookedAs professor marca a série de turma própria; ausente = não', () => {
    const prof = arenaRecurringBookingFromDoc(fakeDoc('s7', { bookedAs: 'professor', customerName: 'Marcos · Turma A' }));
    expect(prof.bookedAsProfessor).toBeTrue();
    expect(prof.customerName).toBe('Marcos · Turma A');
    expect(arenaRecurringBookingFromDoc(fakeDoc('s8', {})).bookedAsProfessor).toBeFalse();
    expect(arenaRecurringBookingFromDoc(fakeDoc('s9', { bookedAs: 'athlete' })).bookedAsProfessor).toBeFalse();
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

describe('recurringCustomerLabel — nome do atleta vinculado', () => {
  const athleteId = 'u1AbCdEfGhbqDmz1';

  it('usa o nome resolvido do atleta no lugar do id', () => {
    const names = new Map([[athleteId, 'Ana Souza']]);
    expect(recurringCustomerLabel({ customerName: null, athleteId }, names)).toBe('Ana Souza');
  });

  it('sem nome resolvido ainda, mostra o fim do id (fallback de hoje)', () => {
    expect(recurringCustomerLabel({ customerName: null, athleteId })).toBe('Atleta (…bqDmz1)');
  });

  it('customerName gravado na série continua vencendo', () => {
    const names = new Map([[athleteId, 'Ana Souza']]);
    expect(recurringCustomerLabel({ customerName: 'Professor · Turma', athleteId }, names)).toBe('Professor · Turma');
  });

  it('avulso sem atleta nem nome vira "Mensalista"', () => {
    expect(recurringCustomerLabel({ customerName: null, athleteId: null }, new Map())).toBe('Mensalista');
  });
});
