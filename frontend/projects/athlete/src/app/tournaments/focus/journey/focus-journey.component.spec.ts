import type { TournamentMatch } from '../../../data/matches-repository';
import { happyPathOf, knockoutRounds, winsToTitleOf } from '../focus-journey';
import type { FocusViewContext } from '../focus-views';
import {
  bestPossiblePlaceOf,
  bracketWorstPlaceOf,
  futurePhasesOf,
  journeyHeadlineOf,
  journeyPathOf,
  journeyStepsOf,
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

// `matchType` nos fixtures abaixo usa a forma REAL que `buildSingleEliminationMatches`/
// `buildDoubleEliminationMatches` gravam (`functions/src/category-bracket-builders.ts`):
// `'knockout'` pra qualquer rodada de mata-mata que não seja a final — o gerador NÃO distingue
// quartas de semifinal por `matchType`, só pelo campo `round` — e `'Final'`/`'Third Place'` com
// essa grafia exata. Achado do round 3 de review, pinado aqui: com nomes plausíveis mas
// inexistentes na produção (`'quarterfinal'`/`'semifinal'`) o fixture ficava mentiroso assim que
// a detecção de campeão passou a ser por `matchType` em vez de por `round` (N2).
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
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'y', scheduleTime: new Date('2026-08-12T11:00:00-03:00') }),
      match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x', scheduleTime: new Date('2026-08-12T09:00:00-03:00') }),
    ];
    const path = journeyPathOf(matches, 'c1', MINE);
    expect(path.mine.map((m) => m.id)).toEqual(['g1', 'q1']);
  });

  it('agrupa em `future` as fases de mata-mata sem dono, em ordem de round', () => {
    const matches = [
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
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
      match({ id: 'q-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'a', teamBId: 'b', winnerId: 'a' }),
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
  // Antes da Task 12, `matchType: 'knockout'` (a forma REAL que o gerador grava) caía fora de
  // `KNOCKOUT_LABELS` e virava "Knockout" em inglês — daí o fixture aqui ter usado
  // `matchType: 'semifinal'`, um valor plausível mas que a produção nunca escreve, só pra não
  // travar neste teste um resultado que já era sabido errado (achado do round 3 de review). A
  // Task 12 ensinou `knockoutLabelOf` a derivar a fase pela distância até a final quando
  // `matchType` é `'knockout'` — o fixture agora usa a forma real, e o `knockoutRoundsOfCategory`
  // (2º parâmetro, também novo da Task 12) é quem informa que o round 2 é a penúltima rodada.
  it('uma fase futura vira uma linha', () => {
    const future = [match({ id: 's1', round: 2, matchType: 'knockout', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' })];
    expect(futurePhasesOf(future, [1, 2, 3])).toEqual([{ round: 2, phaseLabel: 'Semifinal', timeLabel: null }]);
  });

  it('duas partidas paralelas do MESMO round (grupos diferentes da chave, nenhum com dono) viram UMA linha só', () => {
    const future = [
      match({ id: 'q1', round: 1, matchType: 'knockout', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' }),
      match({ id: 'q2', round: 1, matchType: 'knockout', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '' }),
    ];
    expect(futurePhasesOf(future, [1, 2]).length).toBe(1);
  });

  it('mostra o horário só quando a fase já tem um horário real marcado', () => {
    const scheduled = new Date('2026-08-12T18:00:00-03:00');
    const future = [match({ id: 'f1', round: 3, matchType: 'Final', poolId: '', isGroupMatch: false, teamAId: '', teamBId: '', scheduleTime: scheduled })];
    expect(futurePhasesOf(future, [1, 2, 3])[0]?.timeLabel).not.toBeNull();
  });
});

describe('possibleOpponentsOf', () => {
  const duoNameOf = (teamId: string): string => `Dupla ${teamId}`;
  const duoPlayersOf = (): [{ initial: string; photo: string | null }, { initial: string; photo: string | null }] => [
    { initial: 'A', photo: null },
    { initial: 'B', photo: null },
  ];

  it('lista os dois lados de uma partida de mata-mata pendente e sem o atleta', () => {
    const matches = [match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'x', teamBId: 'y' })];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['x', 'y']);
  });

  it('nunca lista um slot ainda sem dono ("a definir") — não adivinha adversário', () => {
    const matches = [match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' })];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('não lista uma partida de mata-mata já encerrada — a dupla perdedora está eliminada e não pode mais cruzar com ninguém', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x' }),
    ];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('nunca lista partida de grupo — ninguém "cruza" no mata-mata antes dele existir', () => {
    const matches = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'x', teamBId: 'y' })];
    expect(possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf)).toEqual([]);
  });

  it('não lista o time do próprio atleta, mesmo que apareça em outra partida da chave', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'x' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'y', teamBId: 'z' }),
    ];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['y', 'z']);
  });

  it('não duplica um time que aparece em mais de uma partida pendente sem o atleta', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'x', teamBId: 'y' }),
      match({ id: 'q2', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'x', teamBId: 'z' }),
    ];
    const opponents = possibleOpponentsOf(matches, 'c1', MINE, duoNameOf, duoPlayersOf);
    expect(opponents.map((o) => o.teamId)).toEqual(['x', 'y', 'z']);
  });
});

