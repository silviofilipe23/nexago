/**
 * Centros de Treinamento no backoffice — o que o owner NÃO faz pelo portal (as rules travam
 * `status`, `receivingConnected` e `subscription` no doc do centro, e `trainingCenterReceiving`
 * é só servidor). Substitui `functions/scripts/set-training-center-status.js` no dia a dia.
 *
 * - `listTrainingCentersBackoffice`: lista com contagens (equipe, alunos, turmas ativas).
 * - `getTrainingCenterBackoffice`: detalhe + recebimento + últimas linhas da auditoria.
 * - `setTrainingCenterStatus`: pending | active | suspended, com motivo (vai para a auditoria do centro).
 * - `setTrainingCenterReceiving`: carteira Asaas (walletId), ambiente e taxa.
 * - `approveTrainingCenterReceiving`: fecha a análise da subconta criada pelo centro quando ela foi
 *   adotada sem apiKey (`manualFollowUp`) — a varredura não consegue consultar o Asaas e o time
 *   NexaGO confere lá e marca aprovada/recusada aqui, sem redigitar a carteira.
 * - `setTrainingCenterSubscription`: plano, situação e fatura em aberto da assinatura NexaGO.
 *
 * Todas exigem acesso ao backoffice (`callerCanAccessBackoffice`: claim `admin` ou superAdmin).
 */
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {TRAINING_CENTERS, TRAINING_CENTER_RECEIVING} from "./training-center-billing-model";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

type Data = Record<string, unknown>;

export interface Actor {
  uid: string;
  name: string;
}

export const CENTER_STATUSES = ["pending", "active", "suspended"] as const;
export type CenterStatus = (typeof CENTER_STATUSES)[number];
const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "cancelled"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function millis(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
}

function invalid(field: string, message: string): HttpsError {
  return new HttpsError("invalid-argument", message, {field});
}

/** Carteira mascarada (o backoffice mostra só o fim, para conferência). */
export function maskWallet(walletId: string): string {
  return walletId.length > 8 ? `••••${walletId.slice(-6)}` : walletId ? "••••" : "";
}

export interface CenterRow {
  id: string;
  name: string;
  legalName: string;
  cnpj: string;
  city: string;
  state: string;
  status: CenterStatus;
  ownerName: string;
  contactEmail: string;
  contactPhone: string;
  createdAtMs: number | null;
  activatedAtMs: number | null;
  activationRequestedAtMs: number | null;
  suspendedAtMs: number | null;
  suspendedReason: string;
  receivingConnected: boolean;
  /** `trainingCenters/{c}.receivingStatus` (pending | approved | rejected | …); "" sem conta própria. */
  receivingStatus: string;
  /** Conta em análise que só o time NexaGO consegue fechar (subconta adotada sem apiKey). */
  receivingManualFollowUp: boolean;
  subscription: {plan: string; status: string; openInvoiceCents: number | null; dueDate: string | null; attempts: string | null} | null;
  counts: {members: number; students: number; activeClasses: number};
}

export function centerRow(id: string, d: Data, counts: CenterRow["counts"], mirror?: Data): CenterRow {
  const status = str(d["status"]);
  const sub = d["subscription"] && typeof d["subscription"] === "object" ? (d["subscription"] as Data) : null;
  return {
    id,
    name: str(d["name"]) || "Centro",
    legalName: str(d["legalName"]),
    cnpj: str(d["cnpj"]),
    city: str(d["city"]),
    state: str(d["state"]),
    status: (CENTER_STATUSES as readonly string[]).includes(status) ? (status as CenterStatus) : "pending",
    ownerName: str(d["ownerName"]),
    contactEmail: str(d["contactEmail"]),
    contactPhone: str(d["contactPhone"]),
    createdAtMs: millis(d["createdAt"]),
    activatedAtMs: millis(d["activatedAt"]),
    activationRequestedAtMs: millis(d["activationRequestedAt"]),
    suspendedAtMs: millis(d["suspendedAt"]),
    suspendedReason: str(d["suspendedReason"]),
    receivingConnected: d["receivingConnected"] === true,
    receivingStatus: str(d["receivingStatus"]),
    receivingManualFollowUp: needsManualFollowUp(mirror),
    subscription: sub ? {
      plan: str(sub["plan"]),
      status: str(sub["status"]),
      openInvoiceCents: typeof sub["openInvoiceCents"] === "number" ? (sub["openInvoiceCents"] as number) : null,
      dueDate: str(sub["dueDate"]) || null,
      attempts: str(sub["attempts"]) || null,
    } : null,
    counts,
  };
}

