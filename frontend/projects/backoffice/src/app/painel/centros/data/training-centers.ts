import type { PillTone } from '../../ui/pill.component';

/** Espelho do retorno de `listTrainingCentersBackoffice` / `getTrainingCenterBackoffice`
 *  (`functions/src/training-center-backoffice.ts`). */
export type CenterStatus = 'pending' | 'active' | 'suspended';

export interface CenterSubscription {
  plan: string;
  status: string;
  openInvoiceCents: number | null;
  dueDate: string | null;
  attempts: string | null;
}

export interface CenterRow {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  city: string;
  state: string;
  status: CenterStatus;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  createdAtMs: number | null;
  activatedAtMs: number | null;
  activationRequestedAtMs: number | null;
  suspendedAtMs: number | null;
  suspendedReason: string;
  receivingConnected: boolean;
  receivingStatus: string;
  /** Subconta em análise que só o time NexaGO fecha (adotada sem apiKey: a varredura não consulta). */
  receivingManualFollowUp: boolean;
  subscription: CenterSubscription | null;
  counts: { members: number; students: number; activeClasses: number };
}

export interface CenterDetail {
  center: CenterRow;
  programs: string[];
  receiving: {
    wallet: string;
    asaasEnv: string;
    feePercent: number | null;
    status: string;
    source: string;
    manualFollowUp: boolean;
  } | null;
  audit: { atMs: number | null; actorName: string; detail: string; reason: string }[];
}

export type CenterFilter = 'all' | 'requested' | 'receiving' | 'pending' | 'active' | 'suspended';
export type ReceivingDecision = 'approved' | 'rejected';

export const FILTERS: readonly { id: CenterFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'requested', label: 'Pediram ativação' },
  { id: 'receiving', label: 'Conferir recebimento' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'active', label: 'Ativos' },
  { id: 'suspended', label: 'Suspensos' },
];

export const SUBSCRIPTION_STATUSES: readonly { id: string; label: string }[] = [
  { id: 'trial', label: 'Teste grátis' },
  { id: 'active', label: 'Em dia' },
  { id: 'past_due', label: 'Em atraso' },
  { id: 'cancelled', label: 'Cancelada' },
];

export function statusPill(c: Pick<CenterRow, 'status' | 'activationRequestedAtMs'>): { label: string; tone: PillTone } {
  if (c.status === 'active') return { label: 'Ativo', tone: 'green' };
  if (c.status === 'suspended') return { label: 'Suspenso', tone: 'red' };
  return c.activationRequestedAtMs ? { label: 'Pediu ativação', tone: 'orange' } : { label: 'Pendente', tone: 'yellow' };
}

export function matchesFilter(c: CenterRow, f: CenterFilter): boolean {
  if (f === 'all') return true;
  if (f === 'requested') return c.status === 'pending' && c.activationRequestedAtMs != null;
  if (f === 'receiving') return c.receivingManualFollowUp;
  return c.status === f;
}

/** Coluna "Recebimento" da lista: o acompanhamento manual vem antes de tudo (ninguém mais fecha). */
export function receivingPill(c: Pick<CenterRow, 'receivingConnected' | 'receivingStatus' | 'receivingManualFollowUp'>): { label: string; tone: PillTone } {
  if (c.receivingManualFollowUp) return { label: 'Conferir no Asaas', tone: 'orange' };
  if (c.receivingConnected) return { label: 'Conectado', tone: 'green' };
  if (c.receivingStatus === 'pending') return { label: 'Em análise', tone: 'yellow' };
  if (c.receivingStatus === 'rejected') return { label: 'Recusada', tone: 'red' };
  return { label: 'Pendente', tone: 'dim' };
}

export function matchesSearch(c: CenterRow, term: string): boolean {
  const t = normalize(term);
  if (!t) return true;
  return [c.name, c.legalName, c.cnpj, c.ownerName, c.contactEmail, c.city].some((v) => normalize(v).includes(t));
}

function normalize(v: string): string {
  return v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '22 out 2026' no fuso de Brasília (o backoffice opera no Brasil). */
export function formatDate(ms: number | null): string {
  if (ms == null) return '—';
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms)).split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function formatBRL(cents: number | null): string {
  if (cents == null) return '—';
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** '249,90' | '249.90' | '249' → centavos; vazio → null; inválido → NaN. */
export function parseCents(raw: string): number | null {
  const clean = raw.replace(/[R$\s]/g, '');
  if (!clean) return null;
  const n = Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

/** O que falta para o centro operar — mesma ordem do checklist que o owner vê no portal. */
export function activationGaps(c: CenterRow, programs: string[]): string[] {
  const gaps: string[] = [];
  if (!c.legalName || !c.cnpj || !c.contactEmail) gaps.push('Dados do centro incompletos');
  if (programs.length === 0) gaps.push('Nenhuma modalidade cadastrada');
  if (!c.receivingConnected) gaps.push('Conta de recebimento não conectada');
  if (!c.subscription) gaps.push('Assinatura NexaGO não registrada');
  return gaps;
}
