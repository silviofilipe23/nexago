import type { TournamentMatch } from '../data/matches-repository';
import { BRACKET_PLANTS, type RawBracketMatch } from '../../../testing/bracket-plants.fixture';
import {
  BRACKET_MATCH_HEIGHT,
  BRACKET_MATCH_WIDTH,
  type DeLayoutNode,
  type DoubleEliminationLayout,
  assignEmptySlotCenters,
  assignFeedCenters,
  assignFeedDepths,
  bracketConvergenceMatches,
  buildBracketFeedTree,
  buildDoubleEliminationLayout,
  buildKnockoutTreeLayout,
} from './bracket-tree';

/** Fábrica mínima de `TournamentMatch` pros testes — só os campos que a geometria da chave
 *  lê (`matchType`, `roundNumber`, `matchNumber`, `winnerAdvance*`); o resto é o placeholder
 *  padrão do painel (mesmo padrão de `agendamento.component.spec.ts`). */
function match(overrides: Partial<TournamentMatch> & Pick<TournamentMatch, 'id' | 'matchType' | 'matchNumber'>): TournamentMatch {
  return {
    tournamentId: 't1',
    categoryId: 'cat-a',
    round: null,
    team1Label: 'A definir',
    team2Label: 'A definir',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: '',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    roundNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

/** Converte uma planta materializada (`bracket-plants.fixture.ts`, mesmo fixture do Dart —
 *  `nexago_app/test/fixtures/bracket_plants.json`) pro formato de `TournamentMatch`. */
function plant(size: number): TournamentMatch[] {
  const raw = BRACKET_PLANTS[size];
  if (!raw) throw new Error(`planta ${size} não existe no fixture`);
  return raw.map((m: RawBracketMatch) =>
    match({
      id: `m${m.matchNumber}`,
      matchType: m.matchType,
      matchNumber: m.matchNumber,
      roundNumber: m.round,
      winnerAdvanceMatchNumber: m.winnerAdvanceMatchNumber,
      winnerAdvanceSlot: m.winnerAdvanceSlot,
      loserAdvanceMatchNumber: m.loserAdvanceMatchNumber,
    }),
  );
}

const PLANT_SIZES = Object.keys(BRACKET_PLANTS).map(Number);

/** Planta mínima com o MESMO padrão de #19/#20 → #22 na planta 12: os dois alimentadores
 *  diretos da Final são tipados "WB" (a fiação decide quem cruza, não o `matchType`) — então
 *  a Final só cai em `convergence` pelo reconhecimento direto do tipo (`isFinalType`), nunca
 *  pelo atalho "um WB + um LB" que `sixTeamPlan` (com `w4`/`l5` alimentando a Final) já
 *  exercita. É esta planta que expõe o bug do alias "Grand Final" não reconhecido: os testes
 *  antigos com `sixTeamPlan`/`comAlias` continuavam verdes com o bug em pé. */
const CROSSOVER_FINAL_PLAN: TournamentMatch[] = [
  match({ id: 'w1', matchType: 'WB', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'A' }),
  match({ id: 'l2', matchType: 'LB', roundNumber: 1, matchNumber: 2, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'B' }),
  match({ id: 'w3', matchType: 'WB', roundNumber: 1, matchNumber: 3, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'A' }),
  match({ id: 'l4', matchType: 'LB', roundNumber: 1, matchNumber: 4, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'B' }),
  // #5 e #6 são as "semifinais cruzadas" — tipadas WB de propósito, como #19/#20 na planta 12.
  match({ id: 'w5', matchType: 'WB', roundNumber: 2, matchNumber: 5, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'A' }),
  match({ id: 'w6', matchType: 'WB', roundNumber: 2, matchNumber: 6, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'B' }),
  match({ id: 'gf', matchType: 'Grand Final', roundNumber: 1, matchNumber: 7 }),
];

describe('bracketConvergenceMatches', () => {
  it('planta de 12: convergência nas semifinais, na final e no 3º lugar', () => {
    // #19 e #20 são as semifinais cruzadas — juntam WB com LB. Elas têm matchType "WB" de
    // propósito (ver bracket-12-teams.ts), então a identificação NÃO pode sair do matchType.
    expect(bracketConvergenceMatches(plant(12))).toEqual(new Set([19, 20, 21, 22]));
  });

  it('planta de 10: convergência nas semifinais cruzadas, na final e no 3º lugar', () => {
    // #15 (WB) e #16 (LB) — juntam WB com LB. Diferente da 12, #16 é LB e não WB. Prova que
    // a lista de tipos não funciona: precisa da fiação.
    expect(bracketConvergenceMatches(plant(10))).toEqual(new Set([15, 16, 17, 18]));
  });

  it('planta de 8: convergência só na final e no 3º lugar', () => {
    expect(bracketConvergenceMatches(plant(8))).toEqual(new Set([13, 14]));
  });

  it('Final cruzada (dois alimentadores WB, padrão da planta 12) tipada "Grand Final" ainda entra em convergência', () => {
    // Bug de uma correção anterior que só ensinou o alias "Grand Final" pro rótulo
    // (`isFinalType`) e não pra convergência: aqui os dois alimentadores diretos da Final são
    // "WB" (`hasWb && hasLb` nunca bate), então só o reconhecimento direto do tipo salva.
    expect(bracketConvergenceMatches(CROSSOVER_FINAL_PLAN)).toContain(7);
  });

  it('plantas com cruzamento WB×LB antes da final (10, 12, 32) têm 4 partidas de convergência; as demais, 2', () => {
    for (const size of PLANT_SIZES) {
      const count = bracketConvergenceMatches(plant(size)).size;
      if (size === 10 || size === 12 || size === 32) {
        expect(count).withContext(`planta ${size} com cruzamento`).toBe(4);
      } else {
        expect(count).withContext(`planta ${size} sem cruzamento, só final + 3º lugar`).toBe(2);
      }
    }
  });
});

describe('buildBracketFeedTree', () => {
  it('planta de 12, lado WB da semifinal #19: o bye vira lugar vago', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'wb')!;
    expect(tree.matchNumber).toBe(16); // a quarta que alimenta a semifinal
    expect(tree.children.map((c) => c.matchNumber)).toEqual([5, 6]);

    // #5 é seed 2 (bye) contra o vencedor do #1: um lado só tem alimentador.
    const jogo5 = tree.children[0]!;
    expect(jogo5.children.length).toBe(2);
    expect(jogo5.children.filter((c) => c.matchNumber === null).length).toBe(1);
    expect(jogo5.span).toBe(2); // o bye ocupa um lugar
  });

  it('planta de 12, lado LB: a entrada do perdedor também vira lugar vago', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'lb')!;
    expect(tree.matchNumber).toBe(17); // #17 = V14 x P15
    expect(tree.children.filter((c) => c.matchNumber === null).length).toBe(1); // lado de P15 sem alimentador
    expect(tree.children.map((c) => c.matchNumber)).toContain(14);
    expect(tree.span).toBe(3);
  });

  it('a ponta da WB não ganha lugar vago — os dois lados são seeds', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'wb')!;
    const jogo1 = tree.children[0]!.children.find((c) => c.matchNumber === 1)!;
    expect(jogo1.children).toEqual([]);
    expect(jogo1.span).toBe(1);
  });

  it('devolve null quando a chave não alimenta aquela partida', () => {
    // O 3º lugar só recebe perdedores: nenhum lado tem alimentador desenhado.
    expect(buildBracketFeedTree(plant(12), 21, 'wb')).toBeNull();
    expect(buildBracketFeedTree(plant(12), 21, 'lb')).toBeNull();
  });

  it('devolve null quando a raiz recebe DOIS alimentadores da mesma chave — a final não é "um lado"', () => {
    // bracket-12-teams.ts: #22 (FINAL) = WINNER(#19) x WINNER(#20), as duas tipadas WB. A
    // final é o encontro de #19 e #20, não a continuação de um deles só.
    expect(buildBracketFeedTree(plant(12), 22, 'wb')).toBeNull();
  });

  it('planta de 8: a final tem um alimentador de cada chave — comportamento normal preservado', () => {
    // bracket-8-teams.ts: #14 (FINAL) = WINNER(#12, LB) x WINNER(#11, WB).
    expect(buildBracketFeedTree(plant(8), 14, 'wb')!.matchNumber).toBe(11);
    expect(buildBracketFeedTree(plant(8), 14, 'lb')!.matchNumber).toBe(12);
  });
});

