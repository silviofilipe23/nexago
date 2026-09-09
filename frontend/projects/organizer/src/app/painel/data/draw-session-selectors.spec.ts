import type { DrawSession, DrawSessionEntrant, DrawSessionReveal } from './draw-session.model';
import {
  destinationLabelOf,
  groupsOf,
  preassignedCountOf,
  revealOriginLabelOf,
  remainingInPot,
  seedOrderOf,
  seedRivalPhrase,
  winRateOf,
} from './draw-session-selectors';

function entrant(teamId: string, over: Partial<DrawSessionEntrant> = {}): DrawSessionEntrant {
  return {
    teamId,
    label: teamId.toUpperCase(),
    playerNames: [],
    photoUrls: [],
    city: null,
    levelLabel: '',
    points: 4,
    rating: null,
    potIndex: 1,
    lockedSeed: null,
    stats: { wins: 0, losses: 0, titles: 0, last5: [] },
    ...over,
  };
}

function groupReveal(index: number, teamId: string, groupId: string): DrawSessionReveal {
  return {
    index,
    teamId,
    destinationKey: `grupo:${groupId}`,
    atMillis: index * 1000,
    prevHash: 'p',
    hash: 'h',
    destination: { type: 'group', groupId },
    relaxed: [],
    phrase: null,
    dePlacement: null,
  };
}

function seedReveal(index: number, teamId: string, seed: number): DrawSessionReveal {
  return {
    ...groupReveal(index, teamId, 'A'),
    destinationKey: `seed:${seed}`,
    destination: { type: 'seed', seed },
  };
}

function session(over: Partial<DrawSession> = {}): DrawSession {
  return {
    id: 's1',
    tournamentId: 't1',
    categoryId: 'c1',
    tournamentName: 'Copa',
    categoryName: 'Open',
    sportCode: 'BEACH_TENNIS',
    format: 'groups_knockout',
    status: 'live',
    scheduledAt: null,
    startedAt: null,
    publishedAt: null,
    voidedAt: null,
    voidReason: null,
    config: {
      mode: 'manual',
      intervalMs: 6000,
      phrasesEnabled: false,
      lockedSeedCount: 0,
      teamsPerGroup: 2,
      qualifiersPerGroup: 1,
      constraints: { seedsApart: false, potsPerGroup: true, avoidSameCity: false },
    },
    pots: [
      { index: 1, teamIds: ['a', 'b'] },
      { index: 2, teamIds: ['c', 'd'] },
    ],
    entrants: [entrant('a'), entrant('b'), entrant('c', { potIndex: 2 }), entrant('d', { potIndex: 2 })],
    reveals: [],
    genesisHash: 'g',
    totalReveals: 4,
    bracketOutline: null,
    ...over,
  };
}

describe('groupsOf', () => {
  it('4 duplas em grupos de 2 dão dois grupos de capacidade 2', () => {
    const groups = groupsOf(session());
    expect(groups.map((g) => g.groupId)).toEqual(['A', 'B']);
    expect(groups.map((g) => g.capacity)).toEqual([2, 2]);
  });

  it('14 duplas em grupos de 4 dão 4/4/3/3 — mesma conta do servidor', () => {
    const entrants = Array.from({ length: 14 }, (_, i) => entrant(`t${i}`));
    const s = session({ entrants, config: { ...session().config, teamsPerGroup: 4 } });
    expect(groupsOf(s).map((g) => g.capacity)).toEqual([4, 4, 3, 3]);
  });

  it('coloca cada dupla no grupo que o log diz', () => {
    const s = session({ reveals: [groupReveal(1, 'a', 'A'), groupReveal(2, 'b', 'B')] });
    const groups = groupsOf(s);
    expect(groups[0].entrants.map((e) => e.teamId)).toEqual(['a']);
    expect(groups[1].entrants.map((e) => e.teamId)).toEqual(['b']);
  });

  it('SEGURA a dupla cujo spotlight ainda não terminou — a grade não pode entregar o segredo', () => {
    // O servidor já gravou as duas revelações, mas na tela só a primeira
    // terminou o ciclo. A segunda ainda está rolando nos dados.
    const s = session({ reveals: [groupReveal(1, 'a', 'A'), groupReveal(2, 'b', 'B')] });
    const groups = groupsOf(s, 1);
    expect(groups[0].entrants.map((e) => e.teamId)).toEqual(['a']);
    expect(groups[1].entrants).toEqual([]);
  });

  it('ignora revelação de dupla que não está no elenco', () => {
    const s = session({ reveals: [groupReveal(1, 'fantasma', 'A')] });
    expect(groupsOf(s)[0].entrants).toEqual([]);
  });
});

