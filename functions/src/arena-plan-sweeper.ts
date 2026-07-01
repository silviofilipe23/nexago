/**
 * Finaliza planos de arena cuja titularidade expirou (Fase 3 da política de
 * downgrade). Como a titularidade é derivada de data (sem evento), este job
 * diário faz os efeitos colaterais de uma única vez:
 *  - pausa as promoções ativas (deixam de valer na agenda);
 *  - transiciona `planStatus` overdue/canceling → none (limpa tier/validade).
 *
 * Idempotente: após virar `none`, a arena não é mais selecionada.
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {OVERDUE_GRACE_MS} from "./arena-entitlement";

/** Espelha ArenaPlanStatus.entitledAt: titularidade acabou para overdue/canceling? */
export function isEntitlementLapsed(
  status: string,
  activeUntil: Timestamp | null,
  nowMs: number,
): boolean {
  if (status === "overdue") {
    return activeUntil == null || nowMs >= activeUntil.toMillis() + OVERDUE_GRACE_MS;
  }
  if (status === "canceling") {
    return activeUntil == null || nowMs >= activeUntil.toMillis();
  }
  return false;
}

export const finalizeLapsedArenaPlans = onSchedule(
  {schedule: "every day 03:00", timeZone: "America/Sao_Paulo"},
  async () => {
    const db = getFirestore();
    const nowMs = Date.now();
    const snap = await db
      .collection("arenas")
      .where("planStatus", "in", ["overdue", "canceling"])
      .get();

    let finalized = 0;
    let promosPaused = 0;
    for (const arena of snap.docs) {
      const data = arena.data();
      const status = typeof data["planStatus"] === "string" ? data["planStatus"] : "";
      const activeUntil = data["planActiveUntil"] instanceof Timestamp ?
        (data["planActiveUntil"] as Timestamp) :
        null;
      if (!isEntitlementLapsed(status, activeUntil, nowMs)) continue;

      try {
        const promos = await arena.ref
          .collection("promotions")
          .where("active", "==", true)
          .get();
        if (!promos.empty) {
          const batch = db.batch();
          for (const promo of promos.docs) {
            batch.update(promo.ref, {active: false});
          }
          await batch.commit();
          promosPaused += promos.size;
        }
        await arena.ref.set(
          {
            planStatus: "none",
            planTier: FieldValue.delete(),
            planActiveUntil: null,
            planUpdatedAt: FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        finalized++;
      } catch (error) {
        logger.error("finalizeLapsedArenaPlans: falha ao finalizar arena", {
          arenaId: arena.id,
          error,
        });
      }
    }
    logger.info("finalizeLapsedArenaPlans concluído", {finalized, promosPaused});
  },
);
