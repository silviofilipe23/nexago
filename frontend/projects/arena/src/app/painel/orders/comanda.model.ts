/** Espelha `nexago_app/.../arena/domain/comandas/*.dart` — schema de `arenaComandas`
 *  (coleção top-level, não subcoleção de arena) e suas subcoleções `items`/`payments`. */

export type ArenaComandaType = 'shared' | 'individual' | 'table' | 'event';
export type ArenaComandaStatus = 'open' | 'closing' | 'partiallyPaid' | 'closed';

export function comandaStatusIsActive(status: ArenaComandaStatus): boolean {
  return status === 'open' || status === 'closing' || status === 'partiallyPaid';
}

export const ARENA_COMANDA_STATUS_LABEL: Record<ArenaComandaStatus, string> = {
  open: 'Aberta',
  closing: 'Em fechamento',
  partiallyPaid: 'Parcialmente paga',
  closed: 'Fechada',
};

export interface ArenaComanda {
  id: string;
  arenaId: string;
  displayNumber: number;
  type: ArenaComandaType;
  status: ArenaComandaStatus;
  bookingId?: string;
  bookingDisplayCode?: string;
  locationLabel?: string;
  customerName: string;
  customerWhatsapp?: string;
  customerCpf?: string;
  allowAppOrders: boolean;
  rentalCents: number;
  itemsTotalCents: number;
  totalCents: number;
  itemsCount: number;
  paidCents: number;
  openedByUid: string;
  openedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export function comandaRemainingCents(comanda: Pick<ArenaComanda, 'totalCents' | 'paidCents'>): number {
  return Math.min(comanda.totalCents, Math.max(0, comanda.totalCents - comanda.paidCents));
}

export type ArenaComandaItemSource = 'counter' | 'app';

export interface ArenaComandaItem {
  id: string;
  productId: string;
  productName: string;
  emoji?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  source: ArenaComandaItemSource;
  addedByName: string;
  addedByUid: string;
  createdAt?: Date;
}

export type ArenaComandaPaymentMethod = 'pix' | 'credit' | 'debit' | 'cash' | 'wallet' | 'other';

export const ARENA_COMANDA_PAYMENT_METHOD_LABEL: Record<ArenaComandaPaymentMethod, string> = {
  pix: 'Pix',
  credit: 'Crédito',
  debit: 'Débito',
  cash: 'Dinheiro',
  wallet: 'Carteira',
  other: 'Outro',
};

export interface ArenaComandaPayment {
  id: string;
  method: ArenaComandaPaymentMethod;
  amountCents: number;
  payerName: string;
  receivedByUid: string;
  createdAt?: Date;
}

export function formatComandaNumber(displayNumber: number): string {
  return `#${String(displayNumber).padStart(4, '0')}`;
}

export function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface ArenaComandasKpis {
  openCount: number;
  todayTotalCents: number;
  averageTicketCents: number;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function computeComandasKpis(comandas: readonly ArenaComanda[], reference = new Date()): ArenaComandasKpis {
  const openCount = comandas.filter((c) => comandaStatusIsActive(c.status)).length;

  let todayTotalCents = 0;
  let todayCount = 0;
  for (const comanda of comandas) {
    const date = comanda.openedAt ?? comanda.createdAt;
    if (!date || !isSameLocalDay(date, reference)) continue;
    todayTotalCents += comanda.totalCents;
    todayCount++;
  }

  return {
    openCount,
    todayTotalCents,
    averageTicketCents: todayCount > 0 ? Math.round(todayTotalCents / todayCount) : 0,
  };
}

/** Motivo pelo qual o estorno não pode ser feito; `null` = permitido. Espelha `comandaItemReverseBlockReason`. */
export function comandaItemReverseBlockReason(
  comanda: Pick<ArenaComanda, 'status' | 'itemsTotalCents' | 'rentalCents' | 'paidCents'>,
  item: Pick<ArenaComandaItem, 'quantity' | 'lineTotalCents'>,
): string | null {
  if (!comandaStatusIsActive(comanda.status)) {
    return 'Comanda não está aberta para estorno.';
  }
  if (item.quantity <= 0 || item.lineTotalCents <= 0) {
    return 'Item inválido para estorno.';
  }
  const newItemsTotal = comanda.itemsTotalCents - item.lineTotalCents;
  if (newItemsTotal < 0) {
    return 'Total de consumo inconsistente.';
  }
  const newTotal = comanda.rentalCents + newItemsTotal;
  if (comanda.paidCents > newTotal) {
    return 'Estorne pagamentos antes de remover itens já cobertos.';
  }
  return null;
}

/** Motivo pelo qual a comanda vazia não pode ser fechada; `null` = permitido.
 *  Comandas sem nenhum lançamento (`totalCents === 0`) nunca passam pelo fluxo
 *  normal de pagamento — `registerPayment` exige `amountCents > 0` — então
 *  precisam de um fechamento direto. */
export function comandaCloseEmptyBlockReason(
  comanda: Pick<ArenaComanda, 'status' | 'totalCents'>,
): string | null {
  if (!comandaStatusIsActive(comanda.status)) {
    return 'Comanda já não está aberta.';
  }
  if (comanda.totalCents !== 0) {
    return 'Comanda tem consumo lançado — registre o pagamento para fechar.';
  }
  return null;
}
