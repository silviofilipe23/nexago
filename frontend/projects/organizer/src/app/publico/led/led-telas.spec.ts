import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { ledTelaOf, CLASSIFICACAO_MS, CLASSIFICADAS_MS } from './led-telas';

const NOW = Date.UTC(2026, 8, 23, 18, 0, 0);

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['a', 'b', 'c'],
    kingTeamId: 'a',
    challengerTeamId: 'b',
    queue: ['c'],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: { endsAtMs: NOW + 120_000, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 4,
    roundsPerBracket: 2,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 3,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
    ...overrides,
  };
}

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 2',
    status: 'in_progress',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 3,
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
    koc: round(),
    ...overrides,
  };
}

describe('ledTelaOf', () => {
  it('rodada agendada com elenco anuncia quem vai entrar', () => {
    const agendada = match({ status: 'scheduled', koc: round({ kingTeamId: '', challengerTeamId: '' }) });

    expect(ledTelaOf(agendada, NOW, null)).toBe('elenco');
  });

  it('rodada agendada sem elenco resolvido não tem o que anunciar', () => {
    const semElenco = match({ status: 'scheduled', koc: round({ teamIds: [] }) });

    expect(ledTelaOf(semElenco, NOW, null)).toBe('aguardando');
  });

  it('mostra o jogo enquanto o relógio corre', () => {
    expect(ledTelaOf(match(), NOW, null)).toBe('jogo');
  });

  it('com o relógio zerado, segura em TEMPO ESGOTADO — quem encerra é a mesa', () => {
    const esgotado = match({ koc: round({ clock: { endsAtMs: NOW, durationSec: 900, pausedAtMs: null } }) });

    expect(ledTelaOf(esgotado, NOW, null)).toBe('tempo-esgotado');
    // Continua esperando, por mais que demore: a bola de ouro acontece nesta janela.
    expect(ledTelaOf(esgotado, NOW + 10 * 60_000, null)).toBe('tempo-esgotado');
  });

  it('rodada pausada não conta como tempo esgotado', () => {
    const pausada = match({
      koc: round({ clock: { endsAtMs: NOW + 1_000, durationSec: 900, pausedAtMs: NOW - 5_000 } }),
    });

    expect(ledTelaOf(pausada, NOW + 60_000, null)).toBe('jogo');
  });

  it('encerrada mostra a classificação da rodada e depois as classificadas da fase', () => {
    const fim = NOW;
    const encerrada = match({ status: 'completed' });

    expect(ledTelaOf(encerrada, fim + 1_000, fim)).toBe('classificacao');
    expect(ledTelaOf(encerrada, fim + CLASSIFICACAO_MS + 1_000, fim)).toBe('classificadas');
  });

  it('passadas as duas telas, o painel fica aguardando a próxima rodada', () => {
    const fim = NOW;
    const encerrada = match({ status: 'completed' });
    const depois = fim + CLASSIFICACAO_MS + CLASSIFICADAS_MS + 1_000;

    expect(ledTelaOf(encerrada, depois, fim)).toBe('aguardando');
  });

  it('sem partida na quadra, aguarda', () => {
    expect(ledTelaOf(null, NOW, null)).toBe('aguardando');
  });

  it('partida que não é KOTC não tem tela neste painel', () => {
    expect(ledTelaOf(match({ matchType: 'knockout', koc: null }), NOW, null)).toBe('aguardando');
  });
});
