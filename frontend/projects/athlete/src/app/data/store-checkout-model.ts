/**
 * Checkout da Loja no portal: cotação do servidor, endereços do atleta e a visão do pedido
 * (`storeOrderViews`). Funções puras — contrato em `docs/business-rules/loja-checkout.md`.
 */
import type { StoreCartItem } from './store-showcase-model';

type Raw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function int(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}

function orNull(v: unknown): string | null {
  const s = str(v);
  return s === '' ? null : s;
}

function onlyDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** A chave da linha que o servidor devolve na cotação: `lineId` da personalizada ou produto/SKU. */
export function cartLineKey(item: StoreCartItem): string {
  return item.lineId ?? `${item.productId}/${item.skuId}`;
}

// ── Cotação ──────────────────────────────────────────────────────

export type CheckoutDeliveryInput = { type: 'arena'; arenaId: string } | { type: 'casa'; addressId: string; modeId: string };

export interface CheckoutRequest {
  channel: 'web';
  delivery: CheckoutDeliveryInput | null;
  couponCode: string | null;
}

export type QuoteLineProblem = 'indisponivel' | 'esgotado' | 'sem_retirada' | 'sem_entrega' | 'personalizacao_off';
export type QuoteProblem =
  | 'carrinho_vazio'
  | 'entrega_faltando'
  | 'arena_indisponivel'
  | 'endereco_faltando'
  | 'modalidade_indisponivel'
  | 'linha_com_problema';

export interface QuoteLine {
  key: string;
  productId: string;
  skuId: string;
  qty: number;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  unitCents: number;
  totalCents: number;
  personalized: boolean;
  customizationLabel: string | null;
  problem: QuoteLineProblem | null;
}

export interface QuoteCoupon {
  code: string;
  discountCents: number;
  problem: string | null;
  message: string | null;
}

export interface CheckoutQuote {
  lines: QuoteLine[];
  units: number;
  subtotalCents: number;
  coupon: QuoteCoupon | null;
  pixDiscountPct: number;
  pixDiscountCents: number;
  shippingCents: number;
  freeShipping: boolean;
  totalCents: number;
  problems: QuoteProblem[];
}

const LINE_PROBLEMS: readonly QuoteLineProblem[] = ['indisponivel', 'esgotado', 'sem_retirada', 'sem_entrega', 'personalizacao_off'];
const QUOTE_PROBLEMS: readonly QuoteProblem[] = [
  'carrinho_vazio',
  'entrega_faltando',
  'arena_indisponivel',
  'endereco_faltando',
  'modalidade_indisponivel',
  'linha_com_problema',
];

/** Resposta da callable (ou `details.quote` de um erro) → cotação; `null` se não for uma. */
export function quoteFromData(raw: unknown): CheckoutQuote | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Raw;
  if (!Array.isArray(d['lines'])) return null;
  const couponRaw = d['coupon'] as Raw | null | undefined;
  return {
    lines: (d['lines'] as Raw[]).map((l) => ({
      key: str(l?.['key']),
      productId: str(l?.['productId']),
      skuId: str(l?.['skuId']),
      qty: int(l?.['qty']),
      name: str(l?.['name']),
      variantLabel: str(l?.['variantLabel']),
      imageUrl: orNull(l?.['imageUrl']),
      unitCents: int(l?.['unitCents']),
      totalCents: int(l?.['totalCents']),
      personalized: l?.['personalized'] === true,
      customizationLabel: orNull(l?.['customizationLabel']),
      problem: LINE_PROBLEMS.includes(l?.['problem'] as QuoteLineProblem) ? (l['problem'] as QuoteLineProblem) : null,
    })),
    units: int(d['units']),
    subtotalCents: int(d['subtotalCents']),
    coupon:
      couponRaw && typeof couponRaw === 'object'
        ? {
            code: str(couponRaw['code']),
            discountCents: int(couponRaw['discountCents']),
            problem: orNull(couponRaw['problem']),
            message: orNull(couponRaw['message']),
          }
        : null,
    pixDiscountPct: int(d['pixDiscountPct']),
    pixDiscountCents: int(d['pixDiscountCents']),
    shippingCents: int(d['shippingCents']),
    freeShipping: d['freeShipping'] === true,
    totalCents: int(d['totalCents']),
    problems: Array.isArray(d['problems'])
      ? (d['problems'] as unknown[]).filter((p): p is QuoteProblem => QUOTE_PROBLEMS.includes(p as QuoteProblem))
      : [],
  };
}

