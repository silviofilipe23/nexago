import type {
  MatchDefinition,
  MatchInputSource,
} from "./bracket-definitions/bracket-definitions";

/**
 * Colocação de uma dupla na chave de dupla eliminação, lida das PLANTAS reais.
 *
 * Na dupla eliminatória o sorteio não escolhe posição de bracket: ele escolhe o
 * NÚMERO DE SEED, e a planta decide o resto — quem joga com quem, quem tem bye,
 * pra onde cai o perdedor. Este módulo traduz "a dupla tirou o seed 12" na
 * consequência que vai ao ar: contra quem ela estreia e em quantas vitórias ela
 * encontra a cabeça mais próxima.
 *
 * Existe pra que NENHUMA superfície de tela precise conhecer planta. O servidor
 * grava a consequência já resolvida na revelação; console e telão só desenham.
 */

export interface SeedPairing {
  matchNumber: number;
  seedA: number;
  seedB: number;
}

export interface ProjectedMeeting {
  /** Seed da cabeça encontrada. */
  seed: number;
  /** Rodada da chave de vencedores em que o encontro acontece. */
  round: number;
  /** Quantas vitórias a dupla precisa ANTES desse jogo (0 = já na estreia). */
  winsNeeded: number;
}

export interface DePlacement {
  seed: number;
  /** Partida de estreia na chave de vencedores; `0` se o seed não existe na planta. */
  entryMatchNumber: number;
  entryRound: number;
  /** Entra depois da primeira rodada — ou seja, ganhou bye. */
  hasBye: boolean;
  /** Seed do adversário de estreia, quando já é conhecido. */
  opponentSeed: number | null;
  /** Partida cujo vencedor será o adversário de estreia (quando o bye adiou a definição). */
  opponentFromMatch: number | null;
  /** Encontro projetado com a cabeça mais próxima, assumindo favoritismo. */
  meetsSeed: ProjectedMeeting | null;
}

const EMPTY: Omit<DePlacement, "seed"> = {
  entryMatchNumber: 0,
  entryRound: 0,
  hasBye: false,
  opponentSeed: null,
  opponentFromMatch: null,
  meetsSeed: null,
};

const byNumber = (definition: readonly MatchDefinition[]): Map<number, MatchDefinition> =>
  new Map(definition.map((d) => [d.matchNumber, d]));

const isWb = (d: MatchDefinition): boolean => d.bracket === "WB";

/** Menor rodada da chave de vencedores presente na planta (normalmente 1). */
function firstWbRound(definition: readonly MatchDefinition[]): number {
  return definition.filter(isWb).reduce((min, d) => Math.min(min, d.round), Number.POSITIVE_INFINITY);
}

/**
 * Quem chega mais longe assumindo que o melhor seed sempre ganha. Serve pra
 * projetar o caminho — não é previsão, é a leitura padrão de chaveamento
 * ("se ganhar duas, pega a 1").
 */
export function expectedWinnerSeed(
  definition: readonly MatchDefinition[],
  matchNumber: number,
): number {
  const index = byNumber(definition);
  const resolve = (num: number, guard: Set<number>): number => {
    if (guard.has(num)) return Number.POSITIVE_INFINITY;
    guard.add(num);
    const match = index.get(num);
    if (!match) return Number.POSITIVE_INFINITY;
    const of = (src: MatchInputSource): number => {
      if (src.type === "SEED") return src.seed;
      if (src.type === "WINNER") return resolve(src.matchNumber, guard);
      // LOSER e BYE não fazem parte da subida na chave de vencedores.
      return Number.POSITIVE_INFINITY;
    };
    return Math.min(of(match.teamA), of(match.teamB));
  };
  return resolve(matchNumber, new Set());
}

/** Jogos de abertura da chave de vencedores, na ordem da planta. */
export function winnersRoundOnePairings(definition: readonly MatchDefinition[]): SeedPairing[] {
  const round = firstWbRound(definition);
  return definition
    .filter((d) => isWb(d) && d.round === round)
    .filter((d) => d.teamA.type === "SEED" && d.teamB.type === "SEED")
    .map((d) => ({
      matchNumber: d.matchNumber,
      seedA: (d.teamA as {seed: number}).seed,
      seedB: (d.teamB as {seed: number}).seed,
    }));
}

