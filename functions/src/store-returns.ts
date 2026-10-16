/**
 * Trocas & devoluções da Loja (tela 09): regras sem banco. As callables em
 * `store-returns-write.ts` leem, aplicam isto e gravam.
 *
 *   storeReturns/{id}      — a solicitação (TC-xxx) e o histórico.
 *   storeConfig/returns    — prazo e quem paga o frete de devolução.
 */

export const RETURNS_CONFIG_ID = "returns";

export type ReturnReason = "tamanho" | "defeito" | "nao_gostei" | "avaria" | "outro";
export type ReturnResolution = "troca" | "reembolso" | "saldo" | "reenvio";
export type ReturnStatus = "analisar" | "aprovada" | "em_transito" | "concluida" | "recusada";
export type ReturnMethodType = "arena" | "correios";
export type ReturnAction = "aprovar" | "recusar" | "em_transito" | "receber" | "concluir";

export const RETURN_REASONS: ReturnReason[] = ["tamanho", "defeito", "nao_gostei", "avaria", "outro"];
export const RETURN_RESOLUTIONS: ReturnResolution[] = ["troca", "reembolso", "saldo", "reenvio"];

export interface ReturnsConfig {
  /** Dias após a entrega/retirada em que a troca vale sem aviso. */
  windowDays: number;
  /** Devolver na arena não custa nada ao cliente. */
  arenaReturnFree: boolean;
  /** Valor da etiqueta de Correios para devolução. */
  carrierLabelCents: number;
  /** Motivos em que a loja paga a devolução (defeito/avaria por padrão). */
  storePaysReasons: ReturnReason[];
}

/** O que vale enquanto `storeConfig/returns` não existir. O backoffice espelha isto. */
export const DEFAULT_RETURNS_CONFIG: ReturnsConfig = {
  windowDays: 30,
  arenaReturnFree: true,
  carrierLabelCents: 2490,
  storePaysReasons: ["defeito", "avaria"],
};

export function withReturnsDefaults(data: Record<string, unknown> | undefined): ReturnsConfig {
  const saved = (data ?? {}) as Partial<ReturnsConfig>;
  return {
    ...DEFAULT_RETURNS_CONFIG,
    ...saved,
    storePaysReasons: Array.isArray(saved.storePaysReasons)
      ? saved.storePaysReasons.filter((r): r is ReturnReason => RETURN_REASONS.includes(r as ReturnReason))
      : DEFAULT_RETURNS_CONFIG.storePaysReasons,
  };
}

/** Quem paga e quanto custa a devolução, pelo motivo e pelo jeito de devolver. */
export function returnShipping(
  type: ReturnMethodType,
  reason: ReturnReason,
  config: ReturnsConfig,
): {costCents: number; paidBy: "loja" | "cliente"} {
  const storePays = config.storePaysReasons.includes(reason);
  if (type === "arena") {
    return {costCents: config.arenaReturnFree ? 0 : config.carrierLabelCents, paidBy: storePays ? "loja" : "cliente"};
  }
  return {costCents: config.carrierLabelCents, paidBy: storePays ? "loja" : "cliente"};
}

/** Dia corrido desde a entrega (dia 1 = o próprio dia). `null` sem data de entrega. */
export function daysSinceDelivery(deliveredAt: string | null, now: Date): number | null {
  if (!deliveredAt || !/^\d{4}-\d{2}-\d{2}$/.test(deliveredAt)) {
    return null;
  }
  const [y, m, d] = deliveredAt.split("-").map(Number);
  const start = Date.UTC(y!, m! - 1, d!);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

export function withinWindow(deliveredAt: string | null, now: Date, config: ReturnsConfig): boolean {
  const day = daysSinceDelivery(deliveredAt, now);
  return day === null || day <= config.windowDays;
}

/**
 * Próximo status de cada ação. Reenvio por defeito/avaria pode pular o retorno
 * do produto: sai de `aprovada` direto para `concluida` quando o reenvio sai.
 */
export function nextReturnStatus(
  current: ReturnStatus,
  action: ReturnAction,
  ctx: {resolution: ReturnResolution; skipReturn: boolean},
): ReturnStatus | null {
  switch (action) {
    case "aprovar":
      return current === "analisar" ? "aprovada" : null;
    case "recusar":
      return current === "analisar" ? "recusada" : null;
    case "em_transito":
      return current === "aprovada" && !ctx.skipReturn ? "em_transito" : null;
    case "receber":
      return (current === "aprovada" || current === "em_transito") && !ctx.skipReturn ? "concluida" : null;
    case "concluir":
      return current === "aprovada" && ctx.skipReturn ? "concluida" : null;
  }
}

/** Só defeito/avaria com reenvio dispensa a volta do produto. */
export function canSkipReturn(reason: ReturnReason, resolution: ReturnResolution): boolean {
  return resolution === "reenvio" && (reason === "defeito" || reason === "avaria");
}

export function returnCode(n: number): string {
  return `TC-${String(n).padStart(3, "0")}`;
}