export const LINE_PROBLEM_LABEL: Record<QuoteLineProblem, string> = {
  indisponivel: 'Saiu da loja — remova pra seguir',
  esgotado: 'Sem estoque nessa quantidade',
  sem_retirada: 'Não sai pra retirada na arena',
  sem_entrega: 'Não tem entrega em casa',
  personalizacao_off: 'A personalização saiu do ar — remova pra seguir',
};

/** Por que o "Pagar" está travado (a primeira causa que o atleta resolve), ou `null`. */
export function quoteBlocker(q: CheckoutQuote): string | null {
  const p = q.problems;
  if (p.includes('carrinho_vazio')) return 'Seu carrinho está vazio.';
  if (p.includes('linha_com_problema')) return 'Revise os itens marcados no carrinho.';
  if (p.includes('entrega_faltando')) return 'Escolha como receber.';
  if (p.includes('arena_indisponivel')) return 'Essa arena não está fazendo retirada. Escolha outra.';
  if (p.includes('endereco_faltando')) return 'Escolha um endereço de entrega.';
  if (p.includes('modalidade_indisponivel')) return 'Escolha um prazo de entrega.';
  return null;
}

/** Cupom aplicado de verdade (sem problema) — o que entra no resumo como desconto. */
export function appliedCoupon(q: CheckoutQuote | null): QuoteCoupon | null {
  return q?.coupon && q.coupon.problem === null ? q.coupon : null;
}

// ── Endereços (`storeAddresses/{uid}`) ──────────────────────────

export const MAX_ADDRESSES = 10;
export const ADDRESS_LABELS = ['Casa', 'Trabalho', 'Outro'] as const;

export interface StoreAddress {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  main: boolean;
}

export function addressesFromDoc(data: Raw | undefined): StoreAddress[] {
  if (!data || !Array.isArray(data['items'])) return [];
  return (data['items'] as Raw[])
    .map((a) => ({
      id: str(a?.['id']),
      label: str(a?.['label']) || 'Casa',
      recipient: str(a?.['recipient']),
      phone: onlyDigits(str(a?.['phone'])),
      zip: onlyDigits(str(a?.['zip'])),
      street: str(a?.['street']),
      number: str(a?.['number']),
      complement: str(a?.['complement']),
      district: str(a?.['district']),
      city: str(a?.['city']),
      uf: str(a?.['uf']).toUpperCase(),
      main: a?.['main'] === true,
    }))
    .filter((a) => a.id !== '' && a.street !== '' && a.city !== '' && /^[A-Z]{2}$/.test(a.uf));
}

/** O mapa que vai para a rule (chaves fixas; `main` só quando é o principal). */
export function addressToDoc(a: StoreAddress): Raw {
  const doc: Raw = {
    id: a.id,
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    zip: a.zip,
    street: a.street,
    number: a.number,
    complement: a.complement,
    district: a.district,
    city: a.city,
    uf: a.uf,
  };
  if (a.main) doc['main'] = true;
  return doc;
}

/**
 * Grava (novo ou editado) mantendo um único principal: o primeiro endereço nasce principal, e
 * marcar outro tira a marca do anterior. `null` quando a lista já está no teto.
 */
export function upsertAddress(list: readonly StoreAddress[], next: StoreAddress, makeMain: boolean): StoreAddress[] | null {
  const exists = list.some((a) => a.id === next.id);
  if (!exists && list.length >= MAX_ADDRESSES) return null;
  const merged = exists ? list.map((a) => (a.id === next.id ? next : a)) : [...list, next];
  const mainId = makeMain || merged.length === 1 ? next.id : (merged.find((a) => a.main)?.id ?? merged[0]!.id);
  return merged.map((a) => ({ ...a, main: a.id === mainId }));
}

export function removeAddress(list: readonly StoreAddress[], id: string): StoreAddress[] {
  const left = list.filter((a) => a.id !== id);
  if (left.length > 0 && !left.some((a) => a.main)) left[0] = { ...left[0]!, main: true };
  return left;
}

/** Endereço que o checkout abre selecionado: o principal, senão o primeiro. */
export function defaultAddressId(list: readonly StoreAddress[]): string | null {
  return (list.find((a) => a.main) ?? list[0])?.id ?? null;
}

/** "Rua T-37, 1240 · Ap 802". */
export function addressLine(a: Pick<StoreAddress, 'street' | 'number' | 'complement'>): string {
  const head = a.number ? `${a.street}, ${a.number}` : a.street;
  return a.complement ? `${head} · ${a.complement}` : head;
}

/** "Setor Bueno · Goiânia, GO". */
export function addressArea(a: Pick<StoreAddress, 'district' | 'city' | 'uf'>): string {
  const city = `${a.city}, ${a.uf}`;
  return a.district ? `${a.district} · ${city}` : city;
}

