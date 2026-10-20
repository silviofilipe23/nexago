import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { bookingInviteFromDoc, type BookingInvite } from './booking-invite-model';

/** Convites para jogar numa reserva (`bookingInvites`). Leitura direta (as rules liberam a
 *  qualquer atleta logado: o preview do link precisa); toda escrita é pelas callables de
 *  `functions/src/arena-booking-invite.ts`, que validam dono, janela e lotação. */

const BOOKING_INVITES = 'bookingInvites';

export class BookingInviteError extends Error {}

/** Mesmo padrão de `arena-booking-split-repository.ts`: as callables escrevem mensagens
 *  prontas em PT-BR ("A quadra já está completa."); o genérico é só a rede caindo. */
function mapCallableError(err: unknown): BookingInviteError {
  const fb = err as { code?: string; message?: string };
  const code = (fb.code ?? '').replace(/^functions\//, '');
  const detail = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
  switch (code) {
    case 'unauthenticated':
      return new BookingInviteError('Faça login para continuar.');
    case 'permission-denied':
      return new BookingInviteError(detail ?? 'Só quem fez a reserva pode fazer isso.');
    case 'not-found':
      return new BookingInviteError(detail ?? 'Convite ou reserva não encontrado.');
    case 'invalid-argument':
    case 'failed-precondition':
      return new BookingInviteError(detail ?? 'Não foi possível concluir agora.');
    case 'internal':
      return new BookingInviteError(detail ?? 'Erro no servidor. Tente novamente.');
    default:
      return new BookingInviteError(detail ?? 'Não foi possível concluir agora. Tente de novo.');
  }
}

async function call<Req, Res>(functions: Functions, name: string, data: Req): Promise<Res> {
  try {
    const result = await httpsCallable<Req, Res>(functions, name)(data);
    return result.data;
  } catch (err) {
    throw mapCallableError(err);
  }
}

export interface InviteArenaBookingPlayersResult {
  invited: { uid: string; inviteId: string }[];
  skipped: { uid: string; reason: 'participant' | 'pending' }[];
}

/** Convite direto (push + inbox). Pula quem já joga ou já tem convite pendente. */
export function inviteArenaBookingPlayers(
  functions: Functions,
  params: { bookingId: string; inviteeUids: string[] },
): Promise<InviteArenaBookingPlayersResult> {
  return call(functions, 'inviteArenaBookingPlayers', params);
}

/** Cria/reabre o link multiuso `link_{bookingId}` e devolve o id. */
export async function getArenaBookingInviteLink(functions: Functions, bookingId: string): Promise<string> {
  const result = await call<{ bookingId: string }, { inviteId?: string }>(
    functions,
    'getArenaBookingInviteLink',
    { bookingId },
  );
  const inviteId = result?.inviteId?.trim();
  if (!inviteId) throw new BookingInviteError('Resposta inválida do servidor.');
  return inviteId;
}

export interface RespondArenaBookingInviteResult {
  /** `already`: já estava no jogo; `dismissed`: "agora não" no link (nada gravado). */
  status: 'accepted' | 'declined' | 'already' | 'dismissed';
  bookingId: string;
  inviteId: string;
}

/** Aceitar/recusar. O link (`link_{bookingId}`) só aceita — recusar não grava nada. */
export function respondArenaBookingInvite(
  functions: Functions,
  params: { inviteId: string; accept: boolean },
): Promise<RespondArenaBookingInviteResult> {
  return call(functions, 'respondArenaBookingInvite', params);
}

/** Convidado sai do jogo; o dono tira alguém passando `participantUid`. */
export function leaveArenaBooking(
  functions: Functions,
  params: { bookingId: string; participantUid?: string },
): Promise<{ removed: boolean }> {
  return call(functions, 'leaveArenaBooking', params);
}

/** Dono cancela um convite ainda sem resposta. */
export function cancelArenaBookingInvite(functions: Functions, inviteId: string): Promise<{ canceled: boolean }> {
  return call(functions, 'cancelArenaBookingInvite', { inviteId });
}

/** Um convite ao vivo (`null` = não existe). A tela vira "Você está no jogo!" sozinha. */
export function watchBookingInvite(
  db: Firestore,
  inviteId: string,
  onChange: (invite: BookingInvite | null) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, BOOKING_INVITES, inviteId),
    (snap) => onChange(snap.exists() ? bookingInviteFromDoc(snap.id, snap.data() as Record<string, unknown>) : null),
    onError,
  );
}

/** Todos os convites da reserva (diretos, entradas por link e o próprio link), ao vivo — só
 *  igualdade em `bookingId`, sem índice composto. Quem chama filtra o que quer mostrar. */
export function watchBookingInvitesOfBooking(
  db: Firestore,
  bookingId: string,
  onChange: (invites: BookingInvite[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, BOOKING_INVITES), where('bookingId', '==', bookingId)),
    (snap) => onChange(snap.docs.map((d) => bookingInviteFromDoc(d.id, d.data() as Record<string, unknown>))),
    () => onChange([]),
  );
}

/** Convites de reserva aceitos além do par único `guestAthleteId`/`guestAthleteName` gravado
 *  na própria reserva — espelha a leitura de `bookingInvites` em `BookingDetailsTeamProviders`
 *  (Flutter) para completar a lista de convidados de reservas antigas, sem `participants`. */
export async function fetchAcceptedBookingInviteGuestUids(
  db: Firestore,
  bookingId: string,
  max = 5,
): Promise<string[]> {
  const snap = await getDocs(
    query(
      collection(db, BOOKING_INVITES),
      where('bookingId', '==', bookingId),
      where('status', '==', 'accepted'),
      limit(max),
    ),
  );
  const uids = new Set<string>();
  for (const d of snap.docs) {
    const uid = d.data()['acceptedByUid'];
    if (typeof uid === 'string' && uid.trim()) uids.add(uid.trim());
  }
  return [...uids];
}
