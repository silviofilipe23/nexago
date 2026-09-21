import { rawMatchFromDoc } from './matches-repository';

/** Regressão da falha estrutural que já reapareceu quatro vezes: código que lê a
 *  partida pelos DOIS LADOS (`teamAId`/`teamBId`) ou pelo `poolId` como se fosse
 *  grupo não enxerga a rodada King of the Court, que tem elenco e não confronto.
 *
 *  O sintoma reportado: a categoria KOTC inteira aparecia como "FASE DE GRUPOS",
 *  com "Grupo C1…C4" e "A definir × A definir" em todas as linhas. */
describe('rawMatchFromDoc · rodada King of the Court', () => {
  function kocDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      tournamentId: 't1',
      categoryId: 'koc-open-masc',
      matchType: 'koc_qualifying',
      // A rodada usa `poolId` como QUADRA LÓGICA da fase, não como grupo.
      poolId: 'C1',
      round: 1,
      matchNumber: 1,
      teamAId: '',
      teamBId: '',
      status: 'scheduled',
      kocTeamIds: ['t-1', 't-2', 't-3', 't-4'],
      kocConfig: { qualifiersPerRound: 2, durationSec: 900 },
      ...extra,
    };
  }

  it('nunca rotula a rodada como grupo, mesmo com poolId preenchido', () => {
    const m = rawMatchFromDoc('m1', kocDoc());
    expect(m.round).toBe('Classificatória · Rodada 1');
    expect(m.round?.startsWith('Grupo ')).toBeFalse();
  });

  it('numera a classificatória pelo matchNumber', () => {
    const m = rawMatchFromDoc('m3', kocDoc({ matchNumber: 3, poolId: 'C3' }));
    expect(m.round).toBe('Classificatória · Rodada 3');
  });

  it('rotula semifinal e final pela fase, não pela quadra', () => {
    const semi = rawMatchFromDoc('s1', kocDoc({ matchType: 'koc_semifinal', poolId: 'S1', matchNumber: 5 }));
    const fim = rawMatchFromDoc('f1', kocDoc({ matchType: 'koc_final', poolId: 'F1', matchNumber: 7 }));
    expect(semi.round).toBe('Semifinal');
    expect(fim.round).toBe('Final');
  });

  it('carrega o elenco em `koc` com os dois lados vazios', () => {
    const m = rawMatchFromDoc('m1', kocDoc());
    // `optionalStr` devolve null pra string vazia: a rodada não tem lado A/B.
    expect(m.teamAId).toBeNull();
    expect(m.teamBId).toBeNull();
    expect(m.koc?.teamIds).toEqual(['t-1', 't-2', 't-3', 't-4']);
  });

  it('aceita a fase seguinte ainda sem elenco', () => {
    const m = rawMatchFromDoc('s1', kocDoc({ matchType: 'koc_semifinal', kocTeamIds: [] }));
    expect(m.round).toBe('Semifinal');
    expect(m.koc?.teamIds).toEqual([]);
  });

  it('mantém o rótulo de grupo no caminho de duelo', () => {
    const m = rawMatchFromDoc('g1', {
      tournamentId: 't1',
      matchType: 'group',
      poolId: 'A',
      round: 1,
      matchNumber: 1,
      teamAId: 'a',
      teamBId: 'b',
      status: 'scheduled',
    });
    expect(m.round).toBe('Grupo A');
    expect(m.koc).toBeNull();
  });
});
