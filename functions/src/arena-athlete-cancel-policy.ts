/**
 * Política da arena para o cancelamento feito pelo atleta dentro do prazo grátis
 * (`arenas/{id}.athleteCancelPolicy`):
 *
 * - `refund` + `refundPercent: 100` — estorno integral pelo mesmo meio (padrão);
 * - `refund` + 75/50/25 — estorno parcial; a arena fica com o resto;
 * - `credit` — nada volta em dinheiro: o valor pago vira crédito do atleta na arena
 *   (o mesmo saldo dos créditos de chuva, usado sozinho na próxima reserva).
 *
 * A reserva guarda uma cópia (`cancelPolicy`) na criação: mudar a política vale para
 * reservas novas, nunca para quem já reservou. Reserva sem cópia = estorno integral.
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export type AthleteCancelMode = "refund" | "credit";

export interface AthleteCancelPolicy {
  mode: AthleteCancelMode;
  /** Só vale no `refund`: quanto do valor pago volta (100 = integral). */
  refundPercent: number;
}

export const PARTIAL_REFUND_PERCENT_OPTIONS = [75, 50, 25] as const;
const REFUND_PERCENT_OPTIONS: readonly number[] = [100, ...PARTIAL_REFUND_PERCENT_OPTIONS];

export const DEFAULT_ATHLETE_CANCEL_POLICY: AthleteCancelPolicy = {mode: "refund", refundPercent: 100};

/** Lê a política de um doc (arena ou cópia na reserva). Qualquer coisa estranha = integral. */
export function normalizeAthleteCancelPolicy(raw: unknown): AthleteCancelPolicy {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (d["mode"] === "credit") return {mode: "credit", refundPercent: 0};
  const pct = Number(d["refundPercent"]);
  return {mode: "refund", refundPercent: REFUND_PERCENT_OPTIONS.includes(pct) ? pct : 100};
}

/** Cópia gravada na reserva nova. */
export function athleteCancelPolicySnapshot(arenaData: Record<string, unknown> | undefined): AthleteCancelPolicy {
  return normalizeAthleteCancelPolicy(arenaData?.["athleteCancelPolicy"]);
}

/** A arena (gestor ou equipe com escrita na agenda) grava a política. */
export const saveArenaAthleteCancelPolicy = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {arenaId?: unknown; policy?: unknown};
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  if (!arenaId || arenaId.includes("/")) throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  const db = getFirestore();
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const policy = normalizeAthleteCancelPolicy(data.policy);
  await db.collection("arenas").doc(arenaId).update({
    athleteCancelPolicy: {...policy, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid},
  });
  return {policy};
});