describe('seedOrderOf', () => {
  const deEntrants = () => [
    entrant('a', { lockedSeed: 1 }),
    entrant('b', { lockedSeed: 2 }),
    entrant('c'),
    entrant('d'),
  ];

  /** Sessão ANTIGA: só as 2 sorteadas tinham revelação, as cabeças eram plantadas. */
  const deSession = () =>
    session({
      format: 'double_elimination',
      config: { ...session().config, lockedSeedCount: 2 },
      entrants: deEntrants(),
      totalReveals: 2,
    });

  /** Sessão NOVA: as 4 passam pelo sorteio, cabeças inclusive. */
  const noArSession = () =>
    session({
      format: 'double_elimination',
      config: { ...session().config, lockedSeedCount: 2 },
      entrants: deEntrants(),
      totalReveals: 4,
    });

  it('cabeças travadas já aparecem sem revelação nenhuma', () => {
    expect(seedOrderOf(deSession()).map((e) => e?.teamId ?? null)).toEqual([
      'a',
      'b',
      null,
      null,
    ]);
  });

  it('a revelação crava a dupla no seed sorteado', () => {
    const s = deSession();
    s.reveals = [seedReveal(1, 'd', 4)];
    expect(seedOrderOf(s).map((e) => e?.teamId ?? null)).toEqual(['a', 'b', null, 'd']);
  });

  it('também segura a revelação que ainda está no ar', () => {
    const s = deSession();
    s.reveals = [seedReveal(1, 'c', 3), seedReveal(2, 'd', 4)];
    expect(seedOrderOf(s, 1).map((e) => e?.teamId ?? null)).toEqual(['a', 'b', 'c', null]);
  });

  /**
   * A chave nascer preenchida era o problema: a cabeça nunca via o próprio nome
   * entrar. Com todo mundo passando pelo sorteio, ela entra na vez dela.
   */
  it('cabeças no ar: a chave começa VAZIA', () => {
    expect(seedOrderOf(noArSession()).map((e) => e?.teamId ?? null)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('cabeças no ar: a revelação da cabeça é que a coloca no seed dela', () => {
    const s = noArSession();
    s.reveals = [seedReveal(1, 'a', 1)];
    expect(seedOrderOf(s).map((e) => e?.teamId ?? null)).toEqual(['a', null, null, null]);
  });

  it('cabeças no ar: o spotlight segura a cabeça igual às outras', () => {
    const s = noArSession();
    s.reveals = [seedReveal(1, 'a', 1), seedReveal(2, 'b', 2)];
    expect(seedOrderOf(s, 1).map((e) => e?.teamId ?? null)).toEqual(['a', null, null, null]);
  });
});

describe('remainingInPot', () => {
  it('lista quem ainda não saiu, na ordem dos potes', () => {
    const s = session({ reveals: [groupReveal(1, 'a', 'A')] });
    expect(remainingInPot(s).map((e) => e.teamId)).toEqual(['b', 'c', 'd']);
  });

  it('sessão antiga: cabeça travada não está na fila — ela não passa pelo sorteio', () => {
    const s = session({
      format: 'double_elimination',
      entrants: [entrant('a', { lockedSeed: 1 }), entrant('b'), entrant('c'), entrant('d')],
      totalReveals: 3,
    });
    expect(remainingInPot(s).map((e) => e.teamId)).toEqual(['b', 'c', 'd']);
  });

  it('cabeças no ar: a cabeça ESTÁ na fila — ela é a próxima a aparecer', () => {
    // A fila do console é o que o organizador narra. Esconder a cabeça dela
    // faria a contagem mentir e a próxima revelação chegar sem aviso.
    const s = session({
      format: 'double_elimination',
      entrants: [entrant('a', { lockedSeed: 1 }), entrant('b'), entrant('c'), entrant('d')],
      totalReveals: 4,
    });
    expect(remainingInPot(s).map((e) => e.teamId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('cabeças no ar: revelada, a cabeça sai da fila como qualquer outra', () => {
    const s = session({
      format: 'double_elimination',
      entrants: [entrant('a', { lockedSeed: 1 }), entrant('b'), entrant('c'), entrant('d')],
      totalReveals: 4,
      reveals: [seedReveal(1, 'a', 1)],
    });
    expect(remainingInPot(s).map((e) => e.teamId)).toEqual(['b', 'c', 'd']);
  });

  it('pote vazio no fim do sorteio', () => {
    const s = session({
      reveals: [
        groupReveal(1, 'a', 'A'),
        groupReveal(2, 'b', 'B'),
        groupReveal(3, 'c', 'A'),
        groupReveal(4, 'd', 'B'),
      ],
    });
    expect(remainingInPot(s)).toEqual([]);
  });
});

describe('destinationLabelOf', () => {
  it('grupo vira "GRUPO C"', () => {
    expect(destinationLabelOf({ type: 'group', groupId: 'C' })).toBe('GRUPO C');
  });

  it('seed vira "POSIÇÃO 12"', () => {
    expect(destinationLabelOf({ type: 'seed', seed: 12 })).toBe('POSIÇÃO 12');
  });
});

describe('seedRivalPhrase', () => {
  it('usa o nome da equipe quando a posição já está preenchida', () => {
    const order = [null, entrant('a', { label: 'Ana / Bia' }), null];
    expect(seedRivalPhrase(order, 2)).toBe('Ana / Bia');
  });

  it('cai em "a cabeça N" enquanto a posição está vazia', () => {
    expect(seedRivalPhrase([null, null], 1)).toBe('a cabeça 1');
  });
});

describe('winRateOf', () => {
  it('arredonda o aproveitamento', () => {
    expect(winRateOf(entrant('a', { stats: { wins: 2, losses: 1, titles: 0, last5: [] } }))).toBe(67);
  });

  it('dupla estreante não tem aproveitamento — mostrar 0% seria mentira', () => {
    expect(winRateOf(entrant('a'))).toBeNull();
  });
});

/**
 * O comprovante existe pra provar que o sorteio foi aleatório. As cabeças de
 * chave NÃO são sorteadas — entram no grupo que o ranking já definiu. Se essas
 * linhas aparecerem iguais às outras, o documento passa a afirmar acaso onde
 * não houve, e aí ele não prova mais nada. Daí a marca por linha e a contagem
 * que muda o texto do cabeçalho.
 */
describe('revealOriginLabelOf', () => {
  it('linha sorteada de verdade diz que foi sorteada', () => {
    expect(revealOriginLabelOf(groupReveal(1, 'a', 'A'))).toBe('sorteada');
  });

  it('cabeça com lugar definido diz "por ranking" — não pode passar por sorteio', () => {
    const cabeca = { ...groupReveal(1, 'a', 'A'), preassigned: true as const };
    expect(revealOriginLabelOf(cabeca)).toBe('por ranking');
  });
});

describe('preassignedCountOf', () => {
  it('sessão toda sorteada não tem nenhuma linha predeterminada', () => {
    expect(preassignedCountOf([groupReveal(1, 'a', 'A'), groupReveal(2, 'b', 'B')])).toBe(0);
  });

  it('conta só as linhas marcadas', () => {
    const reveals = [
      { ...groupReveal(1, 'a', 'A'), preassigned: true as const },
      { ...groupReveal(2, 'b', 'B'), preassigned: true as const },
      groupReveal(3, 'c', 'A'),
    ];
    expect(preassignedCountOf(reveals)).toBe(2);
  });

  it('sem revelação nenhuma conta zero', () => {
    expect(preassignedCountOf([])).toBe(0);
  });
});
