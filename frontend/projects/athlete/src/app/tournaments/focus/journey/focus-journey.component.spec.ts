import type { TournamentMatch } from '../../../data/matches-repository';
import { winsToTitleOf } from '../focus-journey';
import {
  bestPossiblePlaceOf,
  bracketWorstPlaceOf,
  futurePhasesOf,
  journeyHeadlineOf,
  journeyPathOf,
  possibleOpponentsOf,
} from './focus-journey.component';

/**
 * Cobre só a lógica NOVA desta seção (Task 8) — as funções puras que a seção CONSOME
 * (`winsToTitleOf`, `tournamentNumbersOf`, `guaranteedPrizeOf`, `campaignOf`, `knockoutLabelOf`,
 * `outcomeOf`, `sideOf`, `isPending`, `byScheduleTime`) já têm cobertura própria em
 * `focus-journey.spec.ts` e `tournament-live.selectors.spec.ts` — testá-las de novo aqui seria
 * duplicar, não verificar. Extraídas como funções puras (parâmetros crus) pra não precisar de
 * `TestBed`, no mesmo padrão de `focus-now-state.spec.ts`.
 */

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

const MINE = new Set(['mine']);

describe('journeyHeadlineOf', () => {
  it('sem número honesto (chave não sorteada, dupla eliminação ou já eliminado), some por completo', () => {
    expect(journeyHeadlineOf(null)).toBeNull();
  });

  it('zero vitórias faltando é o título na mão, não uma contagem — vira o estado "champion"', () => {
    expect(journeyHeadlineOf(0)).toEqual({ kind: 'champion' });
  });

  it('1 vitória falta: singular', () => {
    expect(journeyHeadlineOf(1)).toEqual({ kind: 'countdown', text: '1 vitória do título.' });
  });

  it('N vitórias faltam: plural', () => {
    expect(journeyHeadlineOf(3)).toEqual({ kind: 'countdown', text: '3 vitórias do título.' });
  });
});

describe('bestPossiblePlaceOf', () => {
  it('campeão (0 vitórias faltando): pior colocação possível é 1º', () => {
    expect(bestPossiblePlaceOf(0)).toBe(1);
  });

  it('na final (1 vitória faltando): pior colocação possível é 2º — mesmo exemplo da doc de guaranteedPrizeOf', () => {
    expect(bestPossiblePlaceOf(1)).toBe(2);
  });

  it('na semifinal (2 vitórias faltando): pior colocação possível é 4º', () => {
    expect(bestPossiblePlaceOf(2)).toBe(4);
  });

  it('nas quartas (3 vitórias faltando): pior colocação possível é 8º', () => {
    expect(bestPossiblePlaceOf(3)).toBe(8);
  });
});

describe('journeyPathOf', () => {
  it('agrupa em `mine` as partidas de grupo e de mata-mata já com o atleta, em ordem cronológica', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'mine', teamBId: 'y', scheduleTime: new Date('2026-08-12T11:00:00-03:00') }),
      match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x', scheduleTime: new Date('2026-08-12T09:00:00-03:00') }),
    ];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.mine.map((m) => m.id)).toEqual(['g1', 'q1']);
  });

  it('agrupa em `future` as fases de mata-mata sem dono, em ordem de round', () => {
    const matches = [
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, teamAId: '', teamBId: '' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
    ];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.future.map((m) => m.id)).toEqual(['q2', 's1']);
  });

  it('nunca inclui partida de grupo em `future`, mesmo pendente e sem o atleta', () => {
    const matches = [match({ id: 'g-outros', poolId: 'p1', categoryId: 'c1', teamAId: 'a', teamBId: 'b' })];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.mine).toEqual([]);
    expect(path.future).toEqual([]);
  });

  it('não inclui em `future` uma partida de mata-mata já encerrada entre outras duas duplas', () => {
    const matches = [
      match({ id: 'q-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'a', teamBId: 'b', winnerId: 'a' }),
    ];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.future).toEqual([]);
  });

  it('ignora partidas de outra categoria', () => {
    const matches = [match({ id: 'g-outra-cat', categoryId: 'c2', poolId: 'p1', teamAId: 'mine', teamBId: 'x' })];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.mine).toEqual([]);
  });
});

