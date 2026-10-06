import type { TournamentMatch } from '../../painel/data/matches-repository';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';
import { medicoOf } from './overlay-medico';

const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Dupla A',
    team2Label: 'Dupla B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [{ a: 10, b: 8 }],
    courtId: 'Q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: 0,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const viewOf = (m: TournamentMatch) => overlayViewOf(m, NOW) as OverlayDuelView;
const med = (over: object = {}) => ({
  side: 'B' as const,
  teamId: 'tb',
  playerSlot: 2 as const,
  playerName: ' Berger ',
  startedAt: new Date(NOW - 30_000),
  durationSec: 300,
  setIndex: 0,
  ...over,
});

describe('overlay-medico', () => {
  it('entra com o atendimento do doc', () => {
    const m = match({ medicalTimeout: med() });
    const r = medicoOf(m, viewOf(m), NOW);
    expect(r?.side).toBe('B');
    expect(r?.playerName).toBe('Berger');
    expect(r?.durMs).toBe(300_000);
    expect(r?.startMs).toBe(NOW - 30_000);
    expect(r?.setInfo).toBe('Set 1 · 10–8');
  });

  it('NÃO sai sozinho ao zerar — só a mesa encerra', () => {
    const m = match({ medicalTimeout: med({ startedAt: new Date(NOW - 900_000) }) });
    expect(medicoOf(m, viewOf(m), NOW)).not.toBeNull();
  });

  it('sem atendimento ou fora do ao vivo não aparece', () => {
    const livre = match();
    expect(medicoOf(livre, viewOf(livre), NOW)).toBeNull();
    const fim = match({ status: 'completed', medicalTimeout: med() });
    expect(medicoOf(fim, viewOf(fim), NOW)).toBeNull();
  });

  it('sem carimbo do servidor mostra o tempo cheio', () => {
    const m = match({ medicalTimeout: med({ startedAt: null }) });
    expect(medicoOf(m, viewOf(m), NOW)?.startMs).toBe(NOW);
  });
});
