/**
 * Planos NexaGO pelo lado da NexaGO (backoffice › Torneios › Contratos): a fila dos pedidos que
 * os organizadores criam em `tournament-plan-contracts.ts`.
 *
 *   - status do contrato, na ordem requested → deposit_paid → paid → completed, ou cancelled;
 *   - aprovação das logos que o organizador envia nas cotas (`logoStatus`);
 *   - patrocinadores trazidos pela própria NexaGO (`source: "nexago"`).
 *
 * Sem cobrança online nesta etapa: quem atende marca o sinal e o saldo à mão. Toda mudança de
 * status entra em `history` ({status, at, by, note}), como o cancelamento do organizador.
 *
 * As rules negam escrita de cliente nas duas coleções: estas callables são a porta.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {saoPauloDate} from "./store-checkout-price";
import {
  CONTRACTS,
  CONTRACT_SPONSORS,
  CONTRACT_STATUSES,
  SPONSOR_NAME_MAX,
  isSponsorLogoUrl,
  type ContractSponsors,
  type ContractStatus,
  type SponsorLogoStatus,
} from "./tournament-plan-contracts";
import type {Actor} from "./tournament-plans";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

/** O passo seguinte de cada status; cancelar é à parte (vale para qualquer status ativo). */
export const NEXT_STATUS: Readonly<Record<ContractStatus, ContractStatus | null>> = {
  requested: "deposit_paid",
  deposit_paid: "paid",
  paid: "completed",
  completed: null,
  cancelled: null,
};

/** Status em que o contrato ainda anda: cancela, recebe cota e tem logo para aprovar. */
const OPEN_STATUSES: readonly ContractStatus[] = ["requested", "deposit_paid", "paid"];

export const STATUS_LABEL: Readonly<Record<ContractStatus, string>> = {
  requested: "Solicitado",
  deposit_paid: "Sinal pago",
  paid: "Pago",
  completed: "Concluído",
  cancelled: "Cancelado",
};

/** Quando cada status aconteceu, além da linha no histórico. */
const STAMP: Readonly<Record<ContractStatus, string | null>> = {
  requested: null,
  deposit_paid: "depositPaidAt",
  paid: "paidAt",
  completed: "completedAt",
  cancelled: "cancelledAt",
};

export const NOTE_MAX = 280;

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const ID = /^[A-Za-z0-9_-]{2,64}$/;

function badField(field: string, message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [field]});
}

function noteOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "string" || v.trim().length > NOTE_MAX) throw badField("note");
  return v.trim();
}

function fmtDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// ── status do contrato ──────────────────────────────────────────────────────

export interface SetContractStatusInput {
  tournamentId: string;
  /** O status que a tela mostrava: dois atendentes no mesmo contrato não pulam etapa. */
  from: ContractStatus;
  to: ContractStatus;
  /** Observação da linha do histórico; obrigatória para cancelar (vira `cancelReason`). */
  note?: string | null;
}

export async function setContractStatusCore(
  db: Firestore,
  input: SetContractStatusInput,
  actor: Actor,
  now: Date,
): Promise<{tournamentId: string; status: ContractStatus}> {
  if (!isObj(input)) throw badField("tournamentId");
  const {tournamentId, from, to} = input;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badField("tournamentId");
  if (!CONTRACT_STATUSES.includes(from)) throw badField("from");
  if (!CONTRACT_STATUSES.includes(to) || to === "requested") throw badField("to");
  const note = noteOf(input.note);
  if (to === "cancelled" && note.length < 3) throw badField("note", "Informe o motivo do cancelamento.");
  const today = saoPauloDate(now);

  const ref = db.collection(CONTRACTS).doc(tournamentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? (snap.data() as Raw) : null;
    if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
    const status = c["status"] as ContractStatus;
    if (status !== from) {
      throw new HttpsError("failed-precondition",
        `Este contrato já está como "${STATUS_LABEL[status] ?? status}". Recarregue para ver o estado atual.`);
    }
    const allowed = to === "cancelled" ? OPEN_STATUSES.includes(status) : NEXT_STATUS[status] === to;
    if (!allowed) {
      throw new HttpsError("failed-precondition",
        `Um contrato "${STATUS_LABEL[status]}" não passa para "${STATUS_LABEL[to]}".`);
    }
    const endDate = String(c["endDate"] ?? c["startDate"] ?? "");
    if (to === "completed" && endDate && today < endDate) {
      throw new HttpsError("failed-precondition", `O evento vai até ${fmtDay(endDate)}: conclua o contrato depois disso.`);
    }
    const history = Array.isArray(c["history"]) ? c["history"] : [];
    const entry: Raw = {status: to, at: now, by: actor};
    if (note) entry["note"] = note;
    const patch: Raw = {status: to, updatedAt: now, updatedBy: actor, history: [...history, entry]};
    const stamp = STAMP[to];
    if (stamp) patch[stamp] = now;
    if (to === "cancelled") patch["cancelReason"] = note;
    tx.update(ref, patch);
    return {tournamentId, status: to};
  });
}

