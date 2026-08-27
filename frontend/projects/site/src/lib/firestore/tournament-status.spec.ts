import { rawStatusOf, resolveListingStatus } from './tournament-status';

describe('resolveListingStatus', () => {
  it('torneio de hoje sem endAt/startAt confiáveis (closed/bracketsReady) fica live enquanto for o mesmo dia', () => {
    // Caso real: doc com `listingStatus: 'closed'` e startAt === endAt === meia-noite de hoje
    // (torneio-seed-nexago) aparecia como "Finalizado" às 15h do próprio dia do evento.
    const status = resolveListingStatus(
      {
        rawStatus: rawStatusOf({ listingStatus: 'closed' }),
        startAt: new Date('2026-08-27T00:00:00-03:00'),
        endAt: new Date('2026-08-27T00:00:00-03:00'),
        liveMatchesNow: 0,
        enrolledCount: 60,
        capacity: 60,
      },
      new Date('2026-08-27T15:18:00-03:00'),
    );
    expect(status).toBe('live');
  });

  it('open sem endAt que começou hoje de manhã continua live à tarde', () => {
    const status = resolveListingStatus(
      {
        rawStatus: 'open',
        startAt: new Date('2026-08-27T08:00:00-03:00'),
        endAt: null,
        liveMatchesNow: 0,
        enrolledCount: 10,
        capacity: 60,
      },
      new Date('2026-08-27T14:00:00-03:00'),
    );
    expect(status).toBe('live');
  });

  it('open sem endAt que começou ontem já é ended', () => {
    const status = resolveListingStatus(
      {
        rawStatus: 'open',
        startAt: new Date('2026-08-26T08:00:00-03:00'),
        endAt: null,
        liveMatchesNow: 0,
        enrolledCount: 10,
        capacity: 60,
      },
      new Date('2026-08-27T14:00:00-03:00'),
    );
    expect(status).toBe('ended');
  });

  it('status cru completed/ended vence mesmo no dia do evento', () => {
    const status = resolveListingStatus(
      {
        rawStatus: 'completed',
        startAt: new Date('2026-08-27T08:00:00-03:00'),
        endAt: null,
        liveMatchesNow: 0,
        enrolledCount: 10,
        capacity: 60,
      },
      new Date('2026-08-27T14:00:00-03:00'),
    );
    expect(status).toBe('ended');
  });

  it('bracketsReady de um torneio de dias atrás com endAt real ainda não vencido fica closed', () => {
    const status = resolveListingStatus(
      {
        rawStatus: 'closed',
        startAt: new Date('2026-08-24T08:00:00-03:00'),
        endAt: new Date('2026-08-30T20:00:00-03:00'),
        liveMatchesNow: 0,
        enrolledCount: 10,
        capacity: 60,
      },
      new Date('2026-08-27T14:00:00-03:00'),
    );
    expect(status).toBe('closed');
  });

  it('liveMatchesNow>0 sempre vence, mesmo com endAt no passado', () => {
    const status = resolveListingStatus(
      {
        rawStatus: 'closed',
        startAt: new Date('2026-08-20T08:00:00-03:00'),
        endAt: new Date('2026-08-20T20:00:00-03:00'),
        liveMatchesNow: 3,
        enrolledCount: 10,
        capacity: 60,
      },
      new Date('2026-08-27T14:00:00-03:00'),
    );
    expect(status).toBe('live');
  });
});
