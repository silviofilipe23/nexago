/**
 * Vínculos professor ↔ arena (spec `docs/superpowers/specs/2026-10-20-vinculos-professor-arena-design.md`).
 *
 * Um documento por par: `arenaProfessors/{arenaId}_{professorUserId}`. Toda transição roda numa
 * transação sobre esse doc — é o que garante "no máximo um vínculo em aberto por arena +
 * professor" sem coleção de trava. Nova tentativa depois de um estado fechado reabre o MESMO doc
 * (`cycle` + 1); o histórico de todas as rodadas fica em `events` (imutável, só escrito aqui).
 *
 * O tipo de vínculo é por arena, nunca do usuário: suspender ou encerrar aqui não toca nos
 * vínculos do professor com outras arenas. Permissões só valem com `ACTIVE`
 * (`effectiveArenaProfessorPermissions`) e nunca vêm do professor.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {assertArenaAreaAccess} from "./arena-area-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {grantProfessorRoleSafely, type ProfessorRoleGranter} from "./professor-role";
import {resolveSport, sportLabel} from "./sports/catalog";

export const ARENA_PROFESSORS = "arenaProfessors";
export const ARENA_PROFESSOR_EVENTS = "events";
export const PUBLIC_PROFESSORS = "publicProfessors";

/** Convite vale 7 dias (protótipo A2). Vencido vira `EXPIRED` quando alguém toca no vínculo. */
export const PROFESSOR_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MESSAGE_MAX = 500;
const REASON_MAX = 300;

export const ARENA_PROFESSOR_TYPES = ["ARENA_STAFF", "INDEPENDENT"] as const;
export type ArenaProfessorType = (typeof ARENA_PROFESSOR_TYPES)[number];

export type ArenaProfessorStatus =
  | "INVITED"
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED"
  | "ENDED"
  | "CANCELED"
  | "EXPIRED";

export type ArenaProfessorEventType =
  | "INVITED"
  | "REQUESTED"
  | "ACCEPTED"
  | "REJECTED"
  | "APPROVED"
  | "SUSPENDED"
  | "REACTIVATED"
  | "ENDED"
  | "PERMISSIONS_CHANGED"
  | "CANCELED"
  | "EXPIRED";

export type ArenaProfessorSide = "ARENA" | "PROFESSOR";
export type ArenaProfessorActorRole = ArenaProfessorSide | "ADMIN" | "SYSTEM";

export const ARENA_PROFESSOR_PERMISSION_KEYS = [
  "canManageOwnLessons",
  "canBookCourts",
  "canAppearInArenaProfile",
  "canEnrollStudents",
  "canScheduleLessons",
  "canCancelLessons",
] as const;
export type ArenaProfessorPermissionKey = (typeof ARENA_PROFESSOR_PERMISSION_KEYS)[number];

/**
 * Agir nas Aulas da arena em nome dela (matricular, encaixar/agendar, cancelar): só o professor
 * da EQUIPE, e só quando a arena liga — desligadas por padrão, inclusive em vínculo antigo (chave
 * ausente). Spec: `docs/superpowers/specs/2026-10-20-professor-app-alunos-fase-2-design.md`.
 */
export const ARENA_STAFF_ONLY_PERMISSION_KEYS: ReadonlySet<ArenaProfessorPermissionKey> = new Set([
  "canEnrollStudents",
  "canScheduleLessons",
  "canCancelLessons",
]);
export type ArenaProfessorPermissions = Record<ArenaProfessorPermissionKey, boolean>;

/** Estados que bloqueiam um novo convite/pedido para o mesmo par. */
const OPEN_STATUSES: ReadonlySet<ArenaProfessorStatus> = new Set([
  "INVITED",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
]);

export interface ArenaProfessorLinkData {
  arenaId: string;
  professorUserId: string;
  relationshipType: ArenaProfessorType;
  status: ArenaProfessorStatus;
  initiatedBy: ArenaProfessorSide;
  permissions: ArenaProfessorPermissions;
  cycle: number;
  message: string | null;
  professorName: string;
  professorPhotoUrl: string | null;
  professorModalities: string[];
  arenaName: string;
  arenaLogoUrl: string | null;
  arenaCity: string | null;
  expiresAt?: Timestamp | null;
  approvedAt?: Timestamp | null;
  [key: string]: unknown;
}

