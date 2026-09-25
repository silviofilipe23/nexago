/** Plano de fases do King of the Court, no portal.
 *
 *  Espelho de `functions/src/koc-bracket-builders.ts`. A FONTE DA VERDADE é o
 *  servidor: nada aqui grava chave — a tela propõe, o organizador ajusta, e o
 *  plano viaja no `bracketConfig`. Divergir do servidor faz a tabela prometer
 *  um formato e a geração entregar outro.
 *
 *  MÓDULO FOLHA, de propósito: nada daqui importa nada do projeto — a tela e o
 *  repositório da categoria importam DAQUI. `koc.ts` e `tournament-create.model.ts`
 *  já duplicam o piso e o teto pelo mesmo motivo; importar de volta fecharia
 *  um ciclo. */

/** Teto duro do formato. Acima de 6 a fila deixa todo mundo esperando. */
export const KOC_MAX_TEAMS_PER_ROUND_HARD = 6;
/** Teto de quem não escolheu — o de antes desta entrega. */
export const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5;
/** Menos de 3 não gira a fila. Mesma constante de `koc.ts`, sem o import. */
export const KOC_MIN_TEAMS_PER_ROUND = 3;

/** Teto de fases — trava de segurança contra plano que não fecha. */
const KOC_MAX_PHASES = 6;
const KOC_CHANGEOVER_SEC = 300;
/** Descanso de quem classifica na última bateria e entra na fase seguinte. */
const KOC_PHASE_BREAK_SEC = 900;

export interface KocPhaseSpec {
  bracketSizes: number[];
  roundsPerBracket: number;
  /** 0 só na final: ali ninguém classifica, a tabela é o pódio. */
  qualifiersPerRound: number;
  durationSec: number;
}

/** Espelha `kocClampMaxPerRound` do servidor. */
export function kocClampMaxPerRound(value: number | null | undefined): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return KOC_LEGACY_MAX_TEAMS_PER_ROUND;
  return Math.min(KOC_MAX_TEAMS_PER_ROUND_HARD, Math.max(KOC_MIN_TEAMS_PER_ROUND, n));
}

/** Espelha `kocMaxRoundsPerBracket` do servidor. */
export function kocMaxRoundsPerBracketFor(bracketSize: number, qualifiersPerRound = 1): number {
  const q = Math.max(1, Math.floor(qualifiersPerRound));
  return Math.max(1, Math.floor((bracketSize - KOC_MIN_TEAMS_PER_ROUND) / q) + 1);
}

/** Espelha `kocRoundCount` do servidor: corrige as duas pontas. `0` = não fecha. */
export function kocBracketCount(field: number, maxPerRound: number): number {
  if (field < KOC_MIN_TEAMS_PER_ROUND) return 0;
  const per = kocClampMaxPerRound(maxPerRound);
  let count = Math.max(1, Math.ceil(field / per));
  while (count > 1 && Math.floor(field / count) < KOC_MIN_TEAMS_PER_ROUND) count--;
  while (Math.ceil(field / count) > per) count++;
  return count;
}

