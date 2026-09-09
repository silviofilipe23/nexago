import { combinationsOf, formatSummaryOf, readinessChecksOf } from './draw-summary';
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

function session(teams: number, over: Partial<DrawSession> = {}): DrawSession {
  const entrants = Array.from({ length: teams }, (_, i) => entrant(`t${i}`));
  return {
    id: 's1',
    tournamentId: 't1',
    categoryId: 'c1',
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
    pots: [],
    entrants,
    reveals: [],
    genesisHash: 'g',
    totalReveals: teams,
    bracketOutline: null,
    ...over,
  };
}

describe('formatSummaryOf — fase de grupos', () => {
  it('16 duplas em grupos de 4: 4 grupos, 4 por grupo, 2 classificam', () => {
    expect(formatSummaryOf(session(16))).toEqual({
      kind: 'groups',
      teams: 16,
      groups: 4,
      perGroup: 4,
      qualifiers: 2,
      exact: true,
    });
  });

  it('14 duplas não fecham exatamente — grupos ficam desiguais', () => {
    const summary = formatSummaryOf(session(14));
    expect(summary.kind === 'groups' && summary.groups).toBe(4);
    expect(summary.exact).toBe(false);
  });

  it('dupla eliminatória conta cabeças travadas em vez de grupos', () => {
    const s = session(16, {
      format: 'double_elimination',
      config: { ...session(16).config, lockedSeedCount: 4 },
      bracketOutline: { pairings: [], byeSeeds: [1, 2] },
    });
    expect(formatSummaryOf(s)).toEqual({
      kind: 'de',
      teams: 16,
      locked: 4,
      byes: 2,
      drawn: 12,
      exact: false,
    });
  });

  it('dupla eliminatória sem bye fecha exatamente', () => {
    const s = session(16, {
      format: 'double_elimination',
      config: { ...session(16).config, lockedSeedCount: 4 },
      bracketOutline: { pairings: [], byeSeeds: [] },
    });
    expect(formatSummaryOf(s).exact).toBe(true);
  });
});

describe('combinationsOf', () => {
  it('com potes por ranking, cada pote distribui um slot por grupo', () => {
    // 16 duplas, 4 grupos, 4 potes cheios: 4! por pote = 24^4.
    const s = session(16, {
      pots: [0, 1, 2, 3].map((i) => ({
        index: i + 1,
        teamIds: ['a', 'b', 'c', 'd'].map((x) => `${x}${i}`),
      })),
    });
    expect(combinationsOf(s)).toBe(24 ** 4);
  });

  it('sem potes por ranking, é a distribuição livre nos grupos', () => {
    // 8 duplas em 2 grupos de 4: 8! / (4! × 4!) = 70.
    const s = session(8, {
      config: {
        ...session(8).config,
        constraints: { seedsApart: false, potsPerGroup: false, avoidSameCity: false },
      },
    });
    expect(combinationsOf(s)).toBe(70);
  });

  it('dupla eliminatória: as não-cabeças permutam nos seeds livres', () => {
    const s = session(8, {
      format: 'double_elimination',
      config: { ...session(8).config, lockedSeedCount: 2 },
      pots: [{ index: 1, teamIds: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    });
    expect(combinationsOf(s)).toBe(720); // 6!
  });

  it('número grande demais para exibir devolve null em vez de Infinity', () => {
    const s = session(60, {
      format: 'double_elimination',
      config: { ...session(60).config, lockedSeedCount: 0 },
      pots: [{ index: 1, teamIds: Array.from({ length: 60 }, (_, i) => `t${i}`) }],
    });
    expect(combinationsOf(s)).toBeNull();
  });

  it('sem duplas não há combinação', () => {
    expect(combinationsOf(session(0))).toBeNull();
  });
});

describe('readinessChecksOf', () => {
  it('confirma o elenco congelado', () => {
    const checks = readinessChecksOf(session(16));
    const inscricoes = checks.find((c) => c.id === 'teams');
    expect(inscricoes?.ok).toBe(true);
    expect(inscricoes?.label).toContain('16');
  });

  it('reprova com menos de 2 duplas — não há sorteio possível', () => {
    expect(readinessChecksOf(session(1)).find((c) => c.id === 'teams')?.ok).toBe(false);
  });

  it('avisa quando a chave não fecha exatamente, sem bloquear', () => {
    const check = readinessChecksOf(session(14)).find((c) => c.id === 'exact');
    expect(check?.ok).toBe(false);
    expect(check?.optional).toBe(true);
  });

  it('confirma cabeças definidas quando o pote 1 tem duplas', () => {
    const s = session(16, { pots: [{ index: 1, teamIds: ['a', 'b', 'c', 'd'] }] });
    expect(readinessChecksOf(s).find((c) => c.id === 'seeds')?.ok).toBe(true);
  });

  it('toda checagem tem rótulo — nada aparece em branco na tela', () => {
    for (const check of readinessChecksOf(session(16))) {
      expect(check.label.length).toBeGreaterThan(0);
    }
  });
});
