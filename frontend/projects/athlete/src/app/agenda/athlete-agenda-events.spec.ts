import { bookingToEvent, classEntryToEvent, registrationToEvent } from './athlete-agenda.component';
import { classAgendaItemFromRaw } from '../data/class-agenda-repository';
import type { MyBooking } from '../data/my-bookings-repository';
import { EMPTY_UNIFORM_SLOT, type AthleteTournamentRegistration } from '../data/tournament-registrations-repository';
import type { TournamentSummary } from '../data/tournaments-repository';

const NOW = new Date(2026, 6, 20, 12, 0, 0); // 2026-07-20 12:00

function makeBooking(overrides: Partial<MyBooking> = {}): MyBooking {
  return {
    id: 'b1',
    arenaId: 'arena-1',
    arenaName: 'Arena Sol',
    courtName: 'Quadra 1',
    dateKey: '2026-07-20',
    startTime: '10:00',
    endTime: '11:00',
    status: 'active',
    attendanceConfirmed: false,
    amountReais: null,
    createdAt: null,
    ...overrides,
  };
}

function makeRegistration(overrides: Partial<AthleteTournamentRegistration> = {}): AthleteTournamentRegistration {
  return {
    id: 'r1',
    tournamentId: 't1',
    categoryId: 'cat-1',
    teamId: null,
    partnerPending: false,
    isPaid: true,
    waitlist: false,
    sharePaidUids: [],
    declaredPaidAt: null,
    paymentVerifiedByOrganizer: false,
    player1Id: null,
    participantUids: [],
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_UNIFORM_SLOT,
    uniformPlayer2: EMPTY_UNIFORM_SLOT,
    teamName: null,
    teamSize: null,
    captainUid: null,
    uniformByUid: {},
    substitutionHistory: [],
    holdExpiresAt: null,
    cancellationRequest: null,
    ...overrides,
  };
}

function makeTournament(overrides: Partial<TournamentSummary> = {}): TournamentSummary {
  return {
    id: 't1',
    name: 'Torneio Teste',
    city: 'Floripa',
    location: 'Arena Sol',
    locationAddress: null,
    dateLabel: null,
    startAt: NOW,
    endAt: null,
    format: 'Dupla',
    capacity: 32,
    enrolledCount: 10,
    featured: false,
    liveMatchesNow: 0,
    rawStatus: 'open',
    isCancelled: false,
    isDraftOrCancelled: false,
    leagueId: null,
    leagueStageId: null,
    leagueStageOrder: null,
    leagueStageName: null,
    coverUrl: null,
    managerId: null,
    regulationsText: null,
    sport: null,
    paymentMode: 'appPixCard',
    organizerPix: null,
    waitlistEnabled: false,
    requireFormedPair: false,
    enrolledTeamsVisible: true,
    registrationHoldMinutes: 30,
    registrationOpensAt: null,
    registrationClosesAt: null,
    tournamentPrizes: [],
    categories: [],
    ...overrides,
  };
}

describe('bookingToEvent', () => {
  it('marca como passado (isPast) uma reserva cujo horário de término já ficou para trás', () => {
    const booking = makeBooking({ dateKey: '2026-07-19', startTime: '10:00', endTime: '11:00' });
    const event = bookingToEvent(booking, NOW);
    expect(event?.isPast).toBe(true);
  });

  it('não marca como passado uma reserva futura', () => {
    const booking = makeBooking({ dateKey: '2026-07-25', startTime: '10:00', endTime: '11:00' });
    const event = bookingToEvent(booking, NOW);
    expect(event?.isPast).toBe(false);
  });

  it('não marca como passado uma reserva em andamento agora', () => {
    const booking = makeBooking({ dateKey: '2026-07-20', startTime: '11:30', endTime: '13:00' });
    const event = bookingToEvent(booking, NOW);
    expect(event?.isPast).toBe(false);
  });

  it('mostra "Confirmado" para reserva paga mesmo sem check-in (attendanceConfirmed) no dia', () => {
    // attendanceConfirmed só vira true no check-in presencial no dia do jogo — não deve
    // rebaixar pra "Aguardando confirmação" uma reserva já paga/confirmada (alinhado com o
    // status exibido na tela de detalhes da reserva).
    const booking = makeBooking({
      dateKey: '2026-07-25',
      startTime: '10:00',
      endTime: '11:00',
      status: 'confirmed',
      attendanceConfirmed: false,
    });
    const event = bookingToEvent(booking, NOW);
    expect(event?.statusLabel).toBe('Confirmado');
    expect(event?.statusTone).toBe('confirmed');
  });

  it('mostra "Pagamento pendente" para reserva com status pending_payment', () => {
    const booking = makeBooking({
      dateKey: '2026-07-25',
      startTime: '10:00',
      endTime: '11:00',
      status: 'pending_payment',
    });
    const event = bookingToEvent(booking, NOW);
    expect(event?.statusLabel).toBe('Pagamento pendente');
    expect(event?.statusTone).toBe('warning');
  });
});

