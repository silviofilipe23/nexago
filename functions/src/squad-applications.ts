/**
 * NexaSquad: candidaturas e convites (backoffice › Squad › Candidaturas & convites, tela 04).
 *
 *   squadApplications/{id}  — uma por candidatura (portal/app) ou convite direto (`source: manual`).
 *                             `stage`: new → review → invited → contract; fora do kanban = `archived`
 *                             (`archivedReason`: rejected · waitlist · expired · canceled · accepted).
 *                             `snapshot` = dados do NexaGO lidos na criação (torneios, Elo, ranking…).
 *   squadInvites/{id}       — o convite: scheduled (piloto cheio) → sent → opened → accepted;
 *                             expired/canceled. O atleta lê o próprio (App 06 · Convite recebido).
 *   squadConfig/cycle       — `{id, start, end, seats}`; ausente = piloto de 20 vagas (`DEFAULT_CYCLE`).
 *
 * O aceite cria/atualiza `squadAmbassadors/{uid}` (o contrato que a atribuição e as comissões já
 * leem), com a versão vigente das regras. Rules negam escrita de cliente: estas callables são a porta.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {artifactsPublicDataBase} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {SAND_RANK_TRACK, sandRankLabel} from "./sand-rank-engine";
import {SQUAD_AMBASSADORS} from "./squad-commissions";
import {
  DAY_MS,
  DEFAULT_CYCLE,
  INVITE_TTL_DAYS,
  LEADS_GROUPS,
  REJECTION_MESSAGE,
  freeSeats,
  isValidCode,
  nextCycleStart,
  normalizeCode,
  suggestTier,
  sweepAction,
  type ArchivedReason,
  type Cycle,
  type InviteStatus,
  type LeadsGroup,
  type Stage,
} from "./squad-program";
import {
  DEFAULT_SQUAD_RULES,
  SQUAD_CONFIG,
  SQUAD_RULES_DOC,
  SQUAD_TIERS,
  TIER_LABELS,
  commissionFloor,
  type Actor,
  type SquadRules,
  type SquadTier,
} from "./squad-rules";
import {INVITES_COLLECTION} from "./tournament-invite-constants";

export {REJECTION_MESSAGE};

export const SQUAD_APPLICATIONS = "squadApplications";
export const SQUAD_INVITES = "squadInvites";
export const CYCLE_DOC = "cycle";

const REASON_MAX = 280;
const NOTE_MAX = 1000;
const MESSAGE_MAX = 500;
const WHY_MAX = 1000;
const MAX_FOLLOWERS = 100_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Brasil sem horário de verão desde 2019. */
const SP_OFFSET = "-03:00";

/** Avisos ao atleta: push + inbox. Injetável para os testes. */
export type Notify = (uid: string, title: string, body: string, data: Record<string, string>) => Promise<void>;

type Raw = Record<string, unknown>;

// ── utilidades ──────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown, min: number, max: number): v is string {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}

export function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return v && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

export function spDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(date);
}

/** Meia-noite de SP da data civil. */
function startOfKey(key: string): Date {
  return new Date(`${key}T00:00:00${SP_OFFSET}`);
}

function dmy(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

function invalid(fields: string[], message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields});
}

function reasonOf(v: unknown, field = "reason"): string {
  if (!text(v, 3, REASON_MAX)) throw invalid([field], "Escreva o motivo (3 a 280 caracteres).");
  return v.trim();
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

// ── config ──────────────────────────────────────────────────────────────────

export async function loadCycle(db: Firestore): Promise<Cycle> {
  const d = (await db.collection(SQUAD_CONFIG).doc(CYCLE_DOC).get()).data();
  if (!isObj(d)) return {...DEFAULT_CYCLE};
  const start = DATE_RE.test(str(d["start"])) ? str(d["start"]) : DEFAULT_CYCLE.start;
  const end = DATE_RE.test(str(d["end"])) ? str(d["end"]) : DEFAULT_CYCLE.end;
  const seats = Number.isInteger(d["seats"]) && (d["seats"] as number) > 0 ? (d["seats"] as number) : DEFAULT_CYCLE.seats;
  return {id: str(d["id"]) || DEFAULT_CYCLE.id, start, end, seats};
}

/** Regras vigentes + número da versão (doc ausente = v1, o padrão do piloto). */
export async function loadCurrentRules(db: Firestore): Promise<{rules: SquadRules; version: number}> {
  const d = (await db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC).get()).data();
  const version = typeof d?.["version"] === "number" ? (d["version"] as number) : 1;
  const rules = isObj(d?.["rules"]) && isObj((d!["rules"] as Raw)["tiers"]) ? (d!["rules"] as unknown as SquadRules) : DEFAULT_SQUAD_RULES;
  return {rules, version};
}

