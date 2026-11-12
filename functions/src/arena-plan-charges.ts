/**
 * Mensalidade do plano da arena: mostrar a cobrança em aberto e lembrar o gestor.
 *
 * - `getArenaPlanOpenCharge` (callable): a cobrança que a arena precisa pagar
 *   agora, com o QR do Pix — painel e app mostram "Mensalidade em aberto".
 * - `remindArenaPlanCharges` (9h, São Paulo): push ao dono da arena 3 dias
 *   antes, no dia, 1 dia depois e no último aviso antes de o plano cair.
 *
 * Regras puras em `arena-plan-charges-model.ts`.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {asaasArenaSecrets, fetchAsaas} from "./asaas-client";
import {fetchAsaasPixQrCode} from "./asaas-booking-payment";
import {assertCallerManagesArena} from "./arena-subscription";
import {ARENA_PLANS, normalizeArenaPlanTier} from "./arena-plans";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {dayKeyFromEventDate} from "./event-timezone";
import {
  deliverNotificationToUser,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";
import {
  pickOpenPlanCharge,
  planChargeReminderKey,
  planChargeReminderMessage,
  planChargeReminderStage,
  type AsaasSubscriptionPayment,
  type OpenPlanCharge,
} from "./arena-plan-charges-model";

/** Rotas do aviso: `url` = app (tela do plano), `webUrl` = portal da arena. */
export const ARENA_PLAN_NOTIFICATION_LINKS = {
  url: "/arena/settings/plan",
  webUrl: "/painel/planos",
} as const;

const MAX_SENT_REMINDER_KEYS = 12;

type PaymentsPage ={data?: AsaasSubscriptionPayment[]};

/** Cobranças pendentes e vencidas da assinatura (as duas listas do Asaas). */
async function listOpenSubscriptionPayments(subscriptionId: string): Promise<AsaasSubscriptionPayment[]> {
  const base = `/v3/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=20&status=`;
  const [overdue, pending] = await Promise.all([
    fetchAsaas<PaymentsPage>(`${base}OVERDUE`),
    fetchAsaas<PaymentsPage>(`${base}PENDING`),
  ]);
  return [...(overdue.data ?? []), ...(pending.data ?? [])];
}

/** Trocável no teste: fala com o Asaas. */
export const planChargeSource = {
  listOpen: listOpenSubscriptionPayments,
};

/** Trocável no teste. */
export const planChargeNotifier = {
  send: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) =>
    deliverNotificationToUser({...input, requireInteraction: false}),
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Assinatura viva da arena (`null` sem assinatura ou cancelada). */
function liveSubscriptionId(billing: Record<string, unknown> | undefined): string | null {
  const id = str(billing?.asaasSubscriptionId);
  if (!id || billing?.status === "canceled") return null;
  return id;
}

export type OpenPlanChargeResult = {
  charge: (OpenPlanCharge & {qrCode: string | null; qrCodeBase64: string | null}) | null;
};

export const getArenaPlanOpenCharge = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: asaasArenaSecrets},
  async (request): Promise<OpenPlanChargeResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    const data = (request.data ?? {}) as Record<string, unknown>;
    const arenaId = str(data.arenaId);
    if (!arenaId) throw new HttpsError("invalid-argument", "arenaId é obrigatório.");

    await assertCallerManagesArena(arenaId, callerUid);

    const billing = (await getFirestore().doc(`arenas/${arenaId}/billing/subscription`).get()).data();
    const subscriptionId = liveSubscriptionId(billing);
    if (!subscriptionId) return {charge: null};

    let charge: OpenPlanCharge | null;
    try {
      charge = pickOpenPlanCharge(await planChargeSource.listOpen(subscriptionId));
    } catch (e) {
      logger.error("getArenaPlanOpenCharge: falha ao consultar o Asaas", arenaId, e);
      throw new HttpsError("unavailable", "Não foi possível consultar a mensalidade agora. Tente de novo.");
    }
    if (!charge) return {charge: null};

    let qrCode: string | null = null;
    let qrCodeBase64: string | null = null;
    if (charge.billingType === "PIX") {
      try {
        const qr = await fetchAsaasPixQrCode(charge.paymentId);
        qrCode = qr.qrCode || null;
        qrCodeBase64 = qr.qrCodeBase64 || null;
      } catch (e) {
        // Sem QR a tela ainda oferece a fatura (invoiceUrl), que tem o Pix.
        logger.warn("getArenaPlanOpenCharge: QR Pix indisponível", charge.paymentId, e);
      }
    }
    return {charge: {...charge, qrCode, qrCodeBase64}};
  },
);

export interface PlanChargeRemindersResult {
  arenas: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Um push por arena por dia, no máximo, e um por (cobrança, tipo de aviso):
 * `billing/subscription.sentReminderKeys` guarda o que já saiu, então rodar de
 * novo no mesmo dia (retry do scheduler) não repete.
 */
export async function runArenaPlanChargeReminders(db: Firestore, now: Date): Promise<PlanChargeRemindersResult> {
  const today = dayKeyFromEventDate(now);
  const snap = await db.collection("arenas").where("planStatus", "in", ["active", "overdue"]).get();
  const result: PlanChargeRemindersResult = {arenas: snap.size, sent: 0, skipped: 0, failed: 0};

  for (const arena of snap.docs) {
    const arenaData = arena.data();
    const managerUid = str(arenaData.managerUserId);
    const tier = normalizeArenaPlanTier(arenaData.planTier);
    if (!managerUid || !tier) {
      result.skipped++;
      continue;
    }
    try {
      const billingRef = arena.ref.collection("billing").doc("subscription");
      const billing = (await billingRef.get()).data();
      const subscriptionId = liveSubscriptionId(billing);
      if (!subscriptionId) {
        result.skipped++;
        continue;
      }
      const charge = pickOpenPlanCharge(await planChargeSource.listOpen(subscriptionId));
      const stage = charge ? planChargeReminderStage(charge, today) : null;
      if (!charge || !stage) {
        result.skipped++;
        continue;
      }
      const key = planChargeReminderKey(charge.paymentId, stage);
      const sentKeys = (Array.isArray(billing?.sentReminderKeys) ? billing!.sentReminderKeys as unknown[] : [])
        .filter((k): k is string => typeof k === "string");
      if (sentKeys.includes(key)) {
        result.skipped++;
        continue;
      }
      // Marca antes de enviar: na dúvida, um aviso a menos é melhor que dois.
      // Só as últimas chaves importam (4 avisos por cobrança), a lista não cresce sem fim.
      await billingRef.set(
        {sentReminderKeys: [...sentKeys, key].slice(-MAX_SENT_REMINDER_KEYS), updatedAt: FieldValue.serverTimestamp()},
        {merge: true},
      );
      const msg = planChargeReminderMessage(stage, charge, ARENA_PLANS[tier].name);
      await planChargeNotifier.send({
        userId: managerUid,
        ...msg,
        type: "arena_plan_charge_reminder",
        data: {...ARENA_PLAN_NOTIFICATION_LINKS, arenaId: arena.id, paymentId: charge.paymentId, stage},
      });
      result.sent++;
    } catch (e) {
      result.failed++;
      logger.warn("remindArenaPlanCharges: arena falhou", arena.id, e);
    }
  }
  return result;
}

export const remindArenaPlanCharges = onSchedule({
  schedule: "every day 09:00",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 300,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await runArenaPlanChargeReminders(getFirestore(), new Date());
  logger.info("remindArenaPlanCharges", result);
});