// ── logos das cotas ─────────────────────────────────────────────────────────

export type LogoDecision = "approve" | "reject";

export interface ReviewLogoInput {
  tournamentId: string;
  sponsorId: string;
  decision: LogoDecision;
  /** A logo que a tela mostrou: se o organizador trocou no meio, a decisão não vale para a nova. */
  logoUrl: string;
  /** Motivo da recusa (opcional), guardado em `logoRejectReason`. */
  reason?: string | null;
}

async function openContract(tx: Transaction, ref: DocumentReference): Promise<ContractSponsors> {
  const snap = await tx.get(ref);
  const c = snap.exists ? (snap.data() as Raw) : null;
  if (!c) throw new HttpsError("not-found", "Contrato não encontrado.");
  if (!OPEN_STATUSES.includes(c["status"] as ContractStatus)) {
    throw new HttpsError("failed-precondition", "Este contrato não aceita mais mudanças nas cotas.");
  }
  const cfg = isObj(c["sponsors"]) ? (c["sponsors"] as unknown as ContractSponsors) : null;
  if (!cfg?.enabled) throw new HttpsError("failed-precondition", "Este plano não tem cotas de patrocínio.");
  return cfg;
}

export async function reviewSponsorLogoCore(
  db: Firestore,
  input: ReviewLogoInput,
  actor: Actor,
  now: Date,
): Promise<{sponsorId: string; logoStatus: SponsorLogoStatus}> {
  if (!isObj(input)) throw badField("tournamentId");
  const {tournamentId, sponsorId, decision, logoUrl} = input;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badField("tournamentId");
  if (typeof sponsorId !== "string" || !ID.test(sponsorId)) throw badField("sponsorId");
  if (decision !== "approve" && decision !== "reject") throw badField("decision");
  if (typeof logoUrl !== "string" || !logoUrl) throw badField("logoUrl");
  const reason = decision === "reject" ? noteOf(input.reason) : "";
  const logoStatus: SponsorLogoStatus = decision === "approve" ? "approved" : "rejected";

  const contractRef = db.collection(CONTRACTS).doc(tournamentId);
  const ref = contractRef.collection(CONTRACT_SPONSORS).doc(sponsorId);
  return db.runTransaction(async (tx) => {
    await openContract(tx, contractRef);
    const sSnap = await tx.get(ref);
    const s = sSnap.exists ? (sSnap.data() as Raw) : null;
    if (!s) throw new HttpsError("not-found", "Patrocinador não encontrado.");
    if (!s["logoUrl"]) throw new HttpsError("failed-precondition", "Este patrocinador ainda não enviou a logo.");
    if (s["logoUrl"] !== logoUrl) {
      throw new HttpsError("failed-precondition", "A logo foi trocada desde que você abriu. Recarregue para ver a nova.");
    }
    tx.update(ref, {
      logoStatus,
      logoRejectReason: decision === "reject" ? reason || null : null,
      logoReviewedAt: now,
      logoReviewedBy: actor,
      updatedAt: now,
    });
    return {sponsorId, logoStatus};
  });
}

// ── patrocinadores da NexaGO ────────────────────────────────────────────────

export type NexagoSponsorAction = "add" | "logo" | "remove";

