import { matchClosedSets, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { isDoubleElimination } from '../bracket-tree';
import { isPending, outcomeOf, sideOf } from '../tournament-live.selectors';

/** Uma barra do gráfico "você × adversário": um set de uma partida do atleta. */
export interface SetBar {
  label: string;
  mine: number;
  theirs: number;
}

export interface TournamentNumbers {
  matches: number;
  setsWon: number;
  setsLost: number;
  points: number;
  pointsAgainst: number;
  pointsPerSet: number;
  sets: SetBar[];
}

/** Fases de mata-mata da categoria, da mais distante da final para a final. Exportada porque
 *  `focus-journey.component.ts` (`bracketWorstPlaceOf`) também precisa dela — uma cópia privada
 *  chegou a existir lá e foi exatamente por perder o contexto desta função que carregou um ponto
 *  cego de dupla eliminação; ver o histórico em `bracketWorstPlaceOf`. Uma derivação só, duas
 *  consumidoras. */
export function knockoutRounds(matches: readonly TournamentMatch[], categoryId: string): number[] {
  const rounds = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch)
    .map((m) => m.round);
  return [...new Set(rounds)].sort((a, b) => a - b);
}

/**
 * O round da partida de mata-mata JÁ VENCIDA mais avançada do atleta, ou `-Infinity` se ele ainda
 * não venceu nenhuma — o piso: nenhuma partida de round anterior a este pode servir de
 * referência "pendente mais cedo" pra `winsToTitleOf`/`bracketWorstPlaceOf`.
 *
 * Existe porque um BYE é gravado como partida real (`teamAId=mine, teamBId=''`, `status:
 * Scheduled`) e NUNCA é jogado (`buildSingleEliminationMatches`, `organizer-category-ops.ts`) —
 * sem o piso, "a pendente mais cedo" ancora nesse bye pra sempre, não importa quantas fases reais
 * o atleta já tenha vencido depois dele. Byes existem em todo mata-mata que não é potência de 2
 * (6 duplas → 2 byes, 12 → 4…), então isso não é um caso de canto.
 *
 * Exportada e compartilhada de propósito (achado do round 4 de review): a primeira versão desta
 * regra foi escrita duas vezes — uma em `bracketWorstPlaceOf` (round 3), outra faltando em
 * `winsToTitleOf` até este round — e foi exatamente a cópia que deixou a segunda desatualizada.
 * Uma derivação só, duas consumidoras, mesmo espírito de `knockoutRounds` acima.
 */
export function wonRoundsFloorOf(myKnockouts: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): number {
  const wonRounds = myKnockouts.filter((m) => outcomeOf(m, myTeamIds) === 'win').map((m) => m.round);
  return wonRounds.length > 0 ? Math.max(...wonRounds) : -Infinity;
}

/**
 * Um BYE já consumido: partida de mata-mata pendente com o slot do adversário vazio, em que o
 * atleta JÁ aparece numa rodada estritamente posterior. Nunca pode ser a referência "pendente
 * mais cedo".
 *
 * Achado do round 5 de review: `wonRoundsFloorOf` (acima) só enxerga o bye depois que o atleta
 * vence alguma coisa — antes disso o piso é `-Infinity` e o bye continua sendo "a pendente mais
 * cedo". Mas byes são propagados pra rodada seguinte NA CONSTRUÇÃO da chave
 * (`category-bracket-builders.ts`, "Propaga byes... da 1ª rodada para a 2ª"), ANTES de qualquer
 * partida real acontecer — então o estado inicial de toda chave que não é potência de 2 já tem o
 * atleta com bye aparecendo em duas partidas ao mesmo tempo: a do bye (round 1, `teamAId=mine,
 * teamBId=''`, `status: Scheduled`, nunca jogada) e a rodada seguinte (já com o time dele, o
 * outro lado ainda por decidir). É esse cenário — zero vitórias ainda, mas já mais adiante — que
 * o piso sozinho não cobre.
 *
 * O slot do adversário vazio SOZINHO não basta pra identificar um bye: uma partida
 * legitimamente pendente TAMBÉM tem o lado do adversário vazio enquanto o alimentador dela não
 * termina (ex.: a própria rodada seguinte do atleta, esperando o vencedor do outro confronto). O
 * que distingue um bye é o atleta já estar presente numa rodada MAIS ADIANTE: em eliminação
 * simples isso só acontece via bye — do contrário o atleta ainda estaria disputando a rodada
 * corrente, não uma posterior.
 */
function isConsumedByeOf(m: TournamentMatch, myKnockouts: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): boolean {
  const side = sideOf(m, myTeamIds);
  const opponentEmpty = side === 'A' ? m.teamBId.length === 0 : m.teamAId.length === 0;
  if (!opponentEmpty) return false;
  return myKnockouts.some((other) => other.round > m.round);
}

