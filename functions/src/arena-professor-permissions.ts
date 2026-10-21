/**
 * Aplicação das permissões do vínculo professor ↔ arena fora do próprio vínculo
 * (spec `docs/superpowers/specs/2026-10-20-vinculos-permissoes-reserva-aulas-design.md`).
 *
 * O vínculo libera o que é DE PROFESSOR e não tira nada do atleta: reservar quadra e ser escalado
 * nas Aulas seguem como sempre. Aqui só se decide se a pessoa pode agir como professor daquela
 * arena — sempre relendo o vínculo no servidor, na hora (`effectiveArenaProfessorPermissions`).
 */
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {
  ARENA_PROFESSORS,
  ARENA_STAFF_ONLY_PERMISSION_KEYS,
  INDEPENDENT_ONLY_PERMISSION_KEYS,
  arenaProfessorLinkId,
  effectiveArenaProfessorPermissions,
  storedCourtDiscount,
  type ArenaProfessorLinkData,
  type CourtDiscountRule,
  type ArenaProfessorPermissionKey,
  type ArenaProfessorType,
} from "./arena-professor-links";

export type ProfessorPermissionDenialReason = "no_link" | "not_active" | "not_staff" | "not_independent" | "permission_off";

export async function loadArenaProfessorLink(
  db: Firestore,
  arenaId: string,
  professorUserId: string,
): Promise<ArenaProfessorLinkData | null> {
  if (!arenaId || !professorUserId) return null;
  const snap = await db.collection(ARENA_PROFESSORS).doc(arenaProfessorLinkId(arenaId, professorUserId)).get();
  return snap.exists ? (snap.data() as ArenaProfessorLinkData) : null;
}

/** Por que o professor não pode usar `key` agora — `null` quando pode. */
export function professorPermissionDenial(
  link: (Pick<ArenaProfessorLinkData, "status" | "permissions"> & {relationshipType?: unknown}) | null,
  key: ArenaProfessorPermissionKey,
): ProfessorPermissionDenialReason | null {
  if (!link) return "no_link";
  if (link.status !== "ACTIVE") return "not_active";
  if (ARENA_STAFF_ONLY_PERMISSION_KEYS.has(key) && link.relationshipType !== "ARENA_STAFF") return "not_staff";
  if (INDEPENDENT_ONLY_PERMISSION_KEYS.has(key) && link.relationshipType !== "INDEPENDENT") return "not_independent";
  return effectiveArenaProfessorPermissions(link)[key] ? null : "permission_off";
}

const PERMISSION_COPY: Record<ArenaProfessorPermissionKey, {action: string; hint: string}> = {
  canBookCourts: {action: "reservar como professor", hint: " Você ainda pode reservar como atleta."},
  canManageOwnLessons: {action: "fazer a chamada das suas aulas", hint: ""},
  canAppearInArenaProfile: {action: "aparecer no perfil da arena", hint: ""},
  canEnrollStudents: {action: "matricular alunos nas suas turmas", hint: " Peça à gestão da arena."},
  canScheduleLessons: {action: "agendar aulas e encaixar alunos", hint: " Peça à gestão da arena."},
  canCancelLessons: {action: "cancelar aulas e avisar os alunos", hint: " Peça à gestão da arena."},
  canBookRecurring: {action: "reservar horário fixo para turma própria", hint: " Peça à gestão da arena."},
};

export function professorPermissionError(
  link: Pick<ArenaProfessorLinkData, "status" | "arenaName"> | null,
  key: ArenaProfessorPermissionKey,
  reason: ProfessorPermissionDenialReason,
  linkId: string,
): HttpsError {
  const {action, hint} = PERMISSION_COPY[key];
  const arena = link?.arenaName || "arena";
  let message: string;
  if (reason === "no_link" || !link) {
    message = `Você não tem vínculo de professor com esta arena. Peça o vínculo na página da arena para ${action}.`;
  } else if (reason === "not_staff") {
    message = `Só professor da equipe da ${arena} pode ${action}.`;
  } else if (reason === "not_independent") {
    message = `Só professor independente da ${arena} pode ${action}.`;
  } else if (reason === "permission_off") {
    message = `A ${arena} não liberou ${action} no seu vínculo.`;
  } else if (link.status === "SUSPENDED") {
    message = `Seu vínculo com a ${arena} está suspenso — dá para ${action} de novo quando a arena reativar.`;
  } else if (link.status === "INVITED") {
    message = `Aceite o convite da ${arena} em Minhas arenas para ${action}.`;
  } else if (link.status === "PENDING") {
    message = `Seu pedido de vínculo com a ${arena} ainda está em análise.`;
  } else {
    message = `Seu vínculo com a ${arena} não está ativo.`;
  }
  return new HttpsError("permission-denied", `${message}${hint}`, {
    reason,
    linkId,
    status: link?.status ?? null,
  });
}

