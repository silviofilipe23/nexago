import { courtChangeBlockReason, courtChangePayload } from './match-court-change';
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