/** Espelho do portal (`receivingAccount/current`) pendente e marcado para o time NexaGO acompanhar. */
function needsManualFollowUp(mirror: Data | undefined): boolean {
  return mirror?.["manualFollowUp"] === true && str(mirror["status"]) === "pending";
}

const mirrorPath = (centerId: string) => `${TRAINING_CENTERS}/${centerId}/receivingAccount/current`;

async function countsOf(db: Firestore, centerId: string): Promise<CenterRow["counts"]> {
  const base = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const [members, students, classes] = await Promise.all([
    base.collection("centerMembers").where("status", "==", "active").get(),
    base.collection("students").get(),
    base.collection("classes").where("status", "==", "active").get(),
  ]);
  return {members: members.size, students: students.size, activeClasses: classes.size};
}

export async function listCentersCore(db: Firestore): Promise<{centers: CenterRow[]}> {
  const snap = await db.collection(TRAINING_CENTERS).get();
  const centers = await Promise.all(snap.docs.map(async (d) => {
    const [counts, mirror] = await Promise.all([countsOf(db, d.id), db.doc(mirrorPath(d.id)).get()]);
    return centerRow(d.id, d.data() as Data, counts, mirror.data() as Data | undefined);
  }));
  // Pedido de ativação primeiro; depois pendentes, suspensos, ativos; nome.
  const rank = (c: CenterRow) => (c.status === "pending" && c.activationRequestedAtMs ? 0 : c.status === "pending" ? 1 : c.status === "suspended" ? 2 : 3);
  centers.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "pt-BR"));
  return {centers};
}

export async function getCenterCore(db: Firestore, centerId: string) {
  if (!centerId) throw invalid("centerId", "Informe o centro.");
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Centro não encontrado.");
  const [counts, receiving, mirror, audit, programs] = await Promise.all([
    countsOf(db, centerId),
    db.doc(`${TRAINING_CENTER_RECEIVING}/${centerId}`).get(),
    db.doc(mirrorPath(centerId)).get(),
    ref.collection("auditLogs").orderBy("at", "desc").limit(30).get(),
    ref.collection("programs").get(),
  ]);
  const r = receiving.data() as Data | undefined;
  const m = mirror.data() as Data | undefined;
  return {
    center: centerRow(centerId, snap.data() as Data, counts, m),
    programs: programs.docs.map((d) => str((d.data() as Data)["name"])).filter(Boolean),
    receiving: r ? {
      wallet: maskWallet(str(r["walletId"])),
      asaasEnv: str(r["asaasEnv"]) || "production",
      feePercent: typeof r["feePercent"] === "number" ? (r["feePercent"] as number) : null,
      status: str(r["status"]),
      source: str(r["source"]),
      manualFollowUp: needsManualFollowUp(m),
    } : null,
    audit: audit.docs.map((d) => {
      const a = d.data() as Data;
      return {atMs: millis(a["at"]), actorName: str(a["actorName"]), detail: str(a["detail"]), reason: str(a["reason"])};
    }),
  };
}

function auditRow(actor: Actor, action: string, centerId: string, detail: string, reason: string, now: Date): Data {
  return {
    at: Timestamp.fromDate(now),
    actorUid: actor.uid,
    actorName: `${actor.name} (NexaGO)`,
    action,
    entity: "center",
    entityId: centerId,
    detail,
    reason,
  };
}

const STATUS_LABEL: Record<CenterStatus, string> = {pending: "pendente", active: "ativo", suspended: "suspenso"};

