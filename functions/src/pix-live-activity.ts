/**
 * Live Activity do Pix pendente no iOS (Dynamic Island + tela bloqueada).
 *
 * O app inicia a activity quando o atleta gera o Pix e grava o token dela em
 * `pixLiveActivities/{uid}_{asaasPaymentId}` (com `paymentId` no doc). A chave
 * leva o uid para ninguém ocupar o doc de outra pessoa: o id da cobrança fica
 * em docs que todo atleta logado lê (ex.: `arenaBookings`). A contagem regressiva roda sozinha no
 * iPhone; o servidor só fala em três momentos, cada um uma vez por cobrança:
 *
 * - **urgent**: faltam 2 minutos (varredura de 1 em 1 minuto);
 * - **paid**: o webhook do Asaas recebeu/confirmou o pagamento;
 * - **expired**: o prazo passou (varredura) ou a cobrança foi apagada/venceu
 *   no Asaas (webhook).
 *
 * A fase gravada no doc é a trava: webhook e varredura podem chegar juntos, e
 * só quem consegue mudar a fase na transação manda o push. O transporte é o
 * FCM (`apns.liveActivityToken`), que já tem a credencial APNs do projeto.
 */

import {
  DocumentReference,
  Firestore,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {TokenMessage, getMessaging} from "firebase-admin/messaging";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {isInvalidFcmTokenError} from "./notification-delivery";

export const PIX_LIVE_ACTIVITIES_COLLECTION = "pixLiveActivities";

/** A partir daqui o card fica vermelho e pede pressa. */
export const PIX_LIVE_ACTIVITY_URGENT_WINDOW_MS = 2 * 60 * 1000;

/** Quanto tempo o card de "pago" fica na tela depois de encerrado. */
export const PIX_LIVE_ACTIVITY_PAID_DISMISS_MS = 30 * 60 * 1000;

/** Quanto tempo o card de "expirou" fica na tela depois de encerrado. */
export const PIX_LIVE_ACTIVITY_EXPIRED_DISMISS_MS = 15 * 60 * 1000;

/** Docs em fase final são apagados depois disso (a activity já saiu da tela). */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

const SWEEP_BATCH = 200;

export type PixLiveActivityPhase = "waiting" | "urgent" | "paid" | "expired";

type PushedPhase = Exclude<PixLiveActivityPhase, "waiting">;

const OPEN_PHASES: readonly PixLiveActivityPhase[] = ["waiting", "urgent"];
const FINAL_PHASES: readonly PixLiveActivityPhase[] = ["paid", "expired"];

/** Fase que um evento de pagamento do Asaas leva a activity; `null` ignora. */
export function phaseForAsaasEvent(event: string): PushedPhase | null {
  switch (event) {
  case "PAYMENT_RECEIVED":
  case "PAYMENT_CONFIRMED":
    return "paid";
  case "PAYMENT_OVERDUE":
  case "PAYMENT_DELETED":
    return "expired";
  default:
    return null;
  }
}

/**
 * Só anda para frente e nunca repete. "Pago" e "expirou" são finais: os dois
 * ENCERRAM a activity, e o iOS ignora push para activity encerrada — um Pix
 * pago depois do prazo é avisado pelo push comum de cada origem, não aqui.
 */
export function canTransitionPixLiveActivity(
  from: PixLiveActivityPhase,
  to: PixLiveActivityPhase,
): boolean {
  if (from === to) return false;
  switch (from) {
  case "waiting":
    return to !== "waiting";
  case "urgent":
    return to === "paid" || to === "expired";
  case "expired":
  case "paid":
    return false;
  }
}

/** O que a varredura faz com uma activity aberta agora; `null` = nada. */
export function sweepTransitionFor(
  phase: PixLiveActivityPhase,
  expiresAtMs: number,
  nowMs: number,
): PushedPhase | null {
  if (!OPEN_PHASES.includes(phase)) return null;
  if (expiresAtMs <= nowMs) return "expired";
  if (phase === "waiting" && expiresAtMs - nowMs <= PIX_LIVE_ACTIVITY_URGENT_WINDOW_MS) {
    return "urgent";
  }
  return null;
}

const ALERTS: Record<PushedPhase, {title: string; body: string} | undefined> = {
  urgent: {
    title: "Seu Pix expira em 2 minutos",
    body: "Pague agora para não perder.",
  },
  paid: {
    title: "Pagamento confirmado",
    body: "Recebemos o seu Pix.",
  },
  expired: undefined,
};

const DISMISS_MS: Record<PushedPhase, number | undefined> = {
  urgent: undefined,
  paid: PIX_LIVE_ACTIVITY_PAID_DISMISS_MS,
  expired: PIX_LIVE_ACTIVITY_EXPIRED_DISMISS_MS,
};

/**
 * Push de Live Activity pelo FCM. O `content-state` é só a fase: valor,
 * prazo e contexto são atributos fixos, gravados no iPhone quando a activity
 * nasce (`PixPaymentAttributes` no Swift).
 */
export function buildPixLiveActivityMessage(params: {
  fcmToken: string;
  liveActivityToken: string;
  phase: PushedPhase;
  nowMs: number;
  /** Prazo do Pix: o update o repete como `stale-date`, senão o iOS o esquece. */
  expiresAtMs: number;
}): TokenMessage {
  const {fcmToken, liveActivityToken, phase, nowMs, expiresAtMs} = params;
  const dismissMs = DISMISS_MS[phase];
  const alert = ALERTS[phase];
  const aps: Record<string, unknown> = {
    "timestamp": Math.floor(nowMs / 1000),
    "event": dismissMs === undefined ? "update" : "end",
    "content-state": {phase},
  };
  if (dismissMs !== undefined) {
    aps["dismissal-date"] = Math.floor((nowMs + dismissMs) / 1000);
  } else {
    // O conteúdo do push SUBSTITUI o da activity: sem isto o `staleDate` do
    // app some e o "Expirou" pelo relógio deixa de valer nos 2 minutos finais.
    aps["stale-date"] = Math.floor(expiresAtMs / 1000);
  }
  if (alert) aps["alert"] = alert;
  return {
    token: fcmToken,
    apns: {
      liveActivityToken,
      headers: {"apns-priority": "10"},
      payload: {aps},
    },
  };
}

interface StoredActivity {
  phase: PixLiveActivityPhase;
  fcmToken: string;
  liveActivityToken: string;
  expiresAtMs: number;
}

function readActivity(data: FirebaseFirestore.DocumentData | undefined): StoredActivity | null {
  if (!data) return null;
  const phase = data.phase as PixLiveActivityPhase;
  const fcmToken = typeof data.fcmToken === "string" ? data.fcmToken.trim() : "";
  const liveActivityToken = typeof data.liveActivityToken === "string" ?
    data.liveActivityToken.trim() : "";
  if (![...OPEN_PHASES, ...FINAL_PHASES].includes(phase)) return null;
  const expiresAt = data.expiresAt;
  const expiresAtMs = expiresAt instanceof Timestamp ? expiresAt.toMillis() : 0;
  return {phase, fcmToken, liveActivityToken, expiresAtMs};
}

/**
 * Muda a fase na transação e, se mudou, manda o push. Sem token da activity
 * (o iPhone ainda não entregou) a fase muda mesmo assim: o app lê a fase ao
 * voltar e o próximo push não repete este.
 */
export async function advancePixLiveActivity(
  ref: DocumentReference,
  to: PushedPhase,
  nowMs: number,
): Promise<boolean> {
  const db = ref.firestore;
  const activity = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = readActivity(snap.data());
    if (!current || !canTransitionPixLiveActivity(current.phase, to)) return null;
    tx.update(ref, {phase: to, phaseChangedAt: Timestamp.fromMillis(nowMs)});
    return current;
  });
  if (!activity) return false;
  if (!activity.fcmToken || !activity.liveActivityToken) return true;

  try {
    await getMessaging().send(buildPixLiveActivityMessage({
      fcmToken: activity.fcmToken,
      liveActivityToken: activity.liveActivityToken,
      phase: to,
      nowMs,
      expiresAtMs: activity.expiresAtMs,
    }));
  } catch (e: unknown) {
    const code = (e as {code?: string})?.code ?? "";
    if (isInvalidFcmTokenError(code)) {
      await ref.delete();
      return true;
    }
    logger.warn(`pixLiveActivity: push falhou id=${ref.id} phase=${to} code=${code}`, e);
  }
  return true;
}

