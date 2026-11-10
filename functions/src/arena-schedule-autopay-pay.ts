/**
 * Planos de horário — "Pagar com cartão salvo" (pagamento na mão, fora do débito automático).
 * Spec: `docs/superpowers/specs/2026-11-09-arena-planos-debito-automatico-cartao-design.md`.
 *
 * Usa a mesma cobrança com token do débito (`runScheduleTokenCharge`, origem `manual`): não conta
 * como tentativa, recusa não mexe em `autopay`, e a baixa passa pelo webhook.
 * Número e CVV nunca passam por aqui: só o token.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_SCHEDULE_CHARGES, str} from "./arena-schedule-plan-constants";
import {requireUid, rethrowSchedule} from "./arena-schedule-plans";
import {
  ONSITE_ONLY_MESSAGE,
  assertPaymentWindowOpen,
  decideScheduleChargeBilling,
} from "./arena-schedule-asaas";
import {AUTOPAY_NO_CARD_MESSAGE, AUTOPAY_UNAVAILABLE_MESSAGE} from "./arena-schedule-autopay";
import {defaultAutopayDeps, runScheduleTokenCharge, type AutopayDeps} from "./arena-schedule-autopay-charge";
import {asaasArenaSecrets} from "./asaas-client";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

type Data = Record<string, unknown>;

export const AUTOPAY_BUSY_MESSAGE = "Estamos debitando esta mensalidade. Aguarde um instante.";
export const CARD_REFUSED_MESSAGE = "O cartão foi recusado. Tente outro cartão ou pague com Pix.";

/** Paga a mensalidade no cartão salvo de quem a vê (`visibleTo`). */
export async function payScheduleChargeWithSavedCardCore(
  db: Firestore,
  uid: string,
  input: unknown,
  deps: AutopayDeps,
): Promise<{status: "paid"}> {
  const chargeId = str((input as Data | null | undefined)?.["chargeId"]);
  if (!chargeId || chargeId.includes("/")) throw new HttpsError("invalid-argument", "Mensalidade inválida.");
  const ref = db.collection(ARENA_SCHEDULE_CHARGES).doc(chargeId);
  let snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Mensalidade não encontrada.");
  let charge = snap.data() as Data;
  const visibleTo = Array.isArray(charge["visibleTo"]) ? (charge["visibleTo"] as unknown[]).map(String) : [];
  if (!visibleTo.includes(uid)) throw new HttpsError("permission-denied", "Esta mensalidade não é sua.");

  if (charge["status"] === "open" && charge["billingMode"] === null) {
    // O gatilho ainda não decidiu: decide aqui (idempotente), como o "Pagar" de hoje.
    await decideScheduleChargeBilling(db, chargeId);
    snap = await ref.get();
    charge = snap.data() as Data;
  }
  if (charge["status"] === "paid") throw new HttpsError("failed-precondition", "Esta mensalidade já foi paga.");
  if (charge["status"] === "canceled") throw new HttpsError("failed-precondition", "Esta mensalidade foi cancelada.");
  if (charge["status"] !== "open" || charge["billingMode"] !== "asaas") {
    throw new HttpsError("failed-precondition", ONSITE_ONLY_MESSAGE);
  }
  await assertPaymentWindowOpen(db, chargeId);

  const result = await runScheduleTokenCharge(db, chargeId, "manual", deps, {uid});
  switch (result.outcome) {
  case "paid":
    return {status: "paid"};
  case "busy":
    throw new HttpsError("failed-precondition", AUTOPAY_BUSY_MESSAGE);
  case "refused":
    throw new HttpsError("invalid-argument", result.message || CARD_REFUSED_MESSAGE);
  default:
    if (result.reason === "no_card") throw new HttpsError("failed-precondition", AUTOPAY_NO_CARD_MESSAGE);
    if (result.reason === "flag_off") throw new HttpsError("failed-precondition", AUTOPAY_UNAVAILABLE_MESSAGE);
    throw new HttpsError("failed-precondition", "Esta mensalidade não está mais em aberto.");
  }
}

export const payScheduleChargeWithSavedCard = onCall({
  region: CLIENT_FACING_REGIONS,
  timeoutSeconds: 120,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await payScheduleChargeWithSavedCardCore(getFirestore(), uid, request.data ?? {}, defaultAutopayDeps);
  } catch (e) {
    return rethrowSchedule("payScheduleChargeWithSavedCard", e);
  }
});
