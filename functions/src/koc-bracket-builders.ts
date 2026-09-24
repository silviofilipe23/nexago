/**
 * Gerador de chave do King of the Court.
 *
 * A unidade aqui NÃO é uma partida de dois lados e sim uma RODADA: 3 a 5 duplas
 * na mesma quadra, com uma tabela de pontos (`docs/business-rules/king-of-court.md`).
 * Por isso este módulo mora fora de `category-bracket-builders.ts`, que fala em
 * `teamAId`/`teamBId`, e devolve o seu próprio tipo.
 *
 * Estrutura: fases sucessivas, cada uma com N rodadas em paralelo (uma por
 * quadra lógica). Os `qualifiersPerRound` primeiros de cada rodada passam para a
 * fase seguinte. A fase que fica com uma rodada só é a FINAL, e a tabela dela é
 * o pódio — não existe "jogo da final".
 */

/** Limites do formato: menos de 3 não gira a fila, mais de 5 deixa todo mundo esperando. */
export const KOC_MIN_TEAMS_PER_ROUND = 3;

/** Duplas por quadra quando a categoria não escolheu — o padrão do formato. */
export const KOC_DEFAULT_TEAMS_PER_COURT = 4;
export const KOC_MAX_TEAMS_PER_ROUND = 5;

/** Teto de fases — trava de segurança contra config que não reduz o campo. */
const KOC_MAX_PHASES = 6;

export const KOC_DEFAULT_ROUND_DURATION_SEC = 900;
export const KOC_MIN_ROUND_DURATION_SEC = 300;
export const KOC_MAX_ROUND_DURATION_SEC = 2400;

export interface KocConfig {
  /** Duplas por quadra na geração (3 a 5). */
  teamsPerCourt: number;
  /** Quantas duplas de cada rodada passam de fase. */
  qualifiersPerRound: number;
  /**
   * Quantas rodadas cada CHAVE joga na classificatória.
   *
   * `1` (padrão) é o formato original: a chave joga uma rodada e as
   * `qualifiersPerRound` melhores por pontos avançam.
   *
   * Acima de 1, a chave joga N rodadas e cada uma classifica UMA dupla — a
   * vencedora sai e libera a quadra, então a rodada seguinte roda com as que
   * sobraram (4 → 3 → …). Como toda rodada precisa de
   * `KOC_MIN_TEAMS_PER_ROUND` duplas, uma chave de S comporta no máximo
   * `S - KOC_MIN_TEAMS_PER_ROUND + 1` rodadas.
   *
   * Vale só na fase 1: as seguintes seguem com uma rodada por chave.
   */
  roundsPerBracket?: number;
  /** Duração padrão da rodada, em segundos. */
  roundDurationSec: number;
  /** Override por fase (chave = número da fase, 1-based). Fase ausente usa o padrão. */
  phaseDurationsSec?: Record<string, number>;
}

/**
 * Quantas rodadas a chave aguenta antes de furar o mínimo do formato.
 *
 * A vencedora de cada rodada sai, então a chave encolhe de uma em uma: uma
 * chave de 4 dá 2 rodadas (4 → 3), uma de 5 dá 3 (5 → 4 → 3).
 */
export function kocMaxRoundsPerBracket(bracketSize: number): number {
  return Math.max(1, bracketSize - KOC_MIN_TEAMS_PER_ROUND + 1);
}

/** Vaga herdada da fase anterior: a `place`-ésima colocada da rodada `fromMatchNumber`. */
export interface KocQualifierSlot {
  fromMatchNumber: number;
  /** Rótulo da rodada de origem dentro da fase dela (1-based), só para exibição. */
  fromRoundLabel: number;
  place: number;
}

export interface KocRoundDraft {
  /** 1 = classificatória … N = final. Vai para o campo `round` do doc. */
  phase: number;
  matchType: string;
  /** Quadra lógica dentro da fase: C1, C2… */
  poolId: string;
  /** Sequencial global, na ordem cronológica de disputa. */
  matchNumber: number;
  /** Posição da rodada dentro da fase (1-based). */
  roundLabel: number;
  /** Elenco fechado — só na fase 1; nas seguintes as vagas vêm de [qualifiers]. */
  teamIds: string[];
  qualifiers: KocQualifierSlot[];
  /** Quantas duplas a rodada terá (elenco fechado ou vagas a preencher). */
  size: number;
  durationSec: number;
  /**
   * Índice que decide para qual rodada da fase seguinte a classificada vai.
   *
   * Normalmente é `roundLabel - 1`. Com várias rodadas por chave ele separa a
   * CHAVE da ordem de disputa: as N classificadas de uma mesma chave precisam
   * cair em rodadas diferentes da fase seguinte (ninguém reencontra adversário
   * antes da hora), mas a ordem em que as rodadas acontecem é outra — todas as
   * chaves jogam a rodada 1 antes de qualquer uma jogar a rodada 2.
   */
  crossoverIndex?: number;
}

