import { CLEARANCE_LEAD_DAYS, RETENTION_DISCOUNTS, RETENTION_OFFERS, type CenterPolicies, type RetentionOffer } from '../../domain/models';

type ChoiceKey = {
  [K in keyof CenterPolicies]: CenterPolicies[K] extends number | unknown[] ? never : K;
}[keyof CenterPolicies];
type NumberKey = {
  [K in keyof CenterPolicies]: CenterPolicies[K] extends number ? K : never;
}[keyof CenterPolicies];

export interface ChoiceRow {
  kind: 'choice';
  key: ChoiceKey;
  title: (p: CenterPolicies) => string;
  hint: (p: CenterPolicies) => string;
  options: { value: string; label: string }[];
}

export interface NumberRow {
  kind: 'number';
  key: NumberKey;
  title: (p: CenterPolicies) => string;
  hint: (p: CenterPolicies) => string;
  unit: string;
  min: number;
  max: number;
  /** Só faz sentido com esta política ligada. */
  dependsOn?: ChoiceKey;
}

/** Número escolhido entre poucas opções (ex.: 7 ou 15 dias). */
export interface NumberChoiceRow {
  kind: 'number-choice';
  key: NumberKey;
  title: (p: CenterPolicies) => string;
  hint: (p: CenterPolicies) => string;
  values: number[];
  unit: string;
  dependsOn?: ChoiceKey;
  /** Linha só aparece quando a condição vale (ex.: percentual só com a oferta de desconto ligada). */
  visibleWhen?: (p: CenterPolicies) => boolean;
}

/** Várias opções ligadas ao mesmo tempo (ofertas de retenção). */
export interface MultiRow {
  kind: 'multi';
  key: 'cancelRetention';
  title: (p: CenterPolicies) => string;
  hint: (p: CenterPolicies) => string;
  options: { value: RetentionOffer; label: string }[];
}

export type PolicyRow = ChoiceRow | NumberRow | NumberChoiceRow | MultiRow;

const on = (yes: string, no: string) => [
  { value: 'true', label: yes },
  { value: 'false', label: no },
];

/** Linhas da aba "Políticas comerciais" (protótipo W4), na ordem de exibição. Trancar, cancelar e lista de espera ficam em `EXIT_SECTIONS`. */
export const POLICY_ROWS: PolicyRow[] = [
  {
    kind: 'choice',
    key: 'activation',
    title: () => 'Ativação da matrícula',
    hint: () => 'Quando a matrícula passa de pendente para ativa',
    options: [
      { value: 'after_payment', label: 'Após pagamento' },
      { value: 'on_confirmation', label: 'Na confirmação' },
    ],
  },
  {
    kind: 'number',
    key: 'pendingHoldHours',
    title: () => 'Reserva da vaga pendente',
    hint: (p) => `A vaga fica guardada por ${p.pendingHoldHours}h enquanto a matrícula está pendente`,
    unit: 'horas',
    min: 1,
    max: 336,
  },
  {
    kind: 'choice',
    key: 'unexcusedAbsenceConsumes',
    title: () => 'Falta não justificada',
    hint: () => 'Mensal: conta como aula usada · Pacote: consome 1 crédito',
    options: on('Consome', 'Não consome'),
  },
  {
    kind: 'choice',
    key: 'excusedAbsenceMakeup',
    title: (p) => `Falta justificada (até ${p.excusedNoticeHours}h antes)`,
    hint: (p) => (p.excusedAbsenceMakeup ? `Gera crédito de reposição com validade de ${p.makeupValidityDays} dias` : 'Não gera crédito de reposição'),
    options: on('Gera reposição', 'Não gera'),
  },
  {
    kind: 'number',
    key: 'excusedNoticeHours',
    title: () => 'Antecedência da falta justificada',
    hint: () => 'Avisos dentro desse prazo contam como falta justificada',
    unit: 'horas',
    min: 0,
    max: 72,
    dependsOn: 'excusedAbsenceMakeup',
  },
  {
    kind: 'number',
    key: 'makeupValidityDays',
    title: () => 'Validade da reposição',
    hint: () => 'Prazo para usar o crédito de reposição',
    unit: 'dias',
    min: 1,
    max: 365,
  },
  {
    kind: 'choice',
    key: 'cancelledClassMakeup',
    title: () => 'Aula cancelada pelo centro ou professor',
    hint: (p) => (p.cancelledClassMakeup === 'auto' ? 'Nunca consome crédito; gera reposição automática para todos os matriculados' : 'Nunca consome crédito; a reposição é lançada manualmente'),
    options: [
      { value: 'auto', label: 'Reposição auto' },
      { value: 'manual', label: 'Manual' },
    ],
  },
  {
    kind: 'choice',
    key: 'makeupScope',
    title: () => 'Onde repor',
    hint: (p) => (p.makeupScope === 'same_level' ? 'Turmas da mesma modalidade e nível, com vaga livre' : 'Qualquer turma com vaga livre'),
    options: [
      { value: 'same_level', label: 'Mesmo nível' },
      { value: 'any_class', label: 'Qualquer turma' },
    ],
  },
  {
    kind: 'number',
    key: 'travelBufferMinutes',
    title: () => 'Intervalo mínimo entre aulas do professor em locais diferentes',
    hint: () => 'Usado para avisar conflito de deslocamento',
    unit: 'min',
    min: 0,
    max: 240,
  },
];

