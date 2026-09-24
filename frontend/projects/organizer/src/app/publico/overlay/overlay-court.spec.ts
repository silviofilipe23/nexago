import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { MatchFinishMemory } from '../../painel/telao/telao-finished';
import { overlayCourtContextOf } from './overlay-court';

const NOW = Date.UTC(2026, 8, 23, 18, 0, 0);

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const SEM_MEMORIA: ReadonlyMap<string, MatchFinishMemory> = new Map();

describe('overlayCourtContextOf', () => {
  it('escolhe a partida ao vivo daquela quadra', () => {
    const ctx = overlayCourtContextOf(
      [
        match({ id: 'outra', status: 'in_progress', courtId: 'q9', matchStartedAt: new Date(NOW) }),
        match({ id: 'certa', status: 'in_progress', courtId: 'q2', matchStartedAt: new Date(NOW) }),
      ],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.match?.id).toBe('certa');
  });

  it('quadra parada não devolve partida, e a tela fica limpa', () => {
    const ctx = overlayCourtContextOf(
      [match({ id: 'velha', status: 'completed', courtId: 'q2' })],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.match).toBeNull();
    expect(ctx.categoryMatches).toEqual([]);
    expect(ctx.totalRounds).toBe(0);
  });

  it('entrega a categoria e o total da fase da partida escolhida', () => {
    const aoVivo = match({
      id: 'certa',
      status: 'in_progress',
      courtId: 'q2',
      matchStartedAt: new Date(NOW),
    });
    const ctx = overlayCourtContextOf(
      [
        aoVivo,
        match({ id: 'r2', matchType: 'koc_round' }),
        match({ id: 'r3', matchType: 'KOC_ROUND' }),
        match({ id: 'sf', matchType: 'koc_semifinal' }),
        match({ id: 'outraCat', categoryId: 'cat9', matchType: 'koc_round' }),
      ],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.categoryMatches.map((m) => m.id)).toEqual(['certa', 'r2', 'r3', 'sf']);
    // `KOC_ROUND` conta junto: a fase é comparada normalizada, como no resto do KOTC.
    expect(ctx.totalRounds).toBe(3);
  });

  it('segura a recém-encerrada enquanto a memória de fim a mantém', () => {
    const encerrada = match({ id: 'fim', status: 'completed', courtId: 'q2' });
    const memoria = new Map<string, MatchFinishMemory>([
      ['fim', { status: 'completed', endedSeenAtMs: NOW - 5_000 }],
    ]);

    expect(overlayCourtContextOf([encerrada], 'q2', NOW, memoria).match?.id).toBe('fim');
  });
});