/**
 * Fase 1 quando a chave joga VÁRIAS rodadas.
 *
 * Cada rodada classifica uma dupla, que sai e libera a quadra; a rodada
 * seguinte da mesma chave roda com as que sobraram. O elenco dela não é
 * inventado: são os lugares 2 em diante da rodada anterior — a mesma mecânica
 * de vagas que monta a semifinal, olhando para a própria chave.
 *
 * A ordem de disputa é por RODADA, não por chave: todas as chaves jogam a
 * rodada 1, depois todas jogam a 2. Numa quadra só isso espalha a espera em vez
 * de esgotar uma chave inteira antes de a seguinte começar.
 */
function emitPhaseOneWithBracketRounds(params: {
  drafts: KocRoundDraft[];
  sizes: number[];
  roundsPerBracket: number;
  matchType: string;
  durationSec: number;
  rosters: string[][];
  nextMatchNumber: () => number;
}): void {
  const {drafts, sizes, roundsPerBracket, matchType, durationSec, rosters} = params;
  const brackets = sizes.length;
  /** Rodada anterior de cada chave, para as vagas apontarem para ela. */
  const previousOfBracket: (KocRoundDraft | null)[] = sizes.map(() => null);
  /** Posição na fase, na ordem em que as rodadas são emitidas. */
  let label = 0;

  // CHAVE por fora, rodada por dentro: as rodadas de uma mesma chave saem em
  // SEQUÊNCIA. Na areia é o mesmo grupo na mesma quadra — joga a rodada 1, a
  // vencedora sai, e as que sobraram seguem direto para a rodada 2. Emitir por
  // rodada (todas as primeiras, depois todas as segundas) espalhava a chave
  // pela grade e mandava as duplas saírem da quadra para voltar depois.
  for (let bracket = 0; bracket < brackets; bracket++) {
    for (let round = 1; round <= roundsPerBracket; round++) {
      const size = sizes[bracket]! - (round - 1);
      const previous = previousOfBracket[bracket];

      // Da segunda rodada em diante o elenco são os NÃO classificados da
      // anterior: lugares 2 em diante, que é exatamente quem ficou na quadra.
      const qualifiers: KocQualifierSlot[] = [];
      if (previous) {
        for (let place = 2; place <= previous.size; place++) {
          qualifiers.push({
            fromMatchNumber: previous.matchNumber,
            fromRoundLabel: previous.roundLabel,
            place,
          });
        }
      }

      const draft: KocRoundDraft = {
        phase: 1,
        matchType,
        poolId: `C${bracket + 1}`,
        matchNumber: params.nextMatchNumber(),
        roundLabel: ++label,
        teamIds: previous ? [] : rosters[bracket]!,
        qualifiers,
        size,
        durationSec,
        // `bracket + (round - 1)`, não `bracket * N + (round - 1)`: as duas
        // formas separam as classificadas da mesma chave, mas a multiplicativa
        // agrupa por ORDEM de classificação — todas as que venceram na rodada 1
        // (contra a chave cheia) numa semifinal, todas as da rodada 2 na outra.
        // Isso faria uma semifinal muito mais forte que a outra. A aditiva
        // alterna, como o cruzamento original faz com os lugares.
        crossoverIndex: bracket + (round - 1),
      };
      drafts.push(draft);
      previousOfBracket[bracket] = draft;
    }
  }
}

export class KocBracketError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = "KocBracketError";
  }
}

export function kocQualifierDescription(slot: KocQualifierSlot): string {
  return `${slot.place}º Rodada ${slot.fromRoundLabel}`;
}

/**
 * Em quantas rodadas dividir `teamCount` duplas.
 *
 * Parte de `teamsPerCourt` e CORRIGE nas duas pontas, porque o pedido do
 * organizador nem sempre fecha: 5 duplas em quadras de 4 dariam rodadas de 3 e
 * 2, e uma rodada de 2 não é King of the Court — é um jogo. Aí vale mais uma
 * rodada de 5 (o teto do formato) do que duas malformadas.
 */