describe('assignFeedCenters / assignFeedDepths / assignEmptySlotCenters', () => {
  it('as pontas ocupam meio lugar cada, o jogo fica na média dos filhos', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'wb')!;
    const centers = new Map<number, number>();
    assignFeedCenters(tree, 0, centers);

    // Lado WB de #19: [#5[ vago, #1 ], #6[ vago, #2 ]] — 4 lugares.
    expect(centers.get(1)).toBe(1.5);
    expect(centers.get(5)).toBe(1.0); // média entre o vago (0.5) e o #1 (1.5)
    expect(centers.get(2)).toBe(3.5);
    expect(centers.get(6)).toBe(3.0);
    expect(centers.get(16)).toBe(2.0); // média de #5 e #6
  });

  it('profundidade cresce ao se afastar do centro', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'wb')!;
    const depths = new Map<number, number>();
    assignFeedDepths(tree, 1, depths);
    expect(depths.get(16)).toBe(1); // quarta: encostada na faixa central
    expect(depths.get(5)).toBe(2);
    expect(depths.get(1)).toBe(3);
  });

  it('o lugar vago tem centro próprio, para o conector achar a ponta', () => {
    const tree = buildBracketFeedTree(plant(12), 19, 'wb')!;
    const vagos = new Map<number, number[]>();
    assignEmptySlotCenters(tree, 0, vagos);
    expect(vagos.get(5)).toEqual([0.5]); // o bye do #5 ocupa o primeiro lugar do bloco
    expect(vagos.get(6)).toEqual([2.5]);
    expect(vagos.has(1)).toBe(false); // ponta não tem lado vago
  });

  it('jogo interno usa a posição REAL do filho, não o meio geométrico do intervalo — filhos diretos com span diferente', () => {
    // Planta 9, WB #16: #13[ #10[ #4[ vago, #1 ], #5 ], #9[ #2, #3 ] ]. #10 (span 3) e #9
    // (span 2) são filhos DIRETOS de #13 com spans diferentes — a "entrada desigual" que a
    // tarefa precisa suportar.
    const tree = buildBracketFeedTree(plant(9), 16, 'wb')!;
    const centers = new Map<number, number>();
    assignFeedCenters(tree, 0, centers);

    // #10 não fica no meio do seu próprio intervalo [0,3) (que seria 1.5): fica em 1.75, a
    // média real de #4 (1.0) e #5 (2.5).
    expect(centers.get(10)).toBe(1.75);
    // #13 usa a posição REAL de #10 (1.75), não o meio geométrico do intervalo que #10
    // ocupa (1.5) — usar o meio geométrico dava 2.875... errado seria 2.75.
    expect(centers.get(13)).toBe(2.875);
  });
});