// ── dados do NexaGO ─────────────────────────────────────────────────────────

export interface AthleteSnapshot {
  name: string;
  city: string | null;
  state: string | null;
  arenaName: string | null;
  photoUrl: string | null;
  tournaments: number | null;
  elo: string | null;
  rankingPoints: number | null;
  rankingPosition: number | null;
  /** Atletas distintos que aceitaram convite de dupla/equipe dele. */
  referredCount: number | null;
  /** Denúncias/W.O. — ainda sem fonte consolidada. */
  conductIncidents: number | null;
  memberSince: Date | null;
}

/** Lê o que já existe no NexaGO. Campo sem fonte fica `null` (a tela mostra "—", nunca inventa). */
export async function athleteSnapshot(db: Firestore, uid: string): Promise<AthleteSnapshot | null> {
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const u = userSnap.data() ?? {};
  const name = str(u["fullName"]) || str(u["name"]) || str(u["displayName"]) || str(u["nickname"]) || "Atleta";

  const ranking = (await db.doc(`${artifactsPublicDataBase()}/athleteRankings/${uid}`).get()).data();
  const rankingPoints = numOrNull(ranking?.["totalPoints"]);
  let rankingPosition: number | null = null;
  if (rankingPoints !== null) {
    try {
      const above = await db.collection(`${artifactsPublicDataBase()}/athleteRankings`)
        .where("totalPoints", ">", rankingPoints).count().get();
      rankingPosition = above.data().count + 1;
    } catch {
      rankingPosition = null;
    }
  }

  const invites = await db.collection(INVITES_COLLECTION)
    .where("inviterUid", "==", uid).where("status", "==", "accepted").get();
  const referred = new Set(invites.docs.map((d) => str(d.data()["inviteeUid"])).filter(Boolean));

  const sandRank = isObj(u["sandRank"]) ? u["sandRank"] : null;
  const step = sandRank && Number.isInteger(sandRank["trackIndex"]) ? SAND_RANK_TRACK[sandRank["trackIndex"] as number] : undefined;

  return {
    name,
    city: str(u["city"]) || null,
    state: str(u["state"]) || null,
    arenaName: str(u["mainArenaName"]) || null,
    photoUrl: str(u["profilePhotoUrl"]) || str(u["photoURL"]) || str(u["avatarUrl"]) || null,
    tournaments: numOrNull(ranking?.["tournamentsCount"]),
    elo: step ? sandRankLabel(step) : null,
    rankingPoints,
    rankingPosition,
    referredCount: referred.size,
    conductIncidents: null,
    memberSince: dateOf(u["createdAt"]),
  };
}

function leadsGroupOf(v: unknown): LeadsGroup | null {
  return typeof v === "string" && (LEADS_GROUPS as readonly string[]).includes(v) ? (v as LeadsGroup) : null;
}

/** Nível sugerido pelos dados da candidatura (formulário + snapshot + redes). */
export function autoTier(app: Raw): SquadTier {
  const snap = isObj(app["snapshot"]) ? app["snapshot"] : {};
  const social = isObj(app["social"]) ? app["social"] : {};
  const answers = isObj(app["answers"]) ? app["answers"] : {};
  return suggestTier({
    leadsGroup: leadsGroupOf(answers["leadsGroup"]),
    referredCount: numOrNull(snap["referredCount"]),
    rankingPosition: numOrNull(snap["rankingPosition"]),
    followers: numOrNull(social["followers"]),
    engagementPct: numOrNull(social["engagementPct"]),
    tournaments: numOrNull(snap["tournaments"]),
  });
}

// ── vagas ───────────────────────────────────────────────────────────────────

const LIVE_CONTRACT = ["active", "paused"];
const OUTSTANDING_INVITE: InviteStatus[] = ["sent", "opened"];

async function liveContract(db: Firestore, uid: string): Promise<Raw | null> {
  const d = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data();
  return d && LIVE_CONTRACT.includes(str(d["status"])) ? d : null;
}

async function invitesWithStatus(db: Firestore, statuses: InviteStatus[]) {
  const snaps = await Promise.all(statuses.map((s) => db.collection(SQUAD_INVITES).where("status", "==", s).get()));
  return snaps.flatMap((s) => s.docs);
}