export async function setStatusCore(
  db: Firestore, input: {centerId?: unknown; status?: unknown; reason?: unknown}, actor: Actor, now: Date,
): Promise<{status: CenterStatus}> {
  const centerId = str(input.centerId);
  const status = str(input.status) as CenterStatus;
  const reason = str(input.reason);
  if (!centerId) throw invalid("centerId", "Informe o centro.");
  if (!(CENTER_STATUSES as readonly string[]).includes(status)) throw invalid("status", "Situação inválida.");
  if (status === "suspended" && reason.length < 3) throw invalid("reason", "Explique o motivo da suspensão (o centro vê).");
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Centro não encontrado.");
    const cur = snap.data() as Data;
    const from = str(cur["status"]) || "pending";
    if (from === status) return;
    const patch: Data = {status};
    if (status === "active") {
      patch["activatedAt"] = cur["activatedAt"] ?? Timestamp.fromDate(now);
      patch["suspendedAt"] = null;
      patch["suspendedReason"] = "";
    } else if (status === "suspended") {
      patch["suspendedAt"] = Timestamp.fromDate(now);
      patch["suspendedReason"] = reason;
    }
    tx.update(ref, patch);
    tx.set(ref.collection("auditLogs").doc(), auditRow(actor, `center.${status}`, centerId,
      `Situação do centro: ${STATUS_LABEL[from as CenterStatus] ?? from} → ${STATUS_LABEL[status]}`, reason, now));
  });
  return {status};
}

export async function setReceivingCore(
  db: Firestore, input: {centerId?: unknown; walletId?: unknown; asaasEnv?: unknown; feePercent?: unknown}, actor: Actor, now: Date,
): Promise<{connected: boolean}> {
  const centerId = str(input.centerId);
  const walletId = str(input.walletId);
  const asaasEnv = str(input.asaasEnv) || "production";
  const fee = input.feePercent;
  if (!centerId) throw invalid("centerId", "Informe o centro.");
  if (!/^[A-Za-z0-9-]{8,64}$/.test(walletId)) throw invalid("walletId", "Wallet ID do Asaas inválido.");
  if (!["production", "sandbox"].includes(asaasEnv)) throw invalid("asaasEnv", "Ambiente inválido.");
  if (fee != null && (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 30)) {
    throw invalid("feePercent", "Taxa precisa estar entre 0% e 30%.");
  }
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Centro não encontrado.");
    tx.set(db.doc(`${TRAINING_CENTER_RECEIVING}/${centerId}`), {
      walletId,
      asaasEnv,
      ...(typeof fee === "number" ? {feePercent: fee} : {}),
      updatedAt: Timestamp.fromDate(now),
      updatedBy: actor.uid,
      source: "manual",
      status: "approved",
    }, {merge: true});
    tx.update(ref, {receivingConnected: true, receivingStatus: "approved"});
    // O que o portal mostra em Configurações › Conta de recebimento.
    tx.set(ref.collection("receivingAccount").doc("current"), {
      status: "approved", source: "manual", documents: [], updatedAt: Timestamp.fromDate(now),
    }, {merge: true});
    tx.set(ref.collection("auditLogs").doc(), auditRow(actor, "center.receiving", centerId,
      `Conta de recebimento conectada (${maskWallet(walletId)} · ${asaasEnv}${typeof fee === "number" ? ` · taxa ${fee}%` : ""})`, "", now));
  });
  return {connected: true};
}

export const RECEIVING_DECISIONS = ["approved", "rejected"] as const;
export type ReceivingDecision = (typeof RECEIVING_DECISIONS)[number];

/**
 * Situação da subconta conferida no Asaas pelo time NexaGO. Não mexe na carteira: exige que ela já
 * esteja gravada (a criada pelo centro). Aprovada vira `source: "manual"` — a varredura deixa de
 * tentar consultar a subconta sem apiKey.
 */