describe('buildDoubleEliminationLayout — geometria convergente', () => {
  function nodeOf(layout: DoubleEliminationLayout, id: string): DeLayoutNode {
    return layout.nodes.find((n) => n.match.id === id)!;
  }
  function centerY(node: DeLayoutNode): number {
    return node.top + BRACKET_MATCH_HEIGHT / 2;
  }
  function separados(a: DeLayoutNode, b: DeLayoutNode): boolean {
    return a.left + BRACKET_MATCH_WIDTH <= b.left || b.left + BRACKET_MATCH_WIDTH <= a.left || a.top + BRACKET_MATCH_HEIGHT <= b.top || b.top + BRACKET_MATCH_HEIGHT <= a.top;
  }
  /** Mesma fórmula de `pathFor` (privada em `bracket-tree.ts`): borda direita quando o
   *  destino está à direita, esquerda quando está à esquerda — reconstruída aqui só pra
   *  comparar com `edges[].d`, já que o edge não guarda `fromMatchId`/`toMatchId` (o mesmo
   *  formato que o painel já usava antes desta tarefa). */
  function pathBetween(a: DeLayoutNode, b: DeLayoutNode): string {
    const toRight = b.left >= a.left;
    const x1 = toRight ? a.left + BRACKET_MATCH_WIDTH : a.left;
    const y1 = a.top + BRACKET_MATCH_HEIGHT / 2;
    const x2 = toRight ? b.left : b.left + BRACKET_MATCH_WIDTH;
    const y2 = b.top + BRACKET_MATCH_HEIGHT / 2;
    const midX = x1 + (x2 - x1) / 2;
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }
  function hasEdge(layout: DoubleEliminationLayout, fromId: string, toId: string): boolean {
    return layout.edges.some((e) => e.d === pathBetween(nodeOf(layout, fromId), nodeOf(layout, toId)));
  }

  // Planta de 6 duplas (`functions/src/bracket-definitions/bracket-6-teams.ts`): fiação
  // irregular — #1 alimenta o slot B do #3, #2 alimenta o slot A do #4.
  const sixTeamPlan: TournamentMatch[] = [
    match({ id: 'w1', matchType: 'WB', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'B' }),
    match({ id: 'w2', matchType: 'WB', roundNumber: 1, matchNumber: 2, winnerAdvanceMatchNumber: 4, winnerAdvanceSlot: 'A' }),
    match({ id: 'w3', matchType: 'WB', roundNumber: 2, matchNumber: 3, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'A' }),
    match({ id: 'w4', matchType: 'WB', roundNumber: 2, matchNumber: 4, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'B' }),
    match({ id: 'l5', matchType: 'LB', roundNumber: 1, matchNumber: 5, winnerAdvanceMatchNumber: 8, winnerAdvanceSlot: 'A' }),
    match({ id: 'l6', matchType: 'LB', roundNumber: 1, matchNumber: 6, winnerAdvanceMatchNumber: 8, winnerAdvanceSlot: 'B' }),
    match({ id: 'w7', matchType: 'WB', roundNumber: 3, matchNumber: 7, winnerAdvanceMatchNumber: 11, winnerAdvanceSlot: 'B' }),
    match({ id: 'l8', matchType: 'LB', roundNumber: 2, matchNumber: 8, winnerAdvanceMatchNumber: 9, winnerAdvanceSlot: 'B' }),
    match({ id: 'l9', matchType: 'LB', roundNumber: 3, matchNumber: 9, winnerAdvanceMatchNumber: 11, winnerAdvanceSlot: 'A' }),
    match({ id: 'tp', matchType: 'Third Place', roundNumber: 1, matchNumber: 10 }),
    match({ id: 'gf', matchType: 'Final', roundNumber: 1, matchNumber: 11 }),
  ];

  it('WB à esquerda do centro, LB à direita, convergência no meio (planta 12)', () => {
    const layout = buildDoubleEliminationLayout(plant(12))!;
    const xOf = (n: number): number => nodeOf(layout, `m${n}`).left;

    // #16 (quarta da WB) → #19 (semifinal) ← #17 (LB)
    expect(xOf(16)).toBeLessThan(xOf(19));
    expect(xOf(17)).toBeGreaterThan(xOf(19));
    // A LB corre da direita para o centro: a R1 fica na ponta direita.
    expect(xOf(11)).toBeGreaterThan(xOf(14));
    expect(xOf(14)).toBeGreaterThan(xOf(17));
  });

  it('a semifinal fica na média vertical dos seus dois alimentadores (planta 12)', () => {
    const layout = buildDoubleEliminationLayout(plant(12))!;
    const cy = (n: number): number => centerY(nodeOf(layout, `m${n}`));
    expect(cy(19)).toBeCloseTo((cy(16) + cy(17)) / 2, 2);
    expect(cy(20)).toBeCloseTo((cy(15) + cy(18)) / 2, 2);
  });

  it('partida de cruzamento fica na média dos alimentadores mesmo com Final/3º lugar espremidos entre elas (planta 10)', () => {
    // #15 e #16 são as partidas de cruzamento (WB×LB) da planta 10, empilhadas pelo
    // `slotCursor` sem folga reservada entre blocos (a folga foi removida — Final e 3º
    // lugar não moram mais nesta faixa central; ver comentário em `buildDoubleEliminationLayout`).
    // #17 (3º lugar) e #18 (Final) não têm árvore própria nesta planta e são posicionadas
    // DEPOIS, fora da sequência do `slotCursor`, lado a lado nas colunas vizinhas ao centro
    // (a Final na 2, o 3º lugar na 4 — a coluna central é a 3, exclusiva das partidas de
    // cruzamento). Por estarem fora dessa sequência, #17/#18 nunca podem empurrar #15 ou
    // #16 pra fora da média exata dos seus dois alimentadores — é isso que este teste protege.
    const layout = buildDoubleEliminationLayout(plant(10))!;
    const cy = (n: number): number => centerY(nodeOf(layout, `m${n}`));
    expect(cy(15)).toBeCloseTo((cy(11) + cy(13)) / 2, 2);
    expect(cy(16)).toBeCloseTo((cy(12) + cy(14)) / 2, 2);
  });

  it('nenhum par de cards se sobrepõe em nenhuma das 25 plantas', () => {
    for (const size of PLANT_SIZES) {
      const layout = buildDoubleEliminationLayout(plant(size))!;
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          expect(separados(layout.nodes[i]!, layout.nodes[j]!)).withContext(`planta ${size}: ${layout.nodes[i]!.match.id} e ${layout.nodes[j]!.match.id} se sobrepõem`).toBe(true);
        }
      }
    }
  });

  it('as duas semifinais não colidem (planta 12)', () => {
    const layout = buildDoubleEliminationLayout(plant(12))!;
    const a = nodeOf(layout, 'm19');
    const b = nodeOf(layout, 'm20');
    expect(Math.abs(a.top - b.top)).toBeGreaterThanOrEqual(BRACKET_MATCH_HEIGHT);
  });

  it('o jogo com bye desloca — não cola na altura do alimentador (planta 12)', () => {
    // #5 recebe o seed 2 (bye) e o vencedor do #1. Se colasse no #1, os dois teriam o mesmo
    // centro — o bug que o desenho antigo tinha.
    const layout = buildDoubleEliminationLayout(plant(12))!;
    const cy = (n: number): number => centerY(nodeOf(layout, `m${n}`));
    expect(cy(5)).not.toBeCloseTo(cy(1), 2);
    expect(cy(5)).toBeLessThan(cy(1));
  });

  it('colunas seguem a ordem convergente — WB esquerda→centro, Final no centro, 3º lugar em coluna própria ADJACENTE (empurra a LB), LB direita→centro', () => {
    const layout = buildDoubleEliminationLayout(sixTeamPlan)!;
    expect(layout.nodes.length).toBe(11);

    // Nesta planta a Final converge direto (feita por w7 e l9), então fica sozinha na
    // coluna central; o vizinho dela do lado LB já tem o próprio alimentador LB da Final na
    // mesma altura — nunca cabe o 3º lugar junto. Cai na coluna própria adjacente, na MESMA
    // altura da Final.
    const labels = [...layout.labels].sort((a, b) => a.left - b.left).map((l) => l.label);
    expect(labels).toEqual(['WB · RODADA 1', 'WB · RODADA 2', 'WB · RODADA 3', 'FINAL', '3º LUGAR', 'LB · RODADA 3', 'LB · RODADA 2', 'LB · RODADA 1']);

    expect(centerY(nodeOf(layout, 'tp'))).toBeCloseTo(centerY(nodeOf(layout, 'gf')), 2);
    // Adjacente de verdade: só uma largura de coluna entre as duas.
    const passo = BRACKET_MATCH_WIDTH + 56;
    expect(nodeOf(layout, 'tp').left - nodeOf(layout, 'gf').left).toBeCloseTo(passo, 2);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it('planta 12: Final e 3º lugar dividem as colunas vizinhas ao centro, na mesma altura — Final à esquerda, 3º lugar à direita', () => {
    // O exemplo do dono: a coluna das quartas (que alimentam o cruzamento) tem um vão
    // vertical de sobra — a Final cabe nele. A coluna da LB R3 tem o mesmo vão — o 3º lugar
    // cabe nela. Ordem da folha impressa do Goiânia Open ("22 - FINAL" à esquerda, "21 - 3º
    // Lugar" à direita). Nenhuma delas ganha coluna nova, e a LB não é empurrada.
    const layout = buildDoubleEliminationLayout(plant(12))!;
    const terceiro = nodeOf(layout, 'm21');
    const finalNode = nodeOf(layout, 'm22');
    const quartaWb = nodeOf(layout, 'm15'); // quarta que alimenta o cruzamento
    const lbR3 = nodeOf(layout, 'm17'); // LB R3 que alimenta o cruzamento

    expect(finalNode.left).toBe(quartaWb.left);
    expect(terceiro.left).toBe(lbR3.left);
    expect(finalNode.left).toBeLessThan(terceiro.left);
    expect(centerY(terceiro)).toBeCloseTo(centerY(finalNode), 2);

    for (const n of layout.nodes) {
      if (n.match.id === 'm21' || n.match.id === 'm22') continue;
      expect(separados(terceiro, n)).withContext(`3º lugar se sobrepõe a ${n.match.id}`).toBe(true);
      expect(separados(finalNode, n)).withContext(`Final se sobrepõe a ${n.match.id}`).toBe(true);
    }
  });

  it('toda planta: Final à esquerda do 3º lugar, mesma linha horizontal, colunas vizinhas ou separadas só pela coluna de cruzamento', () => {
    const passo = BRACKET_MATCH_WIDTH + 56;
    for (const size of PLANT_SIZES) {
      const matches = plant(size);
      const layout = buildDoubleEliminationLayout(matches)!;
      const convergencia = bracketConvergenceMatches(matches);
      const byNumber = new Map(matches.map((m) => [m.matchNumber, m]));
      let finalNum: number | undefined;
      let thirdNum: number | undefined;
      for (const n of convergencia) {
        const tipo = byNumber.get(n)!.matchType.trim().toLowerCase();
        if (tipo === 'final') finalNum = n;
        if (tipo === 'third place') thirdNum = n;
      }
      if (finalNum == null || thirdNum == null) continue;
      const finalNode = nodeOf(layout, `m${finalNum}`);
      const thirdNode = nodeOf(layout, `m${thirdNum}`);

      expect(finalNode.left).withContext(`planta ${size}: Final não está à esquerda do 3º lugar`).toBeLessThan(thirdNode.left);
      expect(centerY(thirdNode)).withContext(`planta ${size}: 3º lugar e Final não estão na mesma linha`).toBeCloseTo(centerY(finalNode), 2);

      const distancia = thirdNode.left - finalNode.left;
      const ladoALado = Math.abs(distancia - passo) < 0.01 || Math.abs(distancia - passo * 2) < 0.01;
      expect(ladoALado).withContext(`planta ${size}: Final e 3º lugar não estão lado a lado (distância ${distancia})`).toBe(true);
    }
  });

  it('planta 25: duas colunas "LB · RODADA 2" recebem keys diferentes', () => {
    // #10 é o play-in da LB gravado com o MESMO round (2) da coluna real "LB · RODADA 2"
    // (#19…#26) que ele alimenta — `bracketGroupKey` bate por coincidência de round, mas
    // são colunas (profundidades) diferentes e não podem reivindicar a mesma identidade
    // visual.
    const layout = buildDoubleEliminationLayout(plant(25))!;
    const m10 = nodeOf(layout, 'm10');
    const m19 = nodeOf(layout, 'm19');
    expect(m10.left).not.toBe(m19.left);

    const keys = layout.labels.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('alias "Grand Final" é reconhecido como Final em chave de dupla eliminação', () => {
    // A CF grava `matchType` da decisão como "Final" hoje, mas o resto do código já trata
    // "Grand Final"/"grand_final" como sinônimo — o motor de layout não pode ser o único
    // lugar que não reconhece o alias.
    const comAlias: TournamentMatch[] = [
      match({ id: 'w1', matchType: 'WB', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: 4, winnerAdvanceSlot: 'A' }),
      match({ id: 'w2', matchType: 'WB', roundNumber: 1, matchNumber: 2, winnerAdvanceMatchNumber: 4, winnerAdvanceSlot: 'B' }),
      match({ id: 'l3', matchType: 'LB', roundNumber: 1, matchNumber: 3, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'A' }),
      match({ id: 'w4', matchType: 'WB', roundNumber: 2, matchNumber: 4, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'A' }),
      match({ id: 'l5', matchType: 'LB', roundNumber: 2, matchNumber: 5, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'B' }),
      match({ id: 'tp', matchType: 'Third Place', roundNumber: 1, matchNumber: 6 }),
      match({ id: 'gf', matchType: 'Grand Final', roundNumber: 1, matchNumber: 7 }),
    ];
    const layout = buildDoubleEliminationLayout(comAlias)!;
    expect(layout.nodes.length).toBe(7);

    // Reconhecida como Final: rotulada (nunca "DESFECHO", o aviso genérico de mistura
    // inesperada) e sem aresta chegando (dupla eliminação não desenha linha até a Final)
    // mesmo w4/l5 tendo `winnerAdvance` real apontando pra ela.
    const gf = nodeOf(layout, 'gf');
    const gfLabel = layout.labels.find((l) => l.left === gf.left);
    expect(gfLabel?.label).toBe('FINAL');
    expect(hasEdge(layout, 'w4', 'gf')).toBeFalse();
    expect(hasEdge(layout, 'l5', 'gf')).toBeFalse();
  });

  it('Final cruzada (padrão da planta 12) tipada "Grand Final" não vira órfã: ganha coluna adjacente ao cruzamento, rotulada FINAL', () => {
    // Diferente do teste acima (`comAlias`, onde w4/l5 alimentam a Final com um WB e um LB
    // cada — o atalho que `bracketConvergenceMatches` já acertava mesmo com o bug): aqui os
    // dois alimentadores diretos são "WB" (o padrão real de #19/#20 → #22 na planta 12). Sem
    // o reconhecimento do alias em `bracketConvergenceMatches`, a Final não virava `finalRoot`
    // e sobrava como órfã numa coluna extra à direita de tudo.
    const layout = buildDoubleEliminationLayout(CROSSOVER_FINAL_PLAN)!;
    expect(layout.nodes.length).toBe(7);

    const gf = nodeOf(layout, 'gf');
    const gfLabel = layout.labels.find((l) => l.left === gf.left);
    expect(gfLabel?.label).toBe('FINAL');
    expect(gfLabel?.label).not.toBe('DESFECHO');

    // Adjacente à coluna de cruzamento (w5/w6), não isolada longe de tudo.
    const passo = BRACKET_MATCH_WIDTH + 56;
    const w5 = nodeOf(layout, 'w5');
    expect(Math.abs(gf.left - w5.left)).toBeCloseTo(passo, 2);
  });

  it('edges seguem a fiação real de avanço, não o pareamento posicional', () => {
    const layout = buildDoubleEliminationLayout(sixTeamPlan)!;

    // Fiação real da planta de 6: #1→#3 e #2→#4 (posicional daria #2→#3).
    expect(hasEdge(layout, 'w1', 'w3')).toBeTrue();
    expect(hasEdge(layout, 'w2', 'w4')).toBeTrue();
    expect(hasEdge(layout, 'w2', 'w3')).toBeFalse();
    expect(hasEdge(layout, 'w3', 'w7')).toBeTrue();
    expect(hasEdge(layout, 'w4', 'w7')).toBeTrue();
    expect(hasEdge(layout, 'l5', 'l8')).toBeTrue();
    expect(hasEdge(layout, 'l6', 'l8')).toBeTrue();
    expect(hasEdge(layout, 'l8', 'l9')).toBeTrue();

    // A Final NÃO recebe aresta em chave de dupla eliminação, mesmo w7/l9 tendo
    // `winnerAdvance` real apontando pra ela.
    expect(hasEdge(layout, 'w7', 'gf')).toBeFalse();
    expect(hasEdge(layout, 'l9', 'gf')).toBeFalse();
    expect(hasEdge(layout, 'w7', 'l9')).toBeFalse();
  });

  it('chave de dupla eliminação: nenhuma aresta chega na Final nem no 3º lugar, nas 25 plantas', () => {
    // As 25 plantas têm `winnerAdvance` real apontando pra Final/3º lugar (inclusive nas
    // que cruzam, 10/12/32) — a garantia é que isso NUNCA vira uma aresta desenhada.
    for (const size of PLANT_SIZES) {
      const matches = plant(size);
      const layout = buildDoubleEliminationLayout(matches)!;
      const byNumber = new Map(matches.map((m) => [m.matchNumber, m]));
      for (const m of matches) {
        const dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        const targetType = byNumber.get(dest)?.matchType.trim().toLowerCase();
        if (targetType !== 'final' && targetType !== 'third place') continue;
        expect(hasEdge(layout, `m${m.matchNumber}`, `m${dest}`)).withContext(`planta ${size}: ${m.matchNumber} → ${dest} não devia virar aresta`).toBe(false);
      }
    }
  });

  it('órfã sem coluna alcançável numa chave com convergência cai no agrupamento legado, à direita de tudo', () => {
    // Não ocorre nas 25 plantas reais, mas é possível numa chave editada à mão: #12 aponta
    // pra um matchNumber que não existe (99), então nunca é alcançada pela travessia que
    // monta a árvore de alimentação a partir dos pontos de convergência — sobra sem coluna.
    const comOrfa: TournamentMatch[] = [...sixTeamPlan, match({ id: 'w12', matchType: 'WB', roundNumber: 1, matchNumber: 12, winnerAdvanceMatchNumber: 99, winnerAdvanceSlot: null })];
    const layout = buildDoubleEliminationLayout(comOrfa)!;

    expect(layout.nodes.length).toBe(12);
    const orfa = nodeOf(layout, 'w12');
    for (const n of layout.nodes) {
      if (n.match.id === 'w12') continue;
      expect(orfa.left).withContext(`a órfã devia ficar à direita de ${n.match.id}`).toBeGreaterThan(n.left);
    }
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        expect(separados(layout.nodes[i]!, layout.nodes[j]!)).withContext(`${layout.nodes[i]!.match.id} e ${layout.nodes[j]!.match.id} se sobrepõem`).toBe(true);
      }
    }
  });

  it('chave de dupla eliminação legada, sem fiação gravada, ainda monta sem conectores', () => {
    // Formato anterior à migração que passou a gravar `winnerAdvance` — precisa continuar
    // desenhando algo em vez de quebrar. Ver decisão nº 8 no topo de `bracket-tree.ts`.
    const legacy: TournamentMatch[] = [
      match({ id: 'w1', matchType: 'WB', roundNumber: 1, matchNumber: 1 }),
      match({ id: 'w2', matchType: 'WB', roundNumber: 1, matchNumber: 2 }),
      match({ id: 'w3', matchType: 'WB', roundNumber: 2, matchNumber: 3 }),
      match({ id: 'gf', matchType: 'Final', roundNumber: 1, matchNumber: 4 }),
    ];
    const layout = buildDoubleEliminationLayout(legacy)!;
    expect(layout.nodes.length).toBe(4);
    expect(layout.edges).toEqual([]);
    expect(centerY(nodeOf(layout, 'w1'))).toBeLessThan(centerY(nodeOf(layout, 'w2')));
  });

  it('a LB liga na faixa central; a queda continua sem linha (planta 12)', () => {
    const layout = buildDoubleEliminationLayout(plant(12))!;
    expect(hasEdge(layout, 'm17', 'm19')).toBeTrue(); // vencedor da LB entra na semifinal
    expect(hasEdge(layout, 'm18', 'm20')).toBeTrue();
    expect(hasEdge(layout, 'm16', 'm19')).toBeTrue();
    // A semifinal NÃO liga na Final (dupla eliminação não desenha linha até a Final/3º lugar).
    expect(hasEdge(layout, 'm19', 'm22')).toBeFalse();
    // Queda: #15 perde e desce pro #17 — sem linha, por decisão do dono.
    expect(hasEdge(layout, 'm15', 'm17')).toBeFalse();
  });

  it('devolve null pra chave sem partidas de dupla eliminação (sem wb/lb) — cabe a buildKnockoutTreeLayout', () => {
    // `buildDoubleEliminationLayout` recusa de propósito: eliminatória simples já tem motor
    // próprio no portal (`buildKnockoutTreeLayout`), diferente do app, onde a MESMA função
    // serve os dois formatos.
    const knockout: TournamentMatch[] = [
      match({ id: 'sf1', matchType: 'knockout', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'A' }),
      match({ id: 'sf2', matchType: 'knockout', roundNumber: 1, matchNumber: 2, winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'B' }),
      match({ id: 'final', matchType: 'Final', roundNumber: 1, matchNumber: 3 }),
    ];
    expect(buildDoubleEliminationLayout(knockout)).toBeNull();
  });

  it('devolve null pra lista de partidas vazia', () => {
    expect(buildDoubleEliminationLayout([])).toBeNull();
  });
});