export async function seatsLeft(db: Firestore, cycle: Cycle): Promise<number> {
  const [active, paused, outstanding] = await Promise.all([
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "active").get(),
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "paused").get(),
    invitesWithStatus(db, OUTSTANDING_INVITE),
  ]);
  return freeSeats(cycle, active.size + paused.size, outstanding.length);
}

function blockedByContract(name: string, contract: Raw): HttpsError {
  const tier = isTier(contract["tier"]) ? TIER_LABELS[contract["tier"]] : "embaixador";
  const end = dateOf(contract["end"]);
  const until = end ? ` até ${dmy(spDateKey(end))}` : "";
  return new HttpsError("failed-precondition", `${name} já é ${tier}${until}.`, {field: "athleteId"});
}

// ── candidatura (atleta) ────────────────────────────────────────────────────

export interface ApplicationAnswers {
  instagram?: string | null;
  city: string;
  leadsGroup: LeadsGroup;
  why: string;
}

export async function submitApplicationCore(
  db: Firestore,
  input: {uid: string; source: unknown; answers: unknown},
  now: Date,
): Promise<{applicationId: string}> {
  const a = isObj(input.answers) ? input.answers : {};
  const fields: string[] = [];
  const instagram = a["instagram"] == null || a["instagram"] === "" ? null : a["instagram"];
  if (instagram !== null && !text(instagram, 2, 60)) fields.push("instagram");
  if (!text(a["city"], 2, 80)) fields.push("city");
  if (!leadsGroupOf(a["leadsGroup"])) fields.push("leadsGroup");
  if (!text(a["why"], 10, WHY_MAX)) fields.push("why");
  const source = input.source === "app" ? "app" : input.source === "portal" ? "portal" : null;
  if (!source) fields.push("source");
  if (fields.length > 0) throw invalid(fields);

  if (await liveContract(db, input.uid)) {
    throw new HttpsError("failed-precondition", "Você já faz parte do NexaSquad.");
  }
  const mine = await db.collection(SQUAD_APPLICATIONS).where("athleteId", "==", input.uid).get();
  if (mine.docs.some((d) => d.data()["stage"] !== "archived")) {
    throw new HttpsError("already-exists", "Você já tem uma candidatura em andamento.");
  }
  const snapshot = await athleteSnapshot(db, input.uid);
  if (!snapshot) throw new HttpsError("failed-precondition", "Complete seu cadastro antes de se candidatar.");

  const answers: ApplicationAnswers = {
    instagram: instagram === null ? null : (instagram as string).trim().replace(/^@/, ""),
    city: (a["city"] as string).trim(),
    leadsGroup: a["leadsGroup"] as LeadsGroup,
    why: (a["why"] as string).trim(),
  };
  const ref = db.collection(SQUAD_APPLICATIONS).doc();
  const doc: Raw = {
    athleteId: input.uid,
    athleteName: snapshot.name,
    submittedAt: now,
    source,
    answers,
    social: null,
    snapshot,
    stage: "new",
    archivedReason: null,
    internalReason: null,
    notes: [],
    inviteId: null,
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
  };
  doc["suggestedTier"] = autoTier(doc);
  doc["suggestedBy"] = "auto";
  await ref.set(doc);
  return {applicationId: ref.id};
}

// ── ações do time na candidatura ────────────────────────────────────────────

export type ApplicationAction =
  | {action: "review"}
  | {action: "reject"; reason: string}
  | {action: "waitlist"; reason?: string | null}
  | {action: "restore"}
  | {action: "note"; text: string}
  | {action: "social"; followers: number; engagementPct: number | null}
  | {action: "suggest"; tier: SquadTier | "auto"};

