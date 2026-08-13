import { matchClosedSets, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { isDoubleElimination } from '../bracket-tree';
import { outcomeOf, sideOf } from '../tournament-live.selectors';

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
 * Quantas vitórias separam o atleta do título.
 *
 * `null` quando: a chave ainda não foi sorteada (a manchete some em vez de chutar); em dupla
 * eliminação (o caminho depende de qual chave o atleta está e a contagem simples de fases
 * mentiria); ou quando o atleta já PERDEU alguma partida do mata-mata — eliminado, sem caminho
 * pro título daqui pra frente.
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
  if (isDoubleElimination(matches.filter((m) => m.categoryId === categoryId))) return null;

  const myKnockouts = matches.filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null);

  // Eliminado: perdeu alguma partida do mata-mata já encerrada. Checado ANTES do fallback de
  // "sem pendência" abaixo — sem isso, um atleta eliminado (nenhuma partida futura leva o time
  // dele) cai no mesmo ramo de quem ainda está nos grupos e herda `rounds.length` por engano.
  const lost = myKnockouts.some((m) => outcomeOf(m, myTeamIds) === 'loss');
  if (lost) return null;

  // Campeão: venceu a partida encerrada da última fase do mata-mata. Mesma lógica do `lost`
  // acima — sem esse ramo, o campeão também cairia no fallback e ouviria que ainda falta vencer
  // fases que já venceu.
  //
  // A ORDEM destes dois `if` é obrigatória, não estética: a disputa de 3º lugar recebe o MESMO
  // número de rodada da final (`category-bracket-builders.ts`, "3º lugar: perdedores das
  // semifinais" — `round: roundStart + totalRounds - 1`, igual ao da final). Um atleta que
  // perdeu a semifinal e venceu o 3º lugar tem uma partida completed em `lastRound` com vitória
  // dele — bateria no `champion` abaixo se ele rodasse primeiro, coroando um 3º colocado. Só não
  // acontece porque o `lost` acima já devolveu `null` pra esse atleta antes de chegar aqui.
  const lastRound = rounds[rounds.length - 1];
  const champion = myKnockouts.some((m) => m.round === lastRound && outcomeOf(m, myTeamIds) === 'win');
  if (champion) return 0;

  const myPending = myKnockouts
    .filter((m) => !matchIsCompleted(m))
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