/** "74210130" → "74210-130" (enquanto digita também). */
export function formatCep(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** "62998124471" → "(62) 99812-4471"; fixo com 10 dígitos → "(62) 3241-0000". */
export function formatPhone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const cut = rest.length > 8 ? 5 : 4;
  return rest.length > cut ? `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}` : `(${ddd}) ${rest}`;
}

export interface AddressDraft {
  label: string;
  recipient: string;
  phone: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
}

export type AddressField = keyof AddressDraft;

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
  label: 'Casa',
  recipient: '',
  phone: '',
  zip: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  uf: '',
};

export function draftFromAddress(a: StoreAddress): AddressDraft {
  return {
    label: a.label,
    recipient: a.recipient,
    phone: a.phone,
    zip: a.zip,
    street: a.street,
    number: a.number,
    complement: a.complement,
    district: a.district,
    city: a.city,
    uf: a.uf,
  };
}

/** Mensagem por campo; vazio = pode salvar. "S/N" vale como número. */
export function addressDraftErrors(d: AddressDraft): Partial<Record<AddressField, string>> {
  const e: Partial<Record<AddressField, string>> = {};
  if (onlyDigits(d.zip).length !== 8) e.zip = 'CEP com 8 números';
  if (!d.street.trim()) e.street = 'Informe a rua';
  if (!d.number.trim()) e.number = 'Informe o número (ou S/N)';
  if (!d.district.trim()) e.district = 'Informe o bairro';
  if (!d.city.trim()) e.city = 'Informe a cidade';
  if (!/^[A-Za-z]{2}$/.test(d.uf.trim())) e.uf = 'UF com 2 letras';
  if (d.recipient.trim().length < 2) e.recipient = 'Quem vai receber';
  const phone = onlyDigits(d.phone);
  if (phone.length < 10 || phone.length > 11) e.phone = 'Celular com DDD';
  return e;
}

export function addressFromDraft(d: AddressDraft, id: string, main: boolean): StoreAddress {
  return {
    id,
    label: d.label.trim().slice(0, 40) || 'Casa',
    recipient: d.recipient.trim().slice(0, 120),
    phone: onlyDigits(d.phone).slice(0, 11),
    zip: onlyDigits(d.zip).slice(0, 8),
    street: d.street.trim().slice(0, 160),
    number: d.number.trim().slice(0, 20),
    complement: d.complement.trim().slice(0, 120),
    district: d.district.trim().slice(0, 120),
    city: d.city.trim().slice(0, 80),
    uf: d.uf.trim().toUpperCase().slice(0, 2),
    main,
  };
}

// ── Pedido do atleta (`storeOrderViews/{orderId}`) ──────────────

export type StoreOrderStatus = 'pag' | 'sep' | 'sepd' | 'ret' | 'tra' | 'ent' | 'rtd' | 'can';
const ORDER_STATUSES: readonly StoreOrderStatus[] = ['pag', 'sep', 'sepd', 'ret', 'tra', 'ent', 'rtd', 'can'];

export interface StoreOrderItem {
  productId: string;
  skuId: string;
  name: string;
  variantLabel: string;
  imageUrl: string | null;
  qty: number;
  unitCents: number;
  totalCents: number;
  personalized: boolean;
  customizationLabel: string | null;
}

export interface StoreOrderView {
  id: string;
  number: string;
  status: StoreOrderStatus;
  items: StoreOrderItem[];
  units: number;
  subtotalCents: number;
  couponCode: string | null;
  couponDiscountCents: number;
  pixDiscountCents: number;
  shippingCents: number;
  totalCents: number;
  pix: { copyPaste: string; expiresAt: Date | null } | null;
  delivery:
    | { type: 'arena'; placeName: string | null; counter: string | null; address: string | null; pickupCode: string | null; pickupDeadline: Date | null }
    | {
        type: 'casa';
        modeName: string | null;
        address: string | null;
        city: string | null;
        uf: string | null;
        zip: string | null;
        carrier: string | null;
        tracking: string | null;
        trackingUrl: string | null;
        eta: string | null;
      };
  createdAt: Date | null;
  paidAt: Date | null;
  cancelReason: string | null;
  refundedCents: number;
}

function date(v: unknown): Date | null {
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Timestamp do Firestore (se um dia a visão gravar como data).
  const ts = v as { toDate?: () => Date } | null;
  return typeof ts?.toDate === 'function' ? ts.toDate() : null;
}

