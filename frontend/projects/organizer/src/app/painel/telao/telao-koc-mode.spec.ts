import { isKingOfCourtMatchType, type KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { KOC_FINISHED_SHOWCASE_MS, kocShowcaseOf } from './telao-koc-mode';
import type { MatchFinishMemory } from './telao-finished';

function koc(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['t1', 't2', 't3'],
    kingTeamId: 't1',
    challengerTeamId: 't2',
    queue: ['t3'],
    points: { t1: 3, t2: 1, t3: 0 },
    rallies: 4,
    servingTeamId: 't2',
    clock: { endsAtMs: Date.now() + 60_000, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 2,
    configuredDurationSec: 900,
    rallySeq: 4,
    roundLabel: 1,
    qualifierSlots: [],
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't',
    categoryId: 'koc',
    round: 'Rodada 1',
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: new Date(),
    court: 'Quadra 1',
    status: 'in_progress',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'Q1',
    dayKey: '2026-09-21',
    scheduleEndAt: null,
    bestOf: 1,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    teamADescription: null,
    teamBDescription: null,
    koc: koc(),
    matchStartedAt: new Date(),
    ...overrides,
  } as TournamentMatch;
}

describe('kocShowcaseOf', () => {
  const now = Date.now();

  it('prioriza a rodada KOTC ao vivo na quadra do telão', () => {
    const live = match({ id: 'live', status: 'in_progress', courtId: 'Q1' });
    const other = match({ id: 'other', status: 'scheduled', courtId: 'Q1', koc: koc({ clock: null }) });
    const out = kocShowcaseOf([other, live], ['Q1'], now, new Map());
    expect(out?.match.id).toBe('live');
    expect(out?.state).toBe('live');
  });

  it('ignora rodada fora das quadras selecionadas', () => {
    const live = match({ courtId: 'Q9' });
    expect(kocShowcaseOf([live], ['Q1'], now, new Map())).toBeNull();
  });

  it('mostra vitrine de encerrada dentro da janela', () => {
    const finished = match({ id: 'done', status: 'completed', courtId: 'Q1' });
    const memory = new Map<string, MatchFinishMemory>([
      ['done', { status: 'completed', endedSeenAtMs: now - 10_000 }],
    ]);
    const out = kocShowcaseOf([finished], ['Q1'], now, memory);
    expect(out?.match.id).toBe('done');
    expect(out?.state).toBe('finished');
  });

  it('não mostra encerrada fora da janela', () => {
    const finished = match({ id: 'old', status: 'completed', courtId: 'Q1' });
    const memory = new Map<string, MatchFinishMemory>([
      ['old', { status: 'completed', endedSeenAtMs: now - KOC_FINISHED_SHOWCASE_MS - 1_000 }],
    ]);
    expect(kocShowcaseOf([finished], ['Q1'], now, memory)).toBeNull();
  });

  it('não assume partida que não é KOTC', () => {
    const duel = match({ matchType: 'Final', koc: null, teamAId: 'a', teamBId: 'b' });
    expect(isKingOfCourtMatchType(duel.matchType)).toBeFalse();
    expect(kocShowcaseOf([duel], ['Q1'], now, new Map())).toBeNull();
  });
});
