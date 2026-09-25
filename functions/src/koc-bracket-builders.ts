/**
 * Gerador de chave do King of the Court.
 *
 * A unidade aqui NÃO é uma partida de dois lados e sim uma RODADA: 3 a 6 duplas
 * na mesma quadra, com uma tabela de pontos (`docs/business-rules/king-of-court.md`).
 * Por isso este módulo mora fora de `category-bracket-builders.ts`, que fala em
 * `teamAId`/`teamBId`, e devolve o seu próprio tipo.
 *
 * Estrutura: fases sucessivas, cada uma com N rodadas em paralelo (uma por
 * quadra lógica). Os `qualifiersPerRound` primeiros de cada rodada passam para a
 * fase seguinte. A fase que fica com uma rodada só é a FINAL, e a tabela dela é
 * o pódio — não existe "jogo da final".
 */

/** Limites do formato: menos de 3 não gira a fila, mais de 6 deixa todo mundo esperando. */
export const KOC_MIN_TEAMS_PER_ROUND = 3;

/** Duplas por quadra quando a categoria não escolheu — o padrão do formato. */
export const KOC_DEFAULT_TEAMS_PER_COURT = 4;

/**
 * Teto duro do formato. Subiu de 5 para 6 quando a semifinal passou a poder
 * rodar várias baterias: com 6 na chave são 4 baterias, e é isso que separa
 * uma semi de verdade de uma final antecipada.
 */
export const KOC_MAX_TEAMS_PER_ROUND = 6;

/**
 * Teto de quem não escolheu. Categoria antiga não tem `maxTeamsPerRound`, e
 * herdar 6 mudaria a chave de torneio já publicado sem ninguém pedir.
 */
export const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5;

/** Teto de fases — trava de segurança contra config que não reduz o campo. */
const KOC_MAX_PHASES = 6;

export const KOC_DEFAULT_ROUND_DURATION_SEC = 900;
export const KOC_MIN_ROUND_DURATION_SEC = 300;
export const KOC_MAX_ROUND_DURATION_SEC = 2400;

export interface KocConfig {
  /**
   * Duplas por quadra na geração — piso 3, teto duro 6 (`KOC_MAX_TEAMS_PER_ROUND`).
   * Categoria que não escolheu um teto próprio (`maxTeamsPerRound`) fica no
   * teto antigo, 5.
   */
  teamsPerCourt: number;
  /** Quantas duplas de cada rodada passam de fase. */
  qualifiersPerRound: number;
  /**
   * Quantas rodadas cada CHAVE joga na classificatória, quando o plano é
   * DERIVADO (sem `phases`) por `kocLegacyPlan`.
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
   * Vale só na fase 1 do plano derivado — as seguintes seguem com uma rodada
   * por chave. Isso é uma limitação do CAMPO `roundsPerBracket`, não do
   * formato: um `phases` explícito pode dar várias baterias a QUALQUER fase
   * (é o próprio ponto desta entrega — uma semifinal de 6 duplas com 4
   * baterias). `roundsPerBracket` só continua existindo porque é o que
   * `kocLegacyPlan` precisa para reproduzir bit a bit a chave de antes.
   */
  roundsPerBracket?: number;
  /** Duração padrão da rodada, em segundos. */
  roundDurationSec: number;
  /** Override por fase (chave = número da fase, 1-based). Fase ausente usa o padrão. */
  phaseDurationsSec?: Record<string, number>;
  /**
   * Plano explícito de fases. Quando existe, MANDA: o gerador não planeja nada,
   * só emite. Ausente, o plano é derivado dos campos acima por `kocLegacyPlan`.
   */
  phases?: KocPhaseSpec[];
  /** Teto de duplas numa bateria nesta categoria. Ausente ⇒ o teto de sempre. */
  maxTeamsPerRound?: number;
}

/**
 * Uma fase do torneio, como o organizador a vê na tabela.
 *
 * `bracketSizes` é o tamanho de cada chave na PRIMEIRA bateria; as seguintes
 * encolhem em `qualifiersPerRound` a cada bateria, porque quem classifica sai
 * e libera a quadra.
 */
export interface KocPhaseSpec {
  bracketSizes: number[];
  roundsPerBracket: number;
  /** 0 só na fase final: ali ninguém classifica, a tabela é o pódio. */
  qualifiersPerRound: number;
  durationSec: number;
}