describe('registrationToEvent', () => {
  it('marca como passado um torneio já concluído', () => {
    const tournament = makeTournament({ rawStatus: 'completed', startAt: new Date(2026, 6, 1) });
    const event = registrationToEvent(makeRegistration(), tournament, NOW);
    expect(event?.isPast).toBe(true);
  });

  it('não marca como passado um torneio futuro', () => {
    const tournament = makeTournament({ rawStatus: 'open', startAt: new Date(2026, 7, 5) });
    const event = registrationToEvent(makeRegistration(), tournament, NOW);
    expect(event?.isPast).toBe(false);
  });
});

describe('classEntryToEvent (aulas da arena)', () => {
  const base = {
    sessionId: 'class_c1_2026-07-21', arenaId: 'arena-1', arenaName: 'Arena Sol', classId: 'c1',
    className: 'Intermediário B', teacherName: 'Carla Dias', courtName: 'Quadra 2',
    date: '2026-07-21', startTime: '19:00', endTime: '20:00', status: 'scheduled', role: 'student', kind: 'regular',
  };

  it('aula futura do aluno: hora de parede, turma com professor e "Ver arena"', () => {
    const ev = classEntryToEvent(classAgendaItemFromRaw(base), NOW)!;
    expect(ev.kind).toBe('class');
    expect(ev.startsAt).toEqual(new Date(2026, 6, 21, 19, 0));
    expect(ev.durationMin).toBe(60);
    expect(ev.title).toBe('Intermediário B · Arena Sol');
    expect(ev.subtitle).toBe('Turma · Prof. Carla · Quadra 2');
    expect(ev.statusLabel).toBe('Confirmada');
    expect(ev.link).toEqual(['/reservar', 'arena-1']);
    expect(ev.isPast).toBeFalse();
  });

  it('chamada, encaixe, cancelada e professor', () => {
    const past = { ...base, date: '2026-07-14' };
    expect(classEntryToEvent(classAgendaItemFromRaw({ ...past, myMark: 'excused' }), NOW)!.statusLabel).toBe('Justificada');
    expect(classEntryToEvent(classAgendaItemFromRaw(past), NOW)!.statusLabel).toBe('Finalizada');
    expect(classEntryToEvent(classAgendaItemFromRaw({ ...base, kind: 'trial' }), NOW)!.subtitle).toBe('Aula experimental · Quadra 2');
    const canceled = classEntryToEvent(classAgendaItemFromRaw({ ...base, status: 'canceled' }), NOW)!;
    expect(canceled.statusLabel).toBe('Cancelada');
    expect(canceled.isPast).toBeTrue();
    const teacher = classEntryToEvent(classAgendaItemFromRaw({ ...base, role: 'teacher', studentCount: 3 }), NOW)!;
    expect(teacher.subtitle).toBe('Você dá aula · 3 alunos · Quadra 2');
    expect(teacher.statusLabel).toBe('Você dá aula');
  });

  it('sem data utilizável não vira evento', () => {
    expect(classEntryToEvent(classAgendaItemFromRaw({ ...base, date: '' }), NOW)).toBeNull();
  });
});