export async function updateApplicationCore(
  db: Firestore,
  input: {applicationId: string} & ApplicationAction,
  actor: Actor,
  now: Date,
  notify: Notify,
): Promise<{stage: Stage}> {
  if (!isObj(input) || typeof input.applicationId !== "string" || !input.applicationId) {
    throw invalid(["applicationId"], "Candidatura inválida.");
  }
  const ref = db.collection(SQUAD_APPLICATIONS).doc(input.applicationId);
  let rejectedUid: string | null = null;

  const stage = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Candidatura não encontrada.");
    const d = snap.data()!;
    const current = str(d["stage"]) as Stage;
    const need = (...stages: Stage[]) => {
      if (!stages.includes(current)) {
        throw new HttpsError("failed-precondition", "A candidatura mudou de etapa. Recarregue a tela.");
      }
    };
    const move = (next: Stage, extra: Raw = {}) => {
      tx.update(ref, {stage: next, stageChangedAt: now, updatedAt: now, ...extra});
      return next;
    };

    switch (input.action) {
    case "review":
      need("new");
      return move("review", {reviewedBy: actor});
    case "reject": {
      need("new", "review");
      const reason = reasonOf(input.reason);
      rejectedUid = str(d["athleteId"]) || null;
      return move("archived", {archivedReason: "rejected" satisfies ArchivedReason, internalReason: reason, archivedBy: actor});
    }
    case "waitlist": {
      need("review");
      const reason = input.reason == null || input.reason === "" ? null : reasonOf(input.reason);
      return move("archived", {archivedReason: "waitlist" satisfies ArchivedReason, internalReason: reason, archivedBy: actor});
    }
    case "restore":
      // Lista de espera e recusada voltam para análise; expirado/cancelado volta pelo reenvio do convite.
      if (current !== "archived" || !["waitlist", "rejected"].includes(str(d["archivedReason"]))) {
        throw new HttpsError("failed-precondition", "Só candidatura em lista de espera ou recusada volta para análise.");
      }
      return move("review", {archivedReason: null, internalReason: null});
    case "note": {
      if (!text(input.text, 1, NOTE_MAX)) throw invalid(["text"], "Escreva a nota (até 1000 caracteres).");
      const notes = Array.isArray(d["notes"]) ? d["notes"] : [];
      tx.update(ref, {notes: [...notes, {by: actor, at: now, text: input.text.trim()}], updatedAt: now});
      return current;
    }
    case "social": {
      const fields: string[] = [];
      if (!Number.isInteger(input.followers) || input.followers < 0 || input.followers > MAX_FOLLOWERS) fields.push("followers");
      const eng = input.engagementPct ?? null;
      if (eng !== null && !(typeof eng === "number" && eng >= 0 && eng <= 100)) fields.push("engagementPct");
      if (fields.length > 0) throw invalid(fields);
      const social = {followers: input.followers, engagementPct: eng, checkedAt: now, checkedBy: actor};
      const extra: Raw = {social, updatedAt: now};
      if (d["suggestedBy"] === "auto") extra["suggestedTier"] = autoTier({...d, social});
      tx.update(ref, extra);
      return current;
    }
    case "suggest": {
      if (input.tier === "auto") {
        tx.update(ref, {suggestedTier: autoTier(d), suggestedBy: "auto", updatedAt: now});
      } else if (isTier(input.tier)) {
        tx.update(ref, {suggestedTier: input.tier, suggestedBy: actor.uid, updatedAt: now});
      } else {
        throw invalid(["tier"]);
      }
      return current;
    }
    default:
      throw invalid(["action"]);
    }
  });

  if (rejectedUid) {
    await notify(rejectedUid, "NexaSquad", REJECTION_MESSAGE, {kind: "application_rejected"}).catch((err) =>
      logger.warn("squad: aviso de candidatura recusada falhou", {err: String(err)}));
  }
  return {stage};
}

// ── convite ─────────────────────────────────────────────────────────────────

export interface SendInviteInput {
  athleteId: string;
  applicationId?: string | null;
  tier: SquadTier;
  /** Só Pro, dentro da faixa da versão vigente. */
  commissionPct?: number | null;
  suggestedCode: string;
  /** Datas civis (YYYY-MM-DD). Início ausente = data do aceite; fim ausente = fim do ciclo. */
  periodStart?: string | null;
  periodEnd?: string | null;
  message?: string | null;
}

function inviteBody(tier: SquadTier): string {
  return `Você foi convidado para o NexaSquad como ${TIER_LABELS[tier]}. Abra o app para ver o convite.`;
}