describe('futurePhasesOf', () => {
  it('uma fase futura vira uma linha', () => {
    const future = [match({ id: 's1', round: 2, matchType: 'semifinal', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' })];
    expect(futurePhasesOf(future)).toEqual([{ round: 2, phaseLabel: 'Semifinal', timeLabel: null }]);
  });

  it('duas partidas paralelas do MESMO round (grupos diferentes da chave, nenhum com dono) viram UMA linha só', () => {
    const future = [
      match({ id: 'q1', round: 1, matchType: 'quarterfinal', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' }),
      match({ id: 'q2', round: 1, matchType: 'quarterfinal', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' }),
    ];
    expect(futurePhasesOf(future).length).toBe(1);
  });

  it('mostra o horário só quando a fase já tem um horário real marcado', () => {
    const scheduled = new Date('2026-08-12T18:00:00-03:00');
    const future = [match({ id: 'f1', round: 3, matchType: 'final', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '', scheduleTime: scheduled })];
    expect(futurePhasesOf(future)[0]?.timeLabel).not.toBeNull();
  });
});

describe('possibleOpponentsOf', () => {
  const duoNameOf = (teamId: string): string => `Dupla ${teamId}`;
  const duoPlayersOf = (): [{ initial: string; photo: string | null }, { initial: string; photo: string | null }] => [
    { initial: 'A', photo: null },
    { initial: 'B', photo: null },
  ];

  it('lista os dois lados de uma partida de mata-mata pendente e sem o atleta', () => {
    const matches = [match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'x', teamBId: 'y' })];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['x', 'y']);
  });

  it('nunca lista um slot ainda sem dono ("a definir") — não adivinha adversário', () => {
    const matches = [match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, teamAId: '', teamBId: '' })];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('não lista uma partida de mata-mata já encerrada — a dupla perdedora está eliminada e não pode mais cruzar com ninguém', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x' }),
    ];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('nunca lista partida de grupo — ninguém "cruza" no mata-mata antes dele existir', () => {
    const matches = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'x', teamBId: 'y' })];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('não lista o time do próprio atleta, mesmo que apareça em outra partida da chave', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'mine', teamBId: 'x' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'y', teamBId: 'z' }),
    ];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['y', 'z']);
  });

  it('não duplica um time que aparece em mais de uma partida pendente sem o atleta', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'x', teamBId: 'y' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, teamAId: 'x', teamBId: 'z' }),
    ];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['x', 'y', 'z']);
  });
});

describe('bracketWorstPlaceOf', () => {
  // Achado do round 1 de review: `winsToTitleOf` vira `null` assim que o atleta perde — correto
  // pra "quantas vitórias faltam pro título" (deixa de fazer sentido), mas `bracketWorstPlaceOf`
  // responde uma pergunta diferente ("o que já está garantido") que continua valendo depois da
  // eliminação. Os dois testes abaixo, ANTES deste fix, reproduziam a fórmula antiga
  // (`bestPossiblePlaceOf(winsToTitleOf(...))`) e falhavam com "Expected undefined to be 4"/"...8"
  // — a premiação sumia do card justo quando o atleta mais queria ver o que já tinha embolsado.

  it('perdeu a semifinal (chave QF/SF/F): ainda garantiu o 4º, não `null`', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'y' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
  });

  it('perdeu as quartas (chave QF/SF/F): ainda garantiu o 8º, não `null`', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'x' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
  });

  it('vivo, com a final pendente: pior colocação possível 2º — inalterado em relação a hoje', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false, teamAId: 'mine', teamBId: 'z' }),
    ];
    const worst = bracketWorstPlaceOf(matches, 'c1', MINE);
    expect(worst).toBe(2);
    // Pino de equivalência: nos casos VIVOS, `bracketWorstPlaceOf` tem que bater exatamente com
    // a fórmula antiga (`bestPossiblePlaceOf` sobre `winsToTitleOf`) — as duas perguntas só
    // coincidem enquanto o atleta segue vivo (ver a doc de `bracketWorstPlaceOf`). Se este
    // `expect` quebrar, as duas fórmulas divergiram onde NÃO deveriam.
    expect(worst).toBe(bestPossiblePlaceOf(winsToTitleOf(matches, 'c1', MINE)!));
  });

  it('campeão (venceu a final): pior colocação possível 1º — inalterado em relação a hoje', () => {
    const matches = [
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'z', winnerId: 'mine' }),
    ];
    const worst = bracketWorstPlaceOf(matches, 'c1', MINE);
    expect(worst).toBe(1);
    expect(worst).toBe(bestPossiblePlaceOf(winsToTitleOf(matches, 'c1', MINE)!));
  });

  it('nunca entrou no mata-mata (só grupo, ou grupo ainda sem chave sorteada): `null`, sem nada garantido', () => {
    const matches = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' })];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBeNull();
  });
});