/**
 * Quantas baterias a chave aguenta antes de furar o mínimo do formato.
 *
 * Cada bateria tira `qualifiersPerRound` duplas, então a chave encolhe em
 * degraus desse tamanho: de 5 tirando 1 dá 3 baterias (5 → 4 → 3); de 7
 * tirando 2 dá 3 (7 → 5 → 3).
 */
export function kocMaxRoundsPerBracket(
  bracketSize: number,
  qualifiersPerRound = 1,
): number {
  const q = Math.max(1, Math.floor(qualifiersPerRound));
  return Math.max(1, Math.floor((bracketSize - KOC_MIN_TEAMS_PER_ROUND) / q) + 1);
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
  /**
   * Posição da bateria DENTRO da chave (1, 2, 3…). `roundLabel` é a posição na
   * fase e, com 20 duplas, diz "Rodada 9" — número que não responde nada pra
   * quem está na areia. Com os dois o telão diz "Chave 4 · Bateria 3".
   */
  batteryLabel: number;
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
 * Emite as rodadas de UMA fase.
 *
 * Vale para qualquer fase — era exclusiva da classificatória e virou geral
 * quando a semifinal passou a poder rodar várias baterias.
 *
 * CHAVE por fora, bateria por dentro: as baterias de uma mesma chave saem em
 * sequência, porque na areia é o mesmo grupo na mesma quadra. Emitir por
 * bateria espalharia a chave pela grade e mandaria as duplas saírem da quadra
 * para voltar depois.
 */
function emitPhase(params: {
  drafts: KocRoundDraft[];
  phase: number;
  spec: KocPhaseSpec;
  matchType: string;
  /** Elenco fechado por chave — só na fase 1. Nulo nas seguintes. */
  rosters: string[][] | null;
  /** Rodadas da fase anterior, de onde vêm as vagas da bateria 1. */
  previousPhase: readonly KocRoundDraft[];
  /** Quantas classificadas cada rodada da fase anterior manda para cá. */
  previousQualifiersPerRound: number;
  nextMatchNumber: () => number;
}): void {
  const {drafts, phase, spec, matchType, rosters, previousPhase} = params;
  const q = Math.max(1, Math.floor(spec.qualifiersPerRound));
  const rounds = Math.max(1, Math.floor(spec.roundsPerBracket));
  const emitted: KocRoundDraft[] = [];
  let label = 0;

  for (let bracket = 0; bracket < spec.bracketSizes.length; bracket++) {
    let previous: KocRoundDraft | null = null;
    for (let battery = 1; battery <= rounds; battery++) {
      const size = spec.bracketSizes[bracket]! - (battery - 1) * q;
      if (size < KOC_MIN_TEAMS_PER_ROUND) {
        throw new KocBracketError(
          `A chave ${bracket + 1} da fase ${phase} ficaria com ${size} duplas na ` +
            `bateria ${battery}: toda bateria precisa de ${KOC_MIN_TEAMS_PER_ROUND}.`,
          "koc_battery_too_small",
        );
      }

      // Da segunda bateria em diante o elenco são os NÃO classificados da
      // anterior: os lugares depois das que saíram, que é quem ficou na quadra.
      const qualifiers: KocQualifierSlot[] = [];
      if (previous) {
        for (let place = q + 1; place <= previous.size; place++) {
          qualifiers.push({
            fromMatchNumber: previous.matchNumber,
            fromRoundLabel: previous.roundLabel,
            place,
          });
        }
      }

      const draft: KocRoundDraft = {
        phase,
        matchType,
        poolId: `C${bracket + 1}`,
        matchNumber: params.nextMatchNumber(),
        roundLabel: ++label,
        batteryLabel: battery,
        teamIds: !previous && rosters ? rosters[bracket]! : [],
        qualifiers,
        size,
        durationSec: spec.durationSec,
        // `chave + (bateria − 1)`, não `chave × N + (bateria − 1)`: as duas
        // separam as classificadas da mesma chave, mas a multiplicativa agrupa
        // por ORDEM de classificação — todas as que venceram contra a chave
        // cheia numa semi só, que nasceria muito mais forte que a outra.
        crossoverIndex: bracket + (battery - 1),
      };
      emitted.push(draft);
      drafts.push(draft);
      previous = draft;
    }
  }

  // A bateria 1 de cada chave recebe do cruzamento da fase anterior.
  if (previousPhase.length > 0) {
    const firsts = emitted.filter((d) => d.batteryLabel === 1);
    for (const source of previousPhase) {
      for (let place = 1; place <= params.previousQualifiersPerRound; place++) {
        const natural = kocNextRoundIndex(
          source.crossoverIndex ?? source.roundLabel - 1,
          place,
          firsts.length,
        );
        const target = findAvailableTarget(firsts, natural, source.matchNumber);
        firsts[target]!.qualifiers.push({
          fromMatchNumber: source.matchNumber,
          fromRoundLabel: source.roundLabel,
          place,
        });
      }
    }
  }
}

/**
 * A partir do alvo que o módulo (`kocNextRoundIndex`) indicou, acha a próxima
 * chave da fase seguinte com lugar livre — sem repetir a chave de ORIGEM.
 *
 * Duas peneiras, não uma. `kocRoundSizes` dá a vaga extra sempre à(s)
 * PRIMEIRA(S) chave(s) da fase seguinte; o módulo não sabe disso e, quando o
 * campo não divide igual entre essas chaves (ex.: 10 vagas em 3 chaves de
 * 4/3/3), pode apontar vagas demais para uma e faltar para outra — corrigido
 * pela 1ª peneira (capacidade). Mas capacidade sozinha não basta: se a próxima
 * chave com lugar livre já tiver uma vaga da MESMA chave de origem, as duas
 * classificadas que acabaram de se enfrentar reencontrariam na chave seguinte
 * — o que a regra do formato proíbe. Por isso a 1ª busca exige as duas coisas.
 *
 * Só aceita repetir a origem (2ª busca, só capacidade) quando NENHUMA chave
 * sobra sem repetir — o pigeonhole genuíno de a origem mandar mais vagas do
 * que a fase seguinte tem chaves (a final, com uma chave só, é o caso extremo:
 * ali repetir é inevitável e não é bug). Com chaves do mesmo tamanho a 1ª
 * busca sempre acha na primeira tentativa — o módulo já fecha certo.
 *
 * Exportada só para o teste: os três desfechos (acha de cara, acha andando,
 * pigeonhole) só apareciam indiretamente, através de varreduras de geração
 * onde as chaves têm todas o mesmo tamanho — ou seja, onde a 1ª busca sempre
 * acerta de primeira e as outras duas nunca rodam.
 */
export function findAvailableTarget(
  firsts: readonly KocRoundDraft[],
  natural: number,
  fromMatchNumber: number,
): number {
  const hasRoom = (i: number) => firsts[i]!.qualifiers.length < firsts[i]!.size;
  const hasSameSource = (i: number) =>
    firsts[i]!.qualifiers.some((q) => q.fromMatchNumber === fromMatchNumber);

  let target = natural;
  for (let tries = 0; tries < firsts.length; tries++) {
    if (hasRoom(target) && !hasSameSource(target)) return target;
    target = (target + 1) % firsts.length;
  }
  target = natural;
  for (let tries = 0; tries < firsts.length; tries++) {
    if (hasRoom(target)) return target;
    target = (target + 1) % firsts.length;
  }
  // Nenhuma chave com lugar livre: o plano não fecha (soma de vagas maior que
  // a capacidade da fase seguinte). Devolve o alvo natural — a rede de
  // segurança em `buildKingOfCourtRounds` recusa o descompasso logo em
  // seguida, com uma mensagem que aponta a rodada, não este laço.
  return natural;
}

export class KocBracketError extends Error {
  /**
   * `details` vira campo do `HttpsError` que a callable devolve, ao lado do
   * `reason`. Existe para o erro poder carregar os NÚMEROS que a mensagem já
   * cita (a menor chave, o teto de baterias) numa forma que a tela consiga
   * ler sem regex sobre o texto em português.
   */
  constructor(
    message: string,
    readonly reason: string,
    readonly details: Record<string, unknown> = {},
  ) {
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
 *
 * `maxPerRound` é o teto que os dois laços respeitam — parâmetro, não a
 * constante do módulo, porque nem todo chamador quer o teto novo de 6: quem
 * não passa nada continua preso no teto de sempre (`KOC_LEGACY_MAX_TEAMS_PER_ROUND`),
 * e é assim que `kocRoundCount(n, teamsPerCourt)` de dois argumentos — todo
 * chamador de antes deste pacote de mudanças — nunca muda de comportamento.
 * Quem já escolheu um teto maior (os planejadores novos) passa o próprio teto
 * nos dois lugares.
 */
export function kocRoundCount(
  teamCount: number,
  teamsPerCourt: number,
  maxPerRound: number = KOC_LEGACY_MAX_TEAMS_PER_ROUND,
): number {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  const perCourt = Math.min(
    maxPerRound,
    Math.max(KOC_MIN_TEAMS_PER_ROUND, Math.floor(teamsPerCourt)),
  );

  let rounds = Math.max(1, Math.ceil(teamCount / perCourt));
  // Rodada pequena demais: menos rodadas, cada uma mais cheia.
  while (rounds > 1 && Math.floor(teamCount / rounds) < KOC_MIN_TEAMS_PER_ROUND) {
    rounds--;
  }
  // Rodada grande demais (só acontece quando o passo acima desceu): mais rodadas.
  while (Math.ceil(teamCount / rounds) > maxPerRound) {
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
 *
 * `maxPerRound` tem o mesmo default de `kocRoundCount` pelo mesmo motivo: esta
 * função só serve o caminho antigo de "várias rodadas por chave" em
 * `buildKingOfCourtRounds`, que este pacote de mudanças não toca — quem chama
 * sem o quarto argumento (o único caminho que existe hoje) continua preso no
 * teto de sempre, mesmo com o teto do módulo agora em 6.
 */
export function kocBracketCountForRounds(
  teamCount: number,
  teamsPerCourt: number,
  roundsPerBracket: number,
  maxPerRound: number = KOC_LEGACY_MAX_TEAMS_PER_ROUND,
): number {
  const needed = KOC_MIN_TEAMS_PER_ROUND + Math.max(1, Math.floor(roundsPerBracket)) - 1;
  let rounds = kocRoundCount(teamCount, teamsPerCourt, maxPerRound);
  while (
    rounds > 1 &&
    Math.floor(teamCount / rounds) < needed &&
    Math.ceil(teamCount / (rounds - 1)) <= maxPerRound
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

/** Teto da categoria, saneado. Ausente ou inválido cai no teto de sempre. */
export function kocClampMaxPerRound(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return KOC_LEGACY_MAX_TEAMS_PER_ROUND;
  return Math.min(KOC_MAX_TEAMS_PER_ROUND, Math.max(KOC_MIN_TEAMS_PER_ROUND, n));
}

/**
 * Proposta "máximo de jogo" a partir de um campo de `field` duplas, para as
 * fases que NÃO são a primeira.
 *
 * Separada de `kocProposePlan` porque a fase 1 tem uma regra a mais (campo que
 * cabe numa quadra é rodada única) e a cascata da tabela editável repropõe só o
 * rabo do plano, nunca a primeira fase.
 */
export function kocProposeTail(
  field: number,
  maxPerRound: number,
  durationFor: (phase: number) => number,
  startPhase: number,
): KocPhaseSpec[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const phases: KocPhaseSpec[] = [];
  let remaining = field;
  for (;;) {
    const phaseNumber = startPhase + phases.length;
    // Vagas que sobram no orçamento de fases, contando esta. O algoritmo é
    // guloso — encaixa o máximo de jogo em cada fase sem olhar para frente —
    // e guloso pode não sobrar campo pra fechar dentro de `KOC_MAX_PHASES`.
    // `left` é a régua que evita isso: com 1 sobrando esta fase TEM que ser a
    // final, e com 2 a PRÓXIMA tem, então esta já tem que entregar um campo
    // que caiba numa quadra só.
    const left = KOC_MAX_PHASES - phaseNumber + 1;
    const durationSec = durationFor(phaseNumber);
    const brackets = kocRoundCount(remaining, max, max);
    const bracketSizes = kocRoundSizes(remaining, brackets);
    const smallest = Math.min(...bracketSizes);
    const largest = Math.max(...bracketSizes);

    // `kocRoundCount` corrige nas duas pontas, mas corrigir nem sempre é
    // possível: um campo pode não ter NENHUMA divisão que caiba entre o piso
    // e o teto do formato — 4 duplas com teto 3 não fecham nem em chave de 3
    // (sobra 1) nem de 4 (não existe, o teto é 3). Aí não existe plano, e é
    // melhor recusar aqui do que devolver uma chave fora da faixa.
    if (smallest < KOC_MIN_TEAMS_PER_ROUND || largest > max) {
      throw new KocBracketError(
        `${remaining} duplas não cabem em nenhuma chave entre ${KOC_MIN_TEAMS_PER_ROUND} ` +
          `e ${max} na fase ${phaseNumber}. Ajuste o teto de duplas por bateria.`,
        "koc_field_not_splittable",
      );
    }

    let rounds = kocMaxRoundsPerBracket(smallest, 1);
    let qualifiers = 1;
    if (rounds === 1) {
      // Chave que não aguenta uma segunda bateria volta ao formato clássico:
      // passa quem está no topo da tabela. Com 1 só, 2 chaves mandariam 2
      // duplas para a fase seguinte — abaixo do piso, e o plano morreria.
      qualifiers = Math.max(
        1,
        Math.min(smallest - 1, Math.floor((remaining - 1) / brackets)),
      );
    }
    let next = brackets * rounds * qualifiers;

    // Campo já cabe numa quadra só: esta fase é a final quando ninguém
    // sobraria para uma próxima (o campo morreria) OU quando o orçamento de
    // fases acaba aqui mesmo — não existe fase seguinte para herdar o campo.
    if (brackets === 1 && (next < KOC_MIN_TEAMS_PER_ROUND || left === 1)) {
      phases.push({bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec});
      return phases;
    }
    if (left === 1) {
      // Última vaga do orçamento e o campo ainda não coube numa quadra só:
      // não sobra fase para terminar o torneio.
      throw new KocBracketError(
        `${field} duplas não fecham em até ${KOC_MAX_PHASES} fases com teto de ${max} ` +
          `por bateria: a fase ${phaseNumber} ainda teria ${brackets} chaves, não uma só. ` +
          "Aumente o teto de duplas por bateria.",
        "koc_plan_exceeds_max_phases",
      );
    }

    if (left === 2) {
      // Sobra só uma vaga depois desta: a fase seguinte TEM que ser a final,
      // ou seja, tem que caber numa quadra só. Encolhe esta fase — menos
      // baterias ou menos classificadas, o que estiver em jogo — até o campo
      // que ela entrega já caber no teto. Sem isso o orçamento estoura na
      // fase seguinte mesmo com um campo pequeno.
      if (qualifiers === 1) {
        rounds = Math.min(rounds, Math.floor(max / brackets));
      } else {
        qualifiers = Math.min(qualifiers, Math.floor(max / brackets));
      }
      if (rounds < 1 || qualifiers < 1) {
        throw new KocBracketError(
          `${field} duplas não fecham em até ${KOC_MAX_PHASES} fases com teto de ${max} ` +
            `por bateria: a fase ${phaseNumber} não consegue entregar um campo que caiba ` +
            "numa quadra só para a final. Aumente o teto de duplas por bateria.",
          "koc_plan_exceeds_max_phases",
        );
      }
      next = brackets * rounds * qualifiers;
      if (next < KOC_MIN_TEAMS_PER_ROUND) {
        throw new KocBracketError(
          `${field} duplas não fecham em até ${KOC_MAX_PHASES} fases com teto de ${max} ` +
            `por bateria: a fase ${phaseNumber} deixaria só ${next} duplas para a final, ` +
            "abaixo do piso do formato. Aumente o teto de duplas por bateria.",
          "koc_plan_exceeds_max_phases",
        );
      }
    }

    phases.push({bracketSizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec});
    remaining = next;
  }
}

/**
 * O plano que a tela propõe quando o organizador não mexeu em nada.
 *
 * Critério: MÁXIMO DE JOGO — chave o mais cheia que o teto permite, e baterias
 * no máximo que a menor chave aguenta. É o que faz 10 duplas caírem em
 * 2 chaves de 5 com 3 baterias, semi de 6 com 4 e final de 4 sem nenhum caso
 * especial.
 */
export function kocProposePlan(
  teamCount: number,
  maxPerRound: number,
  durationFor: (phase: number) => number,
): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  const max = kocClampMaxPerRound(maxPerRound);
  // Campo inteiro numa quadra só: o torneio É a rodada. Inventar fase aqui
  // eliminaria 2 duplas para jogar a final com as 3 que sobraram.
  if (teamCount <= max) {
    return [{
      bracketSizes: [teamCount],
      roundsPerBracket: 1,
      qualifiersPerRound: 0,
      durationSec: durationFor(1),
    }];
  }
  return kocProposeTail(teamCount, max, durationFor, 1);
}

/**
 * O plano que as regras de HOJE produzem, para config sem `phases`.
 *
 * Não é o mesmo critério de `kocProposePlan`: aqui manda o que o organizador
 * escolheu (`teamsPerCourt`, `roundsPerBracket`, `qualifiersPerRound`), e o
 * resultado tem que ser bit a bit o de antes desta entrega. É o que mantém
 * chave de torneio existente igual.
 */
export function kocLegacyPlan(teamCount: number, config: KocConfig): KocPhaseSpec[] {
  const qualifiersPerRound = Math.max(1, Math.floor(config.qualifiersPerRound));
  const roundsPerBracket = Math.max(1, Math.floor(config.roundsPerBracket ?? 1));
  const phases: KocPhaseSpec[] = [];
  let fieldSize = teamCount;

  while (phases.length < KOC_MAX_PHASES) {
    const isFirst = phases.length === 0;
    const phaseNumber = phases.length + 1;
    const durationSec = durationForPhase(phaseNumber, config);
    const brackets = isFirst && roundsPerBracket > 1 ?
      kocBracketCountForRounds(fieldSize, config.teamsPerCourt, roundsPerBracket) :
      kocRoundCount(fieldSize, config.teamsPerCourt);
    const bracketSizes = kocRoundSizes(fieldSize, brackets);

    if (brackets === 1) {
      phases.push({bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec});
      return phases;
    }

    if (isFirst && roundsPerBracket > 1) {
      const smallest = Math.min(...bracketSizes);
      const max = kocMaxRoundsPerBracket(smallest);
      if (roundsPerBracket > max) {
        throw new KocBracketError(
          `Uma chave de ${smallest} duplas comporta no máximo ${max} rodada(s): ` +
            `cada vencedora sai e toda rodada precisa de ${KOC_MIN_TEAMS_PER_ROUND}. ` +
            `Foram pedidas ${roundsPerBracket}.`,
          "koc_rounds_per_bracket_too_high",
          {teamCount, smallestBracket: smallest, maxRoundsPerBracket: max},
        );
      }
    }

    const phaseRounds = isFirst ? roundsPerBracket : 1;
    const perRound = isFirst && roundsPerBracket > 1 ? 1 : qualifiersPerRound;
    const nextFieldSize = brackets * phaseRounds * perRound;
    if (nextFieldSize >= fieldSize) {
      throw new KocBracketError(
        `Com ${qualifiersPerRound} classificadas por rodada a fase não reduz o ` +
          `campo (${fieldSize} duplas em ${brackets} rodadas). Reduza o número de ` +
          "classificadas.",
        "koc_phase_does_not_reduce",
      );
    }
    phases.push({
      bracketSizes,
      roundsPerBracket: phaseRounds,
      qualifiersPerRound: perRound,
      durationSec,
    });
    fieldSize = nextFieldSize;
  }
  return phases;
}

/**
 * Valida um plano vindo de fora (tela ou Firestore) contra o campo real.
 *
 * Plano inválido descoberto na areia é chave torta com as duplas na quadra —
 * então tudo que não fecha vira `KocBracketError` nomeado aqui. `maxTeamsPerRound`
 * é o teto EFETIVO da categoria (já saneado por `kocClampMaxPerRound` em
 * `kocResolvePlan`) — validar contra o teto duro do formato deixaria passar um
 * plano com chave de 6 para uma categoria cujo teto é 3.
 */
function assertPlan(
  phases: readonly KocPhaseSpec[],
  teamCount: number,
  maxTeamsPerRound: number,
): KocPhaseSpec[] {
  if (phases.length === 0) {
    throw new KocBracketError("O plano de fases está vazio.", "koc_plan_empty");
  }
  if (phases.length > KOC_MAX_PHASES) {
    throw new KocBracketError(
      `O plano tem ${phases.length} fases; o formato aceita no máximo ${KOC_MAX_PHASES}.`,
      "koc_plan_exceeds_max_phases",
    );
  }
  const out: KocPhaseSpec[] = [];
  let field = teamCount;
  for (let i = 0; i < phases.length; i++) {
    const spec = phases[i]!;
    const sizes = spec.bracketSizes.map((n) => Math.floor(n));
    const sum = sizes.reduce((a, b) => a + b, 0);
    if (sum !== field) {
      throw new KocBracketError(
        `A fase ${i + 1} do plano soma ${sum} duplas, mas o campo dela tem ${field}.`,
        "koc_phase_size_mismatch",
      );
    }
    for (const size of sizes) {
      if (size > maxTeamsPerRound) {
        throw new KocBracketError(
          `A fase ${i + 1} tem chave de ${size} duplas; o teto desta categoria é ` +
            `${maxTeamsPerRound}.`,
          "koc_bracket_over_max",
        );
      }
      // O piso, do mesmo jeito que o teto. Antes só `emitPhase` barrava — e
      // barrava como `koc_battery_too_small`, a mensagem de uma chave que
      // ENCOLHEU demais ao longo das baterias. Uma chave que já nasce abaixo
      // de 3 é outro defeito: o plano está errado na origem, não na 3ª
      // bateria. Esta é a função que defende o gerador de plano que não veio
      // dos produtores de confiança; deixar o piso para depois era deixar um
      // buraco exatamente no lado que ela existe para cobrir.
      if (size < KOC_MIN_TEAMS_PER_ROUND) {
        throw new KocBracketError(
          `A fase ${i + 1} tem chave de ${size} duplas; toda bateria precisa de ` +
            `${KOC_MIN_TEAMS_PER_ROUND}.`,
          "koc_bracket_under_min",
        );
      }
    }
    if (i === 0) {
      // O sorteio ao vivo guarda o ALVO da caixa, não quantas caixas existem, e
      // reconstrói com `ceil(duplas / alvo)`. Contagem que não sobrevive a essa
      // ida e volta (25 duplas em 6 chaves voltam como 5) faria o sorteio
      // publicar um número de caixas e a geração exigir outro — descoberto
      // depois de as duplas já terem sido reveladas.
      //
      // Esta é a metade FRACA da regra, de propósito: só a CONTAGEM. A metade
      // forte — a FORMA exata das caixas — mora em `kocDrawReproducesPhaseOne`
      // (`draw-sessions.ts`) e é a que recusa `[6,6,4,3]` para 19 duplas, cuja
      // contagem bate mas cuja distribuição não. As duas não foram unificadas
      // porque a forte é DEFINIDA por `groupCapacities`, o divisor do próprio
      // motor do sorteio: reimplementá-la aqui recriaria o espelho que um
      // round de revisão anterior removeu de propósito (espelho prova a
      // matemática, não a implementação), e importar `draw-plan.ts` faria
      // este módulo — folha, sem import nenhum, usado pelo app, pelo portal e
      // pelo próprio sorteio — depender do módulo de sorteio. A relação é de
      // camada, não de duplicação: forte ⇒ fraca, e o teste
      // `koc-draw-bracket-agreement.test.ts` pina isso.
      const target = Math.max(...sizes);
      if (Math.ceil(field / target) !== sizes.length) {
        throw new KocBracketError(
          `A fase 1 pede ${sizes.length} chaves, mas com chaves de até ${target} ` +
            `duplas o sorteio monta ${Math.ceil(field / target)}.`,
          "koc_bracket_count_not_roundtrippable",
        );
      }
    }
    const isLast = i === phases.length - 1;
    const q = Math.floor(spec.qualifiersPerRound);
    const roundsPerBracket = Math.max(1, Math.floor(spec.roundsPerBracket));
    if (isLast) {
      // A ÚLTIMA fase do plano é a final por definição — a tabela dela é o
      // pódio, e o pódio é UM só. Uma fase final com `qualifiersPerRound` ou
      // `roundsPerBracket` fora de 0/1 emitiria baterias com vagas que nunca
      // seriam consumidas (não há fase seguinte para recebê-las); mais de UMA
      // chave emitiria dois pódios desconectados — dois campeões pra uma
      // categoria só. (Achado do fix round 1 da Task 7: `kocBracketCountOptions`
      // oferece 2 chaves pra um campo de 6 com teto 6, e nada aqui barrava.)
      if (q !== 0 || roundsPerBracket !== 1 || sizes.length !== 1) {
        throw new KocBracketError(
          `A fase ${i + 1} é a última do plano — toda final tem uma chave só, ` +
            `qualifiersPerRound 0 e roundsPerBracket 1 (esta tem ${sizes.length} ` +
            `chaves, ${q} e ${roundsPerBracket}).`,
          "koc_last_phase_not_final",
        );
      }
    } else if (q < 1) {
      throw new KocBracketError(
        `A fase ${i + 1} não classifica ninguém e não é a final.`,
        "koc_phase_does_not_reduce",
      );
    }
    out.push({
      bracketSizes: sizes,
      roundsPerBracket,
      qualifiersPerRound: Math.max(0, q),
      durationSec: Math.min(
        KOC_MAX_ROUND_DURATION_SEC,
        Math.max(KOC_MIN_ROUND_DURATION_SEC, Math.round(spec.durationSec)),
      ),
    });
    if (isLast) break;
    const next = sizes.length * roundsPerBracket * q;
    if (next >= field) {
      throw new KocBracketError(
        `A fase ${i + 1} não reduz o campo (${field} duplas viram ${next}).`,
        "koc_phase_does_not_reduce",
      );
    }
    field = next;
  }
  return out;
}

/** O plano que vale: o explícito quando existe, o derivado quando não. */
export function kocResolvePlan(teamCount: number, config: KocConfig): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) {
    throw new KocBracketError(
      `King of the Court precisa de pelo menos ${KOC_MIN_TEAMS_PER_ROUND} duplas ` +
        `na rodada — há ${teamCount}.`,
      "koc_field_too_small",
    );
  }
  return config.phases?.length ?
    assertPlan(config.phases, teamCount, kocClampMaxPerRound(config.maxTeamsPerRound)) :
    kocLegacyPlan(teamCount, config);
}

export function buildKingOfCourtRounds(
  seeds: string[],
  config: KocConfig,
  opts?: {
    phaseOneRosters?: readonly (readonly string[])[];
    /**
     * Plano JÁ resolvido por `kocResolvePlan`. Entra por aqui em vez de por
     * `config.phases` porque plano derivado internamente não deve passar de
     * novo por `assertPlan`: a checagem de round-trip existe para plano vindo
     * de FORA, e aplicá-la ao que o `kocLegacyPlan` acabou de produzir recusa
     * config legada que sempre funcionou (`teamsPerCourt: 3` com 19 duplas).
     */
    plan?: KocPhaseSpec[];
  },
): KocRoundDraft[] {
  const teamIds = seeds.map((id) => id.trim()).filter((id) => id.length > 0);
  const phases = opts?.plan ?? kocResolvePlan(teamIds.length, config);
  const totalPhases = phases.length;
  const drafts: KocRoundDraft[] = [];
  let matchNumber = 1;

  for (let i = 0; i < totalPhases; i++) {
    const spec = phases[i]!;
    const phase = i + 1;
    emitPhase({
      drafts,
      phase,
      spec,
      matchType: matchTypeForPhase(phase, totalPhases),
      rosters: i === 0 ?
        (opts?.phaseOneRosters ?
          assertPhaseOneRosters(opts.phaseOneRosters, teamIds, spec.bracketSizes) :
          kocSnakeDistribute(teamIds, spec.bracketSizes)) :
        null,
      previousPhase: i === 0 ? [] : drafts.filter((d) => d.phase === phase - 1),
      previousQualifiersPerRound: i === 0 ?
        0 :
        Math.max(1, phases[i - 1]!.qualifiersPerRound),
      nextMatchNumber: () => matchNumber++,
    });
  }

  // Rede de segurança: uma rodada com vaga a mais ou a menos só apareceria na
  // areia, com o elenco já chamado para a quadra.
  for (const draft of drafts) {
    if (draft.teamIds.length + draft.qualifiers.length !== draft.size) {
      throw new KocBracketError(
        `A rodada #${draft.matchNumber} (fase ${draft.phase}, ${draft.poolId}) pede ` +
          `${draft.size} duplas e recebeu ${draft.teamIds.length + draft.qualifiers.length}.`,
        "koc_round_roster_mismatch",
      );
    }
  }

  return drafts;
}