describe('buildKnockoutTreeLayout — mata-mata simples', () => {
  // 4 duplas: duas semifinais (mesma coluna 'knockout:1'), Final e 3º lugar.
  const simpleKnockout: TournamentMatch[] = [
    match({ id: 'sf1', matchType: 'knockout', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'A' }),
    match({ id: 'sf2', matchType: 'knockout', roundNumber: 1, matchNumber: 2, winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'B' }),
    match({ id: 'final', matchType: 'Final', roundNumber: 1, matchNumber: 3 }),
    match({ id: 'third', matchType: 'Third Place', roundNumber: 1, matchNumber: 4 }),
  ];

  // Paridade com o app (`_placeLegacyGroups`): a Final vem ANTES do 3º lugar na disposição
  // horizontal. Antes desta correção, `buildKnockoutTreeLayout` colocava o 3º lugar primeiro
  // (`… Semifinais → 3º LUGAR → FINAL`), divergindo do app (`… Semifinais → FINAL → 3º LUGAR`).
  it('Final vem antes do 3º lugar na disposição horizontal', () => {
    const layout = buildKnockoutTreeLayout(simpleKnockout)!;
    const finalNode = layout.nodes.find((n) => n.match.id === 'final')!;
    const thirdNode = layout.nodes.find((n) => n.match.id === 'third')!;
    expect(finalNode.left).toBeLessThan(thirdNode.left);
  });

  // Com o 3º lugar espremido ENTRE a corrente e a Final (ordem antiga), o cotovelo de
  // `pathFor` (a única aresta desenhada nesse trecho — semi→Final) caía dentro da faixa X do
  // card do 3º lugar. Colocar a Final logo após a corrente resolve as duas coisas juntas.
  it('a aresta semi→Final não atravessa a coluna do 3º lugar', () => {
    const layout = buildKnockoutTreeLayout(simpleKnockout)!;
    const thirdNode = layout.nodes.find((n) => n.match.id === 'third')!;
    expect(layout.edges.length).toBeGreaterThan(0);
    for (const edge of layout.edges) {
      // A path é sempre "M x1 y1 H midX V y2 H x2" — só os X importam aqui.
      const numbers = [...edge.d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
      const [x1, , midX, , x2] = numbers;
      for (const x of [x1, midX, x2]) {
        const dentroDoCard = x! > thirdNode.left && x! < thirdNode.left + BRACKET_MATCH_WIDTH;
        expect(dentroDoCard).toBeFalse();
      }
    }
  });
});
