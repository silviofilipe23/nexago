import type { TournamentMatch } from '../../painel/data/matches-repository';
import { categoriesWithChave, chaveMatchesOf, chaveViewOf } from './overlay-chave';

function m(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: `m${over.matchNumber}`, tournamentId: 't', categoryId: 'c1', round: 'Rodada 1', team1Label: 'A definir', team2Label: 'A definir',
    score: null, winnerSide: null, scheduledAt: new Date(2026, 9, 6, 16, 0), court: 'Quadra 1', status: 'scheduled', teamAId: '', teamBId: '', sets: [],
    courtId: 'q1', scheduleEndAt: null, dayKey: '', bestOf: 1, matchType: 'knockout', roundNumber: 1, matchNumber: 1, winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null, loserAdvanceMatchNumber: null, liveScore: null, currentSetIndex: null, servingTeamId: '', servingPlayerSlot: 0,
    medicalTimeout: null, matchStartedAt: null, matchEndedAt: null, ...over,
  };
}

/** Eliminatória simples de 8: quartas 1–4, semis 5–6, final 7, 3º lugar 8. */
function simples(over: Record<number, Partial<TournamentMatch>> = {}): TournamentMatch[] {
  const base: Partial<TournamentMatch>[] = [
    { matchNumber: 1, roundNumber: 1, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'A', teamAId: 'a1', teamBId: 'b1', team1Label: 'Alison / Bruno', team2Label: 'Kaio / Renan' },
    { matchNumber: 2, roundNumber: 1, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'B', teamAId: 'a2', teamBId: 'b2', team1Label: 'George / André', team2Label: 'Pedro / Guto' },
    { matchNumber: 3, roundNumber: 1, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'A', teamAId: 'a3', teamBId: 'b3', team1Label: 'Renato / Vitor Felipe', team2Label: 'Saymon / Oscar' },
    { matchNumber: 4, roundNumber: 1, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'B', teamAId: 'a4', teamBId: 'b4', team1Label: 'Evandro / Arthur', team2Label: 'Hölting / B' },
    { matchNumber: 5, roundNumber: 2, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'A', loserAdvanceMatchNumber: 8, team1Label: 'Vencedor Jogo #1', team2Label: 'Vencedor Jogo #2' },
    { matchNumber: 6, roundNumber: 2, winnerAdvanceMatchNumber: 7, winnerAdvanceSlot: 'B', loserAdvanceMatchNumber: 8 },
    { matchNumber: 7, roundNumber: 3, matchType: 'Final', round: 'Final' },
    { matchNumber: 8, roundNumber: 3, matchType: 'Third Place', round: '3º Lugar' },
  ];
  return base.map((b) => m({ ...b, ...(over[b.matchNumber!] ?? {}) }));
}