/** Seeds que entram depois da primeira rodada — os byes da planta, em ordem. */
export function byeSeeds(definition: readonly MatchDefinition[]): number[] {
  const round = firstWbRound(definition);
  return definition
    .filter((d) => isWb(d) && d.round > round)
    .flatMap((d) => [d.teamA, d.teamB])
    .filter((src): src is {type: "SEED"; seed: number} => src.type === "SEED")
    .map((src) => src.seed)
    .sort((a, b) => a - b);
}

/**
 * Traduz um número de seed na consequência imediata dele.
 *
 * `lockedSeedCount` é quantas cabeças a sessão travou: o "encontro projetado" é
 * com a primeira delas que aparece no caminho. Se a própria dupla é cabeça, não
 * há ninguém acima e `meetsSeed` é `null` — é o caso da 1.
 */
export function dePlacementFor(
  definition: readonly MatchDefinition[],
  seed: number,
  lockedSeedCount: number,
): DePlacement {
  const entry = definition.find(
    (d) =>
      isWb(d) &&
      ((d.teamA.type === "SEED" && d.teamA.seed === seed) ||
        (d.teamB.type === "SEED" && d.teamB.seed === seed)),
  );
  if (!entry) return {seed, ...EMPTY};

  const isOwnSlot = (src: MatchInputSource) => src.type === "SEED" && src.seed === seed;
  const opponentSource = isOwnSlot(entry.teamA) ? entry.teamB : entry.teamA;

  const placement: DePlacement = {
    seed,
    entryMatchNumber: entry.matchNumber,
    entryRound: entry.round,
    hasBye: entry.round > firstWbRound(definition),
    opponentSeed: opponentSource.type === "SEED" ? opponentSource.seed : null,
    opponentFromMatch: opponentSource.type === "WINNER" ? opponentSource.matchNumber : null,
    meetsSeed: null,
  };

  /** Favorito projetado de um lado da chave. */
  const favoriteOf = (src: MatchInputSource): number =>
    src.type === "SEED" ? src.seed :
      src.type === "WINNER" ? expectedWinnerSeed(definition, src.matchNumber) :
        Number.POSITIVE_INFINITY;

  /** Partida da WB alimentada pelo vencedor de `matchNumber`. */
  const nextUp = (matchNumber: number): MatchDefinition | undefined =>
    definition.find(
      (d) =>
        isWb(d) &&
        ((d.teamA.type === "WINNER" && d.teamA.matchNumber === matchNumber) ||
          (d.teamB.type === "WINNER" && d.teamB.matchNumber === matchNumber)),
    );

  // Sobe a chave de vencedores assumindo que ESTA dupla ganha sempre e que o
  // outro ramo é decidido por favoritismo. Para no primeiro degrau em que a
  // adversária projetada é uma cabeça travada.
  let current: MatchDefinition | undefined = entry;
  let ourSource: MatchInputSource = isOwnSlot(entry.teamA) ? entry.teamA : entry.teamB;
  let winsNeeded = 0;
  const visited = new Set<number>();

  while (current && !visited.has(current.matchNumber)) {
    visited.add(current.matchNumber);

    const rival = current.teamA === ourSource ? current.teamB : current.teamA;
    const rivalSeed = favoriteOf(rival);
    if (rivalSeed <= lockedSeedCount && rivalSeed < seed) {
      placement.meetsSeed = {seed: rivalSeed, round: current.round, winsNeeded};
      return placement;
    }

    const next = nextUp(current.matchNumber);
    if (!next) break;
    ourSource =
      next.teamA.type === "WINNER" && next.teamA.matchNumber === current.matchNumber ?
        next.teamA :
        next.teamB;
    current = next;
    winsNeeded += 1;
  }

  return placement;
}
