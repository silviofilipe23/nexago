import type { TournamentMatch } from '../../painel/data/matches-repository';
import { categoriesWithGroups, gruposViewOf, nextPhaseOf } from './overlay-grupo';

function m(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm', tournamentId: 't', categoryId: 'c1', round: 'Grupo A', team1Label: 'A', team2Label: 'B', score: null, winnerSide: null,
    scheduledAt: null, court: null, status: 'completed', teamAId: 'a', teamBId: 'b', sets: [], courtId: 'q1', scheduleEndAt: null,
    dayKey: '', bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null, winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0, medicalTimeout: null,
    matchStartedAt: null, matchEndedAt: null, ...over,
  };
}

// Grupo A de 4 duplas (a, b, c, d); a vence tudo.
const jogos = [
  m({ id: '1', matchNumber: 1, teamAId: 'a', teamBId: 'd', team1Label: 'Berger / Nilsson', team2Label: 'Farias / Braga', winnerSide: 1, sets: [{ a: 21, b: 14 }, { a: 21, b: 17 }] }),
  m({ id: '2', matchNumber: 2, teamAId: 'b', teamBId: 'c', team1Label: 'Mendes / Paiva', team2Label: 'Teles / Moura', winnerSide: 1, sets: [{ a: 19, b: 21 }, { a: 21, b: 18 }, { a: 15, b: 12 }] }),
  m({ id: '3', matchNumber: 3, teamAId: 'a', teamBId: 'c', team1Label: 'Berger / Nilsson', team2Label: 'Teles / Moura', winnerSide: 1, sets: [{ a: 21, b: 19 }, { a: 18, b: 21 }, { a: 15, b: 13 }] }),
  m({ id: '4', matchNumber: 4, teamAId: 'b', teamBId: 'd', team1Label: 'Mendes / Paiva', team2Label: 'Farias / Braga', winnerSide: 1, sets: [{ a: 21, b: 16 }, { a: 21, b: 19 }] }),
  m({ id: '5', matchNumber: 5, teamAId: 'a', teamBId: 'b', team1Label: 'Berger / Nilsson', team2Label: 'Mendes / Paiva', status: 'in_progress', sets: [{ a: 14, b: 11 }], currentSetIndex: 0 }),
  m({ id: '6', matchNumber: 6, teamAId: 'c', teamBId: 'd', team1Label: 'Teles / Moura', team2Label: 'Farias / Braga', status: 'scheduled' }),
];

describe('overlay-grupo', () => {
  it('fase seguinte pelo total de vagas', () => {
    expect([16, 12, 8, 6, 4, 2, 1].map(nextPhaseOf)).toEqual(['Oitavas', 'Oitavas', 'Quartas', 'Quartas', 'Semifinal', 'Final', 'Eliminatória']);
  });

  it('categorias com grupos e grupos por letra', () => {
    expect(categoriesWithGroups([...jogos, m({ id: 'x', categoryId: 'c2', matchType: 'single_elimination', round: 'Final' })])).toEqual(['c1']);
    const g = gruposViewOf([...jogos, m({ id: 'y', round: 'Grupo B', teamAId: 'e', teamBId: 'f' })], null, 2);
    expect(g.map((x) => x.key)).toEqual(['A', 'B']);
  });

  it('classificação: vitórias, J/V/D, sets e saldo; jogo ao vivo não conta', () => {
    const [g] = gruposViewOf(jogos, 'c1', 2);
    expect(g!.rows.map((r) => r.teamId)).toEqual(['a', 'b', 'c', 'd']);
    const a = g!.rows[0]!;
    expect([a.j, a.v, a.d, a.sets]).toEqual([2, 2, 0, '4:1']);
    expect(a.saldo).toBe(21 - 14 + 21 - 17 + 21 - 19 + 18 - 21 + 15 - 13);
    // d perdeu duas, sem pontos de vitória
    expect(g!.rows[3]!.v).toBe(0);
  });

  it('zonas, status e corte de vagas', () => {
    const [g] = gruposViewOf(jogos, 'c1', 2);
    expect(g!.rows.map((r) => r.zone)).toEqual(['lider', 'classifica', 'fora', 'fora']);
    expect(g!.rows[0]!.status).toBe('Lidera · Final');
    expect(g!.rows[1]!.status).toBe('Zona de classificação');
    expect(g!.rows[2]!.status).toBe('Fora da zona');
    expect(g!.vagas).toBe('2 vagas · Final');
  });

  it('andamento do grupo: jogo ao vivo, jogos X de N e encerrado (com Classificada/Eliminada)', () => {
    const [g] = gruposViewOf(jogos, 'c1', 2);
    expect(g!.progressText).toBe('Jogo em andamento');
    const sem = jogos.map((j) => (j.id === '5' ? { ...j, status: 'scheduled' as const } : j));
    expect(gruposViewOf(sem, 'c1', 2)[0]!.progressText).toBe('Jogos 4 de 6');
    const todos = jogos.map((j) => (j.status === 'completed' ? j : { ...j, status: 'completed' as const, winnerSide: 1 as const, sets: [{ a: 21, b: 10 }, { a: 21, b: 10 }] }));
    const fim = gruposViewOf(todos, 'c1', 2)[0]!;
    expect(fim.progressText).toBe('Grupo encerrado');
    expect(fim.rows.map((r) => r.status)).toEqual(['Classificada', 'Classificada', 'Eliminada', 'Eliminada']);
  });

  it('jogos do grupo: encerrado com parciais, ao vivo com set atual, a jogar', () => {
    const [g] = gruposViewOf(jogos, 'c1', 2);
    expect(g!.games[1]).toEqual(jasmine.objectContaining({ state: 'final', score: '2–1', detail: '19-21 21-18 15-12', winner: 'A' }));
    expect(g!.games[4]).toEqual(jasmine.objectContaining({ state: 'live', score: '14–11', detail: 'Ao vivo · 1º set' }));
    expect(g!.games[5]).toEqual(jasmine.objectContaining({ state: 'scheduled', score: null, detail: 'A jogar' }));
  });
});
