import type { PillTone } from '../../../ui/pill.component';

/**
 * Pedidos da Loja (telas 02 e 03): modelo lido de `storeOrders` e as regras de
 * apresentação. Status e estoque só mudam pelas callables (`store-orders-write.ts`);
 * as regras de transição aqui espelham `functions/src/store-orders.ts` só para
 * habilitar botões — o servidor decide.
 */

export type OrderStatus = 'pag' | 'sep' | 'sepd' | 'ret' | 'tra' | 'ent' | 'rtd' | 'can';
export type OrderChannel = 'web' | 'app_ios' | 'app_android';
export type PaymentMethod = 'pix' | 'cartao' | 'saldo';
export type OrderAction = 'iniciar_separacao' | 'marcar_separado' | 'enviar' | 'entregue' | 'confirmar_retirada' | 'cancelar';

export interface OrderItem {
  productId: string;
  skuId: string;
  skuCode: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  qty: number;
  unitCents: number;
  totalCents: number;
  customization: { name: string; artUrl: string | null; status: string } | null;
}

export interface OrderPayment {
  method: PaymentMethod;
  amountCents: number;
  installments: number | null;
  txid: string | null;
  feeCents: number;
}

export interface OrderDelivery {
  type: 'arena' | 'casa';
  locationId: string | null;
  placeName: string;
  counter: string | null;
  address: string | null;
  pickupCode: string | null;
  pickupDeadline: Date | null;
  modeName: string;
  city: string;
  uf: string;
  zip: string;
  carrier: string | null;
  tracking: string | null;
  trackingUrl: string | null;
  eta: string | null;
}

export interface OrderEvent {
  type: string;
  title: string;
  detail: string;
  actorName: string | null;
  at: Date | null;
}

export interface OrderRefund {
  amountCents: number;
  destination: 'original' | 'saldo';
  reason: string;
  status: string;
  actorName: string;
  at: Date | null;
  items: { index: number; qty: number }[] | null;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  channel: OrderChannel;
  customer: { uid: string | null; name: string; email: string; phone: string; cpf: string; level: number | null; orderIndex: number | null };
  items: OrderItem[];
  units: number;
  subtotalCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  pixDiscountCents: number;
  walletCents: number;
  shippingCents: number;
  totalCents: number;
  payments: OrderPayment[];
  paymentMethods: PaymentMethod[];
  pix: { copyPaste: string; expiresAt: Date | null } | null;
  delivery: OrderDelivery;
  reservation: { locationId: string; active: boolean } | null;
  transferId: string | null;
  transferCode: string | null;
  refundedCents: number;
  refunds: OrderRefund[];
  internalNote: { text: string; byName: string; at: Date | null } | null;
  paidAt: Date | null;
  separatedAt: Date | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  history: OrderEvent[];
  version: number;
  createdAt: Date | null;
}

type Raw = Record<string, any>;