export interface PolicySection {
  title: string;
  kicker: string;
  rows: PolicyRow[];
  /** Regra fixa do sistema, mostrada como nota. */
  note?: string;
}

/** Aba "Trancar e cancelar" (protótipo T4). A pausa por lesão sempre reserva a vaga; o trancamento segue `pauseSeat`. */
export const EXIT_SECTIONS: PolicySection[] = [
  {
    title: 'Trancamento',
    kicker: 'Pausa sem justificativa',
    note: 'A cobrança dos ciclos que vencem na pausa é suspensa.',
    rows: [
      {
        kind: 'choice',
        key: 'allowPause',
        title: () => 'Trancar pelo app',
        hint: (p) => (p.allowPause ? 'Dentro do limite, o trancamento é aprovado na hora' : 'O aluno não pode trancar a matrícula'),
        options: on('Permitir', 'Não permitir'),
      },
      {
        kind: 'number',
        key: 'pauseMaxDaysPerYear',
        title: () => 'Limite por ano',
        hint: () => 'Somado entre todos os trancamentos do ano',
        unit: 'dias/ano',
        min: 1,
        max: 365,
        dependsOn: 'allowPause',
      },
      {
        kind: 'number-choice',
        key: 'pauseMinDays',
        title: () => 'Mínimo por pausa',
        hint: () => 'Evita pausas de poucos dias',
        values: [7, 15],
        unit: 'dias',
        dependsOn: 'allowPause',
      },
      {
        kind: 'choice',
        key: 'pauseSeat',
        title: () => 'Vaga durante o trancamento',
        hint: (p) =>
          p.pauseSeat === 'release'
            ? 'Liberar: a vaga vai para a lista de espera; na volta o aluno retoma se houver vaga, senão segue pausado sem cobrança e volta na primeira vaga, antes da fila'
            : 'Reservar: a vaga fica guardada até a volta e não vai para a lista de espera',
        options: [
          { value: 'reserve', label: 'Reservar' },
          { value: 'release', label: 'Liberar' },
        ],
      },
    ],
  },
  {
    title: 'Pausa por lesão',
    kicker: 'Com atestado médico',
    rows: [
      {
        kind: 'choice',
        key: 'injuryPauseApproval',
        title: () => 'Aprovação',
        hint: (p) =>
          p.injuryPauseApproval === 'manual'
            ? 'Owner ou admin revisa o atestado antes de pausar'
            : `Aprovada na hora até ${p.injuryMaxDays} dias; acima disso a gestão revisa`,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'auto', label: 'Automática' },
        ],
      },
      {
        kind: 'choice',
        key: 'injuryCountsInLimit',
        title: () => 'Conta no limite de trancamento',
        hint: (p) => (p.injuryCountsInLimit ? `Os dias de lesão somam nos ${p.pauseMaxDaysPerYear} dias do ano` : 'Os dias de lesão não consomem o limite do ano'),
        options: [
          { value: 'false', label: 'Não' },
          { value: 'true', label: 'Sim' },
        ],
      },
      {
        kind: 'number-choice',
        key: 'injuryMaxDays',
        title: () => 'Limite',
        hint: () => 'Acima disso o centro decide caso a caso',
        values: [90, 180],
        unit: 'dias',
      },
      {
        kind: 'choice',
        key: 'requireMedicalClearance',
        title: () => 'Alta médica para voltar',
        hint: (p) =>
          p.requireMedicalClearance
            ? `Pedida ${CLEARANCE_LEAD_DAYS} dias antes do fim; sem alta aprovada a pausa segue`
            : 'A matrícula volta sozinha no fim da pausa',
        options: [
          { value: 'true', label: 'Exigir' },
          { value: 'false', label: 'Não' },
        ],
      },
    ],
  },
  {
    title: 'Cancelamento',
    kicker: 'Pedido pelo app ou na recepção',
    rows: [
      {
        kind: 'choice',
        key: 'monthlyCancellation',
        title: () => 'Aviso prévio',
        hint: (p) =>
          p.monthlyCancellation === 'end_of_cycle'
            ? 'Plano mensal segue até a véspera do próximo vencimento, que não é cobrado; sem multa'
            : 'A matrícula encerra no dia do pedido e a vaga é liberada',
        options: [
          { value: 'end_of_cycle', label: 'Fim do ciclo' },
          { value: 'immediate', label: 'Imediato' },
        ],
      },
      {
        kind: 'multi',
        key: 'cancelRetention',
        title: () => 'Retenção',
        hint: (p) => (p.cancelRetention.length ? 'Ofertas mostradas no app antes de confirmar' : 'Nenhuma oferta: o app confirma direto'),
        options: [
          { value: 'pause', label: 'Trancar' },
          { value: 'plan_change', label: 'Trocar plano' },
          { value: 'discount', label: 'Desconto de 1 mês' },
        ],
      },
      {
        kind: 'number-choice',
        key: 'retentionDiscountPercent',
        title: () => 'Desconto de 1 mês',
        hint: (p) => `${p.retentionDiscountPercent}% na próxima mensalidade · no máximo um por matrícula a cada 12 meses`,
        values: RETENTION_DISCOUNTS,
        unit: '%',
        visibleWhen: (p) => p.cancelRetention.includes('discount'),
      },
      {
        kind: 'choice',
        key: 'allowCancelWithdraw',
        title: () => 'Desistir do cancelamento',
        hint: (p) => (p.allowCancelWithdraw ? 'O aluno desfaz pelo app até o último dia' : 'Só a recepção desfaz'),
        options: [
          { value: 'true', label: 'Até o último dia' },
          { value: 'false', label: 'Não' },
        ],
      },
    ],
  },
  {
    title: 'Lista de espera',
    kicker: 'Vaga liberada por cancelamento',
    rows: [
      {
        kind: 'choice',
        key: 'waitlistEnabled',
        title: () => 'Lista de espera',
        hint: (p) => (p.waitlistEnabled ? `Ao liberar vaga, o 1º da fila recebe a oferta automaticamente e tem ${p.waitlistAcceptHours}h para pagar` : 'Turma lotada não aceita fila'),
        options: on('Ativa', 'Desligada'),
      },
      {
        kind: 'number',
        key: 'waitlistAcceptHours',
        title: () => 'Prazo para aceitar a vaga',
        hint: () => 'Depois disso a vaga passa para o próximo da fila',
        unit: 'horas',
        min: 1,
        max: 168,
        dependsOn: 'waitlistEnabled',
      },
    ],
  },
];

