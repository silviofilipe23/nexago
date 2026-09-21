import { courtsFromRaw } from './tournaments-repository';

/** As quadras do doc do torneio alimentam a grade de Agendamento (`agendamento.component`:
 *  `courts()` vira uma coluna por quadra) e o `courtId` que `scheduleMatch` grava na partida.
 *
 *  A regra é a mesma do app (`MatchOpsLogic.resolveTournamentCourts`): `courtsCount` manda,
 *  porque subir de 2 pra 4 quadras precisa valer mesmo com a lista antiga de 2 ainda gravada.
 *  O que o `courtsCount` NÃO pode fazer é mandar quando não existe: doc sem o campo tem que
 *  cair no tamanho da lista real, nunca num número inventado — fabricar `Q1..Qn` por cima
 *  descarta id e nome reais e grava `courtId` que o torneio não tem. */
describe('courtsFromRaw', () => {
  it('devolve as quadras reais quando a contagem bate', () => {
    const raw = [
      { id: 'Q1', name: 'Quadra 1', order: 0 },
      { id: 'Q2', name: 'Quadra 2', order: 1 },
    ];
    expect(courtsFromRaw(raw, 2)).toEqual(raw);
  });

  it('sem courtsCount no doc, a lista real manda — caso real de produção', () => {
    // "CIRCUITO DAS ESTAÇÕES-Etapa Outono" e "Challenge de duplas femininas": `courts` com 2
    // quadras e nenhum `courtsCount`. O default 4 fabricava Q1..Q4 e sumia com as reais.
    const raw = [
      { id: 'quadra-a', name: 'Areia 1', order: 0 },
      { id: 'quadra-b', name: 'Areia 2', order: 1 },
    ];
    expect(courtsFromRaw(raw, null)).toEqual(raw);
  });

  it('courtsCount explícito continua mandando quando discorda da lista', () => {
    // Retrocompat: organizador que sobe de 2 pra 4 quadras vê 4, não as 2 antigas.
    const raw = [
      { id: 'quadra-a', name: 'Areia 1', order: 0 },
      { id: 'quadra-b', name: 'Areia 2', order: 1 },
    ];
    expect(courtsFromRaw(raw, 4)).toHaveSize(4);
  });

  it('nunca devolve lista vazia quando não há quadra nenhuma', () => {
    // `courtsCount` 0 caía no `parsed.length === courtsCount` e devolvia [] — grade sem
    // coluna nenhuma, sem nada onde clicar.
    expect(courtsFromRaw([], 0)).toHaveSize(1);
    expect(courtsFromRaw(undefined, 0)).toHaveSize(1);
    expect(courtsFromRaw(undefined, null)).toHaveSize(1);
  });

  it('fabrica Q1..Qn quando o torneio não tem lista de quadras', () => {
    expect(courtsFromRaw(undefined, 3)).toEqual([
      { id: 'Q1', name: 'Quadra 1', order: 1 },
      { id: 'Q2', name: 'Quadra 2', order: 2 },
      { id: 'Q3', name: 'Quadra 3', order: 3 },
    ]);
  });

  it('descarta entrada sem id e ordena por `order`', () => {
    const raw = [
      { id: 'Q2', name: 'Quadra 2', order: 5 },
      { name: 'sem id', order: 0 },
      { id: 'Q1', name: 'Quadra 1', order: 1 },
    ];
    expect(courtsFromRaw(raw, 2).map((c) => c.id)).toEqual(['Q1', 'Q2']);
  });
});