export async function sendInviteCore(
  db: Firestore,
  input: SendInviteInput,
  actor: Actor,
  now: Date,
  notify: Notify,
): Promise<{inviteId: string; applicationId: string; status: "sent" | "scheduled"; scheduledFor: string | null}> {
  if (!isObj(input)) throw invalid(["athleteId"]);
  const todayKey = spDateKey(now);
  const fields: string[] = [];
  if (typeof input.athleteId !== "string" || !input.athleteId) fields.push("athleteId");
  if (!isTier(input.tier)) fields.push("tier");
  const code = normalizeCode(input.suggestedCode);
  if (!isValidCode(code)) fields.push("suggestedCode");
  const periodStart = input.periodStart || null;
  const periodEnd = input.periodEnd || null;
  if (periodStart !== null && (!DATE_RE.test(periodStart) || periodStart < todayKey)) fields.push("periodStart");
  if (periodEnd !== null && (!DATE_RE.test(periodEnd) || periodEnd <= (periodStart ?? todayKey))) fields.push("periodEnd");
  const message = input.message == null || input.message === "" ? null : input.message;
  if (message !== null && !text(message, 1, MESSAGE_MAX)) fields.push("message");
  if (fields.length > 0) throw invalid(fields);

  const [{rules}, cycle] = await Promise.all([loadCurrentRules(db), loadCycle(db)]);
  const pkg = rules.tiers[input.tier];
  let commissionPct: number | null = null;
  if (input.tier === "pro") {
    const range = Array.isArray(pkg.commissionPct) ? pkg.commissionPct : [pkg.commissionPct, pkg.commissionPct];
    const pct = input.commissionPct;
    if (typeof pct !== "number" || pct < range[0] || pct > range[1]) {
      throw invalid(["commissionPct"], `Comissão do Pro entre ${range[0]}% e ${range[1]}%.`);
    }
    commissionPct = pct;
  }

  const athlete = await athleteSnapshot(db, input.athleteId);
  if (!athlete) throw new HttpsError("not-found", "Conta de atleta não encontrada.", {field: "athleteId"});
  const contract = await liveContract(db, input.athleteId);
  if (contract) throw blockedByContract(athlete.name, contract);

  const pending = await db.collection(SQUAD_INVITES).where("athleteId", "==", input.athleteId).get();
  if (pending.docs.some((d) => ["scheduled", "sent", "opened"].includes(str(d.data()["status"])))) {
    throw new HttpsError("failed-precondition", `${athlete.name} já tem um convite em aberto.`, {field: "athleteId"});
  }
  const clash = await db.collection(SQUAD_AMBASSADORS).where("code", "==", code).get();
  if (clash.docs.some((d) => d.id !== input.athleteId && LIVE_CONTRACT.includes(str(d.data()["status"])))) {
    throw invalid(["suggestedCode"], `O código ${code} já está em uso.`);
  }

  const full = (await seatsLeft(db, cycle)) <= 0;
  const scheduledFor = full ? nextCycleStart(cycle) : null;
  const status: "sent" | "scheduled" = full ? "scheduled" : "sent";

  const appRef = input.applicationId ?
    db.collection(SQUAD_APPLICATIONS).doc(input.applicationId) :
    db.collection(SQUAD_APPLICATIONS).doc();
  const inviteRef = db.collection(SQUAD_INVITES).doc();

  await db.runTransaction(async (tx) => {
    if (input.applicationId) {
      const app = await tx.get(appRef);
      if (!app.exists) throw new HttpsError("not-found", "Candidatura não encontrada.");
      const d = app.data()!;
      if (d["athleteId"] !== input.athleteId) throw invalid(["applicationId"]);
      const okStage = d["stage"] === "review" ||
        (d["stage"] === "archived" && ["waitlist", "expired", "canceled"].includes(str(d["archivedReason"])));
      if (!okStage) throw new HttpsError("failed-precondition", "A candidatura mudou de etapa. Recarregue a tela.");
      tx.update(appRef, {
        stage: "invited", stageChangedAt: now, updatedAt: now, inviteId: inviteRef.id,
        archivedReason: null, internalReason: null,
      });
    } else {
      // Convite direto: o card nasce em Convidados.
      tx.set(appRef, {
        athleteId: input.athleteId,
        athleteName: athlete.name,
        submittedAt: now,
        source: "manual",
        answers: null,
        social: null,
        snapshot: athlete,
        suggestedTier: input.tier,
        suggestedBy: actor.uid,
        stage: "invited",
        archivedReason: null,
        internalReason: null,
        notes: [],
        inviteId: inviteRef.id,
        createdAt: now,
        updatedAt: now,
        stageChangedAt: now,
      });
    }
    tx.set(inviteRef, {
      athleteId: input.athleteId,
      athleteName: athlete.name,
      applicationId: appRef.id,
      tier: input.tier,
      commissionPct,
      suggestedCode: code,
      periodStart,
      periodEnd: periodEnd ?? cycle.end,
      message: message?.trim() ?? null,
      scheduledFor,
      sentAt: full ? null : now,
      openedAt: null,
      acceptedAt: null,
      expiresAt: full ? null : new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
      status,
      reminders: [],
      cycleId: cycle.id,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
    });
  });

  if (!full) {
    await notify(input.athleteId, "Convite para o NexaSquad", inviteBody(input.tier), {kind: "invite", inviteId: inviteRef.id})
      .catch((err) => logger.warn("squad: push do convite falhou", {inviteId: inviteRef.id, err: String(err)}));
  }
  return {inviteId: inviteRef.id, applicationId: appRef.id, status, scheduledFor};
}

