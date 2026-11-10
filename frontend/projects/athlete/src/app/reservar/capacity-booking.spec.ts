import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  COURT_BOOKING_ALLOCATION,
  COURT_ON_ARRIVAL_LABEL,
  athleteVisibleCourtName,
  bookingAllocationFromFirestore,
  buildCapacityTimes,
  capacityCandidateCourts,
  capacityChainFor,
  capacityDurationOptions,
  capacityPriceFor,
  capacitySports,
  capacityTimeIsLastSpots,
  shouldUseCapacityGrid,
  type ArenaBookingAllocation,
  type ArenaCourtDoc,
  type ArenaSlot,
} from '@nexago/arena-discovery';
import {
  bookingFromSnapshot,
  callablePayload,
  pendingBookingMatchesArgs,
  type ArenaBookingArgs,
  type ArenaBookingDoc,
} from '../data/arena-bookings-repository';
import { bookingResumePaymentParams } from './booking-resume-params';

/** Arena "a arena define a quadra" no portal do atleta (`docs/product/reservas-por-capacidade.md`). */

const day = new Date(2030, 10, 8);
const earlyMorning = new Date(2030, 10, 8, 6);

function court(id: string, data: Record<string, unknown> = {}): ArenaCourtDoc {
  return { id, name: `Quadra ${id}`, data: { types: ['beachTennis'], ...data } };
}

function slot(courtId: string, start: string, end: string, rawStatus = 'available'): ArenaSlot {
  return {
    id: `${courtId}-${start}`,
    arenaId: 'a1',
    courtId,
    date: day,
    startTime: start,
    endTime: end,
    rawStatus,
    priceReais: 70,
    basePriceReais: 70,
    appliedPromotionId: null,
    isVirtual: true,
  };
}

const allocation: ArenaBookingAllocation = {
  isCapacity: true,
  courtIds: ['c2', 'c1', 'c3', 'c4'],
  priceBySport: { beachTennis: 120 },
  revealBeforeArrival: false,
  allowCourtChoice: false,
};

describe('bookingAllocationFromFirestore', () => {
  it('ausente ou modo court = quadra escolhida', () => {
    expect(bookingAllocationFromFirestore(undefined)).toEqual(COURT_BOOKING_ALLOCATION);
    expect(bookingAllocationFromFirestore({ mode: 'court', courtIds: ['c1'] }).isCapacity).toBeFalse();
  });

  it('modo capacity lê quadras, preços válidos e opções', () => {
    const a = bookingAllocationFromFirestore({
      mode: 'capacity',
      courtIds: ['c1', ' ', 'c2'],
      priceBySport: { beachTennis: 120, footvolley: 0, x: 'abc' },
      revealBeforeArrival: true,
      allowCourtChoice: true,
    });
    expect(a).toEqual({
      isCapacity: true,
      courtIds: ['c1', 'c2'],
      priceBySport: { beachTennis: 120 },
      revealBeforeArrival: true,
      allowCourtChoice: true,
    });
  });
});

describe('shouldUseCapacityGrid', () => {
  it('arena de sempre usa a grade por quadra', () => {
    expect(shouldUseCapacityGrid(COURT_BOOKING_ALLOCATION)).toBeFalse();
  });

  it('arena que define a quadra usa a grade por horário, mesmo vindo com quadra', () => {
    expect(shouldUseCapacityGrid(allocation)).toBeTrue();
    expect(shouldUseCapacityGrid(allocation, { initialCourtId: 'c1' })).toBeTrue();
  });

  it('modo misto: escolher a quadra (ou chegar com uma) vai para a grade por quadra', () => {
    const mixed = { ...allocation, allowCourtChoice: true };
    expect(shouldUseCapacityGrid(mixed)).toBeTrue();
    expect(shouldUseCapacityGrid(mixed, { forceCourtChoice: true })).toBeFalse();
    expect(shouldUseCapacityGrid(mixed, { initialCourtId: 'c1' })).toBeFalse();
  });
});