/**
 * As partidas de mata-mata do atleta que ainda estão de fato pendentes — depois de descontar o
 * piso das já vencidas (`wonRoundsFloorOf`) e os byes já consumidos (`isConsumedByeOf`).
 * Compartilhada entre `winsToTitleOf` e `bracketWorstPlaceOf` (`focus-journey.component.ts`) de
 * propósito: uma cópia da regra do piso já ficou pra trás numa das duas funções entre o round 3 e
 * o round 4 de review, e as duas também discordavam sobre o que conta como "pendente" — uma usava
 * `isPending` (exclui `Canceled`), a outra `!matchIsCompleted` (inclui). `isPending` é a resposta
 * única do app pra essa pergunta; as duas passam a usar a mesma função em vez de cada uma manter
 * sua própria definição.
 */
export function pendingKnockoutsOf(myKnockouts: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentMatch[] {
  const floor = wonRoundsFloorOf(myKnockouts, myTeamIds);
  return myKnockouts.filter((m) => isPending(m) && m.round >= floor && !isConsumedByeOf(m, myKnockouts, myTeamIds));
}

/** Um caminho de mata-mata nunca é maior que isto. Só existe pra que fiação circular — planta
 *  quebrada, não dado normal — pare em vez de girar pra sempre; 32 já cobre uma chave de 4 bilhões
 *  de duplas. */
const MAX_HAPPY_PATH = 32;

/** A final da categoria — em eliminação simples e a grande final da dupla eliminação, que o
 *  gerador grava com o mesmo `matchType: 'Final'` (`category-bracket-builders.ts`).
 *
 *  Exportada e compartilhada de propósito: é a mesma regra que `campaignPlacementOf`
 *  (`campaign/campaign-share.ts`) usa para coroar o campeão. Copiar essa checagem já deixou duas
 *  funções deste arquivo em desacordo entre rounds de review — não repita. */
export function isFinalMatchTypeOf(m: Pick<TournamentMatch, 'matchType'>): boolean {
  const t = m.matchType.trim().toLowerCase();
  return t === 'final' || t === 'grand final' || t === 'grand_final';
}

/**
 * A partida de onde o caminho do atleta parte: a pendente de menor `matchNumber` que não seja um
 * BYE já consumido.
 *
 * NÃO usa `pendingKnockoutsOf`, e a diferença importa: aquela função ancora tudo no `round` (piso
 * das vencidas, bye por "aparece numa rodada posterior"), e na dupla eliminação `round` não é uma
 * escala única — WB e LB numeram a partir de 1 cada uma (`buildDoubleEliminationMatches`). Um
 * atleta que vence a WB rodada 3 e cai na LB rodada 2 tem piso 3 e seria filtrado da própria
 * partida que vai jogar. `matchNumber` é global e cronológico no gerador, então serve às duas
 * chaves; e o bye é reconhecido pela FIAÇÃO — slot do adversário vazio numa partida cujo destino
 * do vencedor JÁ tem o time do atleta —, que também não depende de rodada.
 */
function happyPathAnchorOf(
  myKnockouts: readonly TournamentMatch[],
  byMatchNumber: ReadonlyMap<number, TournamentMatch>,
  myTeamIds: ReadonlySet<string>,
): TournamentMatch | null {
  const pending = myKnockouts.filter(isPending).sort((a, b) => a.matchNumber - b.matchNumber);
  return (
    pending.find((m) => {
      const side = sideOf(m, myTeamIds);
      const opponentEmpty = side === 'A' ? m.teamBId.length === 0 : m.teamAId.length === 0;
      if (!opponentEmpty) return true;
      const next = m.winnerAdvanceMatchNumber != null ? byMatchNumber.get(m.winnerAdvanceMatchNumber) : undefined;
      // Bye consumido: o atleta já está na partida seguinte sem ter jogado esta.
      return next == null || sideOf(next, myTeamIds) === null;
    }) ?? null
  );
}

/**
 * O CAMINHO FELIZ: as partidas que o atleta ainda precisa vencer, na ordem, até o título — ele
 * ganhando todas a partir de onde está.
 *
 * Sai da fiação real da planta (`winnerAdvance`, gravada por `category-bracket-builders.ts` e já
 * usada pelo desenho da chave em `bracket-tree.ts`), nunca de contagem de rodadas. É o que torna a
 * resposta possível na DUPLA ELIMINAÇÃO, onde contar fases mente: WB e LB são duas escadas de
 * comprimentos diferentes que numeram rodadas independentes, e quem caiu pra LB tem MAIS partidas
 * pela frente que quem segue invicto — a fiação sabe disso, a rodada não. Como a âncora é sempre a
 * próxima partida real do atleta, uma derrota na WB (que o `loserAdvance` transforma numa partida
 * pendente da LB) recalcula o caminho sozinho, sem nenhum caso especial aqui.
 *
 * `null` quando não dá pra afirmar: sem partida pendente (campeão ou eliminado de vez), fiação
 * ausente (torneio antigo, gerado antes do `winnerAdvance`) ou fiação que não desemboca na final —
 * planta com ligação errada já aconteceu neste projeto (as 9 plantas de LB), e uma cadeia que
 * termina no meio da chave viraria um número menor que a verdade. Melhor não afirmar nada.
 */
export function happyPathOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): TournamentMatch[] | null {
  const knockouts = matches.filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch);
  const byMatchNumber = new Map(knockouts.map((m) => [m.matchNumber, m]));
  const anchor = happyPathAnchorOf(
    knockouts.filter((m) => sideOf(m, myTeamIds) !== null),
    byMatchNumber,
    myTeamIds,
  );
  if (!anchor) return null;

  const path: TournamentMatch[] = [anchor];
  const seen = new Set<number>([anchor.matchNumber]);
  let current = anchor;
  while (current.winnerAdvanceMatchNumber != null && path.length < MAX_HAPPY_PATH) {
    const next = byMatchNumber.get(current.winnerAdvanceMatchNumber);
    if (!next || seen.has(next.matchNumber)) break;
    seen.add(next.matchNumber);
    path.push(next);
    current = next;
  }
  return isFinalMatchTypeOf(path[path.length - 1]!) ? path : null;
}

