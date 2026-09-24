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

  // Cru do chamador pode ser fracionário ou <= 0 — sem sanear, o `length` do
  // `Array.from` em `kocBracketSizes` divergiria da aritmética de base/resto
  // e devolveria chaves que nem somam o campo certo. Mesmo tratamento que
  // todo outro número que entra de fora neste módulo (`kocClampMaxPerRound`,
  // `parseKocPhases`).
  const bracketCount = Math.max(1, Math.floor(patch.bracketCount ?? current.bracketSizes.length));
  const bracketSizes = kocBracketSizes(field, bracketCount);
  const smallest = Math.min(...bracketSizes);
  const largest = Math.max(...bracketSizes);
  // Mesma checagem que `proposeTail` já faz para o rabo: um `bracketCount`
  // fora da faixa certa fura o piso (alto demais) ou o teto (baixo demais)
  // NA PRÓPRIA fase editada — não só no que vem depois dela. A geração
  // recusaria rio abaixo (`koc_battery_too_small`/`koc_bracket_over_max`),
  // mas uma função pura exportada para as Tasks 6/8/10 não deveria depender
  // de quem chama recusar depois: `[]` aqui é a mesma convenção de "sem
  // plano válido" que o resto do módulo já usa.
  if (smallest < KOC_MIN_TEAMS_PER_ROUND || largest > max) return [];
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
