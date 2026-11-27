import type { TournamentMatch } from '../data/matches-repository';
import { seedingDriftNotes } from './seeding-drift';

function match(over: Partial<TournamentMatch> & Pick<TournamentMatch, 'id' | 'matchNumber'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: null,
    team1Label: 'A definir',
    team2Label: 'A definir',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    matchType: 'knockout',
    roundNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: null,
    scheduleEndAt: null,
    dayKey: null,
    bestOf: 1,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    scoringProfile: null,
    currentGame: null,
    ...over,
  } as TournamentMatch;
}

/** Jogos de grupo dão nome às duplas — é de onde o aviso tira o nome de quem deveria estar na vaga. */
const GROUP_GAMES = [
  match({ id: 'g1', matchNumber: 1, matchType: 'group', teamAId: 'ana', teamBId: 'bia', team1Label: 'Ana / Alice', team2Label: 'Bia / Bruna' }),
  match({ id: 'g2', matchNumber: 2, matchType: 'group', teamAId: 'carla', teamBId: 'duda', team1Label: 'Carla / Clara', team2Label: 'Duda / Dani' }),
];

describe('seedingDriftNotes', () => {
  it('sem aviso gravado, nada a dizer', () => {
    const knockout = [match({ id: 'k1', matchNumber: 10, teamAId: 'ana', team1Label: 'Ana / Alice' })];
    expect(seedingDriftNotes(knockout, [...GROUP_GAMES, ...knockout])).toEqual([]);
  });

  it('diz o jogo, quem a classificação atual poria ali e quem está no lugar', () => {
    const knockout = [
      match({ id: 'k1', matchNumber: 13, teamAId: 'ana', teamBId: 'bia', team1Label: 'Ana / Alice', team2Label: 'Bia / Bruna', seedingDrift: { teamAId: null, teamBId: 'duda' } }),
    ];
    expect(seedingDriftNotes(knockout, [...GROUP_GAMES, ...knockout])).toEqual(['Jogo #13: Duda / Dani no lugar de Bia / Bruna']);
  });

  it('quem folga aparece na partida de folga e na rodada seguinte: uma linha só, com os dois jogos', () => {
    const knockout = [
      match({ id: 'k1', matchNumber: 10, teamAId: 'ana', team1Label: 'Ana / Alice', seedingDrift: { teamAId: 'carla', teamBId: null } }),
      match({ id: 'k2', matchNumber: 14, roundNumber: 2, teamAId: 'ana', team1Label: 'Ana / Alice', team2Label: 'Vencedor Jogo #11', seedingDrift: { teamAId: 'carla', teamBId: null } }),
    ];
    expect(seedingDriftNotes(knockout, [...GROUP_GAMES, ...knockout])).toEqual(['Jogos #10 e #14: Carla / Clara no lugar de Ana / Alice']);
  });

  it('ordena pelo primeiro jogo afetado', () => {
    const knockout = [
      match({ id: 'k2', matchNumber: 13, teamBId: 'bia', team2Label: 'Bia / Bruna', seedingDrift: { teamAId: null, teamBId: 'duda' } }),
      match({ id: 'k1', matchNumber: 11, teamAId: 'duda', team1Label: 'Duda / Dani', seedingDrift: { teamAId: 'bia', teamBId: null } }),
    ];
    expect(seedingDriftNotes(knockout, [...GROUP_GAMES, ...knockout])).toEqual([
      'Jogo #11: Bia / Bruna no lugar de Duda / Dani',
      'Jogo #13: Duda / Dani no lugar de Bia / Bruna',
    ]);
  });

  it('dupla sem nome conhecido não trava o aviso', () => {
    const knockout = [match({ id: 'k1', matchNumber: 13, teamAId: 'ana', team1Label: 'Ana / Alice', seedingDrift: { teamAId: 'zzz', teamBId: null } })];
    expect(seedingDriftNotes(knockout, knockout)).toEqual(['Jogo #13: outra dupla no lugar de Ana / Alice']);
  });
});
