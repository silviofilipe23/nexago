import { buildGroupStandings, groupStandingColumns, type TournamentMatch } from './matches-repository';

const BT = { kind: 'sets_games', bestOf: 3, gamesPerSet: 6, winByGames: 2, tiebreakAtGames: 6, tiebreakTo: 7, noAd: true, decidingSet: 'super_tiebreak', superTiebreakTo: 10 } as const;

function match(teamAId: string, teamBId: string, winnerSide: 1 | 2, sets: TournamentMatch['sets'], games: boolean): TournamentMatch {
  return {
    teamAId,
    teamBId,
    team1Label: teamAId,
    team2Label: teamBId,
    winnerSide,
    status: 'completed',
    sets,
    bestOf: 3,
    scoringProfile: games ? BT : null,
  } as unknown as TournamentMatch;
}

/** Ciclo A>B, B>C, C>A: A e B empatam em vitórias e saldo de games (+3); B tem saldo de sets
 *  maior, A venceu o confronto direto. Mesmo caso de `functions/src/group-standings.test.ts`. */
function cycle(games: boolean): TournamentMatch[] {
  return [
    match('A', 'B', 1, [{ a: 4, b: 6 }, { a: 6, b: 4 }, { a: 1, b: 0 }], games),
    match('B', 'C', 1, [{ a: 6, b: 4 }, { a: 6, b: 4 }], games),
    match('A', 'C', 2, [{ a: 6, b: 2 }, { a: 6, b: 7 }, { a: 0, b: 1 }], games),
  ];
}

describe('buildGroupStandings · critério por tipo', () => {
  it('games: saldo de sets antes do confronto direto', () => {
    expect(buildGroupStandings(cycle(true)).map((r) => r.teamId)).toEqual(['B', 'A', 'C']);
  });

  it('pontos: saldo de pontos e confronto direto, como sempre', () => {
    expect(buildGroupStandings(cycle(false)).map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
  });

  it('colunas da tabela: games em grupo de games, pontos nos demais', () => {
    expect(groupStandingColumns(cycle(true))).toEqual({ made: 'GF', madeTitle: 'Games feitos', lost: 'GT', lostTitle: 'Games tomados', diff: 'SG', diffTitle: 'Saldo de games (feitos − tomados)' });
    expect(groupStandingColumns(cycle(false))).toEqual({ made: 'PF', madeTitle: 'Pontos feitos', lost: 'PT', lostTitle: 'Pontos tomados', diff: 'SP', diffTitle: 'Saldo de pontos (feitos − tomados)' });
  });
});