/** Espelha `kocRoundSizes` do servidor: o resto vai nas primeiras chaves. */
export function kocBracketSizes(field: number, brackets: number): number[] {
  const base = Math.floor(field / brackets);
  const extra = field % brackets;
  return Array.from({length: brackets}, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Espelha `kocProposeTail` do servidor — orçamento-consciente, não guloso.
 *
 * O algoritmo olha para frente pelo `left` (vagas que sobram no orçamento de
 * `KOC_MAX_PHASES`, contando a fase atual): com 1 sobrando esta fase TEM que
 * ser a final, e com 2 a PRÓXIMA tem, então esta já precisa entregar um campo
 * que caiba numa quadra só. Sem essa régua o algoritmo guloso (máximo de jogo
 * em cada fase, sem olhar o orçamento) pode não fechar dentro do teto de
 * fases — é o que os fixtures de paridade com n=14/20/25 exercitam.
 *
 * Onde o servidor lança `KocBracketError` (campo que não cabe em nenhuma
 * chave, ou orçamento de fases estourado), aqui devolve `[]`: quem chama não
 * tem exceção para pegar, só uma tela para dizer "não dá para montar".
 */
function proposeTail(field: number, maxPerRound: number, durationSec: number, startPhase: number): KocPhaseSpec[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const phases: KocPhaseSpec[] = [];
  let remaining = field;
  for (;;) {
    const phaseNumber = startPhase + phases.length;
    const left = KOC_MAX_PHASES - phaseNumber + 1;
    const brackets = kocBracketCount(remaining, max);
    const bracketSizes = kocBracketSizes(remaining, brackets);
    const smallest = Math.min(...bracketSizes);
    const largest = Math.max(...bracketSizes);

    // Campo sem nenhuma divisão entre piso e teto: não existe plano.
    if (smallest < KOC_MIN_TEAMS_PER_ROUND || largest > max) return [];

    let rounds = kocMaxRoundsPerBracketFor(smallest, 1);
    let qualifiers = 1;
    if (rounds === 1) {
      // Chave que não aguenta uma segunda bateria volta ao clássico: passa
      // quem está no topo da tabela, o máximo que não fura o piso da fase
      // seguinte.
      qualifiers = Math.max(1, Math.min(smallest - 1, Math.floor((remaining - 1) / brackets)));
    }
    let next = brackets * rounds * qualifiers;

    // Campo já cabe numa quadra só: esta fase é a final quando ninguém
    // sobraria para uma próxima OU quando o orçamento de fases acaba aqui.
    if (brackets === 1 && (next < KOC_MIN_TEAMS_PER_ROUND || left === 1)) {
      phases.push({bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec});
      return phases;
    }
    if (left === 1) return []; // orçamento acaba e o campo não coube numa quadra só.

    if (left === 2) {
      // Sobra só uma vaga depois desta: a PRÓXIMA fase tem que ser a final.
      // Encolhe esta fase até o campo que ela entrega já caber no teto.
      if (qualifiers === 1) {
        rounds = Math.min(rounds, Math.floor(max / brackets));
      } else {
        qualifiers = Math.min(qualifiers, Math.floor(max / brackets));
      }
      if (rounds < 1 || qualifiers < 1) return [];
      next = brackets * rounds * qualifiers;
      if (next < KOC_MIN_TEAMS_PER_ROUND) return [];
    }

    phases.push({bracketSizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec});
    remaining = next;
  }
}

/** Espelha `kocProposePlan` do servidor: máximo de jogo. */
export function kocProposePhasePlan(teamCount: number, maxPerRound: number, durationSec: number): KocPhaseSpec[] {
  if (teamCount < KOC_MIN_TEAMS_PER_ROUND) return [];
  const max = kocClampMaxPerRound(maxPerRound);
  if (teamCount <= max) {
    return [{bracketSizes: [teamCount], roundsPerBracket: 1, qualifiersPerRound: 0, durationSec}];
  }
  return proposeTail(teamCount, max, durationSec, 1);
}

/**
 * "Classificatória" / "Semifinal" / "Final" pela POSIÇÃO da fase.
 *
 * A última é sempre a Final — a tabela dela é o pódio. A penúltima só é
 * Semifinal quando há 3 fases ou mais: num campo pequeno, de duas fases, a
 * primeira é a classificatória, não uma semi.
 *
 * Mora aqui, no módulo folha, porque tem DOIS leitores que precisam dizer a
 * mesma coisa: a tabela da tela de gerar chave (`seeds.component.ts`) e o
 * aviso de divergência do chaveamento (`koc-drift.ts`, módulo puro que não
 * pode puxar Angular/Firebase). Eram duas cópias que concordavam por acaso, e
 * um "Semifinal" renomeado numa delas passaria calado na outra.
 *
 * Espelha `matchTypeForPhase` do servidor (`koc-bracket-builders.ts`), que faz
 * a mesma escolha com os nomes de `matchType`.
 */
export function kocPhaseLabelAt(index: number, total: number): string {
  if (index === total - 1) return 'Final';
  if (total >= 3 && index === total - 2) return 'Semifinal';
  return 'Classificatória';
}

/** Quantas duplas entram em cada fase. A coluna "Passam" é esta lista deslocada. */
export function kocPhaseFieldSizes(plan: KocPhaseSpec[]): number[] {
  return plan.map((p) => p.bracketSizes.reduce((a, b) => a + b, 0));
}

/**
 * Contagens de chave que o SORTEIO reproduz.
 *
 * O sorteio guarda o alvo da caixa, não quantas caixas existem, e reconstrói
 * com `ceil(duplas / alvo)`. Nem toda contagem sobrevive: 25 duplas em 6 chaves
 * voltam como 5. Oferecer uma que não volta faria a geração recusar o sorteio
 * depois de as duplas já terem sido reveladas.
 */
export function kocBracketCountOptions(field: number, maxPerRound: number): number[] {
  const max = kocClampMaxPerRound(maxPerRound);
  const out: number[] = [];
  for (let n = 1; n <= Math.floor(field / KOC_MIN_TEAMS_PER_ROUND); n++) {
    const target = Math.ceil(field / n);
    if (target > max) continue;
    if (Math.floor(field / n) < KOC_MIN_TEAMS_PER_ROUND) continue;
    if (Math.ceil(field / target) !== n) continue;
    out.push(n);
  }
  return out;
}

export interface KocPhasePatch {
  bracketCount?: number;
  roundsPerBracket?: number;
  qualifiersPerRound?: number;
  durationSec?: number;
}

/**
 * Aplica a edição de UMA fase e repropõe as de baixo.
 *
 * O campo cascateia: mexer nas baterias da semi muda quantas duplas chegam à
 * final, e às vezes some com a final inteira. Manter as fases seguintes como
 * estavam deixaria o plano com soma errada, que a geração recusaria.
 *
 * Se a cascata não fechar (o rabo reproposto não tem plano válido dentro do
 * orçamento de fases), devolve `[]` — mesma convenção de `kocProposePhasePlan`
 * para "não dá para montar": mais previsível para quem chama do que devolver
 * um plano truncado, com a fase editada prometendo baterias que não têm para
 * onde ir.
 */
export function kocApplyPhaseEdit(
  plan: KocPhaseSpec[],
  phaseIndex: number,
  patch: KocPhasePatch,
  maxPerRound: number,
): KocPhaseSpec[] {
  const current = plan[phaseIndex];
  if (!current) return plan;
  const field = current.bracketSizes.reduce((a, b) => a + b, 0);
  const max = kocClampMaxPerRound(maxPerRound);

  // Cru do chamador pode ser fracionário, <= 0, não-finito (`Infinity`,
  // `NaN`) ou grande demais para o campo — e as quatro formas de sujeira
  // precisam ser barradas ANTES de `kocBracketSizes`: validar só DEPOIS de
  // montar o array é tarde demais, porque o próprio `Array.from({length:
  // bracketCount})` já aloca `bracketCount` posições — um `1e9` trava o
  // processo antes de qualquer checagem rodar, mesmo sendo um inteiro
  // positivo legítimo que só falharia mais adiante. `floor(field / piso)` é
  // o maior número de chaves que o campo comporta sem furar o piso em
  // alguma (pombos-e-casas: mais chaves que isso e a média já fica abaixo
  // de 3) — um limite que não depende de construir nada para calcular.
  //
  // `Number.isInteger` sozinho fecha `Infinity`/`-Infinity`/`NaN` (é `false`
  // para todo valor não-finito), sem precisar de um `Number.isFinite` à
  // parte. Fracionário é arredondado para baixo ANTES da checagem — `2.5`
  // vira `2` e passa — mesmo tratamento que todo outro número externo do
  // módulo (`kocClampMaxPerRound`, `parseKocPhases`).
  const bracketCount = Math.floor(patch.bracketCount ?? current.bracketSizes.length);
  const maxBrackets = Math.floor(field / KOC_MIN_TEAMS_PER_ROUND);
  if (!Number.isInteger(bracketCount) || bracketCount < 1 || bracketCount > maxBrackets) return [];
  const bracketSizes = kocBracketSizes(field, bracketCount);
  const smallest = Math.min(...bracketSizes);
  const largest = Math.max(...bracketSizes);
  // `maxBrackets` acima só garante o PISO (chave demais fura o piso em
  // alguma); esta checagem cobre o TETO (chave de menos estoura o teto em
  // alguma) — mesma que `proposeTail` já faz para o rabo, agora também na
  // própria fase editada. A geração recusaria rio abaixo
  // (`koc_bracket_over_max`), mas uma função pura exportada para as
  // Tasks 6/8/10 não deveria depender de quem chama recusar depois: `[]`
  // aqui é a mesma convenção de "sem plano válido" que o resto do módulo
  // já usa.
  if (largest > max) return [];
  const durationSec = patch.durationSec ?? current.durationSec;

  let qualifiersPerRound = Math.max(1, patch.qualifiersPerRound ?? Math.max(1, current.qualifiersPerRound));
  qualifiersPerRound = Math.min(qualifiersPerRound, Math.max(1, smallest - 1));
  let roundsPerBracket = Math.max(1, patch.roundsPerBracket ?? current.roundsPerBracket);
  roundsPerBracket = Math.min(roundsPerBracket, kocMaxRoundsPerBracketFor(smallest, qualifiersPerRound));

  const next = bracketCount * roundsPerBracket * qualifiersPerRound;
  const head = plan.slice(0, phaseIndex);

  // Fase que mandaria menos de 3 duplas adiante É a final: ninguém classifica,
  // e a final é UMA bateria — a tabela dela é o pódio. Manter as baterias
  // pedidas aqui eliminaria duplas depois de o pódio já estar definido.
  if (next < KOC_MIN_TEAMS_PER_ROUND || next >= field) {
    return [...head, {bracketSizes, roundsPerBracket: 1, qualifiersPerRound: 0, durationSec}];
  }
  const tail = proposeTail(next, max, durationSec, phaseIndex + 2);
  if (tail.length === 0) return [];
  return [...head, {bracketSizes, roundsPerBracket, qualifiersPerRound, durationSec}, ...tail];
}

/**
 * Campo que cabe numa chave só pode abrir uma final embaixo dele?
 *
 * 3, 4 e 5 duplas continuam rodada única: é a regra do formato — o torneio É a
 * rodada final, e a tabela dela é o pódio — e partir um campo de 5 eliminaria
 * UMA dupla para a final ser jogada pelas outras quatro, o que não é fase, é
 * formalidade. O campo de 6 é o caso novo: ele só existe porque o teto subiu de
 * 5 para 6, e nele a rodada única deixa o torneio sem decisão nenhuma — seis
 * duplas, uma fila e um cronômetro.
 *
 * A ÚLTIMA fase do plano sempre tem campo menor ou igual ao teto da categoria,
 * que por sua vez não passa de 6 — então na prática esta régua só liga no 6.
 */
export function kocCanSplitFinal(field: number): boolean {
  return field > KOC_LEGACY_MAX_TEAMS_PER_ROUND;
}

/**
 * Onde cai o primeiro clique de "Classificam" numa final ainda não partida.
 *
 * Não é o piso do formato: num campo de 6, classificar 3 corta metade do campo
 * de uma vez. `field - 2` é o corte mais suave que ainda decide alguma coisa, e
 * num campo de 6 dá a final de 4 — a que o organizador quer. O `max` com o piso
 * existe porque `kocApplyPhaseEdit` colapsa de volta para rodada única com menos
 * de 3 classificadas: devolver 2 faria o clique não fazer nada.
 */
export function kocSplitFinalQualifiers(field: number): number {
  return Math.max(KOC_MIN_TEAMS_PER_ROUND, field - 2);
}

export interface KocPlanTotals {
  rounds: number;
  seconds: number;
  /** "3h40" / "45min" — o número que responde se cabe na reserva da quadra. */
  label: string;
}

export function kocPlanTotals(plan: KocPhaseSpec[], courts: number): KocPlanTotals {
  const parallel = Math.max(1, Math.floor(courts));
  let rounds = 0;
  let seconds = 0;
  for (let i = 0; i < plan.length; i++) {
    const phase = plan[i];
    // As baterias de uma chave são SEQUENCIAIS na mesma quadra: o paralelismo
    // vem das chaves, não das baterias.
    const waves = Math.ceil(phase.bracketSizes.length / parallel) * phase.roundsPerBracket;
    rounds += phase.bracketSizes.length * phase.roundsPerBracket;
    seconds += waves * phase.durationSec + Math.max(0, waves - 1) * KOC_CHANGEOVER_SEC;
    if (i < plan.length - 1) seconds += KOC_PHASE_BREAK_SEC;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const label = hours === 0
    ? `${minutes}min`
    : minutes === 0
      ? `${hours}h`
      : `${hours}h${String(minutes).padStart(2, '0')}`;
  return {rounds, seconds, label};
}

/**
 * Plano vindo do Firestore, saneado. Espelha `parseKocPhases` do servidor.
 *
 * Sujeira derruba o plano INTEIRO: sem plano o servidor cai nas regras antigas,
 * que funcionam; com plano meio lido, a tela prometeria um formato que a chave
 * não tem.
 */
export function parseKocPhases(raw: unknown): KocPhaseSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: KocPhaseSpec[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    const sizesRaw = row['bracketSizes'];
    if (!Array.isArray(sizesRaw) || sizesRaw.length === 0) return null;
    const sizes = (sizesRaw as unknown[]).map((n) => Math.floor(Number(n)));
    if (sizes.some((n) => !Number.isFinite(n) || n < 1)) return null;
    const rounds = Math.floor(Number(row['roundsPerBracket']));
    const qualifiers = Math.floor(Number(row['qualifiersPerRound']));
    const duration = Math.round(Number(row['durationSec']));
    if (!Number.isFinite(rounds) || rounds < 1) return null;
    if (!Number.isFinite(qualifiers) || qualifiers < 0) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    out.push({bracketSizes: sizes, roundsPerBracket: rounds, qualifiersPerRound: qualifiers, durationSec: duration});
  }
  return out;
}

/** Dois planos são o mesmo quando cada fase bate em tudo que muda a CHAVE.
 *  A duração fica de fora: mudá-la não refaz a chave, só o relógio. */
export function kocPlansMatch(a: KocPhaseSpec[], b: KocPhaseSpec[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((phase, i) =>
    phase.roundsPerBracket === b[i].roundsPerBracket &&
    phase.qualifiersPerRound === b[i].qualifiersPerRound &&
    phase.bracketSizes.length === b[i].bracketSizes.length &&
    phase.bracketSizes.every((size, j) => size === b[i].bracketSizes[j]));
}