describe('quadras e esportes da grade por horário', () => {
  it('ordem da distribuição; manutenção, fora da lista e outro esporte saem', () => {
    const courts = [
      court('c1'),
      court('c2'),
      court('c3', { status: 'maintenance' }),
      court('c4', { types: ['footvolley'] }),
      court('c5'),
    ];
    expect(capacityCandidateCourts(allocation, courts, 'beachTennis').map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('esportes: só os com preço e quadra', () => {
    const two = { ...allocation, courtIds: [], priceBySport: { beachTennis: 120, footvolley: 100 } };
    expect(capacitySports(two, [court('c1')])).toEqual(['beachTennis']);
  });
});

describe('buildCapacityTimes', () => {
  const candidates = [court('c1'), court('c2'), court('c3')];

  it('conta as quadras livres por horário', () => {
    const times = buildCapacityTimes({
      daySlots: [
        slot('c1', '18:00', '19:00'),
        slot('c2', '18:00', '19:00', 'booked'),
        slot('c3', '18:00', '19:00'),
        slot('c1', '19:00', '20:00', 'booked'),
        slot('c2', '19:00', '20:00', 'blocked'),
        slot('c3', '19:00', '20:00', 'booked'),
      ],
      candidates,
      durationMinutes: 60,
      day,
      now: earlyMorning,
    });
    expect(times.map((t) => [t.startTime, t.endTime, t.freeCourts])).toEqual([
      ['18:00', '19:00', 2],
      ['19:00', '20:00', 0],
    ]);
  });

  it('2 horas exigem a mesma quadra livre nas duas', () => {
    const times = buildCapacityTimes({
      daySlots: [
        slot('c1', '18:00', '19:00'),
        slot('c1', '19:00', '20:00', 'booked'),
        slot('c2', '18:00', '19:00', 'booked'),
        slot('c2', '19:00', '20:00'),
        slot('c3', '18:00', '19:00'),
        slot('c3', '19:00', '20:00'),
      ],
      candidates,
      durationMinutes: 120,
      day,
      now: earlyMorning,
    });
    expect(times.map((t) => [t.startTime, t.endTime, t.freeCourts, t.slotStartTimes])).toEqual([
      ['18:00', '20:00', 1, ['18:00', '19:00']],
    ]);
  });

  it('hoje: horário já começado sai', () => {
    const times = buildCapacityTimes({
      daySlots: [slot('c1', '08:00', '09:00'), slot('c1', '20:00', '21:00')],
      candidates,
      durationMinutes: 60,
      day,
      now: new Date(2030, 10, 8, 8, 30),
    });
    expect(times.map((t) => t.startTime)).toEqual(['20:00']);
  });

  it('últimas vagas: até 2 quadras livres', () => {
    const base = { startTime: '18:00', endTime: '19:00', totalCourts: 15, slotStartTimes: [] };
    expect(capacityTimeIsLastSpots({ ...base, freeCourts: 2 })).toBeTrue();
    expect(capacityTimeIsLastSpots({ ...base, freeCourts: 8 })).toBeFalse();
    expect(capacityTimeIsLastSpots({ ...base, freeCourts: 0 })).toBeFalse();
  });
});

describe('preço, duração e cadeia sem quadra', () => {
  it('preço do horário proporcional à duração', () => {
    expect(capacityPriceFor(allocation, 'beachTennis', 60)).toBe(120);
    expect(capacityPriceFor(allocation, 'beachTennis', 90)).toBe(180);
    expect(capacityPriceFor(allocation, 'footvolley', 60)).toBeNull();
  });

  it('durações em passos da grade, até 3 h', () => {
    expect(capacityDurationOptions([court('c1')])).toEqual([60, 120, 180]);
    expect(capacityDurationOptions([court('c1', { slotDurationMinutes: 30 })])).toEqual([30, 60, 90, 120, 150, 180]);
  });

  it('cadeia sai de uma quadra livre, sem quadra e com o preço do horário', () => {
    const chain = capacityChainFor({
      allocation,
      sport: 'beachTennis',
      daySlots: [slot('c1', '18:00', '19:00', 'booked'), slot('c2', '18:00', '19:00')],
      candidates: [court('c1'), court('c2')],
      day,
      startTime: '18:00',
      durationMinutes: 60,
    });
    expect(chain?.map((s) => [s.startTime, s.courtId, s.priceReais])).toEqual([['18:00', '', 120]]);
  });

  it('horário lotado: sem cadeia', () => {
    const chain = capacityChainFor({
      allocation,
      sport: 'beachTennis',
      daySlots: [slot('c1', '18:00', '19:00', 'booked')],
      candidates: [court('c1')],
      day,
      startTime: '18:00',
      durationMinutes: 60,
    });
    expect(chain).toBeNull();
  });
});

describe('reserva sem quadra no repositório', () => {
  const args: ArenaBookingArgs = {
    arenaId: 'a1',
    arenaName: 'Arena CFC',
    courtId: '',
    courtName: '',
    dateKey: '2030-11-08',
    startTime: '18:00',
    endTime: '19:00',
    selectedSlotStartTimes: ['18:00'],
    capacity: true,
    sport: 'beachTennis',
  };

  it('payload vai sem quadra, com allocation e esporte', () => {
    const payload = callablePayload(args);
    expect(payload['allocation']).toBe('capacity');
    expect(payload['sport']).toBe('beachTennis');
    expect('courtId' in payload).toBeFalse();
    expect('courtName' in payload).toBeFalse();
  });

  it('reserva comum segue mandando a quadra', () => {
    const payload = callablePayload({ ...args, capacity: false, courtId: 'c1', courtName: 'Quadra 1' });
    expect(payload['courtId']).toBe('c1');
    expect('allocation' in payload).toBeFalse();
  });

  function snapshot(data: Record<string, unknown>): DocumentSnapshot<DocumentData> {
    return { id: 'b1', data: () => data } as unknown as DocumentSnapshot<DocumentData>;
  }

  const pending: Record<string, unknown> = {
    arenaId: 'a1',
    courtId: 'c7',
    courtName: 'Quadra 7',
    sport: 'beachTennis',
    date: '2030-11-08',
    startTime: '18:00',
    endTime: '19:00',
    allocationStatus: 'unassigned',
    allocationSource: 'auto',
  };

  it('a provisória não aparece para o atleta', () => {
    const b = bookingFromSnapshot(snapshot(pending))!;
    expect(b.courtName).toBe(COURT_ON_ARRIVAL_LABEL);
    expect(b.allocationStatus).toBe('unassigned');
    expect(bookingFromSnapshot(snapshot({ ...pending, allocationStatus: undefined }))!.courtName).toBe('Quadra 7');
  });

  it('retomada do Pix casa a pendente sem quadra do mesmo esporte e horário', () => {
    const b = bookingFromSnapshot(snapshot(pending))!;
    expect(pendingBookingMatchesArgs(b, args)).toBeTrue();
    expect(pendingBookingMatchesArgs({ ...b, sport: 'footvolley' }, args)).toBeFalse();
    expect(pendingBookingMatchesArgs({ ...b, allocationStatus: 'assigned' }, args)).toBeFalse();
  });

  it('"Concluir pagamento" de reserva sem quadra volta pela grade por horário', () => {
    const b = bookingFromSnapshot(snapshot(pending))! as ArenaBookingDoc;
    expect(bookingResumePaymentParams(b)).toEqual({
      allocation: 'capacity',
      sport: 'beachTennis',
      date: '2030-11-08',
      time: '18:00',
      minutes: 60,
    });
    expect(bookingResumePaymentParams({ ...b, allocationStatus: null })).toEqual({
      courtId: 'c7',
      date: '2030-11-08',
      time: '18:00',
      duration: 1,
    });
  });
});

describe('athleteVisibleCourtName', () => {
  const assigned = {
    courtName: 'Quadra 7',
    date: '2030-11-08',
    startTime: '19:00',
    allocationStatus: 'assigned',
    allocationSource: 'staff',
    revealCourtBeforeArrival: false,
  };

  it('definida pela recepção numa arena que só mostra na chegada: escondida até o início', () => {
    expect(athleteVisibleCourtName(assigned, 'Quadra 7', new Date(2030, 10, 8, 18))).toBe(COURT_ON_ARRIVAL_LABEL);
    expect(athleteVisibleCourtName(assigned, 'Quadra 7', new Date(2030, 10, 8, 19))).toBe('Quadra 7');
  });

  it('arena que mostra antes, ou quadra escolhida pelo atleta: aparece', () => {
    const before = new Date(2030, 10, 8, 18);
    expect(athleteVisibleCourtName({ ...assigned, revealCourtBeforeArrival: true }, 'Quadra 7', before)).toBe('Quadra 7');
    expect(athleteVisibleCourtName({ ...assigned, allocationSource: 'athlete' }, 'Quadra 7', before)).toBe('Quadra 7');
  });
});