export interface ArenaProfessorActor {
  uid: string;
  name: string;
  role: ArenaProfessorActorRole;
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

export function arenaProfessorLinkId(arenaId: string, professorUserId: string): string {
  return `${arenaId}_${professorUserId}`;
}

export function isOpenArenaProfessorStatus(status: unknown): boolean {
  return OPEN_STATUSES.has(status as ArenaProfessorStatus);
}

export function parseArenaProfessorType(raw: unknown): ArenaProfessorType {
  if (raw === "ARENA_STAFF" || raw === "INDEPENDENT") return raw;
  throw new HttpsError("invalid-argument", "Escolha o tipo de vínculo: equipe da arena ou independente.");
}

/**
 * Equipe da arena: chamada, quadras e página pública. Independente: chamada e quadras, fora da
 * página pública. As ações nas Aulas da arena começam desligadas nos dois.
 */
export function defaultArenaProfessorPermissions(type: ArenaProfessorType): ArenaProfessorPermissions {
  return {
    canManageOwnLessons: true,
    canBookCourts: true,
    canAppearInArenaProfile: type === "ARENA_STAFF",
    canEnrollStudents: false,
    canScheduleLessons: false,
    canCancelLessons: false,
  };
}

/**
 * Só aceita as chaves conhecidas, e só booleanos. Chave ausente cai no padrão do tipo; chave
 * desconhecida é ignorada — nada que o cliente mande vira permissão nova.
 */
export function parseArenaProfessorPermissions(
  raw: unknown,
  type: ArenaProfessorType,
): ArenaProfessorPermissions {
  const out = defaultArenaProfessorPermissions(type);
  if (raw == null) return out;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new HttpsError("invalid-argument", "Permissões inválidas.");
  }
  const record = raw as Record<string, unknown>;
  for (const key of ARENA_PROFESSOR_PERMISSION_KEYS) {
    if (!(key in record)) continue;
    const value = record[key];
    if (typeof value !== "boolean") {
      throw new HttpsError("invalid-argument", "Permissões inválidas.");
    }
    if (value && type !== "ARENA_STAFF" && ARENA_STAFF_ONLY_PERMISSION_KEYS.has(key)) {
      throw new HttpsError(
        "invalid-argument",
        "Matricular, agendar e cancelar aulas da arena é só para professor da equipe.",
      );
    }
    out[key] = value;
  }
  return out;
}

/** O que o professor pode de fato fazer agora: nada fora de `ACTIVE`. */
export function effectiveArenaProfessorPermissions(link: {
  status?: unknown;
  permissions?: unknown;
  relationshipType?: unknown;
}): ArenaProfessorPermissions {
  const stored = (link.permissions ?? {}) as Record<string, unknown>;
  const active = link.status === "ACTIVE";
  const staff = active && link.relationshipType === "ARENA_STAFF";
  return {
    canManageOwnLessons: active && stored["canManageOwnLessons"] === true,
    canBookCourts: active && stored["canBookCourts"] === true,
    canAppearInArenaProfile: active && stored["canAppearInArenaProfile"] === true,
    canEnrollStudents: staff && stored["canEnrollStudents"] === true,
    canScheduleLessons: staff && stored["canScheduleLessons"] === true,
    canCancelLessons: staff && stored["canCancelLessons"] === true,
  };
}

export function changedPermissionKeys(
  before: ArenaProfessorPermissions,
  after: ArenaProfessorPermissions,
): ArenaProfessorPermissionKey[] {
  return ARENA_PROFESSOR_PERMISSION_KEYS.filter((key) => before[key] !== after[key]);
}

export function isArenaProfessorInviteExpired(
  link: {status?: unknown; expiresAt?: {toMillis(): number} | null},
  nowMs: number,
): boolean {
  if (link.status !== "INVITED") return false;
  const expiresAt = link.expiresAt?.toMillis?.();
  return expiresAt != null && expiresAt <= nowMs;
}

/** Texto livre aparado e cortado; vazio vira `null`. */
export function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().slice(0, max);
  return text || null;
}

/** Modalidades (rótulos) a partir do perfil esportivo: níveis declarados primeiro, depois o principal. */
export function professorModalitiesFromUser(user: Record<string, unknown>): string[] {
  const onboarding = (user["sportOnboarding"] ?? {}) as Record<string, unknown>;
  const levels = onboarding["levelsBySport"];
  const codes: string[] = [];
  const primary = onboarding["primarySportId"] ?? user["primarySportId"];
  if (typeof primary === "string" && primary.trim()) codes.push(primary.trim());
  if (levels && typeof levels === "object" && !Array.isArray(levels)) {
    codes.push(...Object.keys(levels as Record<string, unknown>));
  }
  const labels: string[] = [];
  for (const code of codes) {
    const label = resolveSport(code)?.label ?? sportLabel(code);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, 4);
}

export function professorDisplayFromUser(user: Record<string, unknown>): {
  name: string;
  photoUrl: string | null;
  modalities: string[];
} {
  const name = String(user["fullName"] ?? user["name"] ?? user["nickname"] ?? "").trim();
  const rawPhoto = user["profilePhotoUrl"] ?? user["avatarUrl"] ?? user["photoURL"];
  return {
    name: (name || "Professor").slice(0, 80),
    photoUrl: typeof rawPhoto === "string" && rawPhoto.trim() ? rawPhoto.trim() : null,
    modalities: professorModalitiesFromUser(user),
  };
}