export function kocRoundCount(teamCount: number, teamsPerCourt: number): number {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  const perCourt = Math.min(
    KOC_MAX_TEAMS_PER_ROUND,
    Math.max(KOC_MIN_TEAMS_PER_ROUND, Math.floor(teamsPerCourt)),
  );

  let rounds = Math.max(1, Math.ceil(teamCount / perCourt));
  // Rodada pequena demais: menos rodadas, cada uma mais cheia.
  while (rounds > 1 && Math.floor(teamCount / rounds) < KOC_MIN_TEAMS_PER_ROUND) {
    rounds--;
  }
  // Rodada grande demais (só acontece quando o passo acima desceu): mais rodadas.
  while (Math.ceil(teamCount / rounds) > KOC_MAX_TEAMS_PER_ROUND) {
    rounds++;
  }
  return rounds;
}

/**
 * Em quantas CHAVES dividir o campo quando cada chave joga `roundsPerBracket`
 * rodadas.
 *
 * A vencedora de cada rodada SAI, então uma chave que joga R rodadas precisa
 * comecar com `KOC_MIN_TEAMS_PER_ROUND + R - 1` duplas: a última rodada ainda
 * tem que ser King of the Court, não um jogo. `kocRoundCount` não sabe disso —
 * ele parte de `teamsPerCourt` e só garante o mínimo da PRIMEIRA rodada.
 *
 * Com 14 duplas em quadras de 4 ele devolve 4 chaves (4, 4, 3, 3), e a chave de
 * 3 não comporta a segunda rodada: a configuração inteira era recusada. Era o
 * que fazia "2 rodadas por chave" só funcionar em campo múltiplo exato da
 * quadra — 8, 12, 16 — e falhar em 13, 14, 15. Menos chaves, cada uma mais
 * cheia (3 chaves de 5, 5, 4), resolve sem sair do teto do formato.
 */
export function kocBracketCountForRounds(
  teamCount: number,
  teamsPerCourt: number,
  roundsPerBracket: number,
): number {
  const needed = KOC_MIN_TEAMS_PER_ROUND + Math.max(1, Math.floor(roundsPerBracket)) - 1;
  let rounds = kocRoundCount(teamCount, teamsPerCourt);
  while (
    rounds > 1 &&
    Math.floor(teamCount / rounds) < needed &&
    Math.ceil(teamCount / (rounds - 1)) <= KOC_MAX_TEAMS_PER_ROUND
  ) {
    rounds--;
  }
  // Normaliza pelo TAMANHO da chave, porque é assim que o sorteio ao vivo
  // descreve a divisão: ele guarda `teamsPerGroup` e reconstrói as caixas com
  // `ceil(duplas / alvo)`. Nem toda contagem sobrevive a essa ida e volta — 25
  // duplas em 6 chaves viram alvo 5, e 5 é o que o sorteio devolve, não 6.
  // Sem normalizar, o sorteio publicava 5 caixas e a geração exigia 6.
  const target = Math.ceil(teamCount / rounds);
  return Math.max(1, Math.ceil(teamCount / target));
}

/**
 * Tamanho de cada rodada, distribuindo o resto nas primeiras — 14 duplas em 4
 * rodadas viram 4, 4, 3, 3.
 */
