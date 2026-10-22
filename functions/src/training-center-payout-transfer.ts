/**
 * Repasse ao professor, fase 2: "Pagar pelo NexaGO" — transferência Asaas da subconta do centro
 * (`trainingCenterAsaasSecrets/{c}`) para a conta de recebimento do professor
 * (`professorPayoutAccounts/{uid}.walletId`).
 *
 * Estado em `payouts/{id}.transferStatus` (só o servidor grava):
 *   requested → criando a transferência (trava contra clique duplo)
 *   pending   → criada; pode estar aguardando o código SMS no app do Asaas do centro
 *   done      → concluída: o repasse vira `paid` (forma "nexago")
 *   failed    → recusada/cancelada: libera para tentar de novo ou pagar por fora
 *   unknown   → resposta ambígua (rede/5xx): NÃO repete sozinho — o owner confere o extrato e
 *               decide (`resolveTrainingCenterPayoutTransfer`)
 * A varredura de 15 min consulta as `pending` (a subconta não tem webhook nosso).
 *
 * Lições do saque (#765): só é pago no DONE; idempotência por tentativa; falha ambígua nunca vira
 * segunda transferência.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {openSecret, PROFESSOR_SECRETS_KEY} from "./professor-secret-box";
import {PROFESSOR_PAYOUT_ACCOUNTS} from "./professor-wallet-model";
import {TRAINING_CENTERS, TRAINING_CENTER_RECEIVING, brlFromCents, reaisFromCents} from "./training-center-billing-model";
import {TRAINING_CENTER_ASAAS_SECRETS} from "./training-center-receiving";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export const CENTER_PAYOUT_PAID_TYPE = "training_center_payout_paid";
export const PAYOUT_TRANSFER_REF_PREFIX = "ctPayout:";

export interface TransferInfo {
  id: string;
  status: string;
  authorized: boolean;
  failReason: string;
}

export interface PayoutTransferDeps {
  now: () => Date;
  env: () => string;
  openKey: (sealed: string) => string;
  createTransfer: (apiKey: string, input: {valueReais: number; walletId: string; description: string; externalReference: string; idempotencyKey: string}) => Promise<TransferInfo>;
  getTransfer: (apiKey: string, id: string) => Promise<TransferInfo>;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

function asTransfer(raw: Data): TransferInfo {
  return {
    id: String(raw["id"] ?? ""),
    status: String(raw["status"] ?? "PENDING").toUpperCase(),
    authorized: raw["authorized"] !== false,
    failReason: String(raw["failReason"] ?? raw["transferFailReason"] ?? ""),
  };
}

export const defaultPayoutTransferDeps: PayoutTransferDeps = {
  now: () => new Date(),
  env: () => getAsaasEnvTag(),
  openKey: (sealed) => openSecret(sealed, PROFESSOR_SECRETS_KEY.value()),
  createTransfer: async (apiKey, input) => {
    if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
    const raw = await fetchAsaas<Data>("/v3/transfers", {
      method: "POST",
      apiKey,
      body: {value: input.valueReais, walletId: input.walletId, description: input.description.slice(0, 200), externalReference: input.externalReference},
      idempotencyKey: input.idempotencyKey,
    });
    return asTransfer(raw);
  },
  getTransfer: async (apiKey, id) => asTransfer(await fetchAsaas<Data>(`/v3/transfers/${encodeURIComponent(id)}`, {apiKey})),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const centerRef = (db: Firestore, c: string) => db.collection(TRAINING_CENTERS).doc(c);

function audit(at: Timestamp, actor: {uid: string; name: string}, action: string, entityId: string, detail: string): Data {
  return {at, actorUid: actor.uid, actorName: actor.name, action, entity: "payout", entityId, detail, reason: ""};
}

const SYSTEM = {uid: "system", name: "Sistema"};

/** `requested` velho = a function caiu entre travar e ouvir o Asaas: trata como sem confirmação. */
const REQUEST_STALE_MS = 10 * 60_000;
function staleRequest(p: Data, now: Date): boolean {
  const at = p["transferRequestedAt"] as {toMillis?: () => number} | undefined;
  const ms = at?.toMillis?.() ?? 0;
  return now.getTime() - ms > REQUEST_STALE_MS;
}