/**
 * Quantas vitórias separam o atleta do título.
 *
 * Duas derivações, uma por formato. Na ELIMINAÇÃO SIMPLES a contagem é por fases restantes — é a
 * versão verificada por fuzz contra o gerador, e continua intacta. Na DUPLA ELIMINAÇÃO a resposta
 * vem de `happyPathOf`, que caminha a fiação da planta: contar fases ali mentiria, porque WB e LB
 * têm comprimentos diferentes e numeram rodadas independentes.
 *
 * `null` quando: a chave ainda não foi sorteada (a manchete some em vez de chutar); na eliminação
 * simples, quando o atleta já PERDEU alguma partida do mata-mata — eliminado, sem caminho pro
 * título daqui pra frente; na dupla eliminação, quando não sobrou partida pendente (eliminado de
 * vez, com as duas derrotas) ou a fiação não desemboca na final.
 *
 * `0` quando o atleta já venceu a partida da última fase do mata-mata — campeão. É uma resposta
 * honesta (zero vitórias faltando), diferente do `null` de "não dá pra afirmar".
 *
 * Deliberadamente NÃO tenta detectar eliminação que aconteceu só na fase de grupos (grupo
 * encerrado, atleta não classificado, mata-mata ainda sem chave sorteada). Decidir isso exigiria
 * simular o desempate do grupo — exatamente o que `qualificationOf`
 * (`tournament-live.selectors.ts`) se recusa a fazer antes do grupo estar 100% encerrado, pelo
 * mesmo motivo: errar o desempate num app de torneio é pior que uma imprecisão temporária e
 * limitada. Um atleta fora só pelo resultado do grupo continua vendo um número de vitórias até
 * o mata-mata ser sorteado — não "complete" essa lacuna aqui sem entender esse custo.
 */
