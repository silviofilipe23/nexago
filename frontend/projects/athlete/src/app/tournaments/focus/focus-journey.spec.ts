import type { TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { guaranteedPrizeOf, happyPathOf, tournamentNumbersOf, winsToTitleOf } from './focus-journey';

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
// `'knockout'` pra qualquer rodada de mata-mata que não seja a final (o gerador NÃO distingue
// quartas de semifinal por `matchType` — só o campo `round` diferencia), `'Final'` e
// `'Third Place'` com essa grafia exata. Achado do round 3 de review: os fixtures chegaram a usar
// `'quarterfinal'`/`'semifinal'`/`'final'`/`'third place'` (nomes plausíveis, mas que o gerador
// nunca escreve) — inofensivo enquanto a detecção de campeão era por `round`, mas viraria um
// fixture mentiroso assim que a detecção passou a ser por `matchType`.
describe('winsToTitleOf', () => {
  it('devolve null sem chave sorteada', () => {
    const groups = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' })];
    expect(winsToTitleOf(groups, 'c1', MINE)).toBeNull();
  });

  it('conta as fases de mata-mata quando o atleta ainda está nos grupos', () => {
    const matches = [
      match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' }),
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
  });

  it('desconta as fases já vencidas quando o atleta está no mata-mata', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: 'y' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
  });

  // Fix round 1 (Task 5): `myPending` vazio também acontece quando o atleta já saiu do
  // mata-mata de vez — eliminado ou campeão — não só quando ainda está nos grupos. Os dois
  // testes abaixo pinam essa distinção; contra a implementação antiga, os dois vinham com
  // `rounds.length` (3), não com o valor honesto.
  it('devolve null quando o atleta já perdeu no mata-mata (eliminado, sem caminho pro título)', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'x' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBeNull();
  });

  it('devolve 0 quando o atleta já venceu a final (campeão, zero vitórias faltando)', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'z', winnerId: 'mine' }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(0);
  });

  // Fix round 2 (Task 5), achado 3: a disputa de 3º lugar recebe o MESMO número de rodada da
  // final (`category-bracket-builders.ts`: `round: roundStart + totalRounds - 1` pros dois). Um
  // atleta que perdeu a semifinal e venceu o 3º lugar NÃO pode virar "campeão" só porque tem uma
  // vitória completed em `lastRound` — pina que o `lost` (perdeu a semifinal) decide antes do
  // `champion` chegar a olhar pro 3º lugar.
  //
  // Fix round 3 (Task 8), achado N2: a detecção de campeão agora é por `matchType === 'final'`
  // (case-insensitive), não mais por `round === lastRound` — então este teste passa a ter DUAS
  // defesas independentes contra a colisão de round: a ordem `lost`-antes-de-`champion` (que
  // continua obrigatória por outro motivo — ver o parágrafo acima) E o fato de "Third Place" nunca
  // ser lido como "Final" não importa em que ordem os `if`s rodem. Mantido com `lost` primeiro
  // mesmo assim, porque essa ordem também é o que garante "eliminado nunca é campeão" em geral.
  it('não confunde vencer o 3º lugar com ser campeão quando os dois dividem a última rodada', () => {
    const matches = [
      match({ id: 'sf', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'x' }),
      match({ id: 'tp', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, status: 'completed', teamAId: 'x', teamBId: 'z', winnerId: 'x' }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBeNull();
  });

  // Achado N1, alargado pro round 4 de review: mesma forma estrutural do bug que já tinha sido
  // corrigido em `bracketWorstPlaceOf` (`focus-journey.component.ts`) — um BYE é gravado como
  // partida real e nunca é jogado (`buildSingleEliminationMatches`/`organizer-category-ops.ts`),
  // então `myPending[0]` (o round pendente mais cedo) ancorava nele pra sempre. Diferente de
  // `bracketWorstPlaceOf`, aqui o efeito é visível na MANCHETE da seção: um atleta na final de uma
  // chave de 6 duplas lia "3 vitórias do título" (a chave inteira) em vez de "1 vitória do
  // título". Fixtures no formato REAL do gerador (bracketSize 8, bye na 1ª rodada).
  it('6 duplas (bracketSize 8, 2 byes): bye na 1ª rodada, venceu a 2ª, pendente na final → 1 vitória do título, não 3', () => {
    const matches = [
      match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      match({ id: 'r1-outros', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'a', teamBId: 'b' }),
      match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      match({ id: 'r3-3lugar', poolId: '', categoryId: 'c1', round: 3, matchType: 'Third Place', isGroupMatch: false, teamAId: 'a', teamBId: 'c' }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(1);
  });

  it('6 duplas (bracketSize 8, 2 byes): bye na 1ª rodada, campeão (venceu a final) → 0 vitórias, não 3', () => {
    const matches = [
      match({ id: 'bye', poolId: '', categoryId: 'c1', round: 1, matchType: 'knockout', isGroupMatch: false, teamAId: 'mine', teamBId: '' }),
      match({ id: 'r2', poolId: '', categoryId: 'c1', round: 2, matchType: 'knockout', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 'r3-final', poolId: '', categoryId: 'c1', round: 3, matchType: 'Final', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'y', winnerId: 'mine' }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(0);
  });
});

describe('tournamentNumbersOf', () => {
  it('soma sets e pontos das partidas encerradas do atleta', () => {
    const matches = [
      match({ id: 'm1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
      match({ id: 'm2', status: 'completed', teamAId: 'y', teamBId: 'mine', winnerId: 'mine', sets: [{ a: 19, b: 21 }, { a: 21, b: 17 }, { a: 7, b: 10 }] }),
    ];
    const numbers = tournamentNumbersOf(matches, MINE);
    expect(numbers.matches).toBe(2);
    expect(numbers.setsWon).toBe(4);
    expect(numbers.setsLost).toBe(1);
    // 21+21 do lado A na m1; 21+17+10 do lado B na m2.
    expect(numbers.points).toBe(21 + 21 + 21 + 17 + 10);
    expect(numbers.sets.length).toBe(5);
  });

  it('não conta partida que ainda não terminou', () => {
    const matches = [match({ id: 'm1', teamAId: 'mine', teamBId: 'x' })];
    expect(tournamentNumbersOf(matches, MINE).matches).toBe(0);
  });

  it('devolve zeros sem partida nenhuma', () => {
    const numbers = tournamentNumbersOf([], MINE);
    expect(numbers.points).toBe(0);
    expect(numbers.pointsPerSet).toBe(0);
  });
});

// Cobertura adicional — não veio no teste do brief (Step 1), mas a própria ambiguidade
// resolvida do Task 5 avisa que inverter o sentido de `bestPossiblePlace` promete premiação que
// o atleta ainda não garantiu. Escrita depois da implementação (não é TDD estrito pra esta
// função), só pra não deixar essa direção sem nenhuma rede de segurança.
describe('guaranteedPrizeOf', () => {
  const prizes: TournamentPrize[] = [
    { position: 1, value: 1000, label: '1º lugar' },
    { position: 2, value: 500, label: '2º lugar' },
    { position: 3, value: 200, label: '3º lugar' },
  ];

  it('quem está na final (pior colocação possível: 2º) já garante o prêmio de 2º, não o de 1º', () => {
    expect(guaranteedPrizeOf(prizes, 2)).toEqual({ position: 2, value: 500, label: '2º lugar' });
  });

  it('campeão confirmado (pior colocação possível: 1º) garante o prêmio de 1º', () => {
    expect(guaranteedPrizeOf(prizes, 1)).toEqual({ position: 1, value: 1000, label: '1º lugar' });
  });

  it('sem prêmio cadastrado pra uma colocação tão ruim quanto a pior possível, não garante nada', () => {
    expect(guaranteedPrizeOf(prizes, 4)).toBeNull();
  });

  it('funciona com os prêmios fora de ordem', () => {
    const shuffled = [prizes[2]!, prizes[0]!, prizes[1]!];
    expect(guaranteedPrizeOf(shuffled, 3)).toEqual({ position: 3, value: 200, label: '3º lugar' });
  });

  it('lista de prêmios vazia nunca garante nada', () => {
    expect(guaranteedPrizeOf([], 1)).toBeNull();
  });

  // Fix round 2 (Task 5), achado 2: a semântica correta é casamento EXATO com a pior colocação
  // ainda possível, não "o primeiro prêmio de posição >= bestPossiblePlace". Com uma tabela
  // ESPARSA (sem prêmio pra 2º), um atleta na final (bestPossiblePlace 2) pode terminar em 1º ou
  // 2º — nunca em 3º — então prometer o prêmio de 3º aqui é dinheiro que ele pode não ganhar.
  // Contra a implementação antiga (`find(p => p.position >= bestPossiblePlace)` com sort), este
  // teste falhava devolvendo o prêmio de 3º.
  it('tabela esparsa (sem prêmio pra 2º): atleta na final não tem nada garantido', () => {
    const sparse: TournamentPrize[] = [
      { position: 1, value: 1000, label: '1º lugar' },
      { position: 3, value: 200, label: '3º lugar' },
    ];
    expect(guaranteedPrizeOf(sparse, 2)).toBeNull();
  });

  it('tabela completa: pior colocação possível 2º garante exatamente o prêmio de 2º', () => {
    expect(guaranteedPrizeOf(prizes, 2)).toEqual({ position: 2, value: 500, label: '2º lugar' });
  });

  it('pior colocação possível além da tabela não garante nada', () => {
    expect(guaranteedPrizeOf(prizes, 5)).toBeNull();
  });
});

/**
 * Dupla eliminação de 4 duplas, na forma que `buildDoubleEliminationMatches` gera: WB com duas
 * rodadas, LB com uma, e a final recebendo o vencedor da WB no `teamAId` e o da LB no `teamBId`.
 * `round` reinicia em cada chave — é justamente isso que quebra qualquer contagem por rodada e
 * obriga a caminhar a fiação.
 *
 *   #1 WB R1  mine × x ─┐
 *   #2 WB R1  y × z ────┴─→ #3 WB R2 ─→ #5 Final (slot A)
 *   #4 LB R1 ───────────────────────────→ #5 Final (slot B)
 */
function deBracket(overrides: Partial<Record<'m1' | 'm2' | 'm3' | 'm4' | 'm5', Partial<TournamentMatch>>> = {}): TournamentMatch[] {
  const de = (id: string, partial: Partial<TournamentMatch>): TournamentMatch =>
    match({ id, poolId: '', isGroupMatch: false, teamAId: '', teamBId: '', ...partial, ...(overrides[id as 'm1'] ?? {}) });
  return [
    de('m1', { matchType: 'WB', round: 1, matchNumber: 1, teamAId: 'mine', teamBId: 'x', winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'A' }),
    de('m2', { matchType: 'WB', round: 1, matchNumber: 2, teamAId: 'y', teamBId: 'z', winnerAdvanceMatchNumber: 3, winnerAdvanceSlot: 'B' }),
    de('m3', { matchType: 'WB', round: 2, matchNumber: 3, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'A' }),
    de('m4', { matchType: 'LB', round: 1, matchNumber: 4, winnerAdvanceMatchNumber: 5, winnerAdvanceSlot: 'B' }),
    de('m5', { matchType: 'Final', round: 1, matchNumber: 5 }),
  ];
}

describe('happyPathOf (dupla eliminação)', () => {
  it('invicto na WB: caminho pela WB até a final', () => {
    expect(happyPathOf(deBracket(), 'c1', MINE)?.map((m) => m.id)).toEqual(['m1', 'm3', 'm5']);
    expect(winsToTitleOf(deBracket(), 'c1', MINE)).toBe(3);
  });

  it('depois de perder na WB, recalcula pela LB — perder uma vez não elimina', () => {
    const matches = deBracket({
      m1: { status: 'completed', winnerId: 'x' },
      m4: { teamAId: 'mine', teamBId: 'w' },
    });

    expect(happyPathOf(matches, 'c1', MINE)?.map((m) => m.id)).toEqual(['m4', 'm5']);
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
  });

  it('campeão com uma derrota no currículo continua sendo campeão', () => {
    const matches = deBracket({
      m1: { status: 'completed', winnerId: 'x' },
      m4: { teamAId: 'mine', teamBId: 'w', status: 'completed', winnerId: 'mine' },
      m5: { teamAId: 'x', teamBId: 'mine', status: 'completed', winnerId: 'mine' },
    });

    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(0);
  });

  it('eliminado de vez (duas derrotas): sem caminho e sem manchete', () => {
    const matches = deBracket({
      m1: { status: 'completed', winnerId: 'x' },
      m4: { teamAId: 'mine', teamBId: 'w', status: 'completed', winnerId: 'w' },
    });

    expect(happyPathOf(matches, 'c1', MINE)).toBeNull();
    expect(winsToTitleOf(matches, 'c1', MINE)).toBeNull();
  });

  it('fiação que não desemboca na final não vira número', () => {
    // Já aconteceu neste projeto (as 9 plantas de LB com ligação errada): melhor não afirmar nada
    // do que anunciar um caminho mais curto que a verdade.
    const quebrada = deBracket({ m3: { winnerAdvanceMatchNumber: null } });

    expect(happyPathOf(quebrada, 'c1', MINE)).toBeNull();
    expect(winsToTitleOf(quebrada, 'c1', MINE)).toBeNull();
  });

  it('não conta o bye como partida a vencer', () => {
    // Bye: adversário vazio e o atleta JÁ está na partida seguinte da fiação.
    const comBye = deBracket({
      m1: { teamBId: '' },
      m3: { teamAId: 'mine' },
    });

    expect(happyPathOf(comBye, 'c1', MINE)?.map((m) => m.id)).toEqual(['m3', 'm5']);
    expect(winsToTitleOf(comBye, 'c1', MINE)).toBe(2);
  });
});

/**
 * Planta REAL de 16 duplas (`BRACKET_DEFINITIONS[16]` via `buildDoubleEliminationMatches`), o
 * formato do "Torneio seed nexaGO". Os números abaixo — matchNumber, rodada e slot de destino —
 * saíram de uma execução do gerador, não de suposição:
 *
 *   #1 WB R1 (t1 × t2) → #13 WB R2 (slot A) → #21 WB R3 (slot A) → #27 WB R4 (slot B) → #30 Final (slot B)
 *
 * São 30 partidas no total (15 WB, 13 LB, 3º lugar e final) e as rodadas COLIDEM entre as chaves:
 * WB vai de 1 a 4, LB de 1 a 5. É por isso que agrupar por rodada misturava as duas.
 */
describe('happyPathOf · planta real de 16 duplas', () => {
  const de = (id: string, partial: Partial<TournamentMatch>): TournamentMatch =>
    match({ id, poolId: '', isGroupMatch: false, teamAId: '', teamBId: '', ...partial });

  const BRACKET_16 = [
    de('m1', { matchType: 'WB', round: 1, matchNumber: 1, teamAId: 'mine', teamBId: 't2', winnerAdvanceMatchNumber: 13, winnerAdvanceSlot: 'A' }),
    // LB com rodadas 1 e 2 — as mesmas da WB. Nenhuma pode entrar no caminho de quem está invicto.
    de('m9', { matchType: 'LB', round: 1, matchNumber: 9, winnerAdvanceMatchNumber: 17, winnerAdvanceSlot: 'B' }),
    de('m17', { matchType: 'LB', round: 2, matchNumber: 17, winnerAdvanceMatchNumber: 23, winnerAdvanceSlot: 'B' }),
    de('m13', { matchType: 'WB', round: 2, matchNumber: 13, winnerAdvanceMatchNumber: 21, winnerAdvanceSlot: 'A' }),
    de('m21', { matchType: 'WB', round: 3, matchNumber: 21, winnerAdvanceMatchNumber: 27, winnerAdvanceSlot: 'B' }),
    de('m27', { matchType: 'WB', round: 4, matchNumber: 27, winnerAdvanceMatchNumber: 30, winnerAdvanceSlot: 'B' }),
    de('m30', { matchType: 'Final', round: 1, matchNumber: 30 }),
  ];

  it('invicto na WB: 4 vitórias até chegar na final, 5 até o título', () => {
    const caminho = happyPathOf(BRACKET_16, 'c1', MINE);

    expect(caminho?.map((m) => `${m.matchType} R${m.round}`)).toEqual(['WB R1', 'WB R2', 'WB R3', 'WB R4', 'Final R1']);
    expect(winsToTitleOf(BRACKET_16, 'c1', MINE)).toBe(5);
    // "Caminho até a final": os quatro degraus da WB antes dela.
    expect((caminho?.length ?? 0) - 1).toBe(4);
  });

  it('nenhuma partida da LB entra no caminho de quem está invicto', () => {
    expect(happyPathOf(BRACKET_16, 'c1', MINE)?.every((m) => m.matchType !== 'LB')).toBe(true);
  });
});
