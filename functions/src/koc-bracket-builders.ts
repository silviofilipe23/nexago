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
  /** Duração padrão da rodada, em segundos. */
  roundDurationSec: number;
  /** Override por fase (chave = número da fase, 1-based). Fase ausente usa o padrão. */
  phaseDurationsSec?: Record<string, number>;
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
  const phaseSizes: number[][] = [];
  let fieldSize = teamIds.length;
  while (phaseSizes.length < KOC_MAX_PHASES) {
    const rounds = kocRoundCount(fieldSize, config.teamsPerCourt);
    phaseSizes.push(kocRoundSizes(fieldSize, rounds));
    if (rounds === 1) break;

    const nextFieldSize = rounds * qualifiersPerRound;
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
      for (const source of previous) {
        for (let place = 1; place <= qualifiersPerRound; place++) {
          const target = kocNextRoundIndex(
            source.roundLabel - 1,
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