export function orderViewFromDoc(id: string, data: Raw | undefined): StoreOrderView | null {
  if (!data) return null;
  const status = str(data['status']) as StoreOrderStatus;
  if (!ORDER_STATUSES.includes(status)) return null;
  const d = (data['delivery'] ?? {}) as Raw;
  const pix = data['pix'] as Raw | null | undefined;
  return {
    id,
    number: str(data['number']) || id,
    status,
    items: (Array.isArray(data['items']) ? (data['items'] as Raw[]) : []).map((i) => ({
      productId: str(i?.['productId']),
      skuId: str(i?.['skuId']),
      name: str(i?.['name']),
      variantLabel: str(i?.['variantLabel']),
      imageUrl: orNull(i?.['imageUrl']),
      qty: int(i?.['qty']),
      unitCents: int(i?.['unitCents']),
      totalCents: int(i?.['totalCents']),
      personalized: i?.['personalized'] === true,
      customizationLabel: orNull(i?.['customizationLabel']),
    })),
    units: int(data['units']),
    subtotalCents: int(data['subtotalCents']),
    couponCode: orNull(data['couponCode']),
    couponDiscountCents: int(data['couponDiscountCents']),
    pixDiscountCents: int(data['pixDiscountCents']),
    shippingCents: int(data['shippingCents']),
    totalCents: int(data['totalCents']),
    pix: status === 'pag' && pix && str(pix['copyPaste']) ? { copyPaste: str(pix['copyPaste']), expiresAt: date(pix['expiresAt']) } : null,
    delivery:
      d['type'] === 'arena'
        ? {
            type: 'arena',
            placeName: orNull(d['placeName']),
            counter: orNull(d['counter']),
            address: orNull(d['address']),
            pickupCode: status === 'ret' ? orNull(d['pickupCode']) : null,
            pickupDeadline: date(d['pickupDeadline']),
          }
        : {
            type: 'casa',
            modeName: orNull(d['modeName']),
            address: orNull(d['address']),
            city: orNull(d['city']),
            uf: orNull(d['uf']),
            zip: orNull(d['zip']),
            carrier: orNull(d['carrier']),
            tracking: orNull(d['tracking']),
            trackingUrl: orNull(d['trackingUrl']),
            eta: orNull(d['eta']),
          },
    createdAt: date(data['createdAt']),
    paidAt: date(data['paidAt']),
    cancelReason: orNull(data['cancelReason']),
    refundedCents: int(data['refundedCents']),
  };
}

export const ORDER_STATUS_LABEL: Record<StoreOrderStatus, string> = {
  pag: 'Aguardando pagamento',
  sep: 'Em separação',
  sepd: 'Separado',
  ret: 'Pronto pra retirar',
  tra: 'Em trânsito',
  ent: 'Entregue',
  rtd: 'Retirado',
  can: 'Cancelado',
};

export type OrderTone = 'wait' | 'progress' | 'ready' | 'transit' | 'done' | 'canceled';

export function orderTone(status: StoreOrderStatus): OrderTone {
  switch (status) {
    case 'pag':
      return 'wait';
    case 'ret':
      return 'ready';
    case 'tra':
      return 'transit';
    case 'ent':
    case 'rtd':
      return 'done';
    case 'can':
      return 'canceled';
    default:
      return 'progress';
  }
}

/** Pedido que ainda vai mudar (aparece em "Em andamento"). */
export function orderActive(status: StoreOrderStatus): boolean {
  return status !== 'ent' && status !== 'rtd' && status !== 'can';
}

/**
 * Barra de etapas: `step` é a etapa em curso (as anteriores ficam verdes). Pedido encerrado não
 * tem barra.
 */
export function orderProgress(o: Pick<StoreOrderView, 'status' | 'delivery'>): { steps: string[]; step: number } | null {
  if (!orderActive(o.status)) return null;
  const arena = o.delivery.type === 'arena';
  const steps = arena ? ['Pago', 'Separado', 'Na arena', 'Retirado'] : ['Pago', 'Separado', 'Em trânsito', 'Entregue'];
  const step = { pag: 0, sep: 1, sepd: 2, ret: 3, tra: 2 }[o.status as 'pag' | 'sep' | 'sepd' | 'ret' | 'tra'] ?? 0;
  return { steps, step };
}

export type OrderFilter = 'todos' | 'andamento' | 'concluidos' | 'cancelados';

export const ORDER_FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'concluidos', label: 'Concluídos' },
  { id: 'cancelados', label: 'Cancelados' },
];

