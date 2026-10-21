import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { brl } from './billing.model';
import { payoutModelFromRaw, type PayoutModelKind, type TeacherPayoutModel } from './class.model';

export { payoutModelFromRaw, type PayoutModelKind, type TeacherPayoutModel };

/** Espelha `functions/src/arena-class-payout.ts` / `-payout-model.ts` — repasse do professor
 *  (fase 2b). A conta do mês é do servidor (`previewArenaClassPayouts`); aqui só leitura,
 *  rótulos e a situação de cada professor no mês. Pagamento manual, fora da plataforma. */

/** Formas que o gestor registra à mão (pagou por fora). */
export type PayoutMethod = 'pix' | 'transfer' | 'cash';
/** Como o repasse foi pago: à mão ou `nexago` (saiu do caixa da arena para a carteira do
 *  professor via `payArenaClassPayoutViaNexago` — não dá para desfazer). */
export type PaidPayoutMethod = PayoutMethod | 'nexago';

export interface PayoutLine {
  key: string;
  label: string;
  detail: string;
  classes: number;
  presences: number;
  payingStudents: number;
  /** Mensalidades rateadas para a linha, valor cheio. */
  grossRevenueReais: number;
  /** Taxa da NexaGO dessas mensalidades (cobrança online). */
  platformFeeReais: number;
  /** Receita sem a taxa da NexaGO — a base do % da receita. */
  revenueReais: number;
  amountReais: number;
}

/** Conta do mês de um professor — igual na prévia e no retrato do fechamento. */
export interface TeacherPayoutFigures {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  model: TeacherPayoutModel | null;
  classesGiven: number;
  presences: number;
  students: number;
  pendingSessions: number;
  grossRevenueReais: number;
  platformFeeReais: number;
  /** Sem a taxa da NexaGO (ver `PayoutLine.revenueReais`). */
  revenueReais: number;
  amountReais: number;
  lines: PayoutLine[];
}

export interface TeacherPayoutPreview extends TeacherPayoutFigures {
  teacherStatus: string;
  canceledSessions: number;
}

export interface ArenaPayoutPreview {
  month: string;
  /** Receita de aulas do mês, valor cheio. */
  revenueReais: number;
  /** Taxa da NexaGO dessa receita (cobrança online). */
  platformFeesReais: number;
  feesReais: number;
  unassignedReais: number;
  teachers: TeacherPayoutPreview[];
}