export function arenaDisplayFromDoc(arena: Record<string, unknown>): {
  name: string;
  logoUrl: string | null;
  city: string | null;
} {
  const pick = (key: string): string | null => {
    const value = arena[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const city = pick("city");
  const state = pick("state");
  return {
    name: (pick("name") ?? "Arena").slice(0, 80),
    logoUrl: pick("logoUrl") ?? pick("logo") ?? pick("logoImageUrl"),
    city: [city, state].filter(Boolean).join(" · ") || null,
  };
}

// ---------------------------------------------------------------------------
// Avisos (puro: o que mandar para quem, depois da transição)
// ---------------------------------------------------------------------------

export interface ArenaProfessorNotice {
  to: "professor" | "arena";
  title: string;
  body: string;
  type: string;
}

export const TYPE_LABEL: Record<ArenaProfessorType, string> = {
  ARENA_STAFF: "equipe da arena",
  INDEPENDENT: "professor independente",
};

/**
 * Professor recebe `professor_link_*`, SEM `arenaId` no data e sem `url`: o app antigo da loja
 * não tem a tela e, pelo ramo genérico de arena, abriria a agenda do GESTOR. Arena recebe
 * `arena_professor_*` (o ramo genérico leva o gestor à agenda, que é o lugar dele no app).
 */
export function arenaProfessorNotices(
  event: ArenaProfessorEventType,
  link: Pick<ArenaProfessorLinkData, "arenaName" | "professorName" | "relationshipType">,
  actorSide: ArenaProfessorSide | "ADMIN",
  reason: string | null,
): ArenaProfessorNotice[] {
  const arena = link.arenaName;
  const prof = link.professorName;
  const as = TYPE_LABEL[link.relationshipType];
  const why = reason ? ` Motivo: ${reason}` : "";
  switch (event) {
  case "INVITED":
    return [{
      to: "professor",
      title: "Convite de arena",
      body: `${arena} convidou você para atuar como ${as}. Responda em Minhas arenas.`,
      type: "professor_link_invite",
    }];
  case "REQUESTED":
    return [{
      to: "arena",
      title: "Nova solicitação de vínculo",
      body: `${prof} pediu vínculo como ${as}. Analise em Profissionais.`,
      type: "arena_professor_request",
    }];
  case "ACCEPTED":
    return [{
      to: "arena",
      title: "Convite aceito",
      body: `${prof} aceitou o convite e agora é ${as} na ${arena}.`,
      type: "arena_professor_invite_accepted",
    }];
  case "REJECTED":
    return actorSide === "PROFESSOR" ?
      [{
        to: "arena",
        title: "Convite recusado",
        body: `${prof} recusou o convite da ${arena}.`,
        type: "arena_professor_invite_declined",
      }] :
      [{
        to: "professor",
        title: "Solicitação não aprovada",
        body: `${arena} não aprovou seu pedido de vínculo.${why}`,
        type: "professor_link_rejected",
      }];
  case "APPROVED":
    return [{
      to: "professor",
      title: "Vínculo aprovado",
      body: `${arena} aprovou seu vínculo como ${as}.`,
      type: "professor_link_approved",
    }];
  case "SUSPENDED":
    return [{
      to: "professor",
      title: "Vínculo suspenso",
      body: `${arena} suspendeu seu vínculo.${why}`,
      type: "professor_link_suspended",
    }];
  case "REACTIVATED":
    return [{
      to: "professor",
      title: "Vínculo reativado",
      body: `${arena} reativou seu vínculo. Suas permissões voltaram.`,
      type: "professor_link_reactivated",
    }];
  case "ENDED":
    return actorSide === "PROFESSOR" ?
      [{
        to: "arena",
        title: "Vínculo encerrado pelo professor",
        body: `${prof} encerrou o vínculo com a ${arena}.${why}`,
        type: "arena_professor_ended",
      }] :
      [{
        to: "professor",
        title: "Vínculo encerrado",
        body: `${arena} encerrou seu vínculo.${why}`,
        type: "professor_link_ended",
      }];
  case "PERMISSIONS_CHANGED":
    return [{
      to: "professor",
      title: "Permissões atualizadas",
      body: `${arena} mudou o que você pode fazer na arena. Confira em Minhas arenas.`,
      type: "professor_link_permissions_changed",
    }];
  default:
    return [];
  }
}

// ---------------------------------------------------------------------------
// Firestore
// ---------------------------------------------------------------------------

function linkRef(db: Firestore, linkId: string) {
  return db.collection(ARENA_PROFESSORS).doc(linkId);
}

function eventsCol(db: Firestore, linkId: string) {
  return db.collection(ARENA_PROFESSORS).doc(linkId).collection(ARENA_PROFESSOR_EVENTS);
}

function publicProfessorRef(db: Firestore, arenaId: string, professorUserId: string) {
  return db.collection("arenas").doc(arenaId).collection(PUBLIC_PROFESSORS).doc(professorUserId);
}

type Tx = {
  get: (ref: unknown) => Promise<{exists: boolean; data: () => Record<string, unknown> | undefined}>;
  set: (ref: unknown, data: Record<string, unknown>, opts?: {merge?: boolean}) => void;
  delete: (ref: unknown) => void;
};

function writeEvent(
  db: Firestore,
  tx: Tx,
  linkId: string,
  link: ArenaProfessorLinkData,
  input: {
    eventType: ArenaProfessorEventType;
    actor: ArenaProfessorActor;
    fromStatus: ArenaProfessorStatus | null;
    toStatus: ArenaProfessorStatus;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    nowMs: number;
  },
): void {
  tx.set(eventsCol(db, linkId).doc(), {
    arenaProfessorId: linkId,
    arenaId: link.arenaId,
    professorUserId: link.professorUserId,
    cycle: link.cycle,
    eventType: input.eventType,
    actorUserId: input.actor.uid,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
    createdAt: Timestamp.fromMillis(input.nowMs),
  });
}

/** Espelho público: só `ACTIVE` com "Aparecer no perfil da arena". */
function syncPublicProfessor(db: Firestore, tx: Tx, link: ArenaProfessorLinkData): void {
  const ref = publicProfessorRef(db, link.arenaId, link.professorUserId);
  if (effectiveArenaProfessorPermissions(link).canAppearInArenaProfile) {
    tx.set(ref, {
      arenaId: link.arenaId,
      professorUserId: link.professorUserId,
      name: link.professorName,
      photoUrl: link.professorPhotoUrl,
      modalities: link.professorModalities,
      relationshipType: link.relationshipType,
      since: link.approvedAt ?? null,
    });
  } else {
    tx.delete(ref);
  }
}

function linkFromSnap(data: Record<string, unknown> | undefined): ArenaProfessorLinkData | null {
  if (!data) return null;
  return data as ArenaProfessorLinkData;
}

function openLinkError(link: ArenaProfessorLinkData, linkId: string, viewer: ArenaProfessorSide): HttpsError {
  const details = {linkId, status: link.status, initiatedBy: link.initiatedBy};
  if (link.status === "ACTIVE" || link.status === "SUSPENDED") {
    return new HttpsError(
      "already-exists",
      viewer === "ARENA" ?
        "Este professor já está vinculado à arena." :
        "Você já tem vínculo com esta arena.",
      details,
    );
  }
  if (link.status === "INVITED") {
    return viewer === "ARENA" ?
      new HttpsError("already-exists", "Convite já enviado — aguardando a resposta do professor.", details) :
      new HttpsError("failed-precondition", "A arena já convidou você. Responda o convite em Minhas arenas.", details);
  }
  return viewer === "ARENA" ?
    new HttpsError("failed-precondition", "Este professor já pediu vínculo. Analise a solicitação.", details) :
    new HttpsError(
      "already-exists",
      "Você já tem um pedido aqui. Aguarde a resposta ou cancele o pedido atual para enviar outro.",
      details,
    );
}

/** Campos de uma rodada que não sobrevivem à reabertura do vínculo. */
const CYCLE_FIELDS_RESET: Record<string, null> = {
  invitedAt: null,
  invitedBy: null,
  invitedByName: null,
  requestedAt: null,
  expiresAt: null,
  respondedAt: null,
  approvedAt: null,
  approvedBy: null,
  approvedByName: null,
  rejectionReason: null,
  suspendedAt: null,
  suspendedBy: null,
  suspensionReason: null,
  suspensionDetails: null,
  endedAt: null,
  endedBy: null,
  endedBySide: null,
  endedReason: null,
  canceledAt: null,
};

/**
 * Abre (ou reabre) o vínculo. Se o doc existe em aberto: convite vencido é marcado `EXPIRED` e a
 * abertura segue; qualquer outro estado aberto recusa com o erro de duplicado de quem pediu.
 */
async function openLink(
  db: Firestore,
  input: {
    arenaId: string;
    professorUserId: string;
    relationshipType: ArenaProfessorType;
    permissions: ArenaProfessorPermissions;
    message: string | null;
    side: ArenaProfessorSide;
    actor: ArenaProfessorActor;
    nowMs: number;
  },
): Promise<{linkId: string; link: ArenaProfessorLinkData}> {
  const [arenaSnap, userSnap] = await Promise.all([
    db.collection("arenas").doc(input.arenaId).get(),
    db.collection("users").doc(input.professorUserId).get(),
  ]);
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  if (!userSnap.exists) throw new HttpsError("not-found", "Conta NexaGO do professor não encontrada.");
  const arenaData = arenaSnap.data() ?? {};
  const managerUserId = typeof arenaData["managerUserId"] === "string" ? arenaData["managerUserId"].trim() : "";
  if (!managerUserId) {
    throw new HttpsError(
      "failed-precondition",
      "Esta arena ainda não é administrada na NexaGO — não dá para pedir vínculo por aqui.",
    );
  }
  const arena = arenaDisplayFromDoc(arenaData);
  const professor = professorDisplayFromUser(userSnap.data() ?? {});
  const linkId = arenaProfessorLinkId(input.arenaId, input.professorUserId);
  const ref = linkRef(db, linkId);
  const now = Timestamp.fromMillis(input.nowMs);

  const link = await db.runTransaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    const snap = await tx.get(ref);
    const prev = linkFromSnap(snap.exists ? snap.data() : undefined);
    if (prev && isOpenArenaProfessorStatus(prev.status)) {
      if (!isArenaProfessorInviteExpired(prev, input.nowMs)) {
        throw openLinkError(prev, linkId, input.side);
      }
      writeEvent(db, tx, linkId, prev, {
        eventType: "EXPIRED",
        actor: {uid: "system", name: "NexaGO", role: "SYSTEM"},
        fromStatus: "INVITED",
        toStatus: "EXPIRED",
        // 1 ms antes da abertura gravada na mesma transação: o histórico ordena por
        // `createdAt` e o empate deixaria a ordem por id (aleatória).
        nowMs: input.nowMs - 1,
      });
    }
    const inviting = input.side === "ARENA";
    const next: ArenaProfessorLinkData = {
      ...CYCLE_FIELDS_RESET,
      arenaId: input.arenaId,
      professorUserId: input.professorUserId,
      relationshipType: input.relationshipType,
      status: inviting ? "INVITED" : "PENDING",
      initiatedBy: input.side,
      permissions: input.permissions,
      cycle: (typeof prev?.cycle === "number" ? prev.cycle : 0) + 1,
      message: input.message,
      professorName: professor.name,
      professorPhotoUrl: professor.photoUrl,
      professorModalities: professor.modalities,
      arenaName: arena.name,
      arenaLogoUrl: arena.logoUrl,
      arenaCity: arena.city,
      createdAt: (snap.exists ? (prev?.["createdAt"] as Timestamp | undefined) : undefined) ?? now,
      updatedAt: now,
      ...(inviting ?
        {
          invitedAt: now,
          invitedBy: input.actor.uid,
          invitedByName: input.actor.name,
          expiresAt: Timestamp.fromMillis(input.nowMs + PROFESSOR_INVITE_TTL_MS),
        } :
        {requestedAt: now}),
    };
    tx.set(ref, next);
    writeEvent(db, tx, linkId, next, {
      eventType: inviting ? "INVITED" : "REQUESTED",
      actor: input.actor,
      fromStatus: prev?.status ?? null,
      toStatus: next.status,
      reason: input.message,
      metadata: {relationshipType: input.relationshipType, permissions: input.permissions},
      nowMs: input.nowMs,
    });
    // Reabertura de um vínculo que estava público: nada a manter no espelho.
    syncPublicProfessor(db, tx, next);
    return next;
  });
  return {linkId, link};
}

