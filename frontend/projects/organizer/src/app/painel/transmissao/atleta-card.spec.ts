import type { TournamentMatch } from '../data/matches-repository';
import { atletaCardOf, type AtletaSource } from './atleta-card';
import type { TeamRoster } from './transmissao-selectors';

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

function match(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm', tournamentId: 't1', categoryId: 'cat1', round: 'Grupo', team1Label: 'A', team2Label: 'B', score: null, winnerSide: null,
    scheduledAt: null, court: null, status: 'completed', teamAId: 'ta', teamBId: 'tb', sets: [], courtId: 'q1', scheduleEndAt: null, dayKey: '',
    bestOf: 3, matchType: 'group', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null, winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null, loserAdvanceSlot: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  } as TournamentMatch;
}

const roster = (...names: string[]): TeamRoster => ({ teamName: null, members: names.map((n, i) => ({ uid: `u-${n}`, name: n, photoUrl: i === 0 ? `http://f/${n}` : null })) });
const ROSTERS = new Map<string, TeamRoster>([
  ['ta', roster('Rafael Batrane', 'Tiisaar Lima')],
  ['tb', roster('Carlos Nilsson', 'Davi Berger')],
  ['tc', roster('Pedro Nunes', 'Caio Alves')],
]);

const g = (id: string, ended: Date, a: number, b: number, over: Partial<TournamentMatch> = {}) =>
  match({ id, matchEndedAt: ended, winnerSide: a > b ? 1 : 2, sets: [{ a, b }], bestOf: 1, ...over });

function src(over: Partial<AtletaSource> = {}): AtletaSource {
  return {
    matches: [], history: [], rosters: ROSTERS, details: new Map([['u-Rafael Batrane', { city: 'Recife', state: 'PE', levelsBySport: {}, legacyLevel: null }]]),
    athleteRanking: [{ id: 'u-Rafael Batrane', points: 1105.4, tournaments: 3, sport: 's', gender: null, format: null }],
    categoryName: 'Masculino B', courtName: '2', year: 2026, ...over,
  };
}

describe('atletaCardOf', () => {
  it('identidade, parceiro, ranking, cidade, quadra e categoria', () => {
    const c = atletaCardOf(src(), 'ta', 'u-Rafael Batrane', null, 'k1')!;
    expect(c).toEqual(jasmine.objectContaining({ key: 'k1', name: 'Rafael Batrane', partner: 'Tiisaar Lima', photoUrl: 'http://f/Rafael Batrane', rankPos: 1, rankPoints: 1105, city: 'Recife', state: 'PE', court: '2', category: 'Masculino B', season: null, h2h: null }));
  });

  it('atleta fora do elenco = null', () => {
    expect(atletaCardOf(src(), 'ta', 'u-Ninguém', null, 'k')).toBeNull();
  });

  it('jogos do torneio: últimos 3, parciais e sets do ponto de vista do atleta', () => {
    const matches = [
      g('1', D(2026, 10, 1), 21, 18, { round: 'Grupo', teamBId: 'tc' }),
      g('2', D(2026, 10, 2), 17, 21, { round: 'Grupo', teamBId: 'tc' }),
      g('3', D(2026, 10, 3), 21, 14, { round: 'Oitavas', teamAId: 'tc', teamBId: 'ta' }), // atleta é o lado B e perdeu
      g('4', D(2026, 10, 4), 21, 10, { round: 'Quartas', teamBId: 'tc' }),
    ];
    const c = atletaCardOf(src({ matches }), 'ta', 'u-Rafael Batrane', null, 'k')!;
    expect(c.games.length).toBe(3);
    expect(c.games[0]).toEqual({ phase: 'Grupo', opponent: 'Nunes / Alves', partials: '17-21', score: '0–1', won: false });
    expect(c.games[1]).toEqual({ phase: 'Oitavas', opponent: 'Nunes / Alves', partials: '14-21', score: '0–1', won: false });
    expect(c.games[2]!.won).toBeTrue();
    expect(c.setsWon).toBe(2);
    expect(c.setsLost).toBe(2);
  });

  it('temporada: só o ano, %, sequência e últimos 5 em ordem', () => {
    const history = [
      g('h0', D(2025, 12, 1), 21, 5), // outro ano: fora
      g('h1', D(2026, 1, 1), 21, 5),
      g('h2', D(2026, 2, 1), 5, 21),
      g('h3', D(2026, 3, 1), 21, 5),
      g('h4', D(2026, 4, 1), 21, 5),
    ];
    const s = atletaCardOf(src({ history }), 'ta', 'u-Rafael Batrane', null, 'k')!.season!;
    expect(s).toEqual({ year: 2026, winPct: 75, wins: 3, losses: 1, streak: { kind: 'V', n: 2 }, last: ['V', 'D', 'V', 'V'] });
  });

  it('confronto direto contra a dupla da partida de hoje, sem contar a própria', () => {
    const hoje = match({ id: 'hoje', status: 'scheduled', teamAId: 'ta', teamBId: 'tb' });
    const history = [
      g('d1', D(2026, 1, 1), 21, 5, { teamAId: 'ta', teamBId: 'tb' }),
      g('d2', D(2026, 2, 1), 21, 5, { teamAId: 'tb', teamBId: 'ta' }), // tb venceu
      g('d3', D(2026, 3, 1), 5, 21, { teamAId: 'tb', teamBId: 'ta' }), // ta venceu
      g('d4', D(2026, 3, 2), 21, 5, { teamAId: 'ta', teamBId: 'tc' }),
      { ...hoje, status: 'completed', winnerSide: 1 } as TournamentMatch,
    ];
    const c = atletaCardOf(src({ history }), 'ta', 'u-Rafael Batrane', hoje, 'k')!;
    expect(c.h2h).toEqual({ wins: 2, losses: 1, vs: 'Nilsson / Berger' });
  });
});