/** Devolve o vínculo quando a permissão vale agora; senão lança com o motivo pronto para a tela. */
export async function requireArenaProfessorPermission(
  db: Firestore,
  arenaId: string,
  professorUserId: string,
  key: ArenaProfessorPermissionKey,
): Promise<ArenaProfessorLinkData> {
  const link = await loadArenaProfessorLink(db, arenaId, professorUserId);
  const reason = professorPermissionDenial(link, key);
  if (reason) throw professorPermissionError(link, key, reason, arenaProfessorLinkId(arenaId, professorUserId));
  return link as ArenaProfessorLinkData;
}

/** Arenas (dentre `arenaIds`) em que o professor pode usar `key` agora. */
export async function arenasWithProfessorPermission(
  db: Firestore,
  arenaIds: Iterable<string>,
  professorUserId: string,
  key: ArenaProfessorPermissionKey,
): Promise<Set<string>> {
  const ids = [...new Set(arenaIds)].filter(Boolean);
  const links = await Promise.all(ids.map((arenaId) => loadArenaProfessorLink(db, arenaId, professorUserId)));
  return new Set(ids.filter((_, i) => professorPermissionDenial(links[i] ?? null, key) == null));
}

// ---------------------------------------------------------------------------
// Reserva como professor (`canBookCourts`)
// ---------------------------------------------------------------------------

export interface ProfessorBookingStamp {
  bookedAs: "professor";
  professorLinkId: string;
  professorRelationshipType: ArenaProfessorType;
}

/**
 * Carimbo da reserva feita como professor. Sem `asProfessor === true` é reserva de atleta: não lê
 * o vínculo nem carimba nada (app antigo, atleta comum e professor jogando seguem iguais).
 */
export async function resolveProfessorBookingStamp(
  db: Firestore,
  arenaId: string,
  uid: string,
  asProfessor: unknown,
): Promise<ProfessorBookingStamp | null> {
  return (await resolveProfessorBooking(db, arenaId, uid, asProfessor))?.stamp ?? null;
}

/** Carimbo + desconto do vínculo no aluguel de quadra (`createArenaBooking`). */
export async function resolveProfessorBooking(
  db: Firestore,
  arenaId: string,
  uid: string,
  asProfessor: unknown,
): Promise<{stamp: ProfessorBookingStamp; courtDiscount: CourtDiscountRule} | null> {
  if (asProfessor !== true) return null;
  const link = await requireArenaProfessorPermission(db, arenaId, uid, "canBookCourts");
  return {
    stamp: {
      bookedAs: "professor",
      professorLinkId: arenaProfessorLinkId(arenaId, uid),
      professorRelationshipType: link.relationshipType,
    },
    courtDiscount: storedCourtDiscount(link),
  };
}

/**
 * Desconto para a COTAÇÃO: não lança — quem não pode reservar como professor vê o preço de atleta
 * e o erro com o motivo chega só na confirmação (`createArenaBooking`).
 */
export async function professorCourtDiscountForQuote(
  db: Firestore,
  arenaId: string,
  uid: string,
  asProfessor: unknown,
): Promise<CourtDiscountRule | null> {
  if (asProfessor !== true || !arenaId) return null;
  const link = await loadArenaProfessorLink(db, arenaId, uid);
  if (professorPermissionDenial(link, "canBookCourts")) return null;
  return storedCourtDiscount(link as ArenaProfessorLinkData);
}

// ---------------------------------------------------------------------------
// Aulas: escalar o professor em turma nova
// ---------------------------------------------------------------------------

/**
 * Turma nova (ou troca de professor) com quem tem o vínculo suspenso ou encerrado: recusa. Sem
 * vínculo, ou vínculo ainda não estabelecido, não trava — é o professor das Aulas de hoje. A
 * trava é o status, não a chave `canManageOwnLessons` (que fala do professor agir, não da arena
 * escalá-lo).
 */
export async function assertTeacherLinkAllowsNewClass(
  db: Firestore,
  arenaId: string,
  teacher: {name: string; userId: string | null},
): Promise<void> {
  if (!teacher.userId) return;
  const link = await loadArenaProfessorLink(db, arenaId, teacher.userId);
  const linkId = arenaProfessorLinkId(arenaId, teacher.userId);
  if (link?.status === "SUSPENDED") {
    throw new HttpsError(
      "failed-precondition",
      `O vínculo de ${teacher.name} com a arena está suspenso. Reative em Profissionais para escalar em turma nova.`,
      {reason: "link_suspended", linkId, status: link.status},
    );
  }
  if (link?.status === "ENDED") {
    throw new HttpsError(
      "failed-precondition",
      `O vínculo de ${teacher.name} com a arena foi encerrado. Convide de novo em Profissionais para escalar em turma nova.`,
      {reason: "link_ended", linkId, status: link.status},
    );
  }
}