/**
 * Transição sobre um vínculo existente. `apply` valida o estado atual (lançando) e devolve o
 * patch + o evento; o espelho público e o evento são gravados na mesma transação.
 */
async function transitionLink(
  db: Firestore,
  linkId: string,
  nowMs: number,
  apply: (link: ArenaProfessorLinkData) => {
    patch: Record<string, unknown>;
    event: {
      eventType: ArenaProfessorEventType;
      actor: ArenaProfessorActor;
      reason?: string | null;
      metadata?: Record<string, unknown>;
    } | null;
  },
): Promise<{before: ArenaProfessorLinkData; after: ArenaProfessorLinkData}> {
  const ref = linkRef(db, linkId);
  return db.runTransaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    const snap = await tx.get(ref);
    const before = linkFromSnap(snap.exists ? snap.data() : undefined);
    if (!before) throw new HttpsError("not-found", "Vínculo não encontrado.");
    const {patch, event} = apply(before);
    const after = {...before, ...patch, updatedAt: Timestamp.fromMillis(nowMs)} as ArenaProfessorLinkData;
    if (!event) return {before, after: before};
    tx.set(ref, after);
    writeEvent(db, tx, linkId, after, {
      ...event,
      fromStatus: before.status,
      toStatus: after.status,
      nowMs,
    });
    syncPublicProfessor(db, tx, after);
    return {before, after};
  });
}

