/**
 * Aulas — modelo de repasse do professor (gravado no cadastro, `classTeachers.payout`) e o gate
 * de quem mexe no repasse. Separado de `arena-class-payout.ts` porque `arena-class.ts` (cadastro
 * do professor) usa estes helpers e o fechamento importa `arena-class.ts`.
 */

import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";

export const PAYOUT_MODELS = ["revenue_share", "per_class", "per_student"] as const;
export type PayoutModelKind = typeof PAYOUT_MODELS[number];

/** Repasse = pagamento direto da arena ao professor (sem maquininha). */
export const PAYOUT_METHODS = ["pix", "transfer", "cash"] as const;
export type PayoutMethod = typeof PAYOUT_METHODS[number];

/**
 * - `revenue_share`: `percent`% da receita das mensalidades pagas no mês (rateada pelos horários);
 * - `per_class`: `amountReais` por aula dada (chamada fechada);
 * - `per_student`: `amountReais` por aluno presente (marca `present` na chamada fechada).
 */
export interface TeacherPayoutModel {
  model: PayoutModelKind;
  percent: number | null;
  amountReais: number | null;
}

export const MAX_PAYOUT_UNIT_REAIS = 10_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lê o modelo gravado; ausente ou inválido = sem modelo (o fechamento pede para definir). */
export function parseTeacherPayoutModel(raw: unknown): TeacherPayoutModel | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const model = String(d["model"] ?? "");
  if (model === "revenue_share") {
    const percent = Number(d["percent"]);
    return Number.isFinite(percent) && percent > 0 && percent <= 100 ?
      {model, percent, amountReais: null} :
      null;
  }
  if (model === "per_class" || model === "per_student") {
    const amount = Number(d["amountReais"]);
    return Number.isFinite(amount) && amount > 0 && amount <= MAX_PAYOUT_UNIT_REAIS ?
      {model, percent: null, amountReais: amount} :
      null;
  }
  return null;
}

/** Valida o modelo vindo do cliente (cadastro do professor). */
export function validateTeacherPayoutModel(raw: unknown): TeacherPayoutModel {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "Modelo de repasse inválido.");
  }
  const d = raw as Record<string, unknown>;
  const model = String(d["model"] ?? "");
  if (!(PAYOUT_MODELS as readonly string[]).includes(model)) {
    throw new HttpsError("invalid-argument", "Modelo de repasse inválido.");
  }
  if (model === "revenue_share") {
    const percent = round2(Number(d["percent"]));
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new HttpsError("invalid-argument", "Percentual do repasse: de 0,01 a 100.");
    }
    return {model, percent, amountReais: null};
  }
  const amount = round2(Number(d["amountReais"]));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PAYOUT_UNIT_REAIS) {
    throw new HttpsError("invalid-argument", "Valor do repasse: de R$ 0,01 a R$ 10.000.");
  }
  return {model: model as PayoutModelKind, percent: null, amountReais: amount};
}

/**
 * Ver o repasse: quem lê o financeiro da arena (dono, gestor, cargo financeiro) — mesma regra
 * das rules de `arenaClassPayouts`. Recepção e manutenção leem a agenda, não o que o professor
 * ganha.
 */
export async function requireClassPayoutReader(db: Firestore, arenaId: string, uid: string): Promise<void> {
  await assertArenaAreaAccess(db, arenaId, uid, "financeiro", "read");
}

/**
 * Mexer no repasse (modelo, fechamento, pagamento): quem escreve nas Aulas E lê o financeiro —
 * na matriz de cargos, só o dono e o gestor. Gate de dinheiro é gestor explícito.
 */
export async function requireClassPayoutManager(db: Firestore, arenaId: string, uid: string): Promise<void> {
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  await assertArenaAreaAccess(db, arenaId, uid, "financeiro", "read");
}