/** Todas as linhas editáveis (as duas abas). */
export const ALL_POLICY_ROWS: PolicyRow[] = [...POLICY_ROWS, ...EXIT_SECTIONS.flatMap((s) => s.rows)];

/** Valor da política como string do segmentado. */
export function choiceValue(p: CenterPolicies, key: ChoiceKey): string {
  return String(p[key]);
}

/** Aplica a escolha do segmentado preservando o tipo (boolean ou união de strings). */
export function applyChoice(p: CenterPolicies, key: ChoiceKey, value: string): CenterPolicies {
  const next = typeof p[key] === 'boolean' ? value === 'true' : value;
  return { ...p, [key]: next } as CenterPolicies;
}

export function applyNumber(p: CenterPolicies, key: NumberKey, raw: string): CenterPolicies {
  const n = raw.trim() === '' ? Number.NaN : Number(raw);
  return { ...p, [key]: n };
}

/** Liga ou desliga uma oferta de retenção (mantém a ordem canônica). */
export function toggleRetention(p: CenterPolicies, offer: RetentionOffer): CenterPolicies {
  const on = p.cancelRetention.includes(offer);
  return { ...p, cancelRetention: RETENTION_OFFERS.filter((o) => (o === offer ? !on : p.cancelRetention.includes(o))) };
}

/** A linha aparece com o rascunho atual? (só `number-choice` tem condição hoje). */
export function rowVisible(row: PolicyRow, p: CenterPolicies): boolean {
  return row.kind !== 'number-choice' || !row.visibleWhen || row.visibleWhen(p);
}

/** Opções do número escolhido; um valor antigo fora da lista continua aparecendo. */
export function numberChoiceOptions(p: CenterPolicies, row: NumberChoiceRow): { value: string; label: string }[] {
  const cur = p[row.key];
  const values = Number.isFinite(cur) && !row.values.includes(cur) ? [...row.values, cur].sort((a, b) => a - b) : row.values;
  return values.map((v) => ({ value: String(v), label: row.unit === '%' ? `${v}%` : `${v} ${row.unit}` }));
}

export function samePolicyValue(a: unknown, b: unknown): boolean {
  return Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
}

export function changedPolicies(before: CenterPolicies, next: CenterPolicies): (keyof CenterPolicies)[] {
  return (Object.keys(next) as (keyof CenterPolicies)[]).filter((k) => !samePolicyValue(before[k], next[k]));
}

/** Primeiro erro de validação (números inteiros dentro da faixa), ou null. */
export function policiesError(p: CenterPolicies): string | null {
  for (const row of ALL_POLICY_ROWS) {
    if (row.kind !== 'number') {
      continue;
    }
    const v = p[row.key];
    if (!Number.isInteger(v) || v < row.min || v > row.max) {
      return `${row.title(p)}: informe um número inteiro entre ${row.min} e ${row.max}.`;
    }
  }
  return null;
}
