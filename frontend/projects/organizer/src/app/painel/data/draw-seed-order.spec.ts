import { currentSeedOrder, headCountOf, movedSeedOrder, sortedByStrength } from './draw-seed-order';
import type { DrawSession, DrawSessionEntrant } from './draw-session.model';

function entrant(teamId: string, over: Partial<DrawSessionEntrant> = {}): DrawSessionEntrant {
  return {
    teamId,
    label: teamId,
    playerNames: [],
    photoUrls: [],
    city: null,
    levelLabel: '',
    points: 8,
    rating: null,
    potIndex: 1,
    lockedSeed: null,
    stats: { wins: 0, losses: 0, titles: 0, last5: [] },
    ...over,
  };
}

function session(over: Partial<DrawSession> = {}): DrawSession {
  return {
    id: 's',
    tournamentId: 't',
    categoryId: 'c',
    tournamentName: 'Copa',
    categoryName: 'Open',
    sportCode: 'BEACH_TENNIS',
    format: 'groups_knockout',
    status: 'draft',
    scheduledAt: null,
    startedAt: null,
    publishedAt: null,
    voidedAt: null,
    voidReason: null,
    config: {
      mode: 'hybrid',
      intervalMs: 6000,
      phrasesEnabled: true,
      lockedSeedCount: 0,
      teamsPerGroup: 4,
      qualifiersPerGroup: 2,
      constraints: { seedsApart: true, potsPerGroup: true, avoidSameCity: false },
    },
    pots: [
      { index: 1, teamIds: ['a', 'b'] },
      { index: 2, teamIds: ['c', 'd'] },
    ],
    entrants: [entrant('a'), entrant('b'), entrant('c'), entrant('d')],
    reveals: [],
    genesisHash: 'g',
    totalReveals: 4,
    bracketOutline: null,
    ...over,
  };
}

describe('currentSeedOrder', () => {
  it('em grupos, a ordem é a dos potes, do pote 1 em diante', () => {
    expect(currentSeedOrder(session())).toEqual(['a', 'b', 'c', 'd']);
  });

  it('na dupla eliminatória, as cabeças travadas vêm primeiro, na ordem do seed', () => {
    const s = session({
      format: 'double_elimination',
      config: { ...session().config, lockedSeedCount: 2 },
      entrants: [
        entrant('a', { lockedSeed: 2 }),
        entrant('b', { lockedSeed: 1 }),
        entrant('c'),
        entrant('d'),
      ],
      pots: [{ index: 1, teamIds: ['c', 'd'] }],
    });
    expect(currentSeedOrder(s)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('dupla fora dos potes entra no fim em vez de sumir da lista', () => {
    const s = session({
      entrants: [entrant('a'), entrant('b'), entrant('c'), entrant('d'), entrant('orfa')],
    });
    expect(currentSeedOrder(s)).toEqual(['a', 'b', 'c', 'd', 'orfa']);
  });

  it('nunca repete uma dupla que está no pote e travada ao mesmo tempo', () => {
    const s = session({
      format: 'double_elimination',
      entrants: [entrant('a', { lockedSeed: 1 }), entrant('b')],
      pots: [{ index: 1, teamIds: ['a', 'b'] }],
    });
    expect(currentSeedOrder(s)).toEqual(['a', 'b']);
  });
});

describe('movedSeedOrder', () => {
  it('sobe uma posição', () => {
    expect(movedSeedOrder(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('desce uma posição', () => {
    expect(movedSeedOrder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('subir a primeira não faz nada — nem estoura', () => {
    expect(movedSeedOrder(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('descer a última não faz nada', () => {
    expect(movedSeedOrder(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('não muta a lista recebida', () => {
    const original = ['a', 'b', 'c'];
    movedSeedOrder(original, 0, 1);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});

describe('sortedByStrength', () => {
  it('ordena da maior pontuação para a menor', () => {
    const pontos = new Map([['a', 4], ['b', 12], ['c', 8]]);
    expect(sortedByStrength(['a', 'b', 'c'], (id) => pontos.get(id) ?? null)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('dupla sem pontuação vai para o fim', () => {
    const pontos = new Map<string, number>([['b', 5]]);
    expect(sortedByStrength(['a', 'b'], (id) => pontos.get(id) ?? null)).toEqual(['b', 'a']);
  });

  it('empate preserva a ordem atual — clicar duas vezes não embaralha', () => {
    const iguais = () => 7;
    expect(sortedByStrength(['c', 'a', 'b'], iguais)).toEqual(['c', 'a', 'b']);
  });
});

describe('headCountOf', () => {
  it('em grupos, as cabeças são o pote 1', () => {
    expect(headCountOf(session(), 4)).toBe(2);
  });

  it('na dupla eliminatória, são as cabeças travadas escolhidas', () => {
    const s = session({ format: 'double_elimination' });
    expect(headCountOf(s, 4)).toBe(4);
  });

  it('sem potes em grupos, não há cabeça', () => {
    expect(headCountOf(session({ pots: [] }), 4)).toBe(0);
  });
});