describe('bracketWorstPlaceOf', () => {
  // Achado do round 1 de review: `winsToTitleOf` vira `null` assim que o atleta perde — correto
  // pra "quantas vitórias faltam pro título" (deixa de fazer sentido), mas `bracketWorstPlaceOf`
  // responde uma pergunta diferente ("o que já está garantido") que continua valendo depois da
  // eliminação.
  //
  // Achado do round 2 de review: a primeira versão desta função escolhia a fase de referência
  // pelo MAIOR round entre as partidas do atleta — e isso supõe demais. A disputa de 3º lugar
  // recebe o MESMO round da final (`category-bracket-builders.ts`) e `loserAdvance` cria essa
  // partida pendente no instante em que a semifinal termina (`category-bracket-advance.ts`), então
  // um atleta que perdeu a semifinal já tem, ao mesmo tempo, uma partida de 3º lugar pendente NO
  // ROUND DA FINAL — "o maior round" apontava pra ela e devolvia 2, prometendo vice-campeão a
  // quem só tinha garantido 4º. Em dupla eliminação o problema era pior: WB e LB numeram rounds
  // independentemente a partir de 1, então "o maior round" misturava as duas ladders e podia
  // devolver 1 (campeão) com a Grand Final ainda por jogar. Os testes abaixo fixam os dois casos.

  it('perdeu a semifinal, com a disputa de 3º lugar já pendente na mesma rodada da final: ainda garantiu o 4º, não o 2º', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'y' }),
      // `loserAdvance` da semifinal já preencheu o slot do atleta aqui, no MESMO round da final —
      // é exatamente essa colisão que faz "o maior round" mentir. Ver o comentário do describe.
      match({ id: 'tp1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: 'y', teamBId: '' }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
  });

  it('perdeu a disputa de 3º lugar (depois de perder a semifinal): ainda garantiu o 4º', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'y' }),
      match({ id: 'tp1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'w', winnerId: 'w' }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
  });

  // Conservadorismo deliberado (documentado em `bracketWorstPlaceOf`): quem VENCE o 3º lugar está
  // de fato garantido em 3º, mas esta função continua devolvendo 4º — a referência permanece a
  // derrota da semifinal, que veio ANTES. Pinado de propósito: não "conserte" isso pra devolver 3
  // sem entender que sub-informar uma garantia é seguro e super-informar é o bug que este arquivo
  // inteiro existe pra evitar.
  it('venceu a disputa de 3º lugar: continua reportando o 4º, não o 3º — conservadorismo deliberado', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'y' }),
      match({ id: 'tp1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'w', winnerId: 'mine' }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
  });

  it('dupla eliminação — campeão da WB com a Grand Final ainda pendente: `null`, nunca 1º', () => {
    const matches = [
      // Só o `matchType` 'WB'/'LB' já basta pra `isDoubleElimination` — ver `bracket-tree.ts`.
      match({ id: 'wbf', poolId: '', categoryId: 'c1', round: 2, matchType: 'WB', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 'gf', poolId: '', categoryId: 'c1', round: 1, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBeNull();
  });

  it('dupla eliminação — campeão da LB com a Grand Final ainda pendente: `null`, nunca 1º', () => {
    const matches = [
      match({ id: 'lbf', poolId: '', categoryId: 'c1', round: 3, matchType: 'LB', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 'gf', poolId: '', categoryId: 'c1', round: 1, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: 'mine' }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBeNull();
  });

  it('perdeu as quartas (chave QF/SF/F): ainda garantiu o 8º, não `null`', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'x' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false }),
    ];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
  });

  it('vivo, com a final pendente: pior colocação possível 2º — inalterado em relação a hoje', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: 'z' }),
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
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'z', winnerId: 'mine' }),
    ];
    const worst = bracketWorstPlaceOf(matches, 'c1', MINE);
    expect(worst).toBe(1);
    expect(worst).toBe(bestPossiblePlaceOf(winsToTitleOf(matches, 'c1', MINE)!));
  });

  it('nunca entrou no mata-mata (só grupo, ou grupo ainda sem chave sorteada): `null`, sem nada garantido', () => {
    const matches = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' })];
    expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBeNull();
  });

  // Achado N1 do round 3 de review, confirmado por execução contra o gerador real
  // (`buildSingleEliminationMatches`): um BYE vira uma partida de verdade — `A=mine, B=—`,
  // gravada `status: Scheduled` (`organizer-category-ops.ts:287`) — e NINGUÉM NUNCA JOGA. Sem
  // piso, "a partida pendente mais cedo" ancora nesse bye pra sempre: um atleta que recebeu bye
  // na 1ª rodada e já venceu tudo depois continuava lendo a 1ª rodada como referência. Byes
  // existem em todo mata-mata que não é potência de 2 (6 duplas → 2 byes; 12 duplas → 4 byes) —
  // era, na prática, o bug do round 1 (a garantia sumindo) reintroduzido pra boa parte das chaves
  // reais, só que silenciosamente (`guaranteedPrizeOf` não acha prêmio pra uma colocação tão
  // ruim quanto "8º"/"16º" e o card inteiro desaparece, em vez de mostrar um valor obviamente
  // errado). Fixtures no formato REAL do gerador (`bracketSize` = próxima potência de 2, byes na
  // 1ª rodada contra os melhores seeds — `standardSeedSlots`), não hipotéticas.
  describe('achado N1 — bye ancorando a referência na 1ª rodada pra sempre', () => {
    it('6 duplas (bracketSize 8, 2 byes): bye na 1ª rodada, venceu a 2ª, pendente na final → 2º, não 8º', () => {
      const matches = [
        // Bye: o gerador grava a partida mesmo assim, só que nunca é jogada.
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r1-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r3-3lugar', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, teamAId: 'a', teamBId: 'c' }),
      ];
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(2);
    });

    it('6 duplas (bracketSize 8, 2 byes): bye na 1ª rodada, venceu tudo até a final → campeão (1º), não 8º', () => {
      const matches = [
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
      ];
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(1);
    });

    it('12 duplas (bracketSize 16, 4 byes): bye na 1ª rodada, venceu a 2ª e a 3ª, pendente na final → 2º, não 16º', () => {
      const matches = [
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
        match({ id: 'r3', poolId: '', categoryId: 'c1', round: 3, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
        match({ id: 'r4-final', poolId: '', categoryId: 'c1', round: 4, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      ];
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(2);
    });
  });

  // Achado do round 5 de review: o piso (`wonRoundsFloorOf`) só enxerga o bye DEPOIS que o atleta
  // vence alguma coisa — antes disso o piso é `-Infinity` e o bye continua sendo "a pendente mais
  // cedo". Mas byes são propagados pra rodada seguinte NA CONSTRUÇÃO da chave
  // (`category-bracket-builders.ts`), então essa é a janela de abertura de TODA chave que não é
  // potência de 2, não um caso de canto: 3 duplas → bye entra direto na final; 5-7 → semifinal;
  // 9-12 → quartas; 20 → oitavas. `pendingKnockoutsOf` (`focus-journey.ts`) fecha a janela: uma
  // partida pendente de slot vazio em que o atleta já aparece numa rodada posterior é um bye
  // consumido, nunca a referência. Fixtures no formato REAL do gerador, do estado INICIAL da
  // chave (nada jogado ainda) — é justamente esse estado que `wonRoundsFloorOf` sozinho não cobre.
  describe('achado N1 fechado no round 5 — bye consumido antes da primeira vitória', () => {
    it('3 duplas (bracketSize 4, 1 bye): bye entra direto na final, nada jogado ainda → 1 vitória do título / 2º garantido, não 2 / 4º', () => {
      const matches = [
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r1-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
        // Propagado na construção da chave: o slot do atleta já preenchido, o do adversário TBD
        // (esperando o vencedor de `r1-outros`) — nenhuma partida real foi jogada ainda.
        match({ id: 'r2-final', poolId: '', categoryId: 'c1', round: 2, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(1);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(2);
    });

    it('6 duplas (bracketSize 8, 2 byes): bye na 1ª rodada, nada jogado ainda → 2 vitórias do título / 4º garantido, não 3 / 8º', () => {
      const matches = [
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r1-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
        match({ id: 'r2-propagado', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
    });

    it('12 duplas (bracketSize 16, 4 byes): bye na 1ª rodada, nada jogado ainda → 3 vitórias do título / 8º garantido, não 4 / 16º', () => {
      const matches = [
        match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r2-propagado', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r3', poolId: '', categoryId: 'c1', round: 3, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' }),
        match({ id: 'r4-final', poolId: '', categoryId: 'c1', round: 4, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
    });

    // Pega um predicado largo demais: se `isConsumedByeOf` esquecesse de checar o slot vazio (ou
    // checasse round diferente), uma dupla que joga de verdade a 1ª rodada — sem bye nenhum —
    // podia ser confundida com uma "já consumida" por engano. Mesma chave de 6 duplas do teste
    // acima, mas agora o atleta É a dupla que joga a 1ª rodada de verdade (adversário real, slot
    // preenchido) — nada muda.
    it('6 duplas: dupla SEM bye (joga a 1ª rodada de verdade), nada jogado ainda → inalterado: 3 vitórias / 8º', () => {
      const matches = [
        match({ id: 'r1-mine', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'x' }),
        match({ id: 'r1-bye-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'y', teamBId: '' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
    });

    // Uma partida legitimamente pendente TAMBÉM tem o slot do adversário vazio — o alimentador
    // dela (o outro lado da chave) ainda não terminou. Isso não pode ser lido como bye: o atleta
    // venceu a 1ª rodada de verdade e está esperando o adversário da 2ª, sem aparecer em nenhuma
    // rodada mais adiante ainda.
    it('slot do adversário vazio SEM o atleta aparecer mais adiante (TBD de verdade, não bye) → continua sendo a referência, inalterado', () => {
      const matches = [
        match({ id: 'r1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
        match({ id: 'r2-tbd', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(4);
    });

    // Potência de 2: nunca tem bye, então o predicado nunca deveria disparar — em duas posições
    // diferentes (cedo, sem nada jogado; e no meio, com uma vitória já no bolso), em dois tamanhos
    // diferentes (8 e 16), pra confirmar que o comportamento continua idêntico ao de antes deste
    // fix.
    it('potência de 2 — 8 duplas, cedo (nada jogado, adversário real na 1ª rodada): inalterado, 3 vitórias / 8º', () => {
      const matches = [
        match({ id: 'r1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'x' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' }),
        match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
    });

    it('potência de 2 — 16 duplas, no meio (1ª rodada já vencida, 2ª pendente com adversário real): inalterado, 3 vitórias / 8º', () => {
      const matches = [
        match({ id: 'r1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
        match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'y' }),
        match({ id: 'r3', poolId: '', categoryId: 'c1', round: 3, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' }),
        match({ id: 'r4-final', poolId: '', categoryId: 'c1', round: 4, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' }),
      ];
      expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
      expect(bracketWorstPlaceOf(matches, 'c1', MINE)).toBe(8);
    });
  });
});

/**
 * A timeline "Caminho até a final" — o desenho do protótipo C1. O que cada degrau mostra sai
 * daqui; o SCSS só pinta o estado que este `status` decide.
 */
describe('journeyStepsOf', () => {
  function ctxOf(matches: readonly TournamentMatch[]): FocusViewContext {
    return {
      matches,
      myTeamIds: MINE,
      duoNameOf: (teamId, fallback) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir')),
      duoPlayersOf: () => [
        { initial: 'MA', photo: null },
        { initial: 'EN', photo: null },
      ],
      isMyTeam: (teamId) => MINE.has(teamId),
      standingsOf: () => [],
      nextMatch: null,
    };
  }

  const GROUP_WON = match({
    id: 'g1',
    poolId: 'pool-a',
    round: 0,
    status: 'completed',
    teamAId: 'mine',
    teamBId: 'rival',
    winnerId: 'mine',
    sets: [
      { a: 21, b: 15 },
      { a: 21, b: 12 },
    ],
    scheduleTime: new Date('2026-08-29T12:00:00Z'),
    courtName: '3',
  });

  const GROUP_NEXT = match({ id: 'g2', poolId: 'pool-a', round: 1, teamAId: 'mine', teamBId: 'outro' });

  function stepsOf(matches: readonly TournamentMatch[], nextMatchId: string | null = null, finalPrize: string | null = null) {
    const path = journeyPathOf(matches, 'c1', MINE);
    return journeyStepsOf(ctxOf(matches), path, knockoutRounds(matches, 'c1'), nextMatchId, finalPrize);
  }

  it('enfileira as partidas do atleta e depois as fases ainda sem dono', () => {
    const semi = match({ id: 'sf', poolId: '', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: '', teamBId: '' });
    const final = match({ id: 'f', poolId: '', round: 2, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' });

    const steps = stepsOf([GROUP_WON, GROUP_NEXT, semi, final]);

    expect(steps.map((s) => s.phaseLabel)).toEqual(['Rodada 1', 'Rodada 2', 'Semifinal', 'Final']);
    expect(steps.map((s) => s.opponentName)).toEqual(['Dupla rival', 'Dupla outro', 'A definir', 'A definir']);
    // Fase sem dono não abre partida nenhuma: o slot ainda não tem jogo pra mostrar.
    expect(steps.slice(2).every((s) => s.matchId === null)).toBe(true);
  });

  it('marca vencida, a próxima e o resto — é o status que pinta o trilho', () => {
    const steps = stepsOf([GROUP_WON, GROUP_NEXT], 'g2');

    expect(steps.map((s) => s.status)).toEqual(['win', 'next']);
  });

  it('placar em sets na coluna da direita e os games na linha de baixo', () => {
    const [won, pending] = stepsOf([GROUP_WON, GROUP_NEXT]);

    expect(won?.scoreLabel).toBe('2 – 0');
    expect(won?.detailLabel).toBe('21-15 · 21-12');
    expect(pending?.scoreLabel).toBe('vs');
  });

  it('mostra horário e quadra do jeito curto da tabela', () => {
    // "09:00", não "9:00": é o formato de hora que o app inteiro usa (`timeLabelOf`).
    expect(stepsOf([GROUP_WON])[0]?.metaLabel).toBe('09:00 · Q3');
  });

  it('quadra com nome sai como o organizador escreveu, sem virar sigla', () => {
    const named = match({ id: 'g3', poolId: 'pool-a', teamAId: 'mine', teamBId: 'rival', scheduleTime: new Date('2026-08-29T20:40:00Z'), courtName: 'Q. central' });

    expect(stepsOf([named])[0]?.metaLabel).toBe('17:40 · Q. central');
  });

  it('sem horário nem quadra marcados, não inventa nada', () => {
    expect(stepsOf([GROUP_NEXT])[0]?.metaLabel).toBeNull();
  });

  it('a final carrega a premiação do título', () => {
    const final = match({ id: 'f', poolId: '', round: 1, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' });

    expect(stepsOf([GROUP_NEXT, final], null, 'R$ 2.400')[1]?.detailLabel).toBe('R$ 2.400');
  });

  it('avisa que o adversário do mata-mata sai ao fim dos grupos', () => {
    const semi = match({ id: 'sf', poolId: '', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '', teamBDescription: '2º do Grupo A' });
    // A final precisa existir no fixture: com uma rodada de mata-mata só, a derivação posicional
    // leria a própria `sf` como Final (`knockoutLabelOf`) e a linha viraria a da premiação.
    const final = match({ id: 'f', poolId: '', round: 2, matchType: 'Final', isGroupMatch: false, teamAId: '', teamBId: '' });

    const [, qf] = stepsOf([GROUP_NEXT, semi, final]);

    expect(qf?.opponentName).toBe('2º do Grupo A');
    expect(qf?.detailLabel).toBe('sai ao fim dos grupos');
  });

  it('na última rodada em aberto do grupo, diz o que a partida decide', () => {
    // Só a rodada 1 segue pendente: é ela que fecha a classificação.
    expect(stepsOf([GROUP_WON, GROUP_NEXT])[1]?.detailLabel).toBe('decide a classificação do grupo');
  });
});

/**
 * Dupla eliminação: o que vem pela frente sai do caminho feliz (`happyPathOf`), não das fases por
 * rodada — WB e LB numeram rodadas independentes e o agrupamento por rodada fundiria as duas.
 * Fixture na forma que `buildDoubleEliminationMatches` gera: #1 WB R1 → #3 WB R2 → #5 Final.
 */
describe('journeyStepsOf · dupla eliminação', () => {
  function ctxOf(matches: readonly TournamentMatch[]): FocusViewContext {
    return {
      matches,
      myTeamIds: MINE,
      duoNameOf: (teamId, fallback) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir')),
      duoPlayersOf: () => [
        { initial: 'MA', photo: null },
        { initial: 'EN', photo: null },
      ],
      isMyTeam: (teamId) => MINE.has(teamId),
      standingsOf: () => [],
      nextMatch: null,
    };
  }

  const de = (id: string, partial: Partial<TournamentMatch>): TournamentMatch =>
    match({ id, poolId: '', isGroupMatch: false, teamAId: '', teamBId: '', ...partial });

  const MATCHES = [
    de('m1', { matchType: 'WB', round: 1, matchNumber: 1, teamAId: 'mine', teamBId: 'x', winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'A' }),
    de('m3', { matchType: 'WB', round: 2, matchNumber: 3, teamBId: 'y', winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'A' }),
    de('m5', { matchType: 'Final', round: 1, matchNumber: 5 }),
  ];

  function stepsOf() {
    return journeyStepsOf(
      ctxOf(MATCHES),
      journeyPathOf(MATCHES, 'c1', MINE),
      knockoutRounds(MATCHES, 'c1'),
      null,
      'R$ 1.000',
      happyPathOf(MATCHES, 'c1', MINE),
    );
  }

  it('mostra a chave e a rodada em cada degrau, na partida do atleta e nas seguintes', () => {
    expect(stepsOf().map((s) => s.phaseLabel)).toEqual(['WB · Rodada 1', 'WB · Rodada 2', 'Final']);
  });

  it('o adversário sai do slot que sobra na fiação, e só quando já tem dupla', () => {
    const steps = stepsOf();

    // O vencedor de m1 cai no slot A de m3, então o adversário é o slot B — já ocupado.
    expect(steps[1]?.opponentName).toBe('Dupla y');
    // A final ainda não tem ninguém do outro lado.
    expect(steps[2]?.opponentName).toBe('A definir');
    expect(steps[2]?.detailLabel).toBe('R$ 1.000');
  });
});