async function readLink(db: Firestore, linkId: string): Promise<ArenaProfessorLinkData> {
  if (!linkId) throw new HttpsError("invalid-argument", "Vínculo é obrigatório.");
  const snap = await linkRef(db, linkId).get();
  const link = linkFromSnap(snap.exists ? snap.data() : undefined);
  if (!link) throw new HttpsError("not-found", "Vínculo não encontrado.");
  return link;
}

function wrongStatus(message: string, link: ArenaProfessorLinkData): HttpsError {
  return new HttpsError("failed-precondition", message, {status: link.status});
}

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------

export interface CallerContext {
  uid: string;
  isSuperAdmin: boolean;
}

async function displayNameOf(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  return professorDisplayFromUser(snap.data() ?? {}).name;
}

/**
 * Lado da arena: dono ou gestor (área `perfil`, escrita). Superadmin passa como suporte
 * (`ADMIN` no histórico).
 */
export async function arenaSideActor(
  db: Firestore,
  arenaId: string,
  caller: CallerContext,
): Promise<ArenaProfessorActor> {
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  try {
    await assertArenaAreaAccess(db, arenaId, caller.uid, "perfil", "write");
    return {uid: caller.uid, name: await displayNameOf(db, caller.uid), role: "ARENA"};
  } catch (error) {
    if (caller.isSuperAdmin && error instanceof HttpsError && error.code === "permission-denied") {
      return {uid: caller.uid, name: "Suporte NexaGO", role: "ADMIN"};
    }
    if (error instanceof HttpsError && error.code === "permission-denied") {
      throw new HttpsError("permission-denied", "Só o dono ou o gestor da arena administram os professores.");
    }
    throw error;
  }
}

async function professorSideActor(
  db: Firestore,
  link: ArenaProfessorLinkData,
  caller: CallerContext,
): Promise<ArenaProfessorActor> {
  if (link.professorUserId !== caller.uid) {
    throw new HttpsError("permission-denied", "Este vínculo não é seu.");
  }
  return {uid: caller.uid, name: await displayNameOf(db, caller.uid), role: "PROFESSOR"};
}

// ---------------------------------------------------------------------------
// Operações (testáveis com FakeFirestore; o `nowMs` vem de fora)
// ---------------------------------------------------------------------------

export interface LinkResult {
  linkId: string;
  status: ArenaProfessorStatus;
  link: ArenaProfessorLinkData;
  notices: ArenaProfessorNotice[];
}