export async function approveReceivingCore(
  db: Firestore, input: {centerId?: unknown; status?: unknown}, actor: Actor, now: Date,
): Promise<{status: ReceivingDecision}> {
  const centerId = str(input.centerId);
  const status = str(input.status) as ReceivingDecision;
  if (!centerId || centerId.includes("/")) throw invalid("centerId", "Informe o centro.");
  if (!(RECEIVING_DECISIONS as readonly string[]).includes(status)) throw invalid("status", "Situação inválida.");
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const recRef = db.doc(`${TRAINING_CENTER_RECEIVING}/${centerId}`);
  const at = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    const [snap, rec] = await Promise.all([tx.get(ref), tx.get(recRef)]);
    if (!snap.exists) throw new HttpsError("not-found", "Centro não encontrado.");
    const walletId = str((rec.data() as Data | undefined)?.["walletId"]);
    if (!walletId) throw new HttpsError("failed-precondition", "O centro ainda não tem carteira Asaas gravada. Use \"Salvar recebimento\".");
    const approved = status === "approved";
    tx.set(recRef, {
      status,
      ...(approved ? {source: "manual"} : {}),
      updatedAt: at,
      updatedBy: actor.uid,
    }, {merge: true});
    tx.update(ref, {receivingConnected: approved, receivingStatus: status});
    tx.set(ref.collection("receivingAccount").doc("current"), {
      status,
      manualFollowUp: false,
      ...(approved ? {documents: []} : {}),
      statusCheckedAt: at,
      updatedAt: at,
    }, {merge: true});
    tx.set(ref.collection("auditLogs").doc(), auditRow(actor, `center.receiving_${status}`, centerId,
      approved
        ? `Conta de recebimento aprovada no Asaas (conferida pelo time NexaGO · ${maskWallet(walletId)}) · cobranças online liberadas`
        : `Conta de recebimento recusada no Asaas (conferida pelo time NexaGO · ${maskWallet(walletId)})`, "", now));
  });
  return {status};
}

export async function setSubscriptionCore(
  db: Firestore,
  input: {centerId?: unknown; plan?: unknown; status?: unknown; openInvoiceCents?: unknown; dueDate?: unknown; attempts?: unknown},
  actor: Actor, now: Date,
): Promise<{ok: true}> {
  const centerId = str(input.centerId);
  const plan = str(input.plan);
  const status = str(input.status);
  const dueDate = str(input.dueDate);
  const open = input.openInvoiceCents;
  if (!centerId) throw invalid("centerId", "Informe o centro.");
  if (!plan) throw invalid("plan", "Informe o plano.");
  if (!SUBSCRIPTION_STATUSES.includes(status)) throw invalid("status", "Situação da assinatura inválida.");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw invalid("dueDate", "Vencimento inválido.");
  if (open != null && (typeof open !== "number" || !Number.isInteger(open) || open < 0)) throw invalid("openInvoiceCents", "Valor em aberto inválido.");
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Centro não encontrado.");
    tx.update(ref, {
      subscription: {
        plan,
        status,
        openInvoiceCents: typeof open === "number" ? open : null,
        dueDate: dueDate || null,
        attempts: str(input.attempts) || null,
      },
    });
    tx.set(ref.collection("auditLogs").doc(), auditRow(actor, "center.subscription", centerId,
      `Assinatura NexaGO: ${plan} · ${status}`, "", now));
  });
  return {ok: true};
}

async function assertBackoffice(uid: string | undefined): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma gerenciam centros de treinamento.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const listTrainingCentersBackoffice = onCall(BACKOFFICE_CALLABLE, async (request) => {
  await assertBackoffice(request.auth?.uid);
  return listCentersCore(getFirestore());
});

export const getTrainingCenterBackoffice = onCall(BACKOFFICE_CALLABLE, async (request) => {
  await assertBackoffice(request.auth?.uid);
  return getCenterCore(getFirestore(), str((request.data as Data | undefined)?.["centerId"]));
});

export const setTrainingCenterStatus = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertBackoffice(request.auth?.uid);
  return setStatusCore(getFirestore(), (request.data ?? {}) as Data, actor, new Date());
});

export const setTrainingCenterReceiving = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertBackoffice(request.auth?.uid);
  return setReceivingCore(getFirestore(), (request.data ?? {}) as Data, actor, new Date());
});

export const approveTrainingCenterReceiving = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertBackoffice(request.auth?.uid);
  return approveReceivingCore(getFirestore(), (request.data ?? {}) as Data, actor, new Date());
});

export const setTrainingCenterSubscription = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertBackoffice(request.auth?.uid);
  return setSubscriptionCore(getFirestore(), (request.data ?? {}) as Data, actor, new Date());
});
