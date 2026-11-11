/**
 * WhatsApp dos jogadores de uma reserva, pro detalhe da reserva no portal da arena.
 *
 * O telefone do atleta é privado: não está no doc da reserva nem no perfil público, e as
 * rules não deixam a arena ler `users/{uid}`. Esta callable lê só o dono (`athleteId`) e os
 * convidados (`participants`) da reserva pedida, depois de conferir que quem chama é equipe
 * da arena com leitura na área `agenda` (a mesma regra do CRM, que já mostra esses números).
 * Devolve só os dígitos prontos pro `wa.me` — nada do resto do perfil.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";
import {whatsappDigits} from "./arena-crm-model";
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;

export interface BookingContact {
  uid: string;
  whatsapp: string;
}

export interface ArenaBookingContactsPayload {
  /** Só quem tem telefone válido; o dono vem primeiro. */
  contacts: BookingContact[];
}

/** Dono primeiro, depois os convidados, sem repetir. */
export function bookingPlayerUids(booking: Data): string[] {
  const uids: string[] = [];
  const add = (v: unknown) => {
    const uid = typeof v === "string" ? v.trim() : "";
    if (uid && !uids.includes(uid)) uids.push(uid);
  };
  add(booking["athleteId"]);
  const participants = Array.isArray(booking["participants"]) ? booking["participants"] : [];
  for (const p of participants) {
    if (p && typeof p === "object") add((p as Data)["uid"]);
  }
  return uids;
}

export async function getArenaBookingContactsCore(db: Firestore, uid: string, raw: unknown): Promise<ArenaBookingContactsPayload> {
  const bookingId = typeof (raw as Data | null)?.["bookingId"] === "string" ? ((raw as Data)["bookingId"] as string).trim() : "";
  if (!bookingId) throw new HttpsError("invalid-argument", "bookingId é obrigatório.");

  const snap = await db.collection("arenaBookings").doc(bookingId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");
  const booking = (snap.data() ?? {}) as Data;
  const arenaId = typeof booking["arenaId"] === "string" ? booking["arenaId"] : "";
  if (!arenaId) throw new HttpsError("failed-precondition", "Reserva sem arena.");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");

  const uids = bookingPlayerUids(booking);
  if (uids.length === 0) return {contacts: []};
  const users = await db.getAll(...uids.map((id) => db.collection("users").doc(id)));
  const contacts: BookingContact[] = [];
  for (const user of users) {
    if (!user.exists) continue;
    const whatsapp = whatsappDigits((user.data() as Data)["phoneNumber"] as string | undefined);
    if (whatsapp) contacts.push({uid: user.id, whatsapp});
  }
  return {contacts};
}

export const getArenaBookingContacts = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return getArenaBookingContactsCore(getFirestore(), uid, request.data);
});