describe('overlay-chave', () => {
  it('categorias com chave e filtro (sem grupo nem KOTC)', () => {
    const ms = [...simples(), m({ matchNumber: 20, categoryId: 'c2', matchType: 'group', round: 'Grupo A' }), m({ matchNumber: 21, categoryId: 'c3', matchType: 'koc_round' })];
    expect(categoriesWithChave(ms)).toEqual(['c1']);
    expect(chaveMatchesOf(ms, 'c1').length).toBe(8);
  });

  it('eliminatória simples: códigos, colunas e tags', () => {
    const v = chaveViewOf(simples({ 1: { status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }] }, 4: { status: 'in_progress', sets: [{ a: 11, b: 9 }] } }), 'c1')!;
    expect(v.kind).toBe('simples');
    expect(v.formatLabel).toBe('Eliminatória simples');
    const by = (n: number) => v.nodes.find((x) => x.matchNumber === n)!;
    expect([1, 2, 5, 6, 7, 8].map((n) => by(n).code)).toEqual(['QUARTAS 1', 'QUARTAS 2', 'SEMI 1', 'SEMI 2', 'FINAL', '3º LUGAR']);
    expect(by(1).tag).toEqual({ kind: 'fim', text: 'Fim' });
    expect(by(1).a.winner).toBeTrue();
    expect(by(1).a.score).toBe(21);
    expect(by(1).b.loser).toBeTrue();
    expect(by(4).tag.kind).toBe('live');
    expect(by(4).a.score).toBe(11);
    expect(by(2).tag).toEqual({ kind: 'hora', text: '16:00' });
    expect(by(1).court).toBe('Q1');
    // colunas à esquerda → direita
    expect(by(1).col).toBeLessThan(by(5).col);
    expect(by(5).col).toBeLessThan(by(7).col);
  });

  it('dentro da coluna os cartões entram de cima pra baixo (row)', () => {
    const v = chaveViewOf(simples(), 'c1')!;
    const quartas = v.nodes.filter((n) => n.col === 0).sort((a, b) => a.top - b.top);
    expect(quartas.map((n) => n.row)).toEqual([0, 1, 2, 3]);
    expect(quartas.map((n) => n.matchNumber)).toEqual([1, 2, 3, 4]);
  });

  it('vagas sem dupla dizem de onde vêm (Vencedor Quartas 4, Perdedor Semi 1…)', () => {
    const v = chaveViewOf(simples(), 'c1')!;
    const by = (n: number) => v.nodes.find((x) => x.matchNumber === n)!;
    expect(by(5).a).toEqual(jasmine.objectContaining({ placeholder: true, label: 'Vencedor Quartas 1' }));
    expect(by(5).b.label).toBe('Vencedor Quartas 2');
    expect(by(6).b.label).toBe('Vencedor Quartas 4');
    expect(by(7).a.label).toBe('Vencedor Semi 1');
    expect(by(7).b.label).toBe('Vencedor Semi 2');
    expect(by(8).a.label).toBe('Perdedor Semi 1');
    expect(by(8).b.label).toBe('Perdedor Semi 2');
  });

  it('ligações acendem quando o jogo de origem termina', () => {
    const feitas = chaveViewOf(simples({ 1: { status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }] } }), 'c1')!.edges.filter((e) => e.done).length;
    const nenhuma = chaveViewOf(simples(), 'c1')!.edges.filter((e) => e.done).length;
    expect(nenhuma).toBe(0);
    expect(feitas).toBe(1);
    expect(chaveViewOf(simples(), 'c1')!.edges.every((e) => e.d.startsWith('M '))).toBeTrue();
  });


  it('melhor de 3 mostra sets vencidos; sem partidas da categoria não há chave', () => {
    const v = chaveViewOf(simples({ 1: { bestOf: 3, status: 'completed', winnerSide: 1, sets: [{ a: 21, b: 15 }, { a: 18, b: 21 }, { a: 15, b: 10 }] } }), 'c1')!;
    expect(v.nodes.find((n) => n.matchNumber === 1)!.a.score).toBe(2);
    expect(v.nodes.find((n) => n.matchNumber === 1)!.b.score).toBe(1);
    expect(chaveViewOf(simples(), 'outra')).toBeNull();
  });

  it('dupla eliminatória: códigos V/P/GF e nada fora da tela', () => {
    const wb = (n: number, over: Partial<TournamentMatch>) => m({ matchNumber: n, matchType: 'WB', roundNumber: 1, ...over });
    const ms = [
      wb(1, { winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'A', loserAdvanceMatchNumber: 4, teamAId: 'a', teamBId: 'b', team1Label: 'A1 / A2', team2Label: 'B1 / B2' }),
      wb(2, { winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'B', loserAdvanceMatchNumber: 4, teamAId: 'c', teamBId: 'd', team1Label: 'C1 / C2', team2Label: 'D1 / D2' }),
      wb(3, { roundNumber: 2, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'A', loserAdvanceMatchNumber: 7 }),
      m({ matchNumber: 4, matchType: 'LB', roundNumber: 1, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'B' }),
      m({ matchNumber: 5, matchType: 'LB', roundNumber: 2, winnerAdvanceMatchNumber: 6, winnerAdvanceSlot: 'B', loserAdvanceMatchNumber: 7 }),
      m({ matchNumber: 6, matchType: 'Final', roundNumber: 3, round: 'Final' }),
      m({ matchNumber: 7, matchType: 'Third Place', roundNumber: 3, round: '3º Lugar' }),
    ];
    const v = chaveViewOf(ms, 'c1');
    expect(v).not.toBeNull();
    expect(v!.kind).toBe('dupla');
    const codes = v!.nodes.map((n) => n.code);
    expect(codes).toContain('V1');
    expect(codes).toContain('P1');
    expect(codes).toContain('GF');
    // nada com coordenada negativa
    expect(v!.nodes.every((n) => n.top >= 0 && n.left >= 0)).toBeTrue();
    // a derrota na chave dos perdedores risca o nome do perdedor
    const lb = chaveViewOf(ms.map((x) => (x.matchNumber === 4 ? { ...x, status: 'completed' as const, winnerSide: 1 as const, teamAId: 'p', teamBId: 'q' } : x)), 'c1')!;
    expect(lb.nodes.find((n) => n.matchNumber === 4)!.eliminates).toBeTrue();
  });
});
