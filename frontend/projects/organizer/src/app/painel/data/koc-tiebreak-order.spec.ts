import { kocCrownOrder, kocQualifyingTieGroup, kocTiebreakOrder } from './koc';
import type { KocRallyEntry, KocRoundState } from './koc';

/**
 * A mini-rodada que resolve o empate de três ou mais.
 *
 * "Rally único entre as empatadas" não diz o que fazer com três duplas — um
 * rally tem dois lados. Elas jogam o próprio formato, e quem começa no TRONO é
 * a melhor pelo critério automático do servidor (rei mais recente, depois ordem
 * de entrada). O portal não recebe `crownOrder`: reconstrói do log.
 *
 * O caso base não é hipotético — um único rally `king` num elenco de 4 já deixa
 * as outras três empatadas em 0.
 */

function round(over: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['a', 'b', 'c', 'd'],
    kingTeamId: 'a',
    challengerTeamId: 'b',
    queue: ['c', 'd'],
    points: {},
    rallies: 0,
    servingTeamId: 'a',
    clock: null,
    standings: [],
    qualifiersPerRound: 2,
    teamsPerCourt: 4,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 1,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
    ...over,
  };
}

function rally(seq: number, winner: KocRallyEntry['winner'], teamId = ''): KocRallyEntry {
  return { seq, winner, teamId, atMs: 1000 * seq };
}

describe('kocCrownOrder', () => {
  it('sem rally nenhum, só quem abriu no trono', () => {
    expect(kocCrownOrder(round())).toEqual(['a']);
  });

  it('o rei que vence não muda a coroa', () => {
    expect(kocCrownOrder(round({ rallyLog: [rally(1, 'king')] }))).toEqual(['a']);
  });

  it('o desafiante que vence entra na ordem das coroas', () => {
    // a abre; b vence e assume; entra c, que vence e assume.
    const r = round({ rallyLog: [rally(1, 'challenger'), rally(2, 'challenger')] });
    expect(kocCrownOrder(r)).toEqual(['a', 'b', 'c']);
  });

  it('erro de saque não coroa ninguém', () => {
    const r = round({ rallyLog: [rally(1, 'serve_fault')] });
    expect(kocCrownOrder(r)).toEqual(['a']);
  });

  it('a bola de ouro não mexe na fila nem nas coroas', () => {
    const r = round({ rallyLog: [rally(1, 'challenger'), rally(2, 'golden_point', 'd')] });
    expect(kocCrownOrder(r)).toEqual(['a', 'b']);
  });
});

describe('kocTiebreakOrder · a mini-rodada', () => {
  it('um único rally já empata três duplas em 0', () => {
    // O caso que motivou a regra: a pontua, e b, c, d ficam em 0 disputando a
    // 2ª vaga.
    const r = round({ rallyLog: [rally(1, 'king')], points: { a: 1 } });
    expect(kocQualifyingTieGroup(r)).toEqual(['b', 'c', 'd']);
  });

  it('quem foi rei por último começa no trono', () => {
    // a abre no trono, b vence e assume, depois b pontua duas vezes. Ficam
    // empatadas em 0: a (ex-rei), c e d. A ordem tem que pôr `a` no trono.
    const r = round({
      rallyLog: [rally(1, 'challenger'), rally(2, 'king'), rally(3, 'king')],
      points: { b: 2 },
    });
    expect(kocQualifyingTieGroup(r)).toContain('a');
    expect(kocTiebreakOrder(r)[0]).toBe('a');
  });

  it('sem coroa nenhuma entre as empatadas, vale a ordem de entrada', () => {
    const r = round({ rallyLog: [rally(1, 'king')], points: { a: 1 } });
    expect(kocTiebreakOrder(r)).toEqual(['b', 'c', 'd']);
  });

  it('a ordem contém exatamente as empatadas, sem repetir nem faltar', () => {
    const r = round({ rallyLog: [rally(1, 'king')], points: { a: 1 } });
    const ordem = kocTiebreakOrder(r);
    expect([...ordem].sort()).toEqual([...kocQualifyingTieGroup(r)].sort());
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it('sem empate na vaga, não há mini-rodada', () => {
    const r = round({ points: { a: 3, b: 2, c: 1 } });
    expect(kocTiebreakOrder(r)).toEqual([]);
  });

  it('com duas empatadas a ordem existe mas não muda nada — é bola de ouro', () => {
    // Empate PELA VAGA: com 2 classificando, as posições 2 e 3 empatadas.
    // (a:3 | b:1 c:1 | d:0 — b e c disputam a segunda vaga.)
    const r = round({ points: { a: 3, b: 1, c: 1, d: 0 } });
    expect(kocQualifyingTieGroup(r)).toEqual(['b', 'c']);
    expect(kocTiebreakOrder(r).length).toBe(2);
  });
});