export function kocRoundSizes(teamCount: number, rounds: number): number[] {
  const base = Math.floor(teamCount / rounds);
  const extra = teamCount % rounds;
  return Array.from({length: rounds}, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Distribui o elenco semeado em serpentina: a 1ª rodada leva o seed 1, a última
 * leva o seed 2, e a volta traz os seeds seguintes na ordem inversa. É o que
 * equilibra a força — em 16 duplas, toda rodada soma 34 e não existe rodada da
 * morte.
 */
export function kocSnakeDistribute(seeds: string[], sizes: number[]): string[][] {
  const rounds: string[][] = sizes.map(() => []);
  let index = 0;
  let pass = 0;
  while (index < seeds.length) {
    // Ida nas passagens pares, volta nas ímpares.
    const order =
      pass % 2 === 0 ?
        rounds.map((_, i) => i) :
        rounds.map((_, i) => rounds.length - 1 - i);
    let placedInPass = false;
    for (const roundIndex of order) {
      if (index >= seeds.length) break;
      if (rounds[roundIndex]!.length >= sizes[roundIndex]!) continue;
      rounds[roundIndex]!.push(seeds[index]!);
      index++;
      placedInPass = true;
    }
    if (!placedInPass) break; // todas as rodadas cheias
    pass++;
  }
  return rounds;
}

/**
 * Para qual rodada da fase seguinte vai a `place`-ésima colocada da rodada
 * `sourceIndex`.
 *
 * `(origem + colocação - 1) % destino` espalha as vagas de uma MESMA rodada por
 * rodadas diferentes: ninguém reencontra na fase seguinte quem acabou de
 * enfrentar. Em 16 duplas dá exatamente o cruzamento da seção 7 do plano —
 * SF1 com 1ºR1, 2ºR2, 1ºR3, 2ºR4 — e cada semi leva metade dos primeiros e
 * metade dos segundos.
 */
export function kocNextRoundIndex(
  sourceIndex: number,
  place: number,
  nextRoundCount: number,
): number {
  return (sourceIndex + place - 1) % nextRoundCount;
}

function durationForPhase(phase: number, config: KocConfig): number {
  const override = config.phaseDurationsSec?.[String(phase)];
  const raw = typeof override === "number" && Number.isFinite(override) ?
    override :
    config.roundDurationSec;
  return Math.min(
    KOC_MAX_ROUND_DURATION_SEC,
    Math.max(KOC_MIN_ROUND_DURATION_SEC, Math.round(raw)),
  );
}

/**
 * `koc_final` na última fase; `koc_semifinal` na penúltima, mas só quando há 3
 * fases ou mais — num campo de 8 duplas a fase 1 é a classificatória, não uma
 * semifinal.
 */
function matchTypeForPhase(phase: number, totalPhases: number): string {
  if (phase === totalPhases) return "koc_final";
  if (totalPhases >= 3 && phase === totalPhases - 1) return "koc_semifinal";
  return "koc_round";
}

/**
 * Monta todas as rodadas da categoria, da classificatória à final.
 *
 * `seeds` vem na ordem de semeadura (melhor primeiro), como o resto do gerador.
 */
/**
 * Elenco da fase 1 vindo de FORA — o sorteio ao vivo, que já distribuiu as
 * duplas nas rodadas na frente do público.
 *
 * Valida que é uma partição exata do campo: mesmas duplas, sem repetir nem
 * faltar, e nas capacidades que a fase exige. Um sorteio publicado com o elenco
 * errado só apareceria na areia, com as duplas já na quadra.
 */
function assertPhaseOneRosters(
  rosters: readonly (readonly string[])[],
  teamIds: readonly string[],
  sizes: readonly number[],
): string[][] {
  if (rosters.length !== sizes.length) {
    throw new KocBracketError(
      `O sorteio trouxe ${rosters.length} rodadas, mas a fase tem ${sizes.length}.`,
      "koc_draw_round_count_mismatch",
    );
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (let i = 0; i < rosters.length; i++) {
    const roster = rosters[i]!.map((id) => id.trim()).filter((id) => id.length > 0);
    if (roster.length !== sizes[i]!) {
      throw new KocBracketError(
        `A rodada ${i + 1} do sorteio tem ${roster.length} duplas; a fase pede ${sizes[i]}.`,
        "koc_draw_round_size_mismatch",
      );
    }
    for (const id of roster) {
      if (seen.has(id)) {
        throw new KocBracketError(
          "O sorteio repetiu uma dupla em mais de uma rodada.",
          "koc_draw_duplicate_team",
        );
      }
      seen.add(id);
    }
    out.push(roster);
  }
  const missing = teamIds.filter((id) => !seen.has(id));
  if (missing.length > 0 || seen.size !== teamIds.length) {
    throw new KocBracketError(
      "O sorteio não cobriu todas as duplas da categoria.",
      "koc_draw_roster_incomplete",
    );
  }
  return out;
}

export function buildKingOfCourtRounds(
  seeds: string[],
  config: KocConfig,
  opts?: {phaseOneRosters?: readonly (readonly string[])[]},
): KocRoundDraft[] {
  const teamIds = seeds.map((id) => id.trim()).filter((id) => id.length > 0);
  const qualifiersPerRound = Math.max(1, Math.floor(config.qualifiersPerRound));

  // Planeja as fases ANTES de emitir, porque o tipo da rodada (final? semi?)
  // depende de quantas fases existem no total.
  // Rodadas por chave na classificatória. Acima de 1, cada rodada classifica
  // UMA dupla e a vencedora sai — a chave encolhe rodada a rodada.
  const roundsPerBracket = Math.max(1, Math.floor(config.roundsPerBracket ?? 1));

  const phaseSizes: number[][] = [];
  let fieldSize = teamIds.length;
  while (phaseSizes.length < KOC_MAX_PHASES) {
    // Só a fase 1 se divide em várias rodadas por chave; as seguintes seguem
    // com uma rodada por chave e `qualifiersPerRound` classificadas. A divisão
    // do campo muda junto: com 2 rodadas por chave nenhuma chave pode nascer
    // com 3 duplas, senão a segunda rodada não existe.
    const isFirst = phaseSizes.length === 0;
    const rounds = isFirst && roundsPerBracket > 1 ?
      kocBracketCountForRounds(fieldSize, config.teamsPerCourt, roundsPerBracket) :
      kocRoundCount(fieldSize, config.teamsPerCourt);
    const sizes = kocRoundSizes(fieldSize, rounds);
    phaseSizes.push(sizes);
    if (rounds === 1) break;

    if (isFirst && roundsPerBracket > 1) {
      const smallest = Math.min(...sizes);
      const max = kocMaxRoundsPerBracket(smallest);
      if (roundsPerBracket > max) {
        throw new KocBracketError(
          `Uma chave de ${smallest} duplas comporta no máximo ${max} rodada(s): ` +
            `cada vencedora sai e toda rodada precisa de ${KOC_MIN_TEAMS_PER_ROUND}. ` +
            `Foram pedidas ${roundsPerBracket}.`,
          "koc_rounds_per_bracket_too_high",
        );
      }
    }
    const perRound = isFirst && roundsPerBracket > 1 ? 1 : qualifiersPerRound;
    const nextFieldSize = rounds * (isFirst ? roundsPerBracket * perRound : perRound);
    if (nextFieldSize >= fieldSize) {
      throw new KocBracketError(
        `Com ${qualifiersPerRound} classificadas por rodada a fase não reduz o ` +
          `campo (${fieldSize} duplas em ${rounds} rodadas). Reduza o número de ` +
          "classificadas.",
        "koc_phase_does_not_reduce",
      );
    }
    fieldSize = nextFieldSize;
  }

  const totalPhases = phaseSizes.length;
  const drafts: KocRoundDraft[] = [];
  let matchNumber = 1;

  for (let phaseIndex = 0; phaseIndex < totalPhases; phaseIndex++) {
    const phase = phaseIndex + 1;
    const sizes = phaseSizes[phaseIndex]!;
    const durationSec = durationForPhase(phase, config);
    const matchType = matchTypeForPhase(phase, totalPhases);

    if (phaseIndex === 0 && roundsPerBracket > 1) {
      emitPhaseOneWithBracketRounds({
        drafts,
        sizes,
        roundsPerBracket,
        matchType,
        durationSec,
        rosters: opts?.phaseOneRosters ?
          assertPhaseOneRosters(opts.phaseOneRosters, teamIds, sizes) :
          kocSnakeDistribute(teamIds, sizes),
        nextMatchNumber: () => matchNumber++,
      });
      continue;
    }

    // Fase 1 nasce com elenco fechado; as seguintes, com vagas apontando para a
    // tabela da fase anterior.
    const rosters =
      phaseIndex === 0 ?
        (opts?.phaseOneRosters ?
          assertPhaseOneRosters(opts.phaseOneRosters, teamIds, sizes) :
          kocSnakeDistribute(teamIds, sizes)) :
        sizes.map(() => []);

    const qualifiersByRound: KocQualifierSlot[][] = sizes.map(() => []);
    if (phaseIndex > 0) {
      const previous = drafts.filter((d) => d.phase === phase - 1);
      // Só a saída da FASE 1 multi-rodada classifica uma por rodada: ali cada
      // rodada já elegeu a sua. Das fases seguintes saem `qualifiersPerRound`
      // como sempre — a semifinal manda duas para a final, não uma.
      const placesFromSource = phaseIndex === 1 && roundsPerBracket > 1 ?
        1 :
        qualifiersPerRound;
      for (const source of previous) {
        for (let place = 1; place <= placesFromSource; place++) {
          const target = kocNextRoundIndex(
            source.crossoverIndex ?? source.roundLabel - 1,
            place,
            sizes.length,
          );
          qualifiersByRound[target]!.push({
            fromMatchNumber: source.matchNumber,
            fromRoundLabel: source.roundLabel,
            place,
          });
        }
      }
    }

    for (let i = 0; i < sizes.length; i++) {
      drafts.push({
        phase,
        matchType,
        poolId: `C${i + 1}`,
        matchNumber: matchNumber++,
        roundLabel: i + 1,
        teamIds: rosters[i]!,
        qualifiers: qualifiersByRound[i]!,
        size: sizes[i]!,
        durationSec,
      });
    }
  }

  return drafts;
}