/** Reenviar (prazo recomeça; no contrato enviado é só o lembrete) ou cancelar. */
export async function updateInviteCore(
  db: Firestore,
  input: {inviteId: string; action: "resend" | "cancel"},
  actor: Actor,
  now: Date,
  notify: Notify,
): Promise<{status: InviteStatus}> {
  if (!isObj(input) || typeof input.inviteId !== "string" || !input.inviteId) throw invalid(["inviteId"]);
  if (input.action !== "resend" && input.action !== "cancel") throw invalid(["action"]);
  const ref = db.collection(SQUAD_INVITES).doc(input.inviteId);
  let push: {uid: string; title: string; body: string} | null = null;
  // Expirado já devolveu a vaga: reenviar com o piloto cheio passaria do limite.
  const full = input.action === "resend" && (await seatsLeft(db, await loadCycle(db))) <= 0;

  const status = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const d = snap.data()!;
    const current = str(d["status"]) as InviteStatus;
    const appRef = d["applicationId"] ? db.collection(SQUAD_APPLICATIONS).doc(str(d["applicationId"])) : null;
    const app = appRef ? await tx.get(appRef) : null;
    const tier = isTier(d["tier"]) ? d["tier"] : "ath";

    if (input.action === "cancel") {
      if (!["scheduled", "sent", "opened"].includes(current)) {
        throw new HttpsError("failed-precondition", "Este convite não está mais em aberto.");
      }
      tx.update(ref, {status: "canceled", canceledAt: now, canceledBy: actor, updatedAt: now});
      if (appRef && app?.exists) {
        tx.update(appRef, {stage: "archived", archivedReason: "canceled", stageChangedAt: now, updatedAt: now});
      }
      return "canceled" as const;
    }

    if (current === "opened") {
      const reminders = Array.isArray(d["reminders"]) ? d["reminders"] : [];
      tx.update(ref, {reminders: [...reminders, `manual_${now.toISOString()}`], updatedAt: now});
      push = {uid: str(d["athleteId"]), title: "Seu convite do NexaSquad", body: "Falta só assinar para entrar no Squad."};
      return current;
    }
    if (current !== "sent" && current !== "expired") {
      throw new HttpsError("failed-precondition", "Só convite enviado, aberto ou expirado pode ser reenviado.");
    }
    if (current === "expired" && full) {
      throw new HttpsError("failed-precondition", "Piloto cheio: envie um convite novo, que entra agendado para o próximo ciclo.");
    }
    tx.update(ref, {
      status: "sent", sentAt: now, openedAt: null, reminders: [],
      expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS), resentBy: actor, updatedAt: now,
    });
    if (appRef && app?.exists) {
      tx.update(appRef, {stage: "invited", archivedReason: null, stageChangedAt: now, updatedAt: now});
    }
    push = {uid: str(d["athleteId"]), title: "Convite para o NexaSquad", body: inviteBody(tier)};
    return "sent" as const;
  });

  const p = push as {uid: string; title: string; body: string} | null;
  if (p) {
    await notify(p.uid, p.title, p.body, {kind: "invite", inviteId: input.inviteId})
      .catch((err) => logger.warn("squad: push do reenvio falhou", {inviteId: input.inviteId, err: String(err)}));
  }
  return {status};
}

// ── atleta: abrir e aceitar ─────────────────────────────────────────────────

/** O atleta abriu o convite no app: o card vai para Contrato enviado e o prazo conta da abertura. */
export async function openInviteCore(
  db: Firestore,
  input: {uid: string; inviteId: unknown},
  now: Date,
): Promise<{status: InviteStatus}> {
  if (typeof input.inviteId !== "string" || !input.inviteId) throw invalid(["inviteId"]);
  const ref = db.collection(SQUAD_INVITES).doc(input.inviteId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!snap.exists || !d || d["athleteId"] !== input.uid) throw new HttpsError("not-found", "Convite não encontrado.");
    const status = str(d["status"]) as InviteStatus;
    if (status !== "sent") return {status};
    const expiresAt = dateOf(d["expiresAt"]);
    if (expiresAt && now >= expiresAt) return {status};
    tx.update(ref, {
      status: "opened", openedAt: now, updatedAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
    });
    if (d["applicationId"]) {
      tx.update(db.collection(SQUAD_APPLICATIONS).doc(str(d["applicationId"])), {
        stage: "contract", stageChangedAt: now, updatedAt: now,
      });
    }
    return {status: "opened" as const};
  });
}