export async function createArenaProfessorInviteCore(
  db: Firestore,
  input: {arenaId: string; professorUserId: string; relationshipType: unknown; permissions?: unknown; message?: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult> {
  const professorUserId = typeof input.professorUserId === "string" ? input.professorUserId.trim() : "";
  if (!professorUserId) throw new HttpsError("invalid-argument", "Escolha a conta NexaGO do professor.");
  const relationshipType = parseArenaProfessorType(input.relationshipType);
  const permissions = parseArenaProfessorPermissions(input.permissions, relationshipType);
  const actor = await arenaSideActor(db, input.arenaId, caller);
  const {linkId, link} = await openLink(db, {
    arenaId: input.arenaId,
    professorUserId,
    relationshipType,
    permissions,
    message: cleanText(input.message, MESSAGE_MAX),
    side: "ARENA",
    actor,
    nowMs,
  });
  return {linkId, status: link.status, link, notices: arenaProfessorNotices("INVITED", link, "ARENA", null)};
}

export async function requestArenaProfessorLinkCore(
  db: Firestore,
  input: {arenaId: string; relationshipType: unknown; message?: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult> {
  const arenaId = typeof input.arenaId === "string" ? input.arenaId.trim() : "";
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const relationshipType = parseArenaProfessorType(input.relationshipType);
  const actor: ArenaProfessorActor = {uid: caller.uid, name: await displayNameOf(db, caller.uid), role: "PROFESSOR"};
  const {linkId, link} = await openLink(db, {
    arenaId,
    professorUserId: caller.uid,
    relationshipType,
    // Pedido não carrega permissão do cliente: fica a proposta padrão do tipo, que a arena
    // ajusta ao aprovar. Nada vale antes do `ACTIVE`.
    permissions: defaultArenaProfessorPermissions(relationshipType),
    message: cleanText(input.message, MESSAGE_MAX),
    side: "PROFESSOR",
    actor,
    nowMs,
  });
  return {linkId, status: link.status, link, notices: arenaProfessorNotices("REQUESTED", link, "PROFESSOR", null)};
}

export async function respondToArenaProfessorInviteCore(
  db: Firestore,
  input: {linkId: string; accept: unknown; reason?: unknown},
  caller: CallerContext,
  nowMs: number,
  grantRole: ProfessorRoleGranter = grantProfessorRoleSafely,
): Promise<LinkResult> {
  if (typeof input.accept !== "boolean") throw new HttpsError("invalid-argument", "Resposta inválida.");
  const current = await readLink(db, input.linkId);
  const actor = await professorSideActor(db, current, caller);
  const reason = cleanText(input.reason, REASON_MAX);
  let expired = false;
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "INVITED") throw wrongStatus("Este convite não está mais aberto.", link);
    if (isArenaProfessorInviteExpired(link, nowMs)) {
      expired = true;
      return {
        patch: {status: "EXPIRED"},
        event: {eventType: "EXPIRED", actor: {uid: "system", name: "NexaGO", role: "SYSTEM"}},
      };
    }
    const now = Timestamp.fromMillis(nowMs);
    return input.accept ?
      {
        patch: {
          status: "ACTIVE",
          respondedAt: now,
          approvedAt: now,
          approvedBy: link["invitedBy"] ?? null,
          approvedByName: link["invitedByName"] ?? null,
          // Nome e foto acompanham o perfil a cada transição.
        },
        event: {eventType: "ACCEPTED", actor},
      } :
      {
        patch: {status: "REJECTED", respondedAt: now, rejectionReason: reason},
        event: {eventType: "REJECTED", actor, reason},
      };
  });
  if (expired) {
    throw new HttpsError(
      "failed-precondition",
      "Este convite expirou. Peça à arena um convite novo.",
      {linkId: input.linkId, status: "EXPIRED"},
    );
  }
  if (after.status === "ACTIVE") await grantRole(db, after.professorUserId);
  return {
    linkId: input.linkId,
    status: after.status,
    link: after,
    notices: arenaProfessorNotices(input.accept ? "ACCEPTED" : "REJECTED", after, "PROFESSOR", reason),
  };
}

export async function decideArenaProfessorRequestCore(
  db: Firestore,
  input: {linkId: string; approve: boolean; permissions?: unknown; reason?: unknown},
  caller: CallerContext,
  nowMs: number,
  grantRole: ProfessorRoleGranter = grantProfessorRoleSafely,
): Promise<LinkResult> {
  const current = await readLink(db, input.linkId);
  const actor = await arenaSideActor(db, current.arenaId, caller);
  const reason = cleanText(input.reason, REASON_MAX);
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "PENDING") throw wrongStatus("Esta solicitação já foi decidida.", link);
    const now = Timestamp.fromMillis(nowMs);
    if (!input.approve) {
      return {
        patch: {status: "REJECTED", respondedAt: now, rejectionReason: reason},
        event: {eventType: "REJECTED", actor, reason},
      };
    }
    const permissions = parseArenaProfessorPermissions(input.permissions, link.relationshipType);
    return {
      patch: {
        status: "ACTIVE",
        permissions,
        respondedAt: now,
        approvedAt: now,
        approvedBy: actor.uid,
        approvedByName: actor.name,
      },
      event: {eventType: "APPROVED", actor, metadata: {permissions}},
    };
  });
  if (after.status === "ACTIVE") await grantRole(db, after.professorUserId);
  return {
    linkId: input.linkId,
    status: after.status,
    link: after,
    notices: arenaProfessorNotices(input.approve ? "APPROVED" : "REJECTED", after, "ARENA", reason),
  };
}

export async function suspendArenaProfessorLinkCore(
  db: Firestore,
  input: {linkId: string; reason?: unknown; details?: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult> {
  const reason = cleanText(input.reason, REASON_MAX);
  if (!reason) throw new HttpsError("invalid-argument", "Informe o motivo da suspensão.");
  const details = cleanText(input.details, MESSAGE_MAX);
  const current = await readLink(db, input.linkId);
  const actor = await arenaSideActor(db, current.arenaId, caller);
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "ACTIVE") throw wrongStatus("Só um vínculo ativo pode ser suspenso.", link);
    return {
      patch: {
        status: "SUSPENDED",
        suspendedAt: Timestamp.fromMillis(nowMs),
        suspendedBy: actor.uid,
        suspensionReason: reason,
        suspensionDetails: details,
      },
      event: {eventType: "SUSPENDED", actor, reason, metadata: details ? {details} : {}},
    };
  });
  const noticeReason = details ? `${reason} — ${details}` : reason;
  return {
    linkId: input.linkId,
    status: after.status,
    link: after,
    notices: arenaProfessorNotices("SUSPENDED", after, "ARENA", noticeReason),
  };
}

