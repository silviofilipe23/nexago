import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/** Clubinho (jogo aberto da arena) — leitura direta de `arenaClubSessions` (+ subcoleção
 *  `clubParticipants`) e escrita 100% via callables (`joinArenaClubSession`/
 *  `leaveArenaClubSession`): capacidade, PIX e estorno vivem no servidor. */

export class ArenaClubError extends Error {}

function mapFunctionsError(err: unknown): ArenaClubError {
  const message =
    err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new ArenaClubError(message);
}

export type ClubParticipantStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'expired'
  | 'canceled'
  | 'canceled_refunded'
  | 'canceled_by_arena_refunded';

export interface ClubSession {
  id: string;
  clubId: string;
  arenaId: string;
  arenaName: string;
  clubName: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date | null;
  courtNames: string[];
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  /** Aceita reservar vaga pagando na arena (sem PIX antecipado). */
  allowOnsitePayment: boolean;
  confirmedCount: number;
  pendingCount: number;
  status: 'scheduled' | 'canceled' | 'completed';
}

export interface ClubParticipant {
  id: string;
  athleteId: string;
  athleteName: string;
  athletePhotoUrl: string | null;
  status: ClubParticipantStatus;
  /** 'onsite' = paga na arena; ausente em docs antigos = 'pix'. */
  paymentMethod: 'pix' | 'onsite';
  amountReais: number;
  joinedAt: Date | null;
}

export interface MyClubParticipation {
  sessionId: string;
  clubId: string;
  arenaId: string;
  arenaName: string;
  clubName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date | null;
  status: ClubParticipantStatus;
  paymentMethod: 'pix' | 'onsite';
  amountReais: number;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function clubSessionFromDoc(docSnap: QueryDocumentSnapshot | DocumentSnapshot): ClubSession {
  const d = (docSnap.data() ?? {}) as Record<string, unknown>;
  return {
    id: docSnap.id,
    clubId: str(d['clubId']),
    arenaId: str(d['arenaId']),
    arenaName: str(d['arenaName'], 'Arena'),
    clubName: str(d['clubName'], 'Clubinho'),
    description: typeof d['description'] === 'string' && d['description'] ? d['description'] : null,
    date: str(d['date']),
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    startAt: toDate(d['startAt']),
    courtNames: Array.isArray(d['courtNames']) ? (d['courtNames'] as unknown[]).map(String) : [],
    capacity: num(d['capacity']),
    priceReais: num(d['priceReais']),
    cancelWindowHours: num(d['cancelWindowHours']),
    allowOnsitePayment: d['allowOnsitePayment'] !== false,
    confirmedCount: num(d['confirmedCount']),
    pendingCount: num(d['pendingCount']),
    status: (str(d['status'], 'scheduled') as ClubSession['status']) || 'scheduled',
  };
}

function participantFromDoc(docSnap: QueryDocumentSnapshot): ClubParticipant {
  const d = docSnap.data() as Record<string, unknown>;
  return {
    id: docSnap.id,
    athleteId: str(d['athleteId'], docSnap.id),
    athleteName: str(d['athleteName'], 'Atleta'),
    athletePhotoUrl:
      typeof d['athletePhotoUrl'] === 'string' && d['athletePhotoUrl'] ? d['athletePhotoUrl'] : null,
    status: (str(d['status']) as ClubParticipantStatus) || 'pending_payment',
    paymentMethod: d['paymentMethod'] === 'onsite' ? 'onsite' : 'pix',
    amountReais: num(d['amountReais']),
    joinedAt: toDate(d['joinedAt']),
  };
}

export function clubSpotsLeft(session: ClubSession): number {
  return Math.max(0, session.capacity - session.confirmedCount - session.pendingCount);
}

/** Sessões abertas da arena a partir de hoje (detalhe da arena). */
export async function fetchUpcomingClubSessions(
  db: Firestore,
  arenaId: string,
  fromDateKey: string,
  max = 12,
): Promise<ClubSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClubSessions'),
      where('arenaId', '==', arenaId),
      where('status', '==', 'scheduled'),
      where('date', '>=', fromDateKey),
      orderBy('date'),
      limit(max),
    ),
  );
  return snap.docs.map(clubSessionFromDoc);
}