/**
 * "Entrar no Squad": valida o código (único entre contratos vivos), cria/atualiza o contrato
 * `squadAmbassadors/{uid}` com a versão vigente das regras e tira o card do kanban.
 * O pedido do kit na Loja fica para depois (follow-up do PR).
 */
export async function acceptInviteCore(
  db: Firestore,
  input: {uid: string; inviteId: unknown; code: unknown},
  now: Date,
): Promise<{code: string; tier: SquadTier; rulesVersion: number}> {
  if (typeof input.inviteId !== "string" || !input.inviteId) throw invalid(["inviteId"]);
  const code = normalizeCode(input.code);
  if (!isValidCode(code)) throw invalid(["code"], "Código com 4 a 12 letras (A–Z) ou números.");

  const [{rules, version}, cycle, athlete] = await Promise.all([
    loadCurrentRules(db), loadCycle(db), athleteSnapshot(db, input.uid),
  ]);
  const inviteRef = db.collection(SQUAD_INVITES).doc(input.inviteId);
  const contractRef = db.collection(SQUAD_AMBASSADORS).doc(input.uid);
  const clashQuery = db.collection(SQUAD_AMBASSADORS).where("code", "==", code);

  return db.runTransaction(async (tx) => {
    const [invite, current, clash] = await Promise.all([tx.get(inviteRef), tx.get(contractRef), tx.get(clashQuery)]);
    const d = invite.data();
    if (!invite.exists || !d || d["athleteId"] !== input.uid) throw new HttpsError("not-found", "Convite não encontrado.");
    const status = str(d["status"]);
    const expiresAt = dateOf(d["expiresAt"]);
    if ((status !== "sent" && status !== "opened") || (expiresAt && now >= expiresAt)) {
      throw new HttpsError("failed-precondition", "Este convite não está mais válido.");
    }
    if (current.exists && LIVE_CONTRACT.includes(str(current.data()?.["status"]))) {
      throw new HttpsError("failed-precondition", "Você já tem um contrato ativo no NexaSquad.");
    }
    if (clash.docs.some((c) => c.id !== input.uid && LIVE_CONTRACT.includes(str(c.data()["status"])))) {
      throw invalid(["code"], "Esse código já está em uso. Escolha outro.");
    }
    const tier = isTier(d["tier"]) ? d["tier"] : "ath";
    const pkg = rules.tiers[tier];
    const commissionPct = typeof d["commissionPct"] === "number" ? d["commissionPct"] : commissionFloor(pkg.commissionPct);
    const periodStart = str(d["periodStart"]);
    const start = periodStart && periodStart > spDateKey(now) ? startOfKey(periodStart) : now;
    const endKey = str(d["periodEnd"]) || cycle.end;
    const prev = current.exists ? current.data()! : null;

    tx.set(contractRef, {
      athleteId: input.uid,
      displayName: athlete?.name ?? str(d["athleteName"]),
      city: athlete?.city ?? null,
      state: athlete?.state ?? null,
      arenaName: athlete?.arenaName ?? null,
      tier,
      code,
      slug: code.toLowerCase(),
      commissionPct,
      followerDiscountPct: pkg.followerDiscountPct,
      rulesVersion: version,
      status: "active",
      start,
      end: new Date(`${endKey}T23:59:59${SP_OFFSET}`),
      pausedAt: null,
      pausedUntil: null,
      pauseReason: null,
      endsAt: null,
      endReason: null,
      endNote: null,
      endedAt: null,
      amendments: [],
      inviteId: invite.id,
      cycleId: str(d["cycleId"]) || cycle.id,
      createdAt: prev?.["createdAt"] ?? now,
      updatedAt: now,
    });
    tx.update(inviteRef, {status: "accepted", acceptedAt: now, acceptedCode: code, updatedAt: now});
    if (d["applicationId"]) {
      tx.update(db.collection(SQUAD_APPLICATIONS).doc(str(d["applicationId"])), {
        stage: "archived", archivedReason: "accepted", stageChangedAt: now, updatedAt: now,
      });
    }
    return {code, tier, rulesVersion: version};
  });
}

// ── varredura: lembretes, expiração e convites agendados ────────────────────

