import type { TournamentMatch } from '../../data/matches-repository';
import { roundScenariosOf, winBoundsOf } from './focus-scenarios';

function match(partial: Partial<TournamentMatch> & Pick<TournamentMatch, 'id'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: 'pool-a',
    teamAId: 'A',
    teamBId: 'B',
    teamADescription: null,
    teamBDescription: null,
    status: 'Scheduled',
    resultA: null,
    resultB: null,
    sets: [],
    winnerId: null,
    isGroupMatch: true,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    scheduleTime: null,
    courtName: null,
    liveScore: null,
    matchStartedAt: null,
    checkIn: { teamA: null, teamB: null },
    queueStatus: null,
    bestOf: 3,
    currentSetIndex: null,
    ...partial,
  };
}

/** Grupo de 4 com 2 rodadas fechadas e só a partida do atleta em aberto. */
function groupWithOnlyMyMatchPending() {
  return [
    match({ id: 'd1', poolId: 'p1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
    match({ id: 'd2', poolId: 'p1', status: 'completed', teamAId: 'rival', teamBId: 'y', winnerId: 'rival', sets: [{ a: 21, b: 10 }, { a: 21, b: 11 }] }),
    match({ id: 'd3', poolId: 'p1', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 19 }, { a: 21, b: 18 }] }),
    match({ id: 'mine-vs-rival', poolId: 'p1', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
  ];
}

describe('roundScenariosOf', () => {
  it('afirma a posição quando ela não muda entre os placares plausíveis', () => {
    const scenarios = roundScenariosOf(groupWithOnlyMyMatchPending(), 'p1', 'mine', 'mine-vs-rival', 2);
    const win = scenarios.find((s) => s.outcome === 'win');
    expect(win?.rank).toBe(1);
    expect(win?.qualifies).toBe(true);
  });

  it('não afirma nada quando há outra partida pendente no grupo', () => {
    const matches = [
      ...groupWithOnlyMyMatchPending(),
      match({ id: 'outra', poolId: 'p1', status: 'scheduled', teamAId: 'x', teamBId: 'y' }),
    ];
    const scenarios = roundScenariosOf(matches, 'p1', 'mine', 'mine-vs-rival', 2);
    expect(scenarios.every((s) => s.rank === null)).toBe(true);
    expect(scenarios[0]?.text).toContain('depende');
  });

  it('devolve vazio quando a partida do atleta não existe no grupo', () => {
    expect(roundScenariosOf(groupWithOnlyMyMatchPending(), 'p1', 'mine', 'inexistente', 2)).toEqual([]);
  });

  /** Grupo desenhado pra fazer os dois EXTREMOS de vitória (`winBoundsOf`, MD3 por padrão)
   *  discordarem de posição. `x` já tem 1V/0D com saldo de sets +2 (2-0) e saldo de games +32.
   *  Vencendo por 2-0 (qualquer placar), o atleta empata em vitórias E em saldo de sets com `x` — quem
   *  decide é o saldo de games, e a vitória mais folgada possível (21-0, 21-0 → saldo +42)
   *  supera o de `x`. Vencendo por 2-1, o saldo de sets do atleta cai pra +1, que já perde de
   *  +2 de `x` no desempate ANTES de chegar no saldo de games — não importa o quanto o atleta
   *  vença os dois sets que fecha. Resultado: a vitória mais folgada dá 1º, a mais apertada dá
   *  2º — exatamente o intervalo contínuo que duas amostras internas (a constante antiga)
   *  podiam não cobrir. */
  function groupWhereBoundsDiverge() {
    return [
      match({ id: 'd1', poolId: 'p2', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 5 }, { a: 21, b: 5 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p2', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
    ];
  }

  it('cai em "depende do placar" quando o extremo folgado e o apertado de uma vitória dão posições diferentes', () => {
    const win = roundScenariosOf(groupWhereBoundsDiverge(), 'p2', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBeNull();
    expect(win?.qualifies).toBeNull();
    // Texto específico do ramo "os extremos discordam" — diferente do texto de "outra partida
    // pendente no grupo", que também contém "depende do placar" mas por outro motivo.
    expect(win?.text).toBe('Vencendo, sua posição depende do placar.');
  });

  it('o mesmo grupo com o atleta do lado B dá o mesmo resultado (o espelhamento está correto)', () => {
    const mirrored = [
      match({ id: 'd1', poolId: 'p2', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 5 }, { a: 21, b: 5 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p2', status: 'scheduled', teamAId: 'rival', teamBId: 'mine' }),
    ];
    const win = roundScenariosOf(mirrored, 'p2', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBeNull();
    expect(win?.text).toBe('Vencendo, sua posição depende do placar.');
  });

  it('afirma a posição do cenário de derrota quando ela não muda entre os extremos', () => {
    // 3 duplas: x já bateu rival (1V/0D) e o atleta, com 0 vitórias, ainda não jogou. Perdendo
    // pra rival ele fica com 0V — pior que x(1V) e rival(1V) em qualquer placar, então o
    // desempate por saldo nunca chega a ser consultado: ele é sempre o 3º.
    const matches = [
      match({ id: 'd1', poolId: 'p3', status: 'completed', teamAId: 'x', teamBId: 'rival', winnerId: 'x', sets: [{ a: 21, b: 10 }, { a: 21, b: 12 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p3', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
    ];
    const loss = roundScenariosOf(matches, 'p3', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'loss');
    expect(loss?.rank).toBe(3);
    expect(loss?.qualifies).toBe(false);
    expect(loss?.text).toBe('Perdendo, você termina em 3º do grupo.');
  });

  it('devolve vazio quando o time informado não joga a partida indicada', () => {
    // 'mine-vs-rival' é entre 'x' e 'rival' — 'mine' não é nenhum dos dois lados.
    const matches = [match({ id: 'mine-vs-rival', poolId: 'p1', status: 'scheduled', teamAId: 'x', teamBId: 'rival' })];
    expect(roundScenariosOf(matches, 'p1', 'mine', 'mine-vs-rival', 2)).toEqual([]);
  });

  it('não confia num 2-1 "realista" como mínimo — regressão do bound interior', () => {
    // Contra-exemplo real que expôs o bug: com o bound antigo (19-21 no set do meio), a função
    // afirmava "1º e avança" pra essa mesma vitória. O placar legal 21-19/5-21/15-13 termina em
    // 2º de verdade (saldo de sets empata com `x` e o saldo de pontos, negativo, perde) — então
    // a função precisa se recusar a afirmar posição aqui.
    const matches = [
      match({ id: 'd1', poolId: 'p4', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 19 }, { a: 9, b: 21 }, { a: 15, b: 5 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p4', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
    ];
    const win = roundScenariosOf(matches, 'p4', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBeNull();
  });

  it('MD5 hardcoded como MD3 mentia — regressão do bound que não olhava o bestOf da partida', () => {
    // `x` já venceu 3-2 num MD5 real, com saldo de sets +1 e saldo de pontos -31 (venceu os 3
    // sets que precisava no fio — 21-19 cada — e perdeu os outros 2 de forma bem feia: 0-21 e
    // 5-21). Vencendo pelo extremo LARGO de um MD5 de verdade (3-0, saldo +3), o atleta supera
    // `x` só no saldo de sets — 1º trivial. Mas pelo extremo ESTREITO de um MD5 de verdade (indo
    // aos 5 sets: 3-2, saldo de sets empata com `x` e o saldo de pontos desce a -36, pior que os
    // -31 de `x`) — `x` fica acima. Isso só existe num MD5: um MD3 nem alcança -36. Com o bound
    // antigo (fixo em formato de MD3, ignorando o `bestOf` da partida do atleta), o "estreito"
    // simulado nunca ia além de -17 — pior que os -31 de `x`? Não, -17 > -31, então o antigo
    // "estreito" TAMBÉM concordava com o "largo" em 1º — afirmação falsa com confiança.
    const matches = [
      match({
        id: 'd1',
        poolId: 'p5',
        status: 'completed',
        teamAId: 'x',
        teamBId: 'y',
        winnerId: 'x',
        bestOf: 5,
        sets: [{ a: 21, b: 19 }, { a: 0, b: 21 }, { a: 21, b: 19 }, { a: 5, b: 21 }, { a: 21, b: 19 }],
      }),
      match({ id: 'mine-vs-rival', poolId: 'p5', status: 'scheduled', teamAId: 'mine', teamBId: 'rival', bestOf: 5 }),
    ];
    const win = roundScenariosOf(matches, 'p5', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBeNull();
  });

  it('MD5 com vitórias decidindo sozinho ainda afirma a posição', () => {
    // Mesmo formato de MD5 do teste anterior, mas aqui o atleta chega a 2V contra no máximo 1V
    // de qualquer rival — a contagem de vitórias decide sozinha em QUALQUER extremo, sem nunca
    // consultar saldo de sets/pontos. Serve pra garantir que o fix não super-corrigiu pra sempre
    // dizer "depende".
    const matches = [
      match({ id: 'd1', poolId: 'p6', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', bestOf: 5, sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
      match({ id: 'd2', poolId: 'p6', status: 'completed', teamAId: 'rival', teamBId: 'y', winnerId: 'rival', bestOf: 5, sets: [{ a: 21, b: 10 }, { a: 21, b: 11 }] }),
      match({ id: 'd3', poolId: 'p6', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', bestOf: 5, sets: [{ a: 21, b: 19 }, { a: 21, b: 18 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p6', status: 'scheduled', teamAId: 'mine', teamBId: 'rival', bestOf: 5 }),
    ];
    const win = roundScenariosOf(matches, 'p6', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBe(1);
    expect(win?.qualifies).toBe(true);
  });

  it('vitória em set único (MD1) ainda afirma a posição', () => {
    // Só 2 duplas no grupo: vencendo o único set, o atleta fica com a única vitória do grupo —
    // não tem como o saldo de sets/pontos discordar disso em nenhum extremo.
    const matches = [match({ id: 'mine-vs-rival', poolId: 'p7', status: 'scheduled', teamAId: 'mine', teamBId: 'rival', bestOf: 1 })];
    const win = roundScenariosOf(matches, 'p7', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    expect(win?.rank).toBe(1);
    expect(win?.qualifies).toBe(true);
    expect(win?.text).toBe('Vencendo, você termina em 1º do grupo e avança.');
  });
});

describe('winBoundsOf', () => {
  it('trava no maior formato real (MD5) mesmo com um bestOf malformado — sem alocar arrays proporcionais ao valor cru', () => {
    // `bestOf` chega cru do documento do Firestore (`matchBestOf` só cobre valores <= 0, caindo
    // pro padrão); nada trava o topo. Um documento malformado ou editado à mão com um número
    // gigante alocava arrays desse tamanho e travava a aba — Finding 4 da revisão.
    const [widest, narrowest] = winBoundsOf(99);
    expect(widest.length).toBe(3); // setsToWin de um MD5 (ceil(5 / 2))
    expect(narrowest.length).toBe(5); // total de sets de um MD5 (3 + 2)
  });
});
