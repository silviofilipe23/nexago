import type { KocRoundState } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { ledNomeCurto, ledProximosOf, ledSeguidasDe } from './led-proximos';

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

describe('ledProximosOf', () => {
  it('antes do apito: "Entrada na quadra" pela ordem de entrada, todos com 0 ponto', () => {
    const px = ledProximosOf(
      match({ status: 'scheduled', koc: round({ kingTeamId: '', challengerTeamId: '', teamIds: ['a', 'b', 'c', 'd'] }) }),
    )!;
    expect(px.inicio).toBeTrue();
    expect(px.trono).toEqual(jasmine.objectContaining({ teamId: 'a', posicao: 1, numero: 1, rotulo: 'Entra no trono' }));
    expect(px.fila.map((r) => [r.teamId, r.posicao, r.rotulo])).toEqual([
      ['b', 2, 'Desafia o trono'],
      ['c', 3, 'Na fila'],
      ['d', 4, 'Na fila'],
    ]);
  });

  it('apitada mas sem rally ainda continua sendo início de rodada', () => {
    const px = ledProximosOf(match({ koc: round({ rallyLog: [] }) }))!;
    expect(px.inicio).toBeTrue();
    expect(px.trono.numero).toBe(1);
  });

  it('durante a rodada: rei, desafiante e fila na ordem ATUAL, com os pontos do rei', () => {
    const px = ledProximosOf(
      match({
        koc: round({
          teamIds: ['a', 'b', 'c', 'd'],
          kingTeamId: 'c',
          challengerTeamId: 'd',
          queue: ['a', 'b'],
          points: { c: 5 },
          rallyLog: [
            { seq: 1, winner: 'challenger', teamId: '', atMs: NOW },
            { seq: 2, winner: 'king', teamId: '', atMs: NOW },
            { seq: 3, winner: 'king', teamId: '', atMs: NOW },
            { seq: 4, winner: 'king', teamId: '', atMs: NOW },
          ],
        }),
      }),
    )!;
    expect(px.inicio).toBeFalse();
    expect(px.trono).toEqual(jasmine.objectContaining({ teamId: 'c', numero: 5, rotulo: 'No trono · Em chamas' }));
    expect(px.fila.map((r) => [r.teamId, r.posicao, r.rotulo])).toEqual([
      ['d', 2, 'Desafiante · Em quadra'],
      ['a', 3, 'Próxima a desafiar'],
      ['b', 4, 'Aguardando'],
    ]);
  });

  it('abaixo de 3 defesas seguidas o trono não leva tag', () => {
    const px = ledProximosOf(
      match({ koc: round({ rallyLog: [{ seq: 1, winner: 'king', teamId: '', atMs: NOW }, { seq: 2, winner: 'king', teamId: '', atMs: NOW }] }) }),
    )!;
    expect(px.trono.rotulo).toBe('No trono');
  });

  it('rei que acabou de coroar não tem sequência', () => {
    const px = ledProximosOf(match({ koc: round({ rallyLog: [{ seq: 1, winner: 'challenger', teamId: '', atMs: NOW }] }) }))!;
    expect(px.trono.rotulo).toBe('No trono');
  });

  it('rodada encerrada ou partida que não é KOTC não tem próximos', () => {
    expect(ledProximosOf(match({ status: 'completed' }))).toBeNull();
    expect(ledProximosOf(match({ matchType: 'group' }))).toBeNull();
    expect(ledProximosOf(null)).toBeNull();
  });
});

describe('ledSeguidasDe', () => {
  it('conta defesas desde a primeira; erro de saque é neutro; coroação quebra', () => {
    const w = (winner: string) => ({ winner });
    expect(ledSeguidasDe([w('king')])).toBe(1);
    expect(ledSeguidasDe([w('king'), w('serve_fault'), w('king')])).toBe(2);
    expect(ledSeguidasDe([w('king'), w('challenger'), w('king')])).toBe(1);
    expect(ledSeguidasDe([w('golden_point')])).toBe(0);
  });
});

describe('ledNomeCurto', () => {
  it('3 primeiras letras em maiúsculas, com acento contado como uma letra', () => {
    expect(ledNomeCurto('Vanessa')).toBe('VAN');
    expect(ledNomeCurto('  Hölting Nilsson ')).toBe('HÖL');
    expect(ledNomeCurto('Íris')).toBe('ÍRI');
  });

  it('nome curto ou com espaço nas 3 primeiras fica sem espaço sobrando', () => {
    expect(ledNomeCurto('Bo')).toBe('BO');
    expect(ledNomeCurto('Jo Ana')).toBe('JO');
    expect(ledNomeCurto('')).toBe('');
  });
});