export function orderMatchesFilter(o: Pick<StoreOrderView, 'status'>, filter: OrderFilter): boolean {
  switch (filter) {
    case 'andamento':
      return orderActive(o.status);
    case 'concluidos':
      return o.status === 'ent' || o.status === 'rtd';
    case 'cancelados':
      return o.status === 'can';
    default:
      return true;
  }
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Busca por número do pedido ou nome de produto (sem acento, sem caixa; "#" opcional). */
export function orderMatchesSearch(o: Pick<StoreOrderView, 'number' | 'items'>, term: string): boolean {
  const t = fold(term.trim().replace(/^#/, ''));
  if (!t) return true;
  return fold(o.number).includes(t) || o.items.some((i) => fold(i.name).includes(t));
}

/** Nome do card: o produto (com o nome personalizado) quando é um só; senão "4 itens". */
export function orderTitle(o: Pick<StoreOrderView, 'items' | 'units'>): string {
  if (o.items.length === 1) {
    const i = o.items[0]!;
    const base = i.customizationLabel ? `${i.name} · ${i.customizationLabel}` : i.name;
    return i.qty > 1 ? `${base} · ${i.qty}×` : base;
  }
  const units = o.units || o.items.reduce((n, i) => n + i.qty, 0);
  return `${units} itens`;
}

// ── Datas (relógio de parede de São Paulo, UTC−3 fixo, a mesma conta do produto) ──

const SAO_PAULO_OFFSET_MS = 3 * 3_600_000;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function wall(d: Date): Date {
  return new Date(d.getTime() - SAO_PAULO_OFFSET_MS);
}

function dayNumber(w: Date): number {
  return Math.floor(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) / 86_400_000);
}

function hhmm(w: Date): string {
  return `${String(w.getUTCHours()).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Hoje, 16:02" · "Ontem, 14:08" · "8 out" (· "8 out 2025" em outro ano). */
export function formatOrderDate(at: Date | null, now: Date): string {
  if (!at) return '';
  const w = wall(at);
  const n = wall(now);
  const diff = dayNumber(n) - dayNumber(w);
  if (diff === 0) return `Hoje, ${hhmm(w)}`;
  if (diff === 1) return `Ontem, ${hhmm(w)}`;
  const base = `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
  return w.getUTCFullYear() === n.getUTCFullYear() ? base : `${base} ${w.getUTCFullYear()}`;
}

/** "sáb, 18 out · 22h" (minutos só quando não é hora cheia). */
export function formatDeadline(at: Date): string {
  const w = wall(at);
  const hour = w.getUTCMinutes() === 0 ? `${w.getUTCHours()}h` : hhmm(w);
  return `${WEEKDAYS_SHORT[w.getUTCDay()]}, ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} · ${hour}`;
}

/** Data civil do envio (`eta` = "2026-10-22") → "qui, 22 out"; `null` se não for uma. */
export function formatCivilDate(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Linha de apoio do card: o que o atleta precisa saber agora. */
export function orderInfo(o: StoreOrderView): string {
  const d = o.delivery;
  switch (o.status) {
    case 'pag':
      return o.pix?.expiresAt ? `Pague o Pix até ${hhmm(wall(o.pix.expiresAt))}` : 'Aguardando o Pix';
    case 'ret':
      return d.type === 'arena' && d.pickupDeadline ? `Retire até ${formatDeadline(d.pickupDeadline)}` : 'Já está na arena';
    case 'tra':
      return d.type === 'casa' && d.eta && formatCivilDate(d.eta) ? `Chega até ${formatCivilDate(d.eta)}` : 'A caminho do seu endereço';
    case 'sep':
    case 'sepd':
      return d.type === 'arena' ? 'Separando pra levar à arena' : 'Separando pra enviar';
    case 'can':
      return o.refundedCents > 0 ? 'Valor devolvido no Pix' : (o.cancelReason ?? 'Pedido cancelado');
    default:
      return '';
  }
}

/** Onde o pedido vai/foi: "Arena Errejota · recepção" ou o endereço. */
export function orderWhere(o: StoreOrderView): string {
  const d = o.delivery;
  if (d.type === 'arena') {
    const place = d.placeName ?? 'Retirada na arena';
    if (o.status === 'rtd') return `Retirado na ${place}`;
    return d.counter ? `${place} · ${d.counter}` : place;
  }
  if (o.status === 'ent') return 'Entregue em casa';
  return d.address ?? 'Receber em casa';
}

/** Rota do Google Maps até o endereço da arena (sem coordenada no espelho do pedido). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Contagem do Pix: "29:58"; `null` quando venceu. */
export function pixCountdown(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;
  const left = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  if (left <= 0) return null;
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}