export interface ClassPayout extends TeacherPayoutFigures {
  id: string;
  arenaId: string;
  month: string;
  computedReais: number;
  adjustmentReais: number;
  adjustmentNote: string | null;
  status: 'closed' | 'paid';
  closedAt: Date | null;
  paidOn: string | null;
  paymentMethod: PaidPayoutMethod | null;
  /** Conta nexaGO do professor no fechamento; sem ela não dá para pagar pelo nexaGO. */
  teacherUserId: string | null;
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

export const PAYOUT_MODELS: readonly PayoutModelKind[] = ['revenue_share', 'per_class', 'per_student'];

export const PAYOUT_MODEL_LABEL: Record<PayoutModelKind, string> = {
  revenue_share: '% da receita',
  per_class: 'Valor por aula',
  per_student: 'Valor por aluno presente',
};

export const PAYOUT_METHODS: readonly PayoutMethod[] = ['pix', 'transfer', 'cash'];

export const PAYOUT_METHOD_LABEL: Record<PaidPayoutMethod, string> = {
  pix: 'PIX',
  transfer: 'Transferência',
  cash: 'Dinheiro',
  nexago: 'nexaGO',
};

/** Pago pelo nexaGO: o valor já está na carteira do professor — não tem "desfazer". */
export function isPaidViaNexago(p: Pick<ClassPayout, 'status' | 'paymentMethod'> | null): boolean {
  return p?.status === 'paid' && p.paymentMethod === 'nexago';
}

/** Fechado, a pagar e com conta nexaGO do professor: dá para pagar pelo caixa da arena. */
export function canPayViaNexago(p: Pick<ClassPayout, 'status' | 'teacherUserId' | 'amountReais'> | null): boolean {
  return p?.status === 'closed' && !!p.teacherUserId && p.amountReais > 0;
}

/** Rótulo do pago na lista/histórico: "Pago pelo nexaGO" ou "Pago 05/10". */
export function paidLabel(p: Pick<ClassPayout, 'status' | 'paymentMethod' | 'paidOn'>, formatDay: (key: string) => string): string {
  if (isPaidViaNexago(p)) return 'Pago pelo nexaGO';
  return p.paidOn ? `Pago ${formatDay(p.paidOn)}` : 'Pago';
}

/** Padrão do cadastro: % da receita (50%, como no protótipo). */
export const DEFAULT_PAYOUT_MODEL: TeacherPayoutModel = { model: 'revenue_share', percent: 50, amountReais: null };

function pct(n: number): string {
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/** "50% da receita" · "R$ 45 / aula" · "R$ 15 / aluno presente". */
export function payoutModelLabel(model: TeacherPayoutModel | null): string {
  if (!model) return 'Não definido';
  if (model.model === 'revenue_share') return `${pct(model.percent ?? 0)} da receita`;
  return `${brl(model.amountReais ?? 0)} / ${model.model === 'per_class' ? 'aula' : 'aluno presente'}`;
}

/** O que o modelo multiplica: a receita, as aulas dadas ou as presenças. */
export function payoutBaseLabel(f: Pick<TeacherPayoutFigures, 'model' | 'revenueReais' | 'classesGiven' | 'presences'>): string {
  const model = f.model?.model ?? 'revenue_share';
  if (model === 'per_class') return `${f.classesGiven} aula${f.classesGiven === 1 ? '' : 's'}`;
  if (model === 'per_student') return `${f.presences} presença${f.presences === 1 ? '' : 's'}`;
  return `${brl(f.revenueReais)} receita`;
}

/** Valor cheio e taxa: retrato fechado antes da taxa entrar na conta não traz os campos —
 *  ali a receita era o valor cheio, sem taxa descontada. */
function revenueFields(d: Record<string, unknown>): { grossRevenueReais: number; platformFeeReais: number; revenueReais: number } {
  const revenueReais = num(d['revenueReais']);
  const hasGross = typeof d['grossRevenueReais'] === 'number';
  return {
    grossRevenueReais: hasGross ? num(d['grossRevenueReais']) : revenueReais,
    platformFeeReais: hasGross ? num(d['platformFeeReais']) : 0,
    revenueReais,
  };
}

/** Cabeçalho da coluna de repasse na composição. */
export function payoutColumnLabel(model: TeacherPayoutModel | null): string {
  if (!model) return 'Repasse';
  if (model.model === 'revenue_share') return `Repasse ${pct(model.percent ?? 0)}`;
  return `Repasse · ${brl(model.amountReais ?? 0)}`;
}

// ── Mês ─────────────────────────────────────────────────────────────────────

const MONTH_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function isMonthKey(raw: string | null | undefined): raw is string {
  return typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = (y ?? 2000) * 12 + (m ?? 1) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "outubro de 2026". */
export function monthLongLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_LONG[(m ?? 1) - 1] ?? '?'} de ${y}`;
}

/** "out". */
export function monthShortLabel(month: string): string {
  return MONTH_SHORT[Number(month.slice(5, 7)) - 1] ?? '?';
}

/** `2026-10-31` → "31 out". */
export function shortMonthDay(dateKey: string): string {
  return `${Number(dateKey.slice(8, 10))} ${monthShortLabel(dateKey.slice(0, 7))}`;
}

/** Último dia do mês como `YYYY-MM-DD`. */
export function monthLastDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const day = new Date(y ?? 2000, m ?? 1, 0).getDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Nos primeiros 10 dias o que importa é pagar o mês anterior; depois, acompanhar o corrente. */
export function defaultPayoutMonth(todayKey: string): string {
  const month = todayKey.slice(0, 7);
  return Number(todayKey.slice(8, 10)) <= 10 ? shiftMonth(month, -1) : month;
}

// ── Situação ────────────────────────────────────────────────────────────────

export type PayoutState = 'no_model' | 'partial' | 'to_close' | 'closed' | 'paid';

export const PAYOUT_STATE_LABEL: Record<PayoutState, string> = {
  no_model: 'Sem modelo',
  partial: 'Parcial',
  to_close: 'A fechar',
  closed: 'A pagar',
  paid: 'Pago',
};

export const PAYOUT_STATE_TONE: Record<PayoutState, 'green' | 'yellow' | 'orange' | 'dim'> = {
  no_model: 'yellow',
  partial: 'dim',
  to_close: 'yellow',
  closed: 'orange',
  paid: 'green',
};

/** O fechamento só abre depois que o mês termina (o servidor recusa antes). */
export function payoutState(closed: Pick<ClassPayout, 'status'> | null, model: TeacherPayoutModel | null, month: string, todayKey: string): PayoutState {
  if (closed) return closed.status === 'paid' ? 'paid' : 'closed';
  if (!model) return 'no_model';
  return month >= todayKey.slice(0, 7) ? 'partial' : 'to_close';
}

export interface PayoutRow {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  figures: TeacherPayoutFigures;
  closed: ClassPayout | null;
  state: PayoutState;
  /** Fechado, mas a prévia de hoje deu outro valor (pagamento lançado/estornado depois). */
  stale: boolean;
}

/** Junta a prévia de hoje com o que já foi fechado: o fechado manda nos números. */
export function buildPayoutRows(preview: readonly TeacherPayoutPreview[], closed: readonly ClassPayout[], month: string, todayKey: string): PayoutRow[] {
  const byTeacher = new Map(closed.filter((c) => c.month === month).map((c) => [c.teacherId, c]));
  const rows: PayoutRow[] = preview.map((p) => {
    const c = byTeacher.get(p.teacherId) ?? null;
    byTeacher.delete(p.teacherId);
    return {
      teacherId: p.teacherId,
      teacherName: p.teacherName,
      teacherColor: p.teacherColor,
      figures: c ?? p,
      closed: c,
      state: payoutState(c, c?.model ?? p.model, month, todayKey),
      stale: c != null && c.status === 'closed' && Math.abs(c.computedReais - p.amountReais) >= 0.01,
    };
  });
  // Fechado de professor que sumiu da prévia (arquivado sem atividade): continua na lista.
  for (const c of byTeacher.values()) {
    rows.push({ teacherId: c.teacherId, teacherName: c.teacherName, teacherColor: c.teacherColor, figures: c, closed: c, state: payoutState(c, c.model, month, todayKey), stale: false });
  }
  return rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'pt-BR'));
}

export interface PayoutTotals {
  totalReais: number;
  paidReais: number;
  toPayReais: number;
  paidCount: number;
  teachers: number;
}

export function payoutTotals(rows: readonly PayoutRow[]): PayoutTotals {
  let total = 0;
  let paid = 0;
  let paidCount = 0;
  for (const r of rows) {
    const value = r.closed ? r.closed.amountReais : r.figures.amountReais;
    total += value;
    if (r.state === 'paid') {
      paid += value;
      paidCount += 1;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { totalReais: round(total), paidReais: round(paid), toPayReais: round(total - paid), paidCount, teachers: rows.length };
}

/** "1.200,50" → 1200.5; "12.5" (ponto decimal) → 12.5 — em dinheiro, "12.50" não pode virar 1250. */
export function parseDecimalInput(raw: string): number {
  const t = raw.trim();
  if (!t) return NaN;
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(/^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, ''));
}

/** Rascunho do formulário (chips + campo de texto) → modelo, ou a mensagem de erro. */
export function payoutModelFromDraft(model: PayoutModelKind, rawValue: string): TeacherPayoutModel | string {
  const value = parseDecimalInput(rawValue);
  if (model === 'revenue_share') {
    if (!Number.isFinite(value) || value <= 0 || value > 100) return 'Informe um percentual entre 0 e 100.';
    return { model, percent: Math.round(value * 100) / 100, amountReais: null };
  }
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) return 'Informe um valor entre R$ 0,01 e R$ 10.000.';
  return { model, percent: null, amountReais: Math.round(value * 100) / 100 };
}

/** Valor do modelo no campo de texto ("50", "45,5"). */
export function payoutDraftValue(model: TeacherPayoutModel): string {
  const n = model.model === 'revenue_share' ? model.percent : model.amountReais;
  return n == null ? '' : String(n).replace('.', ',');
}

/** Mesmo id do servidor (`classPayoutId`). */
export function classPayoutId(arenaId: string, teacherId: string, month: string): string {
  return `${arenaId}_${teacherId}_${month}`;
}

// ── Parse ───────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function linesFromRaw(raw: unknown): PayoutLine[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((l) => ({
    key: str(l['key']),
    label: str(l['label'], 'Aulas'),
    detail: str(l['detail']),
    classes: num(l['classes']),
    presences: num(l['presences']),
    payingStudents: num(l['payingStudents']),
    ...revenueFields(l),
    amountReais: num(l['amountReais']),
  }));
}

export function payoutPreviewFromRaw(raw: unknown): ArenaPayoutPreview {
  const d = (raw ?? {}) as Record<string, unknown>;
  const teachers = Array.isArray(d['teachers']) ? (d['teachers'] as Array<Record<string, unknown>>) : [];
  return {
    month: str(d['month']),
    revenueReais: num(d['revenueReais']),
    platformFeesReais: num(d['platformFeesReais']),
    feesReais: num(d['feesReais']),
    unassignedReais: num(d['unassignedReais']),
    teachers: teachers.map((t) => ({
      teacherId: str(t['teacherId']),
      teacherName: str(t['teacherName'], 'Professor'),
      teacherColor: str(t['teacherColor'], '#FF6A1A'),
      teacherStatus: str(t['teacherStatus'], 'active'),
      model: payoutModelFromRaw(t['model']),
      classesGiven: num(t['classesGiven']),
      presences: num(t['presences']),
      students: num(t['students']),
      pendingSessions: num(t['pendingSessions']),
      canceledSessions: num(t['canceledSessions']),
      ...revenueFields(t),
      amountReais: num(t['amountReais']),
      lines: linesFromRaw(t['lines']),
    })),
  };
}

export function classPayoutFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ClassPayout {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  const method = d['paymentMethod'];
  return {
    id: doc.id,
    arenaId: str(d['arenaId']),
    month: str(d['month']),
    teacherId: str(d['teacherId']),
    teacherName: str(d['teacherName'], 'Professor'),
    teacherColor: str(d['teacherColor'], '#FF6A1A'),
    model: payoutModelFromRaw(d['model']),
    classesGiven: num(d['classesGiven']),
    presences: num(d['presences']),
    students: num(d['students']),
    pendingSessions: num(d['pendingSessions']),
    ...revenueFields(d),
    computedReais: num(d['computedReais']),
    adjustmentReais: num(d['adjustmentReais']),
    adjustmentNote: typeof d['adjustmentNote'] === 'string' && d['adjustmentNote'] ? d['adjustmentNote'] : null,
    amountReais: num(d['amountReais']),
    lines: linesFromRaw(d['lines']),
    status: d['status'] === 'paid' ? 'paid' : 'closed',
    closedAt: d['closedAt'] instanceof Timestamp ? d['closedAt'].toDate() : null,
    paidOn: typeof d['paidOn'] === 'string' ? d['paidOn'] : null,
    paymentMethod: method === 'pix' || method === 'transfer' || method === 'cash' || method === 'nexago' ? method : null,
    teacherUserId: typeof d['teacherUserId'] === 'string' && d['teacherUserId'] ? d['teacherUserId'] : null,
  };
}
