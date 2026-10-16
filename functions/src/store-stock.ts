/**
 * Estoque da Loja: regras que dá para decidir sem banco (entrada, custo médio,
 * frete rateado, transferência). As callables em `store-stock-write.ts` só
 * leem, aplicam isto e gravam — o miolo fica testável sem Firestore.
 */
import {slugify} from "./store-catalog";

export type EntrySubtype = "compra" | "devolucao" | "ajuste" | "producao";
export type TransferStatus = "rascunho" | "separacao" | "em_transito" | "recebido" | "cancelada";
export type TransferAction = "separacao" | "em_transito" | "recebido" | "cancelar";

export const ENTRY_SUBTYPES: EntrySubtype[] = ["compra", "devolucao", "ajuste", "producao"];

/** Teto de linhas por entrada/transferência: cada linha toca SKU + produto + custo na transação. */
export const MAX_STOCK_LINES = 60;

/** Diferença acima disso entre o custo digitado e a última compra gera o alerta da 06a. */
export const COST_ALERT_PERCENT = 5;

/** Dias de giro que a sugestão da transferência tenta cobrir no destino. */
export const COVERAGE_DAYS = 14;

/**
 * Custo médio ponderado (06a):
 * `(qtdAtual × custoMédio + qtdEntrada × custoEntrada) / (qtdAtual + qtdEntrada)`.
 * Sem custo anterior, ou saldo zerado/negativo, o custo da entrada vira o médio.
 */
export function weightedAverageCost(
  currentQty: number,
  currentAvgCents: number | null,
  inQty: number,
  inUnitCents: number,
): number {
  if (inQty <= 0) {
    return currentAvgCents ?? inUnitCents;
  }
  if (currentAvgCents === null || currentQty <= 0) {
    return inUnitCents;
  }
  return Math.round((currentQty * currentAvgCents + inQty * inUnitCents) / (currentQty + inQty));
}

/**
 * Frete rateado no custo unitário, proporcional ao valor de cada linha. Linha
 * sem valor (custo zero em todas) divide pelo número de unidades. O resto do
 * arredondamento vai para a última linha, para a soma bater com o frete.
 */
export function unitCostsWithFreight(
  lines: {qty: number; unitCostCents: number}[],
  freightCents: number,
): number[] {
  const values = lines.map((l) => Math.max(0, l.qty) * l.unitCostCents);
  const totalValue = values.reduce((a, b) => a + b, 0);
  const totalQty = lines.reduce((a, l) => a + Math.max(0, l.qty), 0);
  if (freightCents <= 0 || totalQty === 0) {
    return lines.map((l) => l.unitCostCents);
  }
  const shares = lines.map((l, i) =>
    totalValue > 0 ? (freightCents * values[i]!) / totalValue : (freightCents * Math.max(0, l.qty)) / totalQty,
  );
  const rounded = shares.map((s) => Math.round(s));
  const drift = freightCents - rounded.reduce((a, b) => a + b, 0);
  const lastWithQty = lines.map((l) => l.qty > 0).lastIndexOf(true);
  if (lastWithQty >= 0) rounded[lastWithQty]! += drift;
  return lines.map((l, i) => (l.qty > 0 ? l.unitCostCents + Math.round(rounded[i]! / l.qty) : l.unitCostCents));
}

/** % de diferença para a última compra; `null` sem referência. Positivo = mais caro. */
export function costDeviationPercent(unitCents: number, lastCents: number | null): number | null {
  if (lastCents === null || lastCents <= 0) {
    return null;
  }
  return ((unitCents - lastCents) / lastCents) * 100;
}

/** Chave de unicidade da NF: mesmo fornecedor + mesmo número = mesma nota. */
export function nfKey(supplier: string, nfNumber: string): string {
  return `nf:${slugify(supplier)}:${nfNumber.trim().replace(/\D+/g, "") || nfNumber.trim()}`;
}

export function transferCode(n: number): string {
  return `TR-${String(n).padStart(3, "0")}`;
}

const TRANSITIONS: Record<TransferStatus, TransferAction[]> = {
  rascunho: ["separacao", "cancelar"],
  separacao: ["em_transito", "cancelar"],
  em_transito: ["recebido"],
  recebido: [],
  cancelada: [],
};

/** Status que a ação leva, ou `null` se a ação não vale a partir do status atual. */
export function nextTransferStatus(current: TransferStatus, action: TransferAction): TransferStatus | null {
  if (!TRANSITIONS[current].includes(action)) {
    return null;
  }
  return action === "cancelar" ? "cancelada" : action;
}

/** Disponível para sair do local: saldo menos o que já está reservado ali. */
export function availableAt(
  sku: {stockByLocation?: Record<string, number>; reservedByLocation?: Record<string, number>},
  locationId: string,
): number {
  return Math.max(0, (sku.stockByLocation?.[locationId] ?? 0) - (sku.reservedByLocation?.[locationId] ?? 0));
}

/**
 * Sugerido da 06b: `max(0, ceil(saídaDiária × dias) + reservadosPendentes − qtdDestino)`,
 * limitado ao disponível na origem. Sem saídas registradas, cobre só até o alerta do produto.
 */
export function suggestedTransferQty(input: {
  dailyOut: number;
  reservedPending: number;
  destQty: number;
  originAvailable: number;
  threshold: number;
  days?: number;
}): number {
  const days = input.days ?? COVERAGE_DAYS;
  const target = input.dailyOut > 0 ? Math.ceil(input.dailyOut * days) : input.threshold;
  const need = Math.max(0, target + input.reservedPending - input.destQty);
  return Math.min(need, Math.max(0, input.originAvailable));
}