export async function reactivateArenaProfessorLinkCore(
  db: Firestore,
  input: {linkId: string},
  caller: CallerContext,
  nowMs: number,
  grantRole: ProfessorRoleGranter = grantProfessorRoleSafely,
): Promise<LinkResult> {
  const current = await readLink(db, input.linkId);
  const actor = await arenaSideActor(db, current.arenaId, caller);
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "SUSPENDED") throw wrongStatus("Só um vínculo suspenso pode ser reativado.", link);
    return {
      patch: {status: "ACTIVE", suspendedAt: null, suspendedBy: null, suspensionReason: null, suspensionDetails: null},
      event: {eventType: "REACTIVATED", actor},
    };
  });
  // Autocura: se a concessão da ativação falhou, a reativação concede de novo.
  await grantRole(db, after.professorUserId);
  return {
    linkId: input.linkId,
    status: after.status,
    link: after,
    notices: arenaProfessorNotices("REACTIVATED", after, "ARENA", null),
  };
}

export async function endArenaProfessorLinkCore(
  db: Firestore,
  input: {linkId: string; side: unknown; reason?: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult> {
  if (input.side !== "ARENA" && input.side !== "PROFESSOR") {
    throw new HttpsError("invalid-argument", "Informe quem está encerrando o vínculo.");
  }
  const side = input.side;
  const reason = cleanText(input.reason, REASON_MAX);
  const current = await readLink(db, input.linkId);
  const actor = side === "ARENA" ?
    await arenaSideActor(db, current.arenaId, caller) :
    await professorSideActor(db, current, caller);
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "ACTIVE" && link.status !== "SUSPENDED") {
      throw wrongStatus("Este vínculo não está ativo.", link);
    }
    return {
      patch: {
        status: "ENDED",
        endedAt: Timestamp.fromMillis(nowMs),
        endedBy: actor.uid,
        endedBySide: side,
        endedReason: reason,
      },
      event: {eventType: "ENDED", actor, reason, metadata: {side}},
    };
  });
  return {
    linkId: input.linkId,
    status: after.status,
    link: after,
    notices: arenaProfessorNotices("ENDED", after, actor.role === "ADMIN" ? "ADMIN" : side, reason),
  };
}

/** Arena cancela o próprio convite; professor cancela o próprio pedido. */
export async function cancelArenaProfessorLinkCore(
  db: Firestore,
  input: {linkId: string; side: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult> {
  if (input.side !== "ARENA" && input.side !== "PROFESSOR") {
    throw new HttpsError("invalid-argument", "Informe quem está cancelando.");
  }
  const side = input.side;
  const current = await readLink(db, input.linkId);
  const actor = side === "ARENA" ?
    await arenaSideActor(db, current.arenaId, caller) :
    await professorSideActor(db, current, caller);
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    const expected: ArenaProfessorStatus = side === "ARENA" ? "INVITED" : "PENDING";
    if (link.status !== expected) {
      throw wrongStatus(
        side === "ARENA" ? "Só um convite em aberto pode ser cancelado." : "Só um pedido em aberto pode ser cancelado.",
        link,
      );
    }
    return {
      patch: {status: "CANCELED", canceledAt: Timestamp.fromMillis(nowMs)},
      event: {eventType: "CANCELED", actor, metadata: {side}},
    };
  });
  return {linkId: input.linkId, status: after.status, link: after, notices: []};
}

export async function updateArenaProfessorPermissionsCore(
  db: Firestore,
  input: {linkId: string; permissions: unknown},
  caller: CallerContext,
  nowMs: number,
): Promise<LinkResult & {changed: ArenaProfessorPermissionKey[]}> {
  const patchRaw = input.permissions;
  if (patchRaw == null || typeof patchRaw !== "object" || Array.isArray(patchRaw)) {
    throw new HttpsError("invalid-argument", "Permissões inválidas.");
  }
  const current = await readLink(db, input.linkId);
  const actor = await arenaSideActor(db, current.arenaId, caller);
  let changed: ArenaProfessorPermissionKey[] = [];
  const {after} = await transitionLink(db, input.linkId, nowMs, (link) => {
    if (link.status !== "ACTIVE" && link.status !== "SUSPENDED") {
      throw wrongStatus("As permissões só mudam em vínculo ativo ou suspenso.", link);
    }
    const before = parseArenaProfessorPermissions(link.permissions, link.relationshipType);
    // Patch parcial sobre o gravado: só as chaves enviadas mudam.
    const next = parseArenaProfessorPermissions({...before, ...(patchRaw as Record<string, unknown>)}, link.relationshipType);
    changed = changedPermissionKeys(before, next);
    if (changed.length === 0) return {patch: {}, event: null};
    return {
      patch: {permissions: next},
      event: {eventType: "PERMISSIONS_CHANGED", actor, metadata: {before, after: next, changed}},
    };
  });
  const notices = changed.length > 0 && after.status === "ACTIVE" ?
    arenaProfessorNotices("PERMISSIONS_CHANGED", after, "ARENA", null) :
    [];
  return {linkId: input.linkId, status: after.status, link: after, notices, changed};
}