export function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const orNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function orderFromDoc(id: string, d: Raw): Order {
  const c = (d['customer'] ?? {}) as Raw;
  const dl = (d['delivery'] ?? {}) as Raw;
  const note = d['internalNote'] as Raw | null;
  return {
    id,
    number: str(d['number']) || id,
    status: (d['status'] ?? 'pag') as OrderStatus,
    channel: (d['channel'] ?? 'web') as OrderChannel,
    customer: {
      uid: orNull(c['uid']), name: str(c['name']) || 'Cliente', email: str(c['email']), phone: str(c['phone']),
      cpf: str(c['cpf']), level: typeof c['level'] === 'number' ? c['level'] : null,
      orderIndex: typeof c['orderIndex'] === 'number' ? c['orderIndex'] : null,
    },
    items: ((d['items'] ?? []) as Raw[]).map((i) => ({
      productId: str(i['productId']), skuId: str(i['skuId']), skuCode: str(i['skuCode']), productName: str(i['productName']),
      variantLabel: str(i['variantLabel']), imageUrl: orNull(i['imageUrl']), qty: num(i['qty']), unitCents: num(i['unitCents']),
      totalCents: num(i['totalCents']), customization: i['customization'] ?? null,
    })),
    units: num(d['units']),
    subtotalCents: num(d['subtotalCents']),
    couponCode: orNull(d['couponCode']),
    couponDiscountCents: num(d['couponDiscountCents']),
    pixDiscountCents: num(d['pixDiscountCents']),
    walletCents: num(d['walletCents']),
    shippingCents: num(d['shippingCents']),
    totalCents: num(d['totalCents']),
    payments: ((d['payments'] ?? []) as Raw[]).map((p) => ({
      method: p['method'] as PaymentMethod, amountCents: num(p['amountCents']), installments: p['installments'] ?? null,
      txid: orNull(p['txid']), feeCents: num(p['feeCents']),
    })),
    paymentMethods: (d['paymentMethods'] ?? []) as PaymentMethod[],
    pix: d['pix'] ? { copyPaste: str(d['pix']['copyPaste']), expiresAt: dateOf(d['pix']['expiresAt']) } : null,
    delivery: {
      type: dl['type'] === 'casa' ? 'casa' : 'arena', locationId: orNull(dl['locationId']), placeName: str(dl['placeName']),
      counter: orNull(dl['counter']), address: orNull(dl['address']), pickupCode: orNull(dl['pickupCode']),
      pickupDeadline: dateOf(dl['pickupDeadline']), modeName: str(dl['modeName']), city: str(dl['city']), uf: str(dl['uf']),
      zip: str(dl['zip']), carrier: orNull(dl['carrier']), tracking: orNull(dl['tracking']), trackingUrl: orNull(dl['trackingUrl']),
      eta: orNull(dl['eta']),
    },
    reservation: d['reservation'] ?? null,
    transferId: orNull(d['transferId']),
    transferCode: orNull(d['transferCode']),
    refundedCents: num(d['refundedCents']),
    refunds: ((d['refunds'] ?? []) as Raw[]).map((r) => ({
      amountCents: num(r['amountCents']), destination: r['destination'] === 'saldo' ? 'saldo' : 'original', reason: str(r['reason']),
      status: str(r['status']), actorName: str(r['actor']?.['name']), at: dateOf(r['at']), items: r['items'] ?? null,
    })),
    internalNote: note ? { text: str(note['text']), byName: str(note['by']?.['name']), at: dateOf(note['at']) } : null,
    paidAt: dateOf(d['paidAt']),
    separatedAt: dateOf(d['separatedAt']),
    canceledAt: dateOf(d['canceledAt']),
    cancelReason: orNull(d['cancelReason']),
    history: ((d['history'] ?? []) as Raw[]).map((h) => ({
      type: str(h['type']), title: str(h['title']), detail: str(h['detail']),
      actorName: h['actor'] && h['actor']['uid'] !== 'system' ? str(h['actor']['name']) || null : null, at: dateOf(h['at']),
    })),
    version: num(d['version']),
    createdAt: dateOf(d['createdAt']),
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const STATUS_PILL: Record<OrderStatus, { label: string; tone: PillTone }> = {
  pag: { label: 'Aguardando pgto', tone: 'yellow' },
  sep: { label: 'Pago · separar', tone: 'orange' },
  sepd: { label: 'Separando', tone: 'orange' },
  ret: { label: 'Pronto p/ retirar', tone: 'green' },
  tra: { label: 'Em trânsito', tone: 'dim' },
  ent: { label: 'Entregue', tone: 'green' },
  rtd: { label: 'Retirado', tone: 'green' },
  can: { label: 'Cancelado', tone: 'red' },
};

/** Pill do pedido: `sepd` já separado mostra o que ele espera (remessa ou envio). */
export function pillOf(o: Order): { label: string; tone: PillTone } {
  if (o.status === 'sepd' && o.separatedAt) {
    if (o.delivery.type === 'casa') return { label: 'Aguard. envio', tone: 'orange' };
    return { label: o.transferId ? 'Em remessa' : 'Aguard. remessa', tone: 'orange' };
  }
  return STATUS_PILL[o.status];
}

export type OrderTab = 'todos' | 'pag' | 'sep' | 'sepd' | 'ret' | 'tra' | 'concluidos' | 'can';

export const ORDER_TABS: { id: OrderTab; label: string; statuses: OrderStatus[] | null }[] = [
  { id: 'todos', label: 'Todos', statuses: null },
  { id: 'pag', label: 'Aguardando pgto', statuses: ['pag'] },
  { id: 'sep', label: 'Para separar', statuses: ['sep'] },
  { id: 'sepd', label: 'Separando', statuses: ['sepd'] },
  { id: 'ret', label: 'Na arena', statuses: ['ret'] },
  { id: 'tra', label: 'Em trânsito', statuses: ['tra'] },
  { id: 'concluidos', label: 'Concluídos', statuses: ['ent', 'rtd'] },
  { id: 'can', label: 'Cancelados', statuses: ['can'] },
];

export function tabCounts(orders: Order[]): Record<OrderTab, number> {
  const out = Object.fromEntries(ORDER_TABS.map((t) => [t.id, 0])) as Record<OrderTab, number>;
  for (const o of orders) {
    out.todos++;
    const tab = ORDER_TABS.find((t) => t.statuses?.includes(o.status));
    if (tab) out[tab.id]++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filtros (ficam na URL)
// ---------------------------------------------------------------------------

export type OrderSort = 'recentes' | 'antigos' | 'valor';

export interface OrderFilters {
  tab: OrderTab;
  q: string;
  entrega: 'todas' | 'arena' | 'casa';
  arenas: string[];
  pagamento: PaymentMethod | null;
  canal: 'web' | 'app' | null;
  ordem: OrderSort;
  page: number;
}

export const DEFAULT_FILTERS: OrderFilters = {
  tab: 'todos', q: '', entrega: 'todas', arenas: [], pagamento: null, canal: null, ordem: 'recentes', page: 1,
};

export const PAGE_SIZE = 25;

export function filtersFromParams(p: Record<string, string | undefined>): OrderFilters {
  const tab = ORDER_TABS.some((t) => t.id === p['aba']) ? (p['aba'] as OrderTab) : 'todos';
  const entrega = p['entrega'] === 'arena' || p['entrega'] === 'casa' ? p['entrega'] : 'todas';
  const pagamento = (['pix', 'cartao', 'saldo'] as const).find((m) => m === p['pagamento']) ?? null;
  const canal = p['canal'] === 'web' || p['canal'] === 'app' ? p['canal'] : null;
  const ordem = p['ordem'] === 'antigos' || p['ordem'] === 'valor' ? p['ordem'] : 'recentes';
  const page = Math.max(1, Number.parseInt(p['p'] ?? '1', 10) || 1);
  return {
    tab, q: p['q'] ?? '', entrega, arenas: (p['arena'] ?? '').split(',').filter(Boolean), pagamento, canal, ordem, page,
  };
}

/** Só o que difere do padrão vai para a URL. */
export function filtersToParams(f: OrderFilters): Record<string, string | null> {
  return {
    aba: f.tab === 'todos' ? null : f.tab,
    q: f.q.trim() || null,
    entrega: f.entrega === 'todas' ? null : f.entrega,
    arena: f.arenas.length ? f.arenas.join(',') : null,
    pagamento: f.pagamento,
    canal: f.canal,
    ordem: f.ordem === 'recentes' ? null : f.ordem,
    p: f.page > 1 ? String(f.page) : null,
  };
}

export function hasActiveFilters(f: OrderFilters): boolean {
  return f.q.trim() !== '' || f.entrega !== 'todas' || f.arenas.length > 0 || f.pagamento !== null || f.canal !== null;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Busca e chips (sem a aba): nº do pedido, nome ou CPF. */
export function applyFilters(orders: Order[], f: OrderFilters): Order[] {
  const q = fold(f.q.trim()).replace(/^#/, '');
  const digits = q.replace(/\D+/g, '');
  return orders.filter((o) => {
    if (q) {
      const hit = fold(o.number).includes(q) || fold(o.customer.name).includes(q) || (digits.length >= 3 && o.customer.cpf.includes(digits));
      if (!hit) return false;
    }
    if (f.entrega !== 'todas' && o.delivery.type !== f.entrega) return false;
    if (f.arenas.length > 0 && !(o.delivery.type === 'arena' && f.arenas.includes(o.delivery.locationId ?? ''))) return false;
    if (f.pagamento && !o.paymentMethods.includes(f.pagamento)) return false;
    if (f.canal === 'web' && o.channel !== 'web') return false;
    if (f.canal === 'app' && o.channel === 'web') return false;
    return true;
  });
}

export function rowsForTab(orders: Order[], tab: OrderTab): Order[] {
  const statuses = ORDER_TABS.find((t) => t.id === tab)?.statuses;
  return statuses ? orders.filter((o) => statuses.includes(o.status)) : orders;
}

export function sortOrders(orders: Order[], ordem: OrderSort): Order[] {
  const t = (o: Order) => o.createdAt?.getTime() ?? 0;
  const out = [...orders];
  if (ordem === 'valor') return out.sort((a, b) => b.totalCents - a.totalCents || t(b) - t(a));
  return out.sort((a, b) => (ordem === 'antigos' ? t(a) - t(b) : t(b) - t(a)));
}

export function pageOf<T>(rows: T[], page: number): { rows: T[]; from: number; to: number; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  return { rows: slice, from: slice.length ? start + 1 : 0, to: start + slice.length, pages, page: p };
}

/** "1 2 3 … 24": primeira, última e vizinhas da atual. */
export function pageList(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  if (page <= 3) [2, 3].forEach((n) => n <= pages && keep.add(n));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push(null);
    out.push(n);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

const SP = 'America/Sao_Paulo';
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: SP });
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function hhmm(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: SP, hour: '2-digit', minute: '2-digit' });
}

/** "12 out" no fuso de São Paulo. */
export function dayMonth(d: Date): string {
  const [, m, day] = dayKey(d).split('-').map(Number);
  return `${day} ${MONTHS[m! - 1]}`;
}

/** "Hoje 15:42", "Ontem 14:08" ou "12 out". */
export function relativeDate(d: Date | null, now: Date): string {
  if (!d) return '—';
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const k = dayKey(d);
  if (k === today) return `Hoje ${hhmm(d)}`;
  if (k === yesterday) return `Ontem ${hhmm(d)}`;
  return dayMonth(d);
}

/** "14 out, 14:08". */
export function stamp(d: Date | null): string {
  return d ? `${dayMonth(d)}, ${hhmm(d)}` : '';
}

export function deliveryLabel(o: Order): string {
  if (o.delivery.type === 'arena') return o.delivery.placeName || 'Arena';
  const place = [o.delivery.city, o.delivery.uf].filter(Boolean).join(', ');
  return [o.delivery.modeName || 'Entrega', place].filter(Boolean).join(' · ');
}

export function paymentLabel(o: Order): string {
  const card = o.payments.find((p) => p.method === 'cartao');
  const hasPix = o.payments.some((p) => p.method === 'pix');
  const hasWallet = o.payments.some((p) => p.method === 'saldo' && p.amountCents > 0);
  const main = card ? `Cartão ${card.installments ?? 1}×` : hasPix ? 'Pix' : hasWallet ? 'Saldo' : '—';
  return hasWallet && main !== 'Saldo' ? `${main} + saldo` : main;
}

export const CHANNEL_LABEL: Record<OrderChannel, string> = { web: 'Site', app_ios: 'App iOS', app_android: 'App Android' };

/** CPF mascarado como no desenho: `***.482.331-**`. */
export function maskCpf(cpf: string): string {
  const d = cpf.replace(/\D+/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '—';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() || '?';
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export type PrimaryKind = OrderAction | 'reenviar_cobranca' | 'criar_remessa';

/** Ação primária do detalhe (03) pelo status. `null` = nenhuma. */
export function primaryAction(o: Order): { kind: PrimaryKind; label: string } | null {
  switch (o.status) {
    case 'pag':
      return { kind: 'reenviar_cobranca', label: 'Reenviar cobrança' };
    case 'sep':
      return { kind: 'iniciar_separacao', label: 'Iniciar separação' };
    case 'sepd':
      if (!o.separatedAt) return { kind: 'marcar_separado', label: 'Marcar como separado' };
      if (o.delivery.type === 'casa') return { kind: 'enviar', label: 'Marcar como enviado' };
      return o.transferId ? null : { kind: 'criar_remessa', label: 'Criar remessa p/ arena' };
    case 'ret':
      return { kind: 'confirmar_retirada', label: 'Confirmar retirada' };
    case 'tra':
      return { kind: 'entregue', label: 'Marcar como entregue' };
    default:
      return null;
  }
}

/** Por que "Marcar como separado" não vale para o pedido; `null` = vale. */
export function separateBlock(o: Order): string | null {
  if (o.status === 'sep' || (o.status === 'sepd' && !o.separatedAt)) return null;
  if (o.status === 'pag') return 'aguardando pagamento';
  if (o.status === 'sepd') return 'já separado';
  return 'já saiu da separação';
}

/** Por que a seleção não vira uma remessa; `null` = vira (todos para a mesma arena, reservados no CD). */
export function transferBlock(orders: Order[]): string | null {
  if (orders.length === 0) return 'nenhum pedido selecionado';
  if (orders.some((o) => o.delivery.type !== 'arena')) return 'há pedido com entrega em casa';
  const arenas = new Set(orders.map((o) => o.delivery.locationId));
  if (arenas.size > 1) return 'os pedidos vão para arenas diferentes';
  if (orders.some((o) => o.status !== 'sep' && o.status !== 'sepd')) return 'há pedido fora da separação';
  if (orders.some((o) => o.transferId)) return 'há pedido que já está em remessa';
  if (orders.some((o) => !o.reservation?.active || o.reservation.locationId === o.delivery.locationId)) {
    return 'há pedido que já está reservado na própria arena';
  }
  return null;
}

export function cancelBlock(o: Order): string | null {
  if (o.status === 'tra') return 'Pedido em trânsito não pode ser cancelado. Abra uma troca/devolução quando chegar.';
  if (o.status === 'ent' || o.status === 'rtd') return 'Pedido já entregue: abra uma troca/devolução.';
  if (o.status === 'can') return 'Pedido já cancelado.';
  return null;
}

/** Itens agregados de vários pedidos, para a remessa (`productId/skuId` → qtd). */
export function transferLines(orders: Order[]): { productId: string; skuId: string; qty: number }[] {
  const by = new Map<string, { productId: string; skuId: string; qty: number }>();
  for (const i of orders.flatMap((o) => o.items)) {
    const key = `${i.productId}/${i.skuId}`;
    const cur = by.get(key);
    by.set(key, { productId: i.productId, skuId: i.skuId, qty: (cur?.qty ?? 0) + i.qty });
  }
  return [...by.values()];
}

// ---------------------------------------------------------------------------
// Detalhe: retirada, timeline, pagamento
// ---------------------------------------------------------------------------

/** Estado local da retirada no card lateral. */
export function pickupState(o: Order): { label: string; tone: PillTone } {
  switch (o.status) {
    case 'ret': return { label: 'Na arena', tone: 'green' };
    case 'rtd': return { label: 'Retirado', tone: 'green' };
    case 'can': return { label: 'Cancelado', tone: 'red' };
    case 'pag': return { label: 'Aguardando pgto', tone: 'yellow' };
    default: return { label: o.transferId ? 'Em remessa' : 'Aguardando remessa', tone: 'dim' };
  }
}

export type StepState = 'done' | 'current' | 'next' | 'canceled';
export interface TimelineStep {
  title: string;
  detail: string;
  state: StepState;
}

const PICKUP_STEPS = ['criado', 'pago', 'separado', 'na_arena', 'aguardando', 'retirado'] as const;
const HOME_STEPS = ['criado', 'pago', 'separado', 'enviado', 'entregue'] as const;
const STEP_TITLE: Record<string, string> = {
  criado: 'Pedido criado', pago: 'Pagamento aprovado', separado: 'Separado', na_arena: 'Recebido na arena',
  aguardando: 'Aguardando retirada', retirado: 'Retirado', enviado: 'Enviado', entregue: 'Entregue',
};

function eventDetail(e: OrderEvent): string {
  const by = e.actorName ? `por ${e.actorName}` : '';
  return [e.detail, by, stamp(e.at)].filter(Boolean).join(' · ');
}

/**
 * Linha do tempo da 03: etapas fixas da modalidade, preenchidas pelo histórico.
 * Concluída = verde; atual = laranja; próximas = vazadas. Cancelado encerra ali.
 */
export function timelineOf(o: Order): TimelineStep[] {
  const keys = o.delivery.type === 'arena' ? PICKUP_STEPS : HOME_STEPS;
  const last = (type: string) => [...o.history].reverse().find((e) => e.type === type);
  const steps: TimelineStep[] = [];
  let currentSet = false;
  for (const key of keys) {
    if (key === 'aguardando') {
      // Etapa de espera: atual com o prazo enquanto está na arena.
      const arrived = last('na_arena');
      if (arrived && (o.status === 'rtd' || o.status === 'ret')) {
        const deadline = o.delivery.pickupDeadline;
        steps.push({
          title: STEP_TITLE[key]!, detail: deadline ? `Prazo até ${deadlineLabel(deadline)}` : '',
          state: o.status === 'rtd' ? 'done' : 'current',
        });
        if (o.status === 'ret') currentSet = true;
        continue;
      }
    }
    const e = key === 'aguardando' ? undefined : last(key);
    if (e) {
      steps.push({ title: e.title || STEP_TITLE[key]!, detail: eventDetail(e), state: 'done' });
      continue;
    }
    if (o.status === 'can') break;
    let title = STEP_TITLE[key]!;
    if (key === 'pago' && o.status === 'pag') title = 'Aguardando pagamento';
    if (key === 'separado' && o.status === 'sepd' && !o.separatedAt) title = 'Separando';
    if (key === 'na_arena' && o.transferCode) title = `Em remessa ${o.transferCode}`;
    steps.push({ title, detail: '', state: currentSet ? 'next' : 'current' });
    currentSet = true;
  }
  if (o.status === 'can') {
    const e = last('cancelado');
    steps.push({ title: 'Pedido cancelado', detail: e ? eventDetail(e) : (o.cancelReason ?? ''), state: 'canceled' });
  }
  return steps;
}

/** Eventos fora das etapas (remessa, reembolso, avisos): a lista "Atividade". */
export function activityOf(o: Order): { title: string; detail: string }[] {
  const steps = new Set<string>([...PICKUP_STEPS, ...HOME_STEPS, 'cancelado']);
  return o.history
    .filter((e) => !steps.has(e.type))
    .map((e) => ({ title: e.title, detail: eventDetail(e) }))
    .reverse();
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "sáb, 18 out · 22h" no fuso de São Paulo (igual ao servidor). */
export function deadlineLabel(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3_600_000);
  return `${WEEKDAYS[sp.getUTCDay()]}, ${sp.getUTCDate()} ${MONTHS[sp.getUTCMonth()]} · ${sp.getUTCHours()}h`;
}

/** Total devolvível: o pago (externo + saldo) menos o já reembolsado. */
export function refundable(o: Order): number {
  return Math.max(0, o.totalCents + o.walletCents - o.refundedCents);
}

/** Valor pago por unidade, com descontos rateados (frete fora) — espelha `paidUnitCents` do servidor. */
export function paidUnitCents(o: Order, unitCents: number): number {
  if (o.subtotalCents <= 0) return 0;
  const goods = Math.max(0, o.totalCents + o.walletCents - o.shippingCents);
  return Math.round((unitCents * goods) / o.subtotalCents);
}

export function refundedQty(o: Order, index: number): number {
  return o.refunds.reduce((n, r) => n + (r.items ?? []).filter((l) => l.index === index).reduce((m, l) => m + l.qty, 0), 0);
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');

/** CSV com `;` (abre direto no Excel em pt-BR). */
export function ordersCsv(orders: Order[]): string {
  const head = ['Pedido', 'Data', 'Cliente', 'Itens', 'Entrega', 'Pagamento', 'Canal', 'Subtotal', 'Descontos', 'Frete', 'Total', 'Status'];
  const lines = orders.map((o) => [
    o.number, o.createdAt ? o.createdAt.toLocaleString('pt-BR', { timeZone: SP }) : '', o.customer.name, o.units,
    deliveryLabel(o), paymentLabel(o), CHANNEL_LABEL[o.channel] ?? o.channel, reais(o.subtotalCents),
    reais(o.couponDiscountCents + o.pixDiscountCents + o.walletCents), reais(o.shippingCents), reais(o.totalCents), pillOf(o).label,
  ]);
  return [head, ...lines].map((l) => l.map(csvCell).join(';')).join('\n');
}

export function downloadText(name: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