export interface SaveNexagoSponsorInput {
  tournamentId: string;
  action: NexagoSponsorAction;
  /** Gerado pela tela no `add`: o logo sobe antes, no caminho com este id. */
  sponsorId: string;
  name?: string;
  tierId?: string;
  logoUrl?: string | null;
}

/**
 * Cota vendida pela NexaGO: entra com `source: "nexago"` (o organizador vê, não mexe) e a logo
 * já aprovada — quem sobe é a própria equipe. Mesmo teto por nível que o organizador respeita.
 */
export async function saveNexagoSponsorCore(
  db: Firestore,
  input: SaveNexagoSponsorInput,
  actor: Actor,
  now: Date,
): Promise<{sponsorId: string; logoStatus: SponsorLogoStatus | null}> {
  if (!isObj(input)) throw badField("tournamentId");
  const {tournamentId, action, sponsorId} = input;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badField("tournamentId");
  if (action !== "add" && action !== "logo" && action !== "remove") throw badField("action");
  if (typeof sponsorId !== "string" || !ID.test(sponsorId)) throw badField("sponsorId");
  const logoUrl = input.logoUrl ?? null;
  if ((action === "logo" || logoUrl !== null) && !isSponsorLogoUrl(logoUrl, tournamentId, sponsorId)) {
    throw badField("logoUrl");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (action === "add" && (name.length < 2 || name.length > SPONSOR_NAME_MAX)) throw badField("name");

  const contractRef = db.collection(CONTRACTS).doc(tournamentId);
  const sponsors = contractRef.collection(CONTRACT_SPONSORS);
  const ref = sponsors.doc(sponsorId);
  return db.runTransaction(async (tx) => {
    const cfg = await openContract(tx, contractRef);
    const sSnap = await tx.get(ref);
    const s = sSnap.exists ? (sSnap.data() as Raw) : null;

    if (action === "add") {
      if (s) throw new HttpsError("already-exists", "Patrocinador já cadastrado.");
      const tier = cfg.tiers.find((x) => x.id === input.tierId);
      if (!tier) throw badField("tierId");
      const sold = (await tx.get(sponsors.where("tierId", "==", tier.id))).docs.length;
      if (sold >= tier.maxPerEvent) {
        throw new HttpsError("resource-exhausted", `As ${tier.maxPerEvent} cotas ${tier.name} deste evento já foram vendidas.`);
      }
      const logoStatus: SponsorLogoStatus = logoUrl ? "approved" : "missing";
      tx.set(ref, {name, tierId: tier.id, tier: {...tier}, logoUrl, logoStatus, source: "nexago",
        createdAt: now, createdBy: actor, updatedAt: now});
      return {sponsorId, logoStatus};
    }
    if (!s) throw new HttpsError("not-found", "Patrocinador não encontrado.");
    if (s["source"] !== "nexago") {
      throw new HttpsError("permission-denied",
        "Este patrocinador foi indicado pelo organizador: aprove ou recuse a logo, sem trocar nem remover.");
    }
    if (action === "logo") {
      tx.update(ref, {logoUrl, logoStatus: "approved", logoRejectReason: null, updatedAt: now});
      return {sponsorId, logoStatus: "approved" as SponsorLogoStatus};
    }
    tx.delete(ref);
    return {sponsorId, logoStatus: null};
  });
}

// ── callables ───────────────────────────────────────────────────────────────

async function adminActorOf(auth: {uid?: string} | undefined): Promise<Actor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  let caller;
  try {
    caller = await getAuth().getUser(auth.uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem atender os contratos de plano.");
  }
  return {uid: auth.uid, name: caller.displayName ?? caller.email ?? auth.uid};
}

export const setTournamentPlanContractStatus = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await adminActorOf(request.auth);
  return setContractStatusCore(getFirestore(), (request.data ?? {}) as SetContractStatusInput, actor, new Date());
});

export const reviewPlanContractSponsorLogo = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await adminActorOf(request.auth);
  return reviewSponsorLogoCore(getFirestore(), (request.data ?? {}) as ReviewLogoInput, actor, new Date());
});

export const saveNexagoPlanContractSponsor = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await adminActorOf(request.auth);
  return saveNexagoSponsorCore(getFirestore(), (request.data ?? {}) as SaveNexagoSponsorInput, actor, new Date());
});
