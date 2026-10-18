/**
 * NexaSquad: comissões dos embaixadores e repasse quinzenal (backoffice › Squad › Comissões).
 *
 *   squadCommissions/{id}            — uma por inscrição × embaixador. `pending` → `released` (pagamento
 *                                      confirmado) → `paid` (repasse aprovado); `canceled` em reembolso,
 *                                      chargeback, pagamento não concluído ou ação manual.
 *   squadCommissionAdjustments/{id}  — negativo de comissão já paga que foi cancelada; sai do próximo repasse.
 *   squadPayouts/{YYYY-MM-DD}        — o repasse daquela data (id = data: aprovar duas vezes é impossível).
 *   squadWallets/{uid}               — carteira do embaixador (saldo sacável; não é a de cashback, que
 *                                      vence e não saca). Extrato em `transactions/{payoutId}`.
 *   squadAmbassadors/{uid}           — contrato vigente (nível, % e versão das regras). Escrito pelas
 *                                      telas de Embaixadores/Perfil; aqui só é lido para reatribuir.
 *   squadConfig/payout               — `{days, minNetCents}`; padrão dias 06 e 20, mínimo R$ 20.
 *
 * A criação da comissão (atribuição no checkout) e a liberação pelo webhook do Asaas chegam com a
 * atribuição por código/link/QR. Este módulo cobre o que a tela de Comissões aciona: aprovar o
 * repasse, reter, cancelar e reatribuir. As rules negam escrita de cliente em tudo acima.
 *
 * Espelhado à mão em `frontend/projects/backoffice/src/app/painel/squad/comissoes/data/` (ciclo do
 * repasse e plano por embaixador): mudou aqui, muda lá.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {SQUAD_CONFIG, type Actor} from "./squad-rules";

export const SQUAD_COMMISSIONS = "squadCommissions";
export const SQUAD_ADJUSTMENTS = "squadCommissionAdjustments";
export const SQUAD_PAYOUTS = "squadPayouts";
export const SQUAD_WALLETS = "squadWallets";
export const SQUAD_AMBASSADORS = "squadAmbassadors";
export const PAYOUT_CONFIG_DOC = "payout";

export const DEFAULT_PAYOUT_CONFIG = {days: [6, 20], minNetCents: 20_00};

/** Limite de uma transação do Firestore (500 escritas), com folga para carteira e extrato. */
const MAX_WRITES_PER_AMBASSADOR = 450;
const REASON_MAX = 280;
/** A callable tem 300 s; depois de 10 min "processando" é resto de uma execução que caiu. */
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Brasil sem horário de verão desde 2019: meia-noite de SP é sempre 03:00 UTC. */
const SP_OFFSET = "-03:00";

export type CommissionStatus = "pending" | "released" | "paid" | "canceled";
export type CancelReason = "refund" | "chargeback" | "payment_failed" | "manual";

export interface TimelineEntry {
  at: Date;
  event: string;
  by: Actor | null;
  note: string | null;
}

export interface CommissionHold {
  payoutDate: string;
  reason: string;
  by: Actor;
  at: Date;
}

export interface PayoutConfig {
  days: number[];
  minNetCents: number;
}

// ── datas civis de São Paulo ────────────────────────────────────────────────

export function spDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(date);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Primeira data ≥ `fromKey` cujo dia do mês está em `days`. */
export function nextPayoutDate(fromKey: string, days: number[]): string {
  for (let i = 0; i < 62; i++) {
    const key = addDays(fromKey, i);
    if (days.includes(Number(key.slice(8, 10)))) return key;
  }
  throw new Error("Calendário de repasse sem dia válido.");
}

/**
 * O repasse em aberto: o primeiro dia de repasse depois do último aprovado (ou a partir de hoje,
 * se nenhum foi aprovado). Um repasse atrasado continua sendo o da vez até alguém aprová-lo.
 */
export function openPayoutDate(todayKey: string, lastDoneKey: string | null, days: number[]): string {
  return nextPayoutDate(lastDoneKey ? addDays(lastDoneKey, 1) : todayKey, days);
}

/** Fecha às 23:59 do dia anterior: entra o que foi liberado antes da meia-noite do dia do repasse. */
export function payoutCutoff(payoutDate: string): Date {
  return new Date(`${payoutDate}T00:00:00${SP_OFFSET}`);
}

// ── plano do repasse ────────────────────────────────────────────────────────

export interface PlanCommission {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  amountCents: number;
  releasedAt: Date | null;
  hold: {payoutDate: string; reason: string} | null;
}

