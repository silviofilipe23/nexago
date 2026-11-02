import { courtChangeBlockReason, courtChangePayload, liveCourtChangePayload, type LiveCourtChangeSource } from './match-court-change';
import type { TournamentMatch } from './matches-repository';

const SCHEDULED_AT = new Date('2026-08-01T13:00:00-03:00');

function matchFixture(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    round: 'Quartas',
    team1Label: 'Dupla A',
    team2Label: 'Dupla B',
    score: null,
    winnerSide: null,
    scheduledAt: SCHEDULED_AT,
    court: 'Quadra 1',
    status: 'scheduled',
    teamAId: 'a',
    teamBId: 'b',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'knockout',
    roundNumber: 1,
    matchNumber: 1,
    ...overrides,
  } as TournamentMatch;
}

describe('courtChangeBlockReason', () => {
  it('libera a troca em partida agendada e não encerrada', () => {
    expect(courtChangeBlockReason(matchFixture())).toBeNull();
  });

  it('bloqueia partida sem horário', () => {
    expect(courtChangeBlockReason(matchFixture({ scheduledAt: null }))).toBe('unscheduled');
  });

  it('bloqueia partida concluída', () => {
    expect(courtChangeBlockReason(matchFixture({ status: 'completed' }))).toBe('finished');
  });

  it('bloqueia partida com placar mesmo sem status concluído', () => {
    expect(courtChangeBlockReason(matchFixture({ score: '21/18 21/15' }))).toBe('finished');
  });
});

describe('courtChangePayload', () => {
  it('preserva início e fim exatos quando a partida tem scheduleEndAt', () => {
    const scheduleEndAt = new Date('2026-08-01T13:45:00-03:00');
    const payload = courtChangePayload(matchFixture({ scheduleEndAt }), 'q3', 30);

    expect(payload).toEqual({
      matchId: 'm1',
      courtId: 'q3',
      scheduleTime: SCHEDULED_AT,
      scheduleEndTime: scheduleEndAt,
    });
  });

  it('usa início + duração padrão quando não há scheduleEndAt', () => {
    const payload = courtChangePayload(matchFixture(), 'q3', 40);

    expect(payload?.scheduleTime).toEqual(SCHEDULED_AT);
    expect(payload?.scheduleEndTime).toEqual(new Date(SCHEDULED_AT.getTime() + 40 * 60000));
  });

  it('cai pra 30 min quando a duração padrão é inválida', () => {
    const payload = courtChangePayload(matchFixture(), 'q3', 0);

    expect(payload?.scheduleEndTime).toEqual(new Date(SCHEDULED_AT.getTime() + 30 * 60000));
  });

  it('não monta payload pra partida bloqueada', () => {
    expect(courtChangePayload(matchFixture({ scheduledAt: null }), 'q3', 30)).toBeNull();
    expect(courtChangePayload(matchFixture({ status: 'completed' }), 'q3', 30)).toBeNull();
  });

  it('não monta payload com courtId vazio ou só espaços', () => {
    expect(courtChangePayload(matchFixture(), '', 30)).toBeNull();
    expect(courtChangePayload(matchFixture(), '   ', 30)).toBeNull();
  });
});

describe('liveCourtChangePayload', () => {
  const STARTED_AT = new Date('2026-08-01T13:20:00-03:00');
  const NOW = new Date('2026-08-01T13:35:00-03:00');

  function liveFixture(overrides: Partial<LiveCourtChangeSource> = {}): LiveCourtChangeSource {
    return {
      id: 'm1',
      status: 'in_progress',
      courtId: 'q1',
      scheduleTime: SCHEDULED_AT,
      scheduleEndTime: new Date('2026-08-01T13:45:00-03:00'),
      matchStartedAt: STARTED_AT,
      dayKey: '2026-07-31',
      ...overrides,
    };
  }

  it('troca a quadra de partida ao vivo mantendo horário e jornada', () => {
    expect(liveCourtChangePayload(liveFixture(), 'q3', 30, NOW)).toEqual({
      matchId: 'm1',
      courtId: 'q3',
      scheduleTime: SCHEDULED_AT,
      scheduleEndTime: new Date('2026-08-01T13:45:00-03:00'),
      dayKey: '2026-07-31',
    });
  });

  it('partida iniciada pela mesa sem horário: janela parte do início real', () => {
    const payload = liveCourtChangePayload(liveFixture({ courtId: null, scheduleTime: null, scheduleEndTime: null, dayKey: null }), 'q2', 40, NOW);

    expect(payload).toEqual({
      matchId: 'm1',
      courtId: 'q2',
      scheduleTime: STARTED_AT,
      scheduleEndTime: new Date(STARTED_AT.getTime() + 40 * 60000),
    });
  });

  it('sem horário nem início: janela parte de agora', () => {
    const payload = liveCourtChangePayload(liveFixture({ status: 'scheduled', scheduleTime: null, scheduleEndTime: null, matchStartedAt: null }), 'q2', 0, NOW);

    expect(payload?.scheduleTime).toEqual(NOW);
    expect(payload?.scheduleEndTime).toEqual(new Date(NOW.getTime() + 30 * 60000));
  });

  it('ignora fim gravado sem início gravado', () => {
    const payload = liveCourtChangePayload(liveFixture({ scheduleTime: null }), 'q2', 30, NOW);

    expect(payload?.scheduleEndTime).toEqual(new Date(STARTED_AT.getTime() + 30 * 60000));
  });

  it('não monta payload pra mesma quadra, quadra vazia ou partida encerrada', () => {
    expect(liveCourtChangePayload(liveFixture(), 'q1', 30, NOW)).toBeNull();
    expect(liveCourtChangePayload(liveFixture(), '  ', 30, NOW)).toBeNull();
    expect(liveCourtChangePayload(liveFixture({ status: 'completed' }), 'q3', 30, NOW)).toBeNull();
    expect(liveCourtChangePayload(liveFixture({ status: 'canceled' }), 'q3', 30, NOW)).toBeNull();
  });
});