export async function sweepInvitesCore(
  db: Firestore,
  now: Date,
  notify: Notify,
): Promise<{sent: number; reminded: number; expired: number}> {
  const todayKey = spDateKey(now);
  const docs = await invitesWithStatus(db, ["scheduled", "sent", "opened"]);
  const out = {sent: 0, reminded: 0, expired: 0};
  for (const doc of docs) {
    const d = doc.data();
    const action = sweepAction({
      status: str(d["status"]) as InviteStatus,
      sentAt: dateOf(d["sentAt"]),
      openedAt: dateOf(d["openedAt"]),
      expiresAt: dateOf(d["expiresAt"]),
      scheduledFor: str(d["scheduledFor"]) || null,
      reminders: Array.isArray(d["reminders"]) ? d["reminders"].map(String) : [],
    }, now, todayKey);
    if (!action) continue;
    const uid = str(d["athleteId"]);
    const tier = isTier(d["tier"]) ? d["tier"] : "ath";
    const appRef = d["applicationId"] ? db.collection(SQUAD_APPLICATIONS).doc(str(d["applicationId"])) : null;
    try {
      if (action.kind === "send") {
        await doc.ref.update({
          status: "sent", sentAt: now, expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS), updatedAt: now,
        });
        await notify(uid, "Convite para o NexaSquad", inviteBody(tier), {kind: "invite", inviteId: doc.id});
        out.sent++;
      } else if (action.kind === "expire") {
        await doc.ref.update({status: "expired", expiredAt: now, updatedAt: now});
        if (appRef) {
          await appRef.update({stage: "archived", archivedReason: "expired", stageChangedAt: now, updatedAt: now});
        }
        out.expired++;
      } else {
        const reminders = Array.isArray(d["reminders"]) ? d["reminders"] : [];
        await doc.ref.update({reminders: [...reminders, action.key], updatedAt: now});
        const body = action.key === "sent_d3" ?
          "Seu convite para o NexaSquad está esperando. Ele vale por mais 4 dias." :
          "Falta só assinar para entrar no NexaSquad.";
        await notify(uid, "Seu convite do NexaSquad", body, {kind: "invite", inviteId: doc.id});
        out.reminded++;
      }
    } catch (err) {
      logger.error("squad: varredura do convite falhou", {inviteId: doc.id, action: action.kind, err: String(err)});
    }
  }
  return out;
}

// ── callables ───────────────────────────────────────────────────────────────

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};
const NOTIFY_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export const notifySquad: Notify = async (uid, title, body, data) => {
  await deliverNotificationToUser({userId: uid, title, body, type: "squad_program", data});
};

/** Mesma porta das outras telas do Squad: admin da plataforma ou super admin. */
export async function assertSquadEditor(uid: string | undefined): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma operam o NexaSquad.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

function athleteUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const submitSquadApplication = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = athleteUid(request.auth?.uid);
  const data = (request.data ?? {}) as {source?: unknown; answers?: unknown};
  return submitApplicationCore(getFirestore(), {uid, source: data.source, answers: data.answers}, new Date());
});

export const updateSquadApplication = onCall({...BACKOFFICE_CALLABLE, secrets: NOTIFY_SECRETS}, async (request) => {
  const actor = await assertSquadEditor(request.auth?.uid);
  return updateApplicationCore(
    getFirestore(), (request.data ?? {}) as Parameters<typeof updateApplicationCore>[1], actor, new Date(), notifySquad,
  );
});

export const sendSquadInvite = onCall({...BACKOFFICE_CALLABLE, secrets: NOTIFY_SECRETS}, async (request) => {
  const actor = await assertSquadEditor(request.auth?.uid);
  return sendInviteCore(getFirestore(), (request.data ?? {}) as SendInviteInput, actor, new Date(), notifySquad);
});

export const updateSquadInvite = onCall({...BACKOFFICE_CALLABLE, secrets: NOTIFY_SECRETS}, async (request) => {
  const actor = await assertSquadEditor(request.auth?.uid);
  return updateInviteCore(
    getFirestore(), (request.data ?? {}) as {inviteId: string; action: "resend" | "cancel"}, actor, new Date(), notifySquad,
  );
});

export const openSquadInvite = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = athleteUid(request.auth?.uid);
  return openInviteCore(getFirestore(), {uid, inviteId: (request.data ?? {}).inviteId}, new Date());
});

export const acceptSquadInvite = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = athleteUid(request.auth?.uid);
  const data = (request.data ?? {}) as {inviteId?: unknown; code?: unknown};
  return acceptInviteCore(getFirestore(), {uid, inviteId: data.inviteId, code: data.code}, new Date());
});