export interface PlanAdjustment {
  id: string;
  ambassadorId: string;
  ambassadorName: string;
  amountCents: number;
}

export type PlanStatus = "included" | "accumulating" | "held";

export interface PlanRow {
  ambassadorId: string;
  ambassadorName: string;
  commissionIds: string[];
  adjustmentIds: string[];
  heldCommissionIds: string[];
  grossCents: number;
  adjustmentsCents: number;
  netCents: number;
  status: PlanStatus;
  holdReason: string | null;
}

/**
 * Agrupa por embaixador o que está liberado até o fechamento. Retido para esta data sai da conta;
 * líquido abaixo do mínimo (inclusive negativo, quando só há ajuste) fica acumulando para o próximo.
 */
export function planPayout(input: {
  payoutDate: string;
  cutoff: Date;
  commissions: PlanCommission[];
  adjustments: PlanAdjustment[];
  minNetCents: number;
}): PlanRow[] {
  const rows = new Map<string, PlanRow>();
  const row = (ambassadorId: string, name: string) => {
    let r = rows.get(ambassadorId);
    if (!r) {
      r = {
        ambassadorId,
        ambassadorName: name,
        commissionIds: [],
        adjustmentIds: [],
        heldCommissionIds: [],
        grossCents: 0,
        adjustmentsCents: 0,
        netCents: 0,
        status: "included",
        holdReason: null,
      };
      rows.set(ambassadorId, r);
    } else if (!r.ambassadorName && name) {
      r.ambassadorName = name;
    }
    return r;
  };

  for (const c of input.commissions) {
    if (!c.releasedAt || c.releasedAt.getTime() >= input.cutoff.getTime()) continue;
    const r = row(c.ambassadorId, c.ambassadorName);
    if (c.hold && c.hold.payoutDate === input.payoutDate) {
      r.heldCommissionIds.push(c.id);
      r.holdReason ??= c.hold.reason;
      continue;
    }
    r.commissionIds.push(c.id);
    r.grossCents += c.amountCents;
  }
  for (const a of input.adjustments) {
    const r = row(a.ambassadorId, a.ambassadorName);
    r.adjustmentIds.push(a.id);
    r.adjustmentsCents += a.amountCents;
  }
  for (const r of rows.values()) {
    r.netCents = r.grossCents + r.adjustmentsCents;
    if (r.commissionIds.length === 0 && r.heldCommissionIds.length > 0) {
      r.status = "held";
    } else if (r.netCents < input.minNetCents) {
      r.status = "accumulating";
    }
  }
  return [...rows.values()].sort((a, b) => a.ambassadorName.localeCompare(b.ambassadorName, "pt-BR"));
}

// ── leitura ─────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return null;
}

function holdOf(v: unknown): PlanCommission["hold"] {
  if (!v || typeof v !== "object") return null;
  const h = v as Raw;
  return typeof h["payoutDate"] === "string" ? {payoutDate: h["payoutDate"], reason: String(h["reason"] ?? "")} : null;
}

function planCommissionOf(id: string, d: Raw): PlanCommission {
  return {
    id,
    ambassadorId: String(d["ambassadorId"] ?? ""),
    ambassadorName: String(d["ambassadorName"] ?? ""),
    amountCents: Number(d["amountCents"] ?? 0),
    releasedAt: dateOf(d["releasedAt"]),
    hold: holdOf(d["hold"]),
  };
}

export async function loadPayoutConfig(db: Firestore): Promise<PayoutConfig> {
  const snap = await db.collection(SQUAD_CONFIG).doc(PAYOUT_CONFIG_DOC).get();
  const d = snap.exists ? snap.data()! : {};
  const days = Array.isArray(d["days"]) ?
    (d["days"] as unknown[]).filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 28) :
    [];
  const min = d["minNetCents"];
  return {
    days: days.length > 0 ? days : DEFAULT_PAYOUT_CONFIG.days,
    minNetCents: typeof min === "number" && Number.isInteger(min) && min >= 0 ? min : DEFAULT_PAYOUT_CONFIG.minNetCents,
  };
}

/** Último repasse concluído (`done`); os repasses são poucos, então lê todos. */
export async function lastDonePayout(db: Firestore): Promise<string | null> {
  const snap = await db.collection(SQUAD_PAYOUTS).get();
  return snap.docs
    .filter((d) => d.data()["status"] === "done")
    .map((d) => d.id)
    .sort()
    .pop() ?? null;
}