export function winsToTitleOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): number | null {
  const rounds = knockoutRounds(matches, categoryId);
  if (rounds.length === 0) return null;

  const categoryMatches = matches.filter((m) => m.categoryId === categoryId);
  const myKnockouts = categoryMatches.filter((m) => !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null);

  // Campeão primeiro, e não mais depois de `lost`: na DUPLA ELIMINAÇÃO uma derrota não elimina —
  // quem cai pra LB e volta pra vencer a final é campeão com uma derrota no currículo, e a ordem
  // antiga responderia `null` pra ele. Continua seguro na eliminação simples porque a checagem é
  // pelo `matchType` da final, não pelo round (ver abaixo): lá, uma derrota nunca coexiste com uma
  // final vencida.
  //
  // Checado por `matchType === 'final'` (case-insensitive, trim — mesmo critério de
  // `knockoutLabelOf` em `tournament-live.selectors.ts`), NUNCA por `round === lastRound` (achado
  // N2, round 3 de review): a disputa de 3º lugar recebe o MESMO número de rodada da final
  // (`category-bracket-builders.ts`, "3º lugar: perdedores das semifinais" — `round: roundStart +
  // totalRounds - 1`, igual ao da final), então checar por round faria um atleta que perdeu a
  // semifinal e venceu o 3º lugar (uma partida completed em `lastRound` com vitória dele) coroar
  // como campeão — e a única coisa que impedia isso era a ORDEM dos `if`s (`lost` primeiro), sem
  // nenhuma blindagem própria neste ramo. Checar o `matchType` elimina essa dependência de ordem:
  // "Third Place" nunca é lido como "Final" não importa em que sequência os `if`s rodem — é
  // justamente essa independência de ordem que permitiu subir este ramo pra cima do `lost`.
  const champion = myKnockouts.some((m) => isFinalMatchTypeOf(m) && outcomeOf(m, myTeamIds) === 'win');
  if (champion) return 0;

  // Dupla eliminação: a contagem de fases mentiria (WB e LB são duas escadas de comprimentos
  // diferentes, com rodadas numeradas independentemente), então a resposta vem da FIAÇÃO — quantas
  // partidas o atleta ainda precisa vencer a partir de onde está. `happyPathOf` devolve `null`
  // quando não dá pra afirmar (eliminado de vez, ou planta sem fiação até a final), e aí a
  // manchete some, como sempre fez aqui.
  if (isDoubleElimination(categoryMatches)) return happyPathOf(matches, categoryId, myTeamIds)?.length ?? null;

  // Eliminado na eliminação simples: uma derrota encerra a campanha. Checado ANTES do fallback de
  // "sem pendência" abaixo — sem isso, um atleta eliminado (nenhuma partida futura leva o time
  // dele) cai no mesmo ramo de quem ainda está nos grupos e herda `rounds.length` por engano.
  const lost = myKnockouts.some((m) => outcomeOf(m, myTeamIds) === 'loss');
  if (lost) return null;

  // Piso + byes já consumidos (achado N1, alargado pro round 4 e fechado no round 5 de review —
  // ver `pendingKnockoutsOf` acima): sem isso, um BYE — partida real, nunca jogada — ancora
  // `myPending[0]` na 1ª rodada pra sempre, e um atleta na final de uma chave de 6 duplas (bye na
  // 1ª rodada) lia "3 vitórias do título" (a chave inteira) em vez de "1". Regra compartilhada com
  // `bracketWorstPlaceOf` (`focus-journey.component.ts`) em vez de duplicada.
  const myPending = pendingKnockoutsOf(myKnockouts, myTeamIds)
    .map((m) => m.round)
    .sort((a, b) => a - b);

  // Já dentro do mata-mata: conta da fase pendente dele em diante. Ainda nos grupos: todas.
  const from = myPending[0];
  if (from == null) return rounds.length;
  const index = rounds.indexOf(from);
  return index < 0 ? rounds.length : rounds.length - index;
}

/** Sets e pontos do atleta nas partidas já encerradas — tudo derivado de `sets[]`. */
export function tournamentNumbersOf(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentNumbers {
  const mine = matches.filter((m) => sideOf(m, myTeamIds) !== null && matchIsCompleted(m));
  const bars: SetBar[] = [];
  let setsWon = 0;
  let setsLost = 0;
  let points = 0;
  let pointsAgainst = 0;

  mine.forEach((m, matchIndex) => {
    const iAmA = sideOf(m, myTeamIds) === 'A';
    matchClosedSets(m).forEach((s, setIndex) => {
      const my = iAmA ? s.a : s.b;
      const their = iAmA ? s.b : s.a;
      if (my > their) setsWon++;
      else if (their > my) setsLost++;
      points += my;
      pointsAgainst += their;
      bars.push({ label: `P${matchIndex + 1} · S${setIndex + 1}`, mine: my, theirs: their });
    });
  });

  return {
    matches: mine.length,
    setsWon,
    setsLost,
    points,
    pointsAgainst,
    pointsPerSet: bars.length > 0 ? Math.round((points / bars.length) * 10) / 10 : 0,
    sets: bars,
  };
}

/** A melhor premiação que a campanha atual já garante — `bestPossiblePlace` é a pior colocação
 *  possível a partir daqui (ex.: quem está na final termina no máximo em 2º).
 *
 *  Casamento EXATO com `bestPossiblePlace`, não um "piso" (menor posição >= ele): o atleta pode
 *  terminar em qualquer lugar até `bestPossiblePlace`, nunca pior — então o que está garantido é
 *  o prêmio da colocação mais ruim ainda alcançável. Se essa colocação exata não tem prêmio
 *  cadastrado (tabela com buraco), a resposta certa é "nada garantido", não o prêmio de uma
 *  colocação pior que o atleta não pode mais alcançar. */
export function guaranteedPrizeOf(prizes: readonly TournamentPrize[], bestPossiblePlace: number): TournamentPrize | null {
  return prizes.find((p) => p.position === bestPossiblePlace) ?? null;
}