export function watchClubSession(
  db: Firestore,
  sessionId: string,
  onChange: (session: ClubSession | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaClubSessions', sessionId),
    (snap) => onChange(snap.exists() ? clubSessionFromDoc(snap) : null),
    () => onChange(null),
  );
}

export function watchClubParticipants(
  db: Firestore,
  sessionId: string,
  onChange: (participants: ClubParticipant[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaClubSessions', sessionId, 'clubParticipants'), orderBy('joinedAt')),
    (snap) => onChange(snap.docs.map(participantFromDoc)),
    () => onChange([]),
  );
}

/** Doc do próprio atleta na sessão — é este listener que "vira" a tela quando o PIX confirma. */
export function watchMyParticipant(
  db: Firestore,
  sessionId: string,
  uid: string,
  onChange: (participant: ClubParticipant | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaClubSessions', sessionId, 'clubParticipants', uid),
    (snap) =>
      onChange(snap.exists() ? participantFromDoc(snap as QueryDocumentSnapshot) : null),
    () => onChange(null),
  );
}

/** Minhas inscrições em clubinhos (collection group) a partir de `fromDate`. */
export async function fetchMyClubParticipations(
  db: Firestore,
  uid: string,
  fromDate: Date,
): Promise<MyClubParticipation[]> {
  const snap = await getDocs(
    query(
      collectionGroup(db, 'clubParticipants'),
      where('athleteId', '==', uid),
      where('startAt', '>=', Timestamp.fromDate(fromDate)),
      orderBy('startAt'),
    ),
  );
  return snap.docs.map((docSnap) => {
    const d = docSnap.data() as Record<string, unknown>;
    return {
      sessionId: docSnap.ref.parent.parent?.id ?? '',
      clubId: str(d['clubId']),
      arenaId: str(d['arenaId']),
      arenaName: str(d['arenaName'], 'Arena'),
      clubName: str(d['clubName'], 'Clubinho'),
      date: str(d['date']),
      startTime: str(d['startTime']),
      endTime: str(d['endTime']),
      startAt: toDate(d['startAt']),
      status: (str(d['status']) as ClubParticipantStatus) || 'pending_payment',
      paymentMethod: d['paymentMethod'] === 'onsite' ? 'onsite' : 'pix',
      amountReais: num(d['amountReais']),
    };
  });
}

/** Sessões abertas de TODAS as arenas a partir de hoje (aba Descobrir do hub Clubinho).
 *  Range + orderBy no mesmo campo (`date`) dispensa índice composto; o filtro de
 *  `scheduled` fica no cliente para não depender de deploy de índice novo. */
export async function fetchDiscoverClubSessions(
  db: Firestore,
  fromDateKey: string,
  max = 80,
): Promise<ClubSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'arenaClubSessions'),
      where('date', '>=', fromDateKey),
      orderBy('date'),
      limit(max),
    ),
  );
  return snap.docs.map(clubSessionFromDoc).filter((s) => s.status === 'scheduled');
}

// ── Callables ────────────────────────────────────────────────────────────────

export interface ClubJoinPixPayment {
  sessionId: string;
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt: string;
  amountReais: number;
}

export async function joinClubSession(
  functions: Functions,
  sessionId: string,
  cpfCnpj?: string,
): Promise<ClubJoinPixPayment> {
  try {
    const result = await httpsCallable<{ sessionId: string; cpfCnpj?: string }, ClubJoinPixPayment>(
      functions,
      'joinArenaClubSession',
    )({ sessionId, cpfCnpj: cpfCnpj || undefined });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

/** Garante a vaga pagando na arena no dia (se o clubinho aceitar) — confirma na hora. */
export async function joinClubSessionOnsite(
  functions: Functions,
  sessionId: string,
): Promise<{ sessionId: string; status: string; amountReais: number }> {
  try {
    const result = await httpsCallable<
      { sessionId: string; paymentMethod: 'onsite' },
      { sessionId: string; status: string; amountReais: number }
    >(functions, 'joinArenaClubSession')({ sessionId, paymentMethod: 'onsite' });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function leaveClubSession(
  functions: Functions,
  sessionId: string,
): Promise<{ status: string; refunded: boolean }> {
  try {
    const result = await httpsCallable<{ sessionId: string }, { status: string; refunded: boolean }>(
      functions,
      'leaveArenaClubSession',
    )({ sessionId });
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