// ── aprovar repasse ─────────────────────────────────────────────────────────

export interface PayoutItem {
  ambassadorId: string;
  ambassadorName: string;
  commissionIds: string[];
  adjustmentIds: string[];
  grossCents: number;
  adjustmentsCents: number;
  netCents: number;
  status: "credited" | "failed" | "held";
  holdReason: string | null;
}

export interface ApproveResult {
  payoutId: string;
  status: "done" | "partial";
  creditedCount: number;
  failedCount: number;
  totalCents: number;
}

export type PayoutNotify = (uid: string, netCents: number, payoutDate: string) => Promise<void>;

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function shortDate(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/**
 * Credita um embaixador numa transação só: relê as comissões (alguém pode ter cancelado ou retido no
 * meio), marca `paid`, amarra os ajustes, soma na carteira e grava o extrato com id = repasse.
 * Devolve o item como ficou; `null` quando, relido, não sobrou o mínimo para pagar.
 */
async function creditAmbassador(
  db: Firestore,
  row: PlanRow,
  payoutDate: string,
  cutoff: Date,
  minNetCents: number,
  actor: Actor,
  now: Date,
): Promise<PayoutItem | null> {
  if (row.commissionIds.length + row.adjustmentIds.length > MAX_WRITES_PER_AMBASSADOR) {
    throw new Error(`Comissões demais para uma transação (${row.commissionIds.length}).`);
  }
  return db.runTransaction(async (tx) => {
    const cRefs = row.commissionIds.map((id) => db.collection(SQUAD_COMMISSIONS).doc(id));
    const aRefs = row.adjustmentIds.map((id) => db.collection(SQUAD_ADJUSTMENTS).doc(id));
    const walletRef = db.collection(SQUAD_WALLETS).doc(row.ambassadorId);
    const entryRef = walletRef.collection("transactions").doc(payoutDate);
    const cSnaps = await Promise.all(cRefs.map((r) => tx.get(r)));
    const aSnaps = await Promise.all(aRefs.map((r) => tx.get(r)));
    const [wallet, entry] = await Promise.all([tx.get(walletRef), tx.get(entryRef)]);
    if (entry.exists) {
      // Já creditado numa tentativa anterior: nunca credita duas vezes o mesmo repasse.
      const e = entry.data()!;
      return {...itemOf(row, "credited"), netCents: Number(e["amountCents"] ?? row.netCents)};
    }

    const commissions = cSnaps.filter((s) => {
      const d = s.data();
      const c = d ? planCommissionOf(s.id, d) : null;
      return !!d && !!c && d["status"] === "released" && (d["payoutId"] ?? null) === null &&
        !!c.releasedAt && c.releasedAt < cutoff && c.hold?.payoutDate !== payoutDate;
    });
    const adjustments = aSnaps.filter((s) => s.exists && (s.data()!["payoutId"] ?? null) === null);
    const gross = commissions.reduce((n, s) => n + Number(s.data()!["amountCents"] ?? 0), 0);
    const adj = adjustments.reduce((n, s) => n + Number(s.data()!["amountCents"] ?? 0), 0);
    const net = gross + adj;
    if (commissions.length === 0 || net < minNetCents) return null;

    const entryLog: TimelineEntry = {at: now, event: "paid", by: actor, note: `Repasse ${payoutDate}`};
    for (const s of commissions) {
      const timeline = Array.isArray(s.data()!["timeline"]) ? (s.data()!["timeline"] as unknown[]) : [];
      tx.update(s.ref, {status: "paid", payoutId: payoutDate, paidAt: now, timeline: [...timeline, entryLog]});
    }
    for (const s of adjustments) tx.update(s.ref, {payoutId: payoutDate});
    const balance = Number(wallet.data()?.["balanceCents"] ?? 0);
    tx.set(walletRef, {balanceCents: balance + net, updatedAt: now}, {merge: true});
    tx.set(entryRef, {
      type: "squad_commission",
      amountCents: net,
      grossCents: gross,
      adjustmentsCents: adj,
      payoutId: payoutDate,
      commissionIds: commissions.map((s) => s.id),
      adjustmentIds: adjustments.map((s) => s.id),
      label: `Repasse de ${shortDate(payoutDate)} · indicações`,
      createdAt: now,
    });
    return {
      ...itemOf(row, "credited"),
      commissionIds: commissions.map((s) => s.id),
      adjustmentIds: adjustments.map((s) => s.id),
      grossCents: gross,
      adjustmentsCents: adj,
      netCents: net,
    };
  });
}

function itemOf(row: PlanRow, status: PayoutItem["status"]): PayoutItem {
  return {
    ambassadorId: row.ambassadorId,
    ambassadorName: row.ambassadorName,
    commissionIds: status === "held" ? row.heldCommissionIds : row.commissionIds,
    adjustmentIds: status === "held" ? [] : row.adjustmentIds,
    grossCents: row.grossCents,
    adjustmentsCents: row.adjustmentsCents,
    netCents: row.netCents,
    status,
    holdReason: status === "held" ? row.holdReason : null,
  };
}

export async function approvePayoutCore(
  db: Firestore,
  input: {payoutDate: string},
  actor: Actor,
  now: Date,
  notify: PayoutNotify,
): Promise<ApproveResult> {
  const payoutDate = input?.payoutDate;
  if (typeof payoutDate !== "string" || !DATE_RE.test(payoutDate)) {
    throw new HttpsError("invalid-argument", "Data do repasse inválida.", {fields: ["payoutDate"]});
  }
  const config = await loadPayoutConfig(db);
  const open = openPayoutDate(spDateKey(now), await lastDonePayout(db), config.days);
  if (payoutDate !== open) {
    throw new HttpsError("failed-precondition", `O repasse em aberto é o de ${shortDate(open)}. Recarregue a tela.`);
  }

  const payoutRef = db.collection(SQUAD_PAYOUTS).doc(payoutDate);
  const previous = await db.runTransaction(async (tx) => {
    const snap = await tx.get(payoutRef);
    const d = snap.exists ? snap.data()! : null;
    if (d?.["status"] === "done") {
      throw new HttpsError("failed-precondition", "Este repasse já foi aprovado.");
    }
    // Processando há pouco = outro clique/aba no meio. Parado há mais que isso = função que caiu.
    const startedAt = dateOf(d?.["approvedAt"]);
    if (d?.["status"] === "processing" && startedAt && now.getTime() - startedAt.getTime() < PROCESSING_STALE_MS) {
      throw new HttpsError("failed-precondition", "Este repasse já está sendo processado.");
    }
    tx.set(payoutRef, {
      scheduledFor: payoutDate,
      status: "processing",
      approvedBy: actor,
      approvedAt: now,
      items: d?.["items"] ?? [],
      totalCents: d?.["totalCents"] ?? 0,
    }, {merge: true});
    return (Array.isArray(d?.["items"]) ? d!["items"] : []) as PayoutItem[];
  });

  const cutoff = new Date(Math.min(now.getTime(), payoutCutoff(payoutDate).getTime()));
  const [cSnap, aSnap] = await Promise.all([
    db.collection(SQUAD_COMMISSIONS).where("status", "==", "released").get(),
    db.collection(SQUAD_ADJUSTMENTS).where("payoutId", "==", null).get(),
  ]);
  const plan = planPayout({
    payoutDate,
    cutoff,
    commissions: cSnap.docs.filter((d) => (d.data()["payoutId"] ?? null) === null).map((d) => planCommissionOf(d.id, d.data())),
    adjustments: aSnap.docs.map((d) => ({
      id: d.id,
      ambassadorId: String(d.data()["ambassadorId"] ?? ""),
      ambassadorName: String(d.data()["ambassadorName"] ?? ""),
      amountCents: Number(d.data()["amountCents"] ?? 0),
    })),
    minNetCents: config.minNetCents,
  });

  // Tentativa anterior (parcial): o que já foi creditado fica; o resto é refeito pelo plano novo.
  const items = new Map<string, PayoutItem>(
    previous.filter((i) => i.status === "credited").map((i) => [i.ambassadorId, i]),
  );
  const credited: PayoutItem[] = [];
  for (const row of plan) {
    if (row.status === "held") {
      items.set(row.ambassadorId, itemOf(row, "held"));
      continue;
    }
    if (row.status !== "included") continue;
    try {
      const item = await creditAmbassador(db, row, payoutDate, cutoff, config.minNetCents, actor, now);
      if (item) {
        items.set(row.ambassadorId, item);
        credited.push(item);
      }
    } catch (err) {
      logger.error("Crédito de repasse do Squad falhou", {payoutDate, ambassadorId: row.ambassadorId, err});
      items.set(row.ambassadorId, itemOf(row, "failed"));
    }
  }

  const all = [...items.values()];
  const failedCount = all.filter((i) => i.status === "failed").length;
  const creditedItems = all.filter((i) => i.status === "credited");
  const totalCents = creditedItems.reduce((n, i) => n + i.netCents, 0);
  const status = failedCount > 0 ? "partial" : "done";
  await payoutRef.set({
    scheduledFor: payoutDate,
    status,
    approvedBy: actor,
    approvedAt: now,
    items: all,
    totalCents,
    creditedCount: creditedItems.length,
    failedCount,
    finishedAt: now,
  });

  for (const item of credited) {
    try {
      await notify(item.ambassadorId, item.netCents, payoutDate);
    } catch (err) {
      logger.warn("Aviso de repasse do Squad falhou", {payoutDate, ambassadorId: item.ambassadorId, err});
    }
  }
  return {payoutId: payoutDate, status, creditedCount: creditedItems.length, failedCount, totalCents};
}

// ── reter, cancelar, reatribuir ─────────────────────────────────────────────

function reasonOf(v: unknown): string {
  if (typeof v !== "string" || v.trim().length < 3 || v.trim().length > REASON_MAX) {
    throw new HttpsError("invalid-argument", "Informe um motivo (3 a 280 caracteres).", {fields: ["reason"]});
  }
  return v.trim();
}

function timelineOf(d: Raw): unknown[] {
  return Array.isArray(d["timeline"]) ? (d["timeline"] as unknown[]) : [];
}

/** Reter (ou soltar, com `reason: null`) comissões liberadas no repasse daquela data. */
export async function setHoldCore(
  db: Firestore,
  input: {commissionIds: string[]; payoutDate: string; reason: string | null},
  actor: Actor,
  now: Date,
): Promise<{updated: number}> {
  const ids = input?.commissionIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((i) => typeof i === "string" && i)) {
    throw new HttpsError("invalid-argument", "Selecione de 1 a 200 comissões.", {fields: ["commissionIds"]});
  }
  if (typeof input.payoutDate !== "string" || !DATE_RE.test(input.payoutDate)) {
    throw new HttpsError("invalid-argument", "Data do repasse inválida.", {fields: ["payoutDate"]});
  }
  const reason = input.reason === null ? null : reasonOf(input.reason);
  return db.runTransaction(async (tx) => {
    const refs = [...new Set(ids)].map((id) => db.collection(SQUAD_COMMISSIONS).doc(id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const bad = snaps.filter((s) => !s.exists || s.data()!["status"] !== "released");
    if (bad.length > 0) {
      throw new HttpsError("failed-precondition", "Só comissões liberadas podem ser retidas. Recarregue a tela.");
    }
    for (const s of snaps) {
      const event: TimelineEntry = {
        at: now,
        event: reason === null ? "hold_released" : "held",
        by: actor,
        note: reason === null ? `Retenção desfeita (${input.payoutDate})` : `${input.payoutDate}: ${reason}`,
      };
      tx.update(s.ref, {
        hold: reason === null ? null : {payoutDate: input.payoutDate, reason, by: actor, at: now},
        timeline: [...timelineOf(s.data()!), event],
      });
    }
    return {updated: snaps.length};
  });
}

/**
 * Cancela uma comissão. Pendente ou liberada só muda de status; paga vira um ajuste negativo,
 * descontado no próximo repasse (o dinheiro já está na carteira dele).
 */
export async function cancelCommissionCore(
  db: Firestore,
  input: {commissionId: string; reason: string},
  actor: Actor,
  now: Date,
): Promise<{status: CommissionStatus; adjustmentId: string | null}> {
  if (typeof input?.commissionId !== "string" || !input.commissionId) {
    throw new HttpsError("invalid-argument", "Comissão inválida.", {fields: ["commissionId"]});
  }
  const reason = reasonOf(input.reason);
  const ref = db.collection(SQUAD_COMMISSIONS).doc(input.commissionId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Comissão não encontrada.");
    const d = snap.data()!;
    if (d["status"] === "canceled") throw new HttpsError("failed-precondition", "Esta comissão já está cancelada.");
    let adjustmentId: string | null = null;
    if (d["status"] === "paid") {
      const adjRef = db.collection(SQUAD_ADJUSTMENTS).doc(`${snap.id}_manual`);
      adjustmentId = adjRef.id;
      tx.set(adjRef, {
        commissionId: snap.id,
        ambassadorId: d["ambassadorId"],
        ambassadorName: d["ambassadorName"] ?? "",
        amountCents: -Number(d["amountCents"] ?? 0),
        reason: "manual",
        note: reason,
        payoutId: null,
        createdAt: now,
        createdBy: actor,
      });
    }
    tx.update(ref, {
      status: "canceled",
      cancelReason: "manual",
      cancelNote: reason,
      canceledAt: now,
      hold: null,
      timeline: [...timelineOf(d), {at: now, event: "canceled", by: actor, note: reason}],
    });
    return {status: "canceled" as const, adjustmentId};
  });
}

/** Passa a comissão a outro embaixador (só antes de paga) e recalcula com o % do contrato dele. */
export async function reassignCommissionCore(
  db: Firestore,
  input: {commissionId: string; ambassadorId: string; reason: string},
  actor: Actor,
  now: Date,
): Promise<{amountCents: number; pct: number}> {
  if (typeof input?.commissionId !== "string" || !input.commissionId) {
    throw new HttpsError("invalid-argument", "Comissão inválida.", {fields: ["commissionId"]});
  }
  if (typeof input.ambassadorId !== "string" || !input.ambassadorId) {
    throw new HttpsError("invalid-argument", "Escolha o embaixador.", {fields: ["ambassadorId"]});
  }
  const reason = reasonOf(input.reason);
  const ref = db.collection(SQUAD_COMMISSIONS).doc(input.commissionId);
  const ambassadorRef = db.collection(SQUAD_AMBASSADORS).doc(input.ambassadorId);
  return db.runTransaction(async (tx) => {
    const [snap, amb] = await Promise.all([tx.get(ref), tx.get(ambassadorRef)]);
    if (!snap.exists) throw new HttpsError("not-found", "Comissão não encontrada.");
    const d = snap.data()!;
    if (d["status"] !== "pending" && d["status"] !== "released") {
      throw new HttpsError("failed-precondition", "Só comissão aguardando ou liberada pode ser reatribuída.");
    }
    if (d["ambassadorId"] === input.ambassadorId) {
      throw new HttpsError("failed-precondition", "A comissão já é deste embaixador.");
    }
    const a = amb.exists ? amb.data()! : null;
    const pct = a?.["commissionPct"];
    if (!a || a["status"] !== "active" || typeof pct !== "number" || !(pct >= 0 && pct <= 30)) {
      throw new HttpsError("failed-precondition", "Este embaixador não tem contrato ativo com comissão definida.");
    }
    const amountCents = Math.round(Number(d["netCents"] ?? 0) * pct / 100);
    tx.update(ref, {
      ambassadorId: input.ambassadorId,
      ambassadorName: String(a["displayName"] ?? ""),
      ambassadorCode: a["code"] ?? null,
      ambassadorTier: a["tier"] ?? null,
      pct,
      amountCents,
      rulesVersion: a["rulesVersion"] ?? d["rulesVersion"] ?? null,
      hold: null,
      timeline: [...timelineOf(d), {
        at: now,
        event: "reassigned",
        by: actor,
        note: `${String(d["ambassadorName"] ?? d["ambassadorId"])} → ${String(a["displayName"] ?? input.ambassadorId)}: ${reason}`,
      }],
    });
    return {amountCents, pct};
  });
}

// ── callables ───────────────────────────────────────────────────────────────

async function assertSquadOperator(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma operam as comissões do Squad.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

async function notifyPayout(uid: string, netCents: number): Promise<void> {
  await deliverNotificationToUser({
    userId: uid,
    title: "Repasse do NexaSquad",
    body: `${brl(netCents)} das suas indicações caiu na sua carteira.`,
    type: "squad_payout",
    data: {amountCents: String(netCents)},
  });
}

export const approveSquadPayout = onCall(
  {...BACKOFFICE_CALLABLE, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT], timeoutSeconds: 300},
  async (request) => {
    const actor = await assertSquadOperator(request.auth?.uid);
    return approvePayoutCore(getFirestore(), (request.data ?? {}) as {payoutDate: string}, actor, new Date(), notifyPayout);
  },
);

export const setSquadCommissionHold = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertSquadOperator(request.auth?.uid);
  return setHoldCore(getFirestore(), (request.data ?? {}) as Parameters<typeof setHoldCore>[1], actor, new Date());
});

export const cancelSquadCommission = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertSquadOperator(request.auth?.uid);
  return cancelCommissionCore(getFirestore(), (request.data ?? {}) as {commissionId: string; reason: string}, actor, new Date());
});

export const reassignSquadCommission = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertSquadOperator(request.auth?.uid);
  return reassignCommissionCore(
    getFirestore(),
    (request.data ?? {}) as {commissionId: string; ambassadorId: string; reason: string},
    actor,
    new Date(),
  );
});