// ---------------------------------------------------------------------------
// Entrega dos avisos (fora da transação; falha não desfaz a transição)
// ---------------------------------------------------------------------------

async function arenaRecipientUids(db: Firestore, arenaId: string): Promise<string[]> {
  const [arenaSnap, gestores] = await Promise.all([
    db.collection("arenas").doc(arenaId).get(),
    db.collection("arenas").doc(arenaId).collection("staff").where("role", "==", "gestor").get(),
  ]);
  const owner = typeof arenaSnap.data()?.["managerUserId"] === "string" ?
    String(arenaSnap.data()?.["managerUserId"]).trim() :
    "";
  const uids = new Set<string>();
  if (owner) uids.add(owner);
  for (const doc of gestores.docs) {
    if (doc.data()?.["status"] === "active") uids.add(doc.id);
  }
  return [...uids];
}

export async function deliverArenaProfessorNotices(
  db: Firestore,
  result: LinkResult,
  actorUid: string,
): Promise<void> {
  for (const notice of result.notices) {
    try {
      if (notice.to === "professor") {
        await deliverNotificationToUser({
          userId: result.link.professorUserId,
          title: notice.title,
          body: notice.body,
          type: notice.type,
          // Sem `arenaId`/`url` de propósito — ver `arenaProfessorNotices`.
          data: {linkId: result.linkId, linkStatus: result.status, webUrl: `/professor/arenas/${result.linkId}`},
          requireInteraction: false,
        });
      } else {
        const uids = (await arenaRecipientUids(db, result.link.arenaId)).filter((uid) => uid !== actorUid);
        for (const uid of uids) {
          await deliverNotificationToUser({
            userId: uid,
            title: notice.title,
            body: notice.body,
            type: notice.type,
            data: {
              linkId: result.linkId,
              arenaId: result.link.arenaId,
              linkStatus: result.status,
              webUrl: `/painel/profissionais/${result.linkId}`,
            },
            requireInteraction: false,
          });
        }
      }
    } catch (error) {
      logger.warn("arenaProfessor: falha ao notificar", {linkId: result.linkId, type: notice.type, error});
    }
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

function callerOf(auth: {uid?: string; token?: Record<string, unknown>} | undefined): CallerContext {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return {uid, isSuperAdmin: auth?.token?.["superAdmin"] === true};
}

function strField(data: unknown, key: string): string {
  const raw = (data as Record<string, unknown> | null)?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

async function run(
  caller: CallerContext,
  op: (db: Firestore) => Promise<LinkResult>,
): Promise<{linkId: string; status: ArenaProfessorStatus}> {
  const db = getFirestore();
  const result = await op(db);
  await deliverArenaProfessorNotices(db, result, caller.uid);
  return {linkId: result.linkId, status: result.status};
}

export const createArenaProfessorInvite = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => createArenaProfessorInviteCore(db, {
    arenaId: strField(data, "arenaId"),
    professorUserId: strField(data, "professorUserId"),
    relationshipType: data?.["relationshipType"],
    permissions: data?.["permissions"],
    message: data?.["message"],
  }, caller, Date.now()));
});

export const requestArenaProfessorLink = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => requestArenaProfessorLinkCore(db, {
    arenaId: strField(data, "arenaId"),
    relationshipType: data?.["relationshipType"],
    message: data?.["message"],
  }, caller, Date.now()));
});

export const respondToArenaProfessorInvite = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => respondToArenaProfessorInviteCore(db, {
    linkId: strField(data, "linkId"),
    accept: data?.["accept"],
    reason: data?.["reason"],
  }, caller, Date.now()));
});

export const approveArenaProfessorRequest = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => decideArenaProfessorRequestCore(db, {
    linkId: strField(data, "linkId"),
    approve: true,
    permissions: data?.["permissions"],
  }, caller, Date.now()));
});

export const rejectArenaProfessorRequest = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => decideArenaProfessorRequestCore(db, {
    linkId: strField(data, "linkId"),
    approve: false,
    reason: data?.["reason"],
  }, caller, Date.now()));
});

export const suspendArenaProfessorLink = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => suspendArenaProfessorLinkCore(db, {
    linkId: strField(data, "linkId"),
    reason: data?.["reason"],
    details: data?.["details"],
  }, caller, Date.now()));
});

export const reactivateArenaProfessorLink = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  return run(caller, (db) => reactivateArenaProfessorLinkCore(db, {
    linkId: strField(request.data, "linkId"),
  }, caller, Date.now()));
});

export const endArenaProfessorLink = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => endArenaProfessorLinkCore(db, {
    linkId: strField(data, "linkId"),
    side: data?.["side"],
    reason: data?.["reason"],
  }, caller, Date.now()));
});

export const cancelArenaProfessorLink = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => cancelArenaProfessorLinkCore(db, {
    linkId: strField(data, "linkId"),
    side: data?.["side"],
  }, caller, Date.now()));
});

export const updateArenaProfessorPermissions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const caller = callerOf(request.auth);
  const data = request.data as Record<string, unknown> | null;
  return run(caller, (db) => updateArenaProfessorPermissionsCore(db, {
    linkId: strField(data, "linkId"),
    permissions: data?.["permissions"],
  }, caller, Date.now()));
});