/** Falha CERTA (o Asaas recusou): pode tentar de novo com outra chave. Rede/5xx/408/409/429 = ambígua. */
function definiteFailure(e: unknown): boolean {
  return e instanceof AsaasApiError && e.httpStatus >= 400 && e.httpStatus < 500 && ![408, 409, 429].includes(e.httpStatus);
}

function monthLabel(month: string): string {
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[Number(month.slice(5, 7)) - 1] ?? month}/${month.slice(0, 4)}`;
}

async function requireOwner(db: Firestore, uid: string | undefined, centerId: string): Promise<{uid: string; name: string}> {
  if (!uid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const m = (await centerRef(db, centerId).collection("centerMembers").doc(uid).get()).data();
  if (!m || m["status"] !== "active" || m["role"] !== "center_owner") {
    throw new HttpsError("permission-denied", "Só o owner do centro paga repasses pelo NexaGO.");
  }
  return {uid, name: str(m["displayName"]) || "Owner"};
}

function parseInput(raw: unknown): {centerId: string; payoutId: string; d: Data} {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const payoutId = str(d["payoutId"]);
  if (!centerId || !payoutId || centerId.includes("/") || payoutId.includes("/")) throw new HttpsError("invalid-argument", "Repasse inválido.");
  return {centerId, payoutId, d};
}

/** Marca o repasse como pago pela transferência concluída (e avisa o professor). */
async function finalizePaid(db: Firestore, ref: DocumentReference, centerId: string, tz: string, deps: PayoutTransferDeps, transferId: string): Promise<boolean> {
  const at = Timestamp.fromDate(deps.now());
  const paid = await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data();
    if (!p || p["status"] === "paid" || str(p["transferId"]) !== transferId) return null;
    tx.update(ref, {
      status: "paid", transferStatus: "done", transferDoneAt: at, paidAt: at,
      paidOn: dayKeyIn(deps.now(), tz), paidByName: str(p["transferByName"]) || "NexaGO", paidMethod: "nexago",
      note: `Transferência Asaas ${transferId}`,
    });
    tx.set(centerRef(db, centerId).collection("auditLogs").doc(), audit(at, SYSTEM, "payout.transfer_done", ref.id,
      `${str(p["coachName"])} · ${monthLabel(str(p["month"]))} · ${brlFromCents(Number(p["totalCents"] ?? 0))} transferido pelo NexaGO`));
    return p;
  });
  if (!paid) return false;
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  await deps.notify({
    userId: str(paid["coachUid"]),
    title: `Repasse de ${monthLabel(str(paid["month"]))} pago · ${brlFromCents(Number(paid["totalCents"] ?? 0))}`,
    body: `${str(center["name"]) || "O centro"} transferiu para a sua conta de recebimento no Asaas.`,
    type: CENTER_PAYOUT_PAID_TYPE, data: {centerId, payoutId: ref.id},
  }).catch((e) => logger.warn(`payout ${ref.path}: push ao professor falhou`, e));
  return true;
}

async function markFailed(db: Firestore, ref: DocumentReference, centerId: string, deps: PayoutTransferDeps, transferId: string, reason: string): Promise<void> {
  const at = Timestamp.fromDate(deps.now());
  await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data();
    if (!p || p["status"] === "paid" || str(p["transferId"]) !== transferId) return;
    tx.update(ref, {transferStatus: "failed", transferError: reason.slice(0, 200), transferAttempt: Number(p["transferAttempt"] ?? 0) + 1, transferUpdatedAt: at});
    tx.set(centerRef(db, centerId).collection("auditLogs").doc(), audit(at, SYSTEM, "payout.transfer_failed", ref.id,
      `${str(p["coachName"])} · ${monthLabel(str(p["month"]))} · transferência não concluída${reason ? ` (${reason})` : ""}`));
  });
}

export interface PayResult {
  transferStatus: "pending" | "done" | "failed" | "unknown";
  awaitingAuthorization: boolean;
  message: string;
}

export async function payPayoutCore(db: Firestore, uid: string | undefined, raw: unknown, deps: PayoutTransferDeps = defaultPayoutTransferDeps): Promise<PayResult> {
  const {centerId, payoutId} = parseInput(raw);
  const actor = await requireOwner(db, uid, centerId);
  const center = (await centerRef(db, centerId).get()).data();
  if (!center) throw new HttpsError("not-found", "Centro não encontrado.");
  if (center["status"] === "suspended") throw new HttpsError("failed-precondition", "Centro suspenso.");
  const env = deps.env();

  const rec = (await db.collection(TRAINING_CENTER_RECEIVING).doc(centerId).get()).data();
  const sealed = str((await db.collection(TRAINING_CENTER_ASAAS_SECRETS).doc(centerId).get()).data()?.["sealedApiKey"]);
  if (!rec || rec["source"] !== "self" || rec["status"] !== "approved" || !sealed || (rec["asaasEnv"] && rec["asaasEnv"] !== env)) {
    throw new HttpsError("failed-precondition", "Pagar pelo NexaGO precisa da conta de recebimento do centro criada aqui e aprovada pelo Asaas.");
  }
  const ref = centerRef(db, centerId).collection("payouts").doc(payoutId);
  const payout = (await ref.get()).data();
  if (!payout) throw new HttpsError("not-found", "Repasse não encontrado.");
  if (payout["status"] !== "closed") throw new HttpsError("failed-precondition", "Só repasse fechado (e ainda não pago) pode ser transferido.");
  const cents = Math.round(Number(payout["totalCents"] ?? 0));
  if (cents < 100) throw new HttpsError("failed-precondition", "Valor baixo demais para transferir.");
  const coachUid = str(payout["coachUid"]);
  if (coachUid === actor.uid) throw new HttpsError("failed-precondition", "O owner não transfere repasse para si mesmo pelo NexaGO.");
  const account = (await db.collection(PROFESSOR_PAYOUT_ACCOUNTS).doc(coachUid).get()).data();
  const walletId = str(account?.["walletId"]);
  if (!account || account["status"] !== "approved" || !walletId || (account["asaasEnv"] && account["asaasEnv"] !== env)) {
    throw new HttpsError("failed-precondition",
      `${str(payout["coachName"]) || "O professor"} ainda não tem conta de recebimento aprovada. Ele cria em "Meus repasses" no portal do centro.`);
  }
  if (walletId === str(rec["walletId"])) throw new HttpsError("failed-precondition", "A conta do professor é a mesma do centro.");

  const at = Timestamp.fromDate(deps.now());
  const attempt = await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur || cur["status"] !== "closed") throw new HttpsError("failed-precondition", "O repasse mudou. Recarregue e tente de novo.");
    const ts = str(cur["transferStatus"]);
    if (ts === "requested" && staleRequest(cur, deps.now())) {
      throw new HttpsError("failed-precondition", "A última tentativa ficou sem resposta. Confira o extrato do Asaas e resolva antes de tentar de novo.");
    }
    if (ts === "requested" || ts === "pending") throw new HttpsError("already-exists", "Este repasse já está sendo transferido.");
    if (ts === "unknown") throw new HttpsError("failed-precondition", "A última transferência ficou sem confirmação. Confira o extrato do Asaas e resolva antes de tentar de novo.");
    const n = Number(cur["transferAttempt"] ?? 0);
    tx.update(ref, {
      transferStatus: "requested", transferAttempt: n, transferRequestedAt: at, transferByUid: actor.uid, transferByName: actor.name,
      transferCents: Math.round(Number(cur["totalCents"] ?? 0)), transferError: "", transferId: "",
    });
    return n;
  });

  let transfer: TransferInfo;
  try {
    transfer = await deps.createTransfer(deps.openKey(sealed), {
      valueReais: reaisFromCents(cents),
      walletId,
      description: `Repasse ${monthLabel(str(payout["month"]))} · ${str(center["name"])}`,
      externalReference: `${PAYOUT_TRANSFER_REF_PREFIX}${centerId}:${payoutId}`,
      idempotencyKey: `ct-payout-${env}-${centerId}-${payoutId}-${attempt}`,
    });
  } catch (e) {
    const sure = definiteFailure(e);
    const reason = e instanceof AsaasApiError ? e.message : "sem resposta do Asaas";
    await ref.update({
      transferStatus: sure ? "failed" : "unknown",
      transferError: reason.slice(0, 200),
      ...(sure ? {transferAttempt: attempt + 1} : {}),
      transferUpdatedAt: Timestamp.fromDate(deps.now()),
    });
    await centerRef(db, centerId).collection("auditLogs").add(audit(at, actor, sure ? "payout.transfer_failed" : "payout.transfer_unknown", payoutId,
      `${str(payout["coachName"])} · ${brlFromCents(cents)} · ${sure ? `recusada (${reason})` : "sem confirmação — conferir o extrato do Asaas"}`));
    if (!sure) logger.error(`payPayout ${centerId}/${payoutId}: resposta ambígua do Asaas`, e);
    return {
      transferStatus: sure ? "failed" : "unknown",
      awaitingAuthorization: false,
      message: sure ? `O Asaas recusou a transferência: ${reason}` : "O Asaas não confirmou a transferência. Confira o extrato antes de tentar de novo.",
    };
  }

  await ref.update({transferStatus: "pending", transferId: transfer.id, transferAuthorized: transfer.authorized, transferUpdatedAt: Timestamp.fromDate(deps.now())});
  await centerRef(db, centerId).collection("auditLogs").add(audit(at, actor, "payout.transfer_requested", payoutId,
    `${str(payout["coachName"])} · ${monthLabel(str(payout["month"]))} · ${brlFromCents(cents)} · transferência ${transfer.id}${transfer.authorized ? "" : " aguardando autorização no Asaas"}`));
  const tz = str(center["timezone"]);
  if (transfer.status === "DONE" && (await finalizePaid(db, ref, centerId, tz, deps, transfer.id))) {
    return {transferStatus: "done", awaitingAuthorization: false, message: "Transferência concluída."};
  }
  if (transfer.status === "FAILED" || transfer.status === "CANCELLED") {
    await markFailed(db, ref, centerId, deps, transfer.id, transfer.failReason);
    return {transferStatus: "failed", awaitingAuthorization: false, message: "O Asaas não concluiu a transferência."};
  }
  return {
    transferStatus: "pending",
    awaitingAuthorization: !transfer.authorized,
    message: transfer.authorized ?
      "Transferência enviada. O repasse fica pago assim que o Asaas concluir." :
      "Transferência criada. Confirme o código enviado por SMS no app do Asaas do centro para ela sair.",
  };
}

/** Consulta uma transferência pendente e leva ao estado final (varredura e "Atualizar"). */
export async function checkPayoutTransfer(db: Firestore, centerId: string, payoutId: string, deps: PayoutTransferDeps): Promise<string> {
  const ref = centerRef(db, centerId).collection("payouts").doc(payoutId);
  const p = (await ref.get()).data();
  if (!p || p["transferStatus"] !== "pending" || !str(p["transferId"])) return str(p?.["transferStatus"]);
  const sealed = str((await db.collection(TRAINING_CENTER_ASAAS_SECRETS).doc(centerId).get()).data()?.["sealedApiKey"]);
  if (!sealed) return "pending";
  const t = await deps.getTransfer(deps.openKey(sealed), str(p["transferId"]));
  if (t.status === "DONE") {
    const center = (await centerRef(db, centerId).get()).data() ?? {};
    await finalizePaid(db, ref, centerId, str(center["timezone"]), deps, t.id || str(p["transferId"]));
    return "done";
  }
  if (t.status === "FAILED" || t.status === "CANCELLED") {
    await markFailed(db, ref, centerId, deps, str(p["transferId"]), t.failReason || t.status.toLowerCase());
    return "failed";
  }
  if (Boolean(p["transferAuthorized"]) !== t.authorized) await ref.update({transferAuthorized: t.authorized});
  return "pending";
}

export async function sweepPayoutTransfersCore(db: Firestore, deps: PayoutTransferDeps = defaultPayoutTransferDeps): Promise<number> {
  const centers = await db.collection(TRAINING_CENTERS).where("status", "==", "active").get();
  let settled = 0;
  for (const c of centers.docs) {
    const pending = await c.ref.collection("payouts").where("transferStatus", "==", "pending").get();
    for (const p of pending.docs) {
      try {
        const r = await checkPayoutTransfer(db, c.id, p.id, deps);
        if (r !== "pending") settled++;
      } catch (e) {
        logger.warn(`sweepTrainingCenterPayoutTransfers ${p.ref.path}`, e);
      }
    }
  }
  return settled;
}

/**
 * Owner resolve uma transferência sem confirmação depois de conferir o extrato do Asaas:
 * `sent` = saiu (marca pago); `not_sent` = não saiu (libera para tentar de novo / pagar por fora).
 */
export async function resolvePayoutTransferCore(db: Firestore, uid: string | undefined, raw: unknown, deps: PayoutTransferDeps = defaultPayoutTransferDeps): Promise<{transferStatus: string}> {
  const {centerId, payoutId, d} = parseInput(raw);
  const actor = await requireOwner(db, uid, centerId);
  const outcome = d["outcome"] === "sent" ? "sent" : d["outcome"] === "not_sent" ? "not_sent" : null;
  if (!outcome) throw new HttpsError("invalid-argument", "Informe se a transferência saiu ou não.");
  const ref = centerRef(db, centerId).collection("payouts").doc(payoutId);
  const center = (await centerRef(db, centerId).get()).data() ?? {};
  const at = Timestamp.fromDate(deps.now());
  return db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data();
    const stuck = p?.["transferStatus"] === "unknown" || (p?.["transferStatus"] === "requested" && staleRequest(p, deps.now()));
    if (!p || p["status"] !== "closed" || !stuck) throw new HttpsError("failed-precondition", "Não há transferência sem confirmação neste repasse.");
    if (outcome === "sent") {
      tx.update(ref, {
        status: "paid", transferStatus: "done", transferDoneAt: at, paidAt: at, paidOn: dayKeyIn(deps.now(), str(center["timezone"])),
        paidByName: actor.name, paidMethod: "nexago", note: "Transferência conferida no extrato do Asaas",
      });
    } else {
      tx.update(ref, {transferStatus: "failed", transferAttempt: Number(p["transferAttempt"] ?? 0) + 1, transferError: "Conferido: não saiu", transferUpdatedAt: at});
    }
    tx.set(centerRef(db, centerId).collection("auditLogs").doc(), audit(at, actor, `payout.transfer_${outcome}`, payoutId,
      `${str(p["coachName"])} · ${brlFromCents(Number(p["totalCents"] ?? 0))} · ${outcome === "sent" ? "conferido no extrato: saiu" : "conferido no extrato: não saiu"}`));
    return {transferStatus: outcome === "sent" ? "done" : "failed"};
  });
}

const SECRETS = [...asaasArenaSecrets, PROFESSOR_SECRETS_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export const payTrainingCenterPayout = onCall({region: CLIENT_FACING_REGIONS, secrets: SECRETS},
  async (request: CallableRequest) => payPayoutCore(getFirestore(), request.auth?.uid, request.data));

export const resolveTrainingCenterPayoutTransfer = onCall({region: CLIENT_FACING_REGIONS},
  async (request: CallableRequest) => resolvePayoutTransferCore(getFirestore(), request.auth?.uid, request.data));

export const sweepTrainingCenterPayoutTransfers = onSchedule({schedule: "every 15 minutes", timeZone: "America/Sao_Paulo", secrets: SECRETS},
  async () => {
    await sweepPayoutTransfersCore(getFirestore());
  });
