/**
 * Regras puras do cashback do atleta (sem I/O): ganho, consumo dos lotes,
 * vencimento e a decisão de liberar um lote pendente.
 */
import {Timestamp} from "firebase-admin/firestore";
import {eventDateFromDayKeyAndTime} from "./event-timezone";
import type {CashbackConfig} from "./cashback-config";

export type CashbackSourceType = "registration" | "booking" | "club";

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCentsBrl(cents: number): string {
  return `R$ ${(Math.round(cents) / 100).toFixed(2).replace(".", ",")}`;
}

/** % do dinheiro pago, travado numa fração da taxa da nexaGO; sempre para baixo. */
export function computeEarnCents(params: {
  cashCents: number;
  feeCents: number;
  config: Pick<CashbackConfig, "ratePercent" | "maxShareOfFee">;
}): number {
  const {cashCents, feeCents, config} = params;
  if (cashCents <= 0 || feeCents <= 0) return 0;
  const byRate = Math.floor((cashCents * config.ratePercent) / 100);
  const byFee = Math.floor(feeCents * config.maxShareOfFee);
  return Math.max(0, Math.min(byRate, byFee));
}

export type LotBalance = {lotId: string; remainingCents: number; expiresAtMs: number};
export type LotAllocation = {lotId: string; cents: number};

/** Consome primeiro o que vence primeiro; empate pelo id, para ser determinístico. */
export function allocateFifo(lots: LotBalance[], amountCents: number): LotAllocation[] {
  const ordered = lots
    .filter((lot) => lot.remainingCents > 0)
    .sort((a, b) =>
      a.expiresAtMs - b.expiresAtMs || (a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0));
  const allocations: LotAllocation[] = [];
  let left = amountCents;
  for (const lot of ordered) {
    if (left <= 0) break;
    const cents = Math.min(lot.remainingCents, left);
    allocations.push({lotId: lot.lotId, cents});
    left -= cents;
  }
  if (left > 0) throw new Error("CASHBACK_INSUFFICIENT_BALANCE");
  return allocations;
}

/** Soma meses mantendo dia e hora; dia inexistente no mês de destino vira o último dia. */
export function computeExpiresAtMs(releasedAtMs: number, months: number): number {
  const d = new Date(releasedAtMs);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.getTime();
}

/** Timestamp, Date, ISO ou millis → millis; qualquer outra coisa → null. */
export function toMillisOrNull(raw: unknown): number | null {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime();
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/** Início da reserva (`date` YYYY-MM-DD + `startTime` HH:mm) no fuso do evento. */
export function bookingEventAtMs(date: unknown, startTime: unknown): number | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof startTime !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(startTime.trim());
  if (!m) return null;
  return eventDateFromDayKeyAndTime(date, Number(m[1]), Number(m[2])).getTime();
}

/** Estado atual da origem de um lote, lido pela varredura diária. */
export type CashbackSourceState =
  | {sourceType: "booking"; exists: boolean; status: string; eventAtMs: number | null}
  | {
    sourceType: "registration";
    exists: boolean;
    cancellationPending: boolean;
    tournamentCancelled: boolean;
    eventAtMs: number | null;
  }
  | {
    sourceType: "club";
    exists: boolean;
    participantStatus: string;
    sessionStatus: string;
    eventAtMs: number | null;
  };

export type ReleaseDecision =
  | {kind: "release"}
  | {kind: "cancel"; reason: string}
  | {kind: "wait"; eventAtMs: number | null};

const BOOKING_CANCELLED_STATUSES = new Set(["canceled", "cancelled"]);

/**
 * Pendente → disponível quando o evento aconteceu e o vínculo continua de pé.
 * Vínculo que caiu cancela o lote — é isso que cobre o estorno manual "por
 * fora" sem precisar detectá-lo. Pedido de cancelamento pendente espera.
 */
export function releaseDecision(state: CashbackSourceState, nowMs: number): ReleaseDecision {
  if (!state.exists) return {kind: "cancel", reason: "source_missing"};
  if (state.sourceType === "booking") {
    if (BOOKING_CANCELLED_STATUSES.has(state.status.toLowerCase())) {
      return {kind: "cancel", reason: "booking_cancelled"};
    }
  } else if (state.sourceType === "registration") {
    if (state.tournamentCancelled) return {kind: "cancel", reason: "tournament_cancelled"};
    if (state.cancellationPending) return {kind: "wait", eventAtMs: null};
  } else {
    if (state.sessionStatus.toLowerCase() === "canceled") {
      return {kind: "cancel", reason: "session_cancelled"};
    }
    if (state.participantStatus !== "confirmed") {
      return {kind: "cancel", reason: "participant_left"};
    }
  }
  if (state.eventAtMs != null && state.eventAtMs > nowMs) {
    return {kind: "wait", eventAtMs: state.eventAtMs};
  }
  return {kind: "release"};
}
