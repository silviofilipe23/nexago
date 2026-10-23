/**
 * Régua do chat das Aulas da arena (gestão ↔ aluno), sem depender do motor de mensagens:
 * usada ao abrir a conversa (`arena-class-messages.ts`) e a cada envio (`professor-messages.ts`).
 */
import {FieldValue, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {decideArenaAreaAccess, type ArenaAreaAccessArenaData, type ArenaAreaAccessStaffData} from "./arena-area-access";
import {ARENA_CLASS_CHARGES, ARENA_CLASS_ENROLLMENTS, CLASS_STUDENTS} from "./arena-class-constants";

export type Data = Record<string, unknown>;

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const arenaStudentConversationId = (arenaId: string, staffUid: string, athleteUid: string) =>
  `s_${arenaId}_${staffUid}_${athleteUid}`;

/** Quem vê o aluno nas Aulas: dono ou equipe que lê a agenda ou o financeiro (as rules das mensalidades). */
export function staffSeesArenaStudents(arena: Data | undefined, staffUid: string, staff: Data | undefined, nowMs: number): boolean {
  if (!arena) return false;
  const a = arena as ArenaAreaAccessArenaData;
  const s = (staff ?? null) as ArenaAreaAccessStaffData | null;
  return decideArenaAreaAccess(a, staffUid, s, "agenda", "read", nowMs) ||
    decideArenaAreaAccess(a, staffUid, s, "financeiro", "read", nowMs);
}

/**
 * O atleta é aluno da arena AGORA? Turma ativa, plano ativo/pausado ou mensalidade em aberto
 * (quem cancelou e ainda deve pode ser cobrado). Só igualdade em `athleteId`; o resto filtra aqui.
 */
export async function isArenaClassStudent(db: Firestore, arenaId: string, athleteUid: string): Promise<boolean> {
  if (!arenaId || !athleteUid) return false;
  const [members, enrollments, charges] = await Promise.all([
    db.collectionGroup(CLASS_STUDENTS).where("athleteId", "==", athleteUid).get(),
    db.collection(ARENA_CLASS_ENROLLMENTS).where("athleteId", "==", athleteUid).get(),
    db.collection(ARENA_CLASS_CHARGES).where("athleteId", "==", athleteUid).get(),
  ]);
  const inArena = (d: Data) => str(d["arenaId"]) === arenaId;
  return members.docs.some((d) => inArena(d.data()) && d.data()["status"] === "active") ||
    enrollments.docs.some((d) => inArena(d.data()) && ["active", "paused"].includes(str(d.data()["status"]))) ||
    charges.docs.some((d) => inArena(d.data()) && d.data()["status"] === "open");
}

/** Pode haver chat: a pessoa segue na gestão das Aulas e o atleta segue aluno da arena. */
export async function arenaStudentChatAllowed(
  db: Firestore, arenaId: string, staffUid: string, athleteUid: string, nowMs: number,
): Promise<boolean> {
  if (!arenaId || !staffUid || !athleteUid || staffUid === athleteUid) return false;
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [arena, staff] = await Promise.all([arenaRef.get(), arenaRef.collection("staff").doc(staffUid).get()]);
  if (!staffSeesArenaStudents(arena.data(), staffUid, staff.data(), nowMs)) return false;
  return isArenaClassStudent(db, arenaId, athleteUid);
}

/** Fecha: só quem é da gestão continua vendo o histórico. */
export async function closeArenaStudentConversation(ref: DocumentReference, staffUid: string): Promise<void> {
  await ref.update({closed: true, memberIds: [staffUid], closedAt: FieldValue.serverTimestamp()});
}