/** Chamado pelo webhook do Asaas para todo evento de pagamento. */
export async function notifyPixLiveActivityForAsaasEvent(
  db: Firestore,
  paymentId: string,
  event: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const phase = phaseForAsaasEvent(event);
  if (!phase || !paymentId) return;
  // Normalmente um doc só; mais de um seria o mesmo atleta em dois aparelhos.
  const snap = await db.collection(PIX_LIVE_ACTIVITIES_COLLECTION)
    .where("paymentId", "==", paymentId)
    .limit(10)
    .get();
  for (const doc of snap.docs) {
    await advancePixLiveActivity(doc.ref, phase, nowMs);
  }
}

async function sweepOpenActivities(db: Firestore, nowMs: number): Promise<number> {
  const horizon = Timestamp.fromMillis(nowMs + PIX_LIVE_ACTIVITY_URGENT_WINDOW_MS);
  const snap = await db.collection(PIX_LIVE_ACTIVITIES_COLLECTION)
    .where("phase", "in", OPEN_PHASES)
    .where("expiresAt", "<=", horizon)
    .limit(SWEEP_BATCH)
    .get();
  let pushed = 0;
  for (const doc of snap.docs) {
    const expiresAt = doc.get("expiresAt");
    if (!(expiresAt instanceof Timestamp)) continue;
    const to = sweepTransitionFor(doc.get("phase"), expiresAt.toMillis(), nowMs);
    if (!to) continue;
    if (await advancePixLiveActivity(doc.ref, to, nowMs)) pushed++;
  }
  return pushed;
}

async function purgeFinishedActivities(db: Firestore, nowMs: number): Promise<number> {
  const snap = await db.collection(PIX_LIVE_ACTIVITIES_COLLECTION)
    .where("phase", "in", FINAL_PHASES)
    .where("expiresAt", "<=", Timestamp.fromMillis(nowMs - PURGE_AFTER_MS))
    .limit(SWEEP_BATCH)
    .get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

/** Urgência dos 2 minutos, expiração pelo relógio e limpeza dos docs velhos. */
export const sweepPixLiveActivities = onSchedule({
  schedule: "every 1 minutes",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const pushed = await sweepOpenActivities(db, nowMs);
  const purged = await purgeFinishedActivities(db, nowMs);
  if (pushed || purged) {
    logger.info(`sweepPixLiveActivities: pushed=${pushed} purged=${purged}`);
  }
});
